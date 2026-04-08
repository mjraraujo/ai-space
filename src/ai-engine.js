/**
 * AI Engine — unified adapter-based inference engine.
 *
 * Modes:
 *   - local   : WebGPU via web-llm (on-device, zero network)
 *   - ollama  : local Ollama server
 *   - cloud   : OpenAI-compatible / Anthropic API
 *   - hybrid  : local by default, cloud on forceCloud / fallback
 *
 * The Engine never talks to model backends directly — it routes through
 * a ModelAdapter (WebLLMAdapter / OllamaAdapter / CloudAdapter).
 * Skill routing, tool-calling, and KV-context management live here.
 */

import {
  WebLLMAdapter,
  OllamaAdapter,
  CloudAdapter,
  WEB_LLM_MODELS,
  DEFAULT_WEB_LLM_MODEL
} from './model-adapter.js';

// ─── Keep legacy MODELS / DEFAULT_MODEL exports for backward compat ──────────
const DEFAULT_MODEL = DEFAULT_WEB_LLM_MODEL;
const MODELS = Object.fromEntries(
  Object.entries(WEB_LLM_MODELS).map(([id, m]) => [
    id,
    { name: m.name, size: m.size, description: m.description }
  ])
);

const SYSTEM_PROMPT = `You are AI Space — a precise, honest, and highly capable personal AI assistant running locally on your device.

## Core Behavior
- Answer DIRECTLY and ACCURATELY. Never fabricate facts.
- If you don't know something, say: "I don't have reliable information on this."
- Never invent names, capitals, dates, or statistics. Verify against your training knowledge.
- Keep responses concise but complete. No filler. No padding.

## Reasoning Protocol (follow this internally before every answer)
1. What is the user ACTUALLY asking?
2. Do I know this with confidence? If uncertain, say so explicitly.
3. Structure: give the answer first, then explanation/context.

## Formatting Rules
- Use markdown: **bold** for key terms, \`code\` for technical values, bullet lists for options.
- Short answers for simple questions. Structured answers for complex ones.
- Never start with "Certainly!", "Of course!", "Great question!" — go straight to the answer.

## What You Are
- Local AI — you run on this device. No cloud unless the user has configured it.
- Privacy-first: you never share data. Everything stays on device.
- You have a skills system for iOS Shortcuts automation.

## Honesty Rules
- WRONG: "The capital of Roraima is Belume." CORRECT: "The capital of Roraima is Boa Vista."
- If asked about models, say: "I'm AI Space, your local private assistant."
- Never claim to be GPT, Phi, Claude, or any other model by name.
- If you receive a SYSTEM message beginning with [WEB_CONTEXT], treat it as turn-specific context and do not pretend to have full browsing access.`;

export class AIEngine {
  constructor() {
    // ─── Adapter layer (new) ──────────────────────────────────────────────
    /** @type {import('./model-adapter.js').ModelAdapter|null} */
    this._adapter = null;

    // ─── Backward-compat properties (kept so existing tests / app.js don't break) ──
    this.engine = null;       // set to adapter when ready, for legacy checks
    this.modelId = null;
    this.status = 'idle';     // idle | loading | ready | error
    this.webgpuAvailable = false;
    this.mode = 'local';      // local | ollama | cloud | hybrid

    // Cloud configuration (legacy path, still supported)
    this.cloudEndpoint = '';
    this.cloudApiKey = '';
    this.cloudModel = 'gpt-3.5-turbo';

    // Personalized prompt context from onboarding
    this.promptContext = '';

    // ─── Context management ───────────────────────────────────────────────
    /** Maximum number of conversation turns to keep in the live context window */
    this.maxContextTurns = 20;
    /** Compressed summary of evicted turns (KV-context pagination) */
    this._contextSummary = '';

    // ─── Active generation abort handle ──────────────────────────────────
    this._abortController = null;
  }

  // ─── Adapter Management ───────────────────────────────────────────────────

  /**
   * Set the model adapter directly (used by app when switching backends).
   * @param {import('./model-adapter.js').ModelAdapter} adapter
   */
  setAdapter(adapter) {
    this._adapter = adapter;
  }

  /**
   * Get the active adapter, or null.
   * @returns {import('./model-adapter.js').ModelAdapter|null}
   */
  getAdapter() {
    return this._adapter;
  }

  // ─── WebGPU check (legacy compat) ─────────────────────────────────────────

  /**
   * Check WebGPU availability.
   * @returns {Promise<boolean>}
   */
  async checkWebGPU() {
    if (typeof navigator === 'undefined' || !navigator.gpu) {
      this.webgpuAvailable = false;
      return false;
    }
    try {
      const adapter = await navigator.gpu.requestAdapter();
      this.webgpuAvailable = !!adapter;
      return this.webgpuAvailable;
    } catch {
      this.webgpuAvailable = false;
      return false;
    }
  }

  // ─── Initialization ───────────────────────────────────────────────────────

  /**
   * Initialize the engine with a model.
   * Automatically selects the adapter based on current mode.
   * Backward-compatible: works exactly as before for local/cloud modes.
   *
   * @param {string} [modelId]
   * @param {function} [onProgress] - ({text, progress}) callback
   * @returns {Promise<boolean>}
   */
  async init(modelId, onProgress) {
    if (!modelId) modelId = DEFAULT_MODEL;

    // Validate model ID for local/hybrid modes
    if ((this.mode === 'local' || this.mode === 'hybrid') && !MODELS[modelId]) {
      this.status = 'error';
      throw new Error(`Unknown model: ${modelId}`);
    }

    // Return early if same model already loaded
    if (this.status === 'ready' && this.engine && this.modelId === modelId) {
      return true;
    }

    this.status = 'loading';
    this.modelId = modelId;

    const progressFn = onProgress
      ? (p) => onProgress({ text: p.text || 'Loading…', progress: p.ratio || 0 })
      : undefined;

    try {
      if (this.mode === 'cloud') {
        // Cloud mode: use CloudAdapter
        const adapter = new CloudAdapter({
          endpoint: this.cloudEndpoint,
          apiKey: this.cloudApiKey,
          model: this.cloudModel
        });
        await adapter.init(this.cloudModel, progressFn);
        this._adapter = adapter;
      } else if (this.mode === 'ollama') {
        // Ollama mode
        const adapter = new OllamaAdapter();
        await adapter.init(modelId, progressFn);
        this._adapter = adapter;
      } else {
        // local | hybrid: WebGPU
        const hasWebGPU = await this.checkWebGPU();
        if (!hasWebGPU) {
          this.status = 'error';
          throw new Error('WebGPU is not available on this device. Try Chrome 113+ on a supported device.');
        }

        // Dispose existing adapter if model changed
        if (this._adapter instanceof WebLLMAdapter) {
          await this._adapter.dispose().catch(() => {});
        }

        const adapter = new WebLLMAdapter();
        await adapter.init(modelId, progressFn);
        this._adapter = adapter;
      }

      // Set legacy sentinel
      this.engine = this._adapter;
      this.status = 'ready';
      return true;
    } catch (err) {
      this.status = 'error';
      throw err;
    }
  }

  // ─── Cloud Config (backward compat) ──────────────────────────────────────

  /**
   * Configure cloud API access.
   * @param {string} endpoint
   * @param {string} key
   * @param {string} [model]
   */
  setCloudConfig(endpoint, key, model) {
    this.cloudEndpoint = (endpoint || '').replace(/\/+$/, '');
    this.cloudApiKey = key || '';
    this.cloudModel = model || 'gpt-3.5-turbo';

    // Hot-update the cloud adapter if one is active
    if (this._adapter instanceof CloudAdapter) {
      this._adapter.configure({
        endpoint: this.cloudEndpoint,
        apiKey: this.cloudApiKey,
        model: this.cloudModel
      });
    }
  }

  get cloudConfigured() {
    return !!(this.cloudEndpoint && this.cloudApiKey);
  }

  // ─── Context Management ───────────────────────────────────────────────────

  /**
   * Trim the conversation history to maxContextTurns, summarizing evicted turns.
   * The summary is prepended as a system message so the model retains context.
   * @param {Array} messages
   * @returns {Array} trimmed messages
   */
  _manageContext(messages) {
    if (!messages || messages.length <= this.maxContextTurns) return messages;

    const evicted = messages.slice(0, messages.length - this.maxContextTurns);
    const kept = messages.slice(messages.length - this.maxContextTurns);

    // Build a one-line summary of evicted turns
    const evictedSummary = evicted
      .filter((m) => m.role === 'user')
      .map((m) => (typeof m.content === 'string' ? m.content.slice(0, 80) : ''))
      .filter(Boolean)
      .join('; ');

    if (evictedSummary) {
      this._contextSummary = `[Earlier context — topics discussed: ${evictedSummary}]`;
    }

    return kept;
  }

  /**
   * Get generation config based on message content.
   * High-precision mode activates for verify/debug instructions.
   * @param {Array} messages
   * @returns {{ temperature: number, max_tokens: number }}
   */
  _getGenerationConfig(messages) {
    const transcript = (messages || [])
      .map((m) => (typeof m?.content === 'string' ? m.content : ''))
      .join('\n');

    const highPrecision = /\[Instruction: Answer only with verified facts|\[Mode: Verify\]|\[Mode: Debug\]/i.test(transcript);

    return {
      temperature: highPrecision ? 0.25 : 0.55,
      max_tokens: highPrecision ? 900 : 1024
    };
  }

  // ─── Chat ─────────────────────────────────────────────────────────────────

  /**
   * Send a chat and get a response.
   * Routes to local or cloud based on current mode.
   *
   * @param {Array} messages - [{role, content}]
   * @param {function} [onToken] - (token, accumulated) streaming callback
   * @param {object} [options] - { forceCloud, tools, temperature, max_tokens }
   * @returns {Promise<string>}
   */
  async chat(messages, onToken, options = {}) {
    const useCloud = this.mode === 'cloud' ||
      (this.mode === 'hybrid' && (options.forceCloud || this.status !== 'ready'));

    if (useCloud) {
      return this._chatCloud(messages, onToken, options);
    }
    return this._chatLocal(messages, onToken, options);
  }

  /**
   * Cancel any in-progress generation.
   */
  abort() {
    if (this._adapter) this._adapter.abort();
  }

  // ─── Local inference (via adapter) ───────────────────────────────────────

  async _chatLocal(messages, onToken, options = {}) {
    if (this.status !== 'ready' || !this._adapter) {
      throw new Error('Local engine not ready. Call init() first or switch to cloud mode.');
    }

    const systemContent = SYSTEM_PROMPT + (this.promptContext || '');
    const contextSummary = this._contextSummary
      ? `\n\n${this._contextSummary}`
      : '';

    const trimmedMessages = this._manageContext(messages);

    const fullMessages = [
      { role: 'system', content: systemContent + contextSummary },
      ...trimmedMessages
    ];

    const { temperature, max_tokens } = this._getGenerationConfig(fullMessages);

    try {
      return await this._adapter.chat(fullMessages, onToken, {
        temperature,
        max_tokens,
        tools: options.tools
      });
    } catch (err) {
      throw new Error('Local generation failed: ' + err.message);
    }
  }

  // ─── Cloud inference (via CloudAdapter or legacy path) ───────────────────

  async _chatCloud(messages, onToken, options = {}) {
    if (!this.cloudEndpoint || !this.cloudApiKey) {
      throw new Error('Cloud API not configured. Set endpoint and API key in settings.');
    }

    const systemContent = SYSTEM_PROMPT + (this.promptContext || '');
    const isAnthropic = this.cloudEndpoint.toLowerCase().includes('api.anthropic.com');

    if (isAnthropic) {
      return this._chatAnthropic(messages, systemContent, onToken);
    }

    // Use CloudAdapter
    const adapter = this._adapter instanceof CloudAdapter
      ? this._adapter
      : new CloudAdapter({
          endpoint: this.cloudEndpoint,
          apiKey: this.cloudApiKey,
          model: this.cloudModel
        });

    const fullMessages = [
      { role: 'system', content: systemContent },
      ...messages
    ];

    const { temperature, max_tokens } = this._getGenerationConfig(fullMessages);

    try {
      return await adapter.chat(fullMessages, onToken, { temperature, max_tokens });
    } catch (err) {
      if (err.message.startsWith('Cloud API error')) throw err;
      throw new Error('Cloud API request failed: ' + err.message);
    }
  }

  /**
   * Anthropic inference (kept as dedicated path for backward compat with tests).
   */
  async _chatAnthropic(messages, systemContent, onToken) {
    let url = this.cloudEndpoint;
    if (!url.endsWith('/messages')) {
      if (!url.endsWith('/')) url += '/';
      url += 'messages';
    }

    const anthropicMessages = (messages || [])
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
      .map((m) => ({ role: m.role, content: m.content || '' }));

    const generationConfig = this._getGenerationConfig([
      { role: 'system', content: systemContent },
      ...anthropicMessages
    ]);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.cloudApiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: this.cloudModel,
          max_tokens: generationConfig.max_tokens,
          temperature: generationConfig.temperature,
          system: systemContent,
          messages: anthropicMessages,
          stream: true
        })
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Cloud API error (${response.status}): ${errorText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (!data) continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
              const delta = parsed.delta.text || '';
              if (delta) {
                fullResponse += delta;
                if (onToken) onToken(delta, fullResponse);
              }
            }
          } catch {}
        }
      }

      return fullResponse;
    } catch (err) {
      if (err.message.startsWith('Cloud API error')) throw err;
      throw new Error('Cloud API request failed: ' + err.message);
    }
  }

  // ─── Status ───────────────────────────────────────────────────────────────

  /**
   * Get engine status.
   * @returns {object}
   */
  getStatus() {
    const caps = this._adapter?.getCapabilities?.() || {};
    return {
      status: this.status,
      mode: this.mode,
      modelId: this.modelId,
      modelInfo: this.modelId ? MODELS[this.modelId] : null,
      webgpuAvailable: this.webgpuAvailable,
      cloudConfigured: this.cloudConfigured,
      cloudEndpoint: this.cloudEndpoint ? this.cloudEndpoint.replace(/\/.*$/, '/...') : '',
      cloudModel: this.cloudModel,
      // Adapter info (new)
      adapterName: this._adapter?.displayName || null,
      backend: caps.backend || null,
      toolCalling: caps.toolCalling || false,
      maxContextTokens: caps.maxContextTokens || null
    };
  }

  // ─── Static helpers (backward compat) ────────────────────────────────────

  static getModels() { return MODELS; }
  static getDefaultModelId() { return DEFAULT_MODEL; }
}
