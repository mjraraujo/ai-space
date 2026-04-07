/**
 * AI Engine - WebGPU local inference via web-llm + Cloud mode
 * 
 * Modes:
 *   - local: WebGPU via web-llm (on-device inference)
 *   - cloud: fetch to user-configured OpenAI-compatible API endpoint
 *   - hybrid: local by default, cloud when user explicitly requests
 * 
 * Cloud calls are ONLY made when:
 *   1. Mode is 'cloud' or 'hybrid', AND
 *   2. User triggered the action
 */

const DEFAULT_MODEL = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';

const MODELS = {
  'Llama-3.2-1B-Instruct-q4f16_1-MLC': {
    name: 'Llama 3.2 1B',
    size: '700 MB',
    description: 'Best quality local reasoning. Recommended default.'
  },
  'Qwen2.5-0.5B-Instruct-q4f16_1-MLC': {
    name: 'Qwen 2.5 0.5B',
    size: '350 MB',
    description: 'Ultra-fast balance for everyday use.'
  },
  'SmolLM2-360M-Instruct-q4f16_1-MLC': {
    name: 'SmolLM2 360M',
    size: '200 MB',
    description: 'Fastest option for lightweight tasks.'
  },
  'Phi-3.5-mini-instruct-q4f16_1-MLC': {
    name: 'Phi 3.5 Mini 3.8B',
    size: '2.2 GB',
    description: 'Largest local model. Needs 4GB+ RAM.'
  }
};

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
    this.engine = null;
    this.modelId = null;
    this.status = 'idle'; // idle | loading | ready | error
    this.webgpuAvailable = false;
    this.mode = 'local'; // local | cloud | hybrid

    // Cloud configuration
    this.cloudEndpoint = '';
    this.cloudApiKey = '';
    this.cloudModel = 'gpt-3.5-turbo';

    // Personalized prompt context from onboarding
    this.promptContext = '';
  }

  /**
   * Check WebGPU availability
   * @returns {Promise<boolean>}
   */
  async checkWebGPU() {
    if (!navigator.gpu) {
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

  /**
   * Initialize the local WebGPU engine with a model
   * @param {string} [modelId] - Model identifier (defaults to first available)
   * @param {function} [onProgress] - Progress callback ({text, progress})
   */
  async init(modelId, onProgress) {
    if (!modelId) {
      modelId = DEFAULT_MODEL;
    }

    if (!MODELS[modelId]) {
      this.status = 'error';
      throw new Error(`Unknown model: ${modelId}`);
    }

    if (this.status === 'ready' && this.engine && this.modelId === modelId) {
      return true;
    }

    const hasWebGPU = await this.checkWebGPU();
    if (!hasWebGPU) {
      this.status = 'error';
      throw new Error('WebGPU is not available on this device. Try Chrome 113+ on a supported device.');
    }

    this.status = 'loading';
    this.modelId = modelId;

    try {
      const webllm = await import('https://esm.run/@mlc-ai/web-llm');

      const progressCallback = (report) => {
        if (onProgress) {
          onProgress({
            text: report.text || 'Loading...',
            progress: report.progress || 0
          });
        }
      };

      this.engine = await webllm.CreateMLCEngine(modelId, {
        initProgressCallback: progressCallback
      });

      this.status = 'ready';
      return true;
    } catch (err) {
      this.status = 'error';
      throw err;
    }
  }

  /**
   * Configure cloud API access
   * Settings are stored in memory by the app layer.
   * @param {string} endpoint - API base URL (e.g., https://api.openai.com/v1)
   * @param {string} key - API key
   * @param {string} [model] - Model name (default: gpt-3.5-turbo)
   */
  setCloudConfig(endpoint, key, model) {
    this.cloudEndpoint = (endpoint || '').replace(/\/+$/, '');
    this.cloudApiKey = key || '';
    this.cloudModel = model || 'gpt-3.5-turbo';
  }

  /**
   * Check if cloud is configured
   */
  get cloudConfigured() {
    return !!(this.cloudEndpoint && this.cloudApiKey);
  }

  /**
   * Send a chat and get response.
   * Routes to local or cloud based on current mode.
   * 
   * @param {Array} messages - Chat messages [{role, content}]
   * @param {function} [onToken] - Streaming token callback (token, accumulated)
   * @param {object} [options] - { forceCloud: false }
   * @returns {Promise<string>} Full response text
   */
  async chat(messages, onToken, options = {}) {
    const useCloud = this.mode === 'cloud' ||
      (this.mode === 'hybrid' && (options.forceCloud || this.status !== 'ready'));

    if (useCloud) {
      return this._chatCloud(messages, onToken);
    } else {
      return this._chatLocal(messages, onToken);
    }
  }

  _getGenerationConfig(messages) {
    const transcript = (messages || [])
      .map((message) => typeof message?.content === 'string' ? message.content : '')
      .join('\n');

    const highPrecision = /\[Instruction: Answer only with verified facts|\[Mode: Verify\]|\[Mode: Debug\]/i.test(transcript);

    return {
      temperature: highPrecision ? 0.25 : 0.55,
      max_tokens: highPrecision ? 900 : 1024
    };
  }

  /**
   * Local inference via web-llm
   */
  async _chatLocal(messages, onToken) {
    if (this.status !== 'ready' || !this.engine) {
      throw new Error('Local engine not ready. Call init() first or switch to cloud mode.');
    }

    const systemContent = SYSTEM_PROMPT + (this.promptContext || '');
    const fullMessages = [
      { role: 'system', content: systemContent },
      ...messages
    ];

    let fullResponse = '';
    const generationConfig = this._getGenerationConfig(fullMessages);

    try {
      const stream = await this.engine.chat.completions.create({
        messages: fullMessages,
        stream: true,
        temperature: generationConfig.temperature,
        max_tokens: generationConfig.max_tokens
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || '';
        if (delta) {
          fullResponse += delta;
          if (onToken) {
            onToken(delta, fullResponse);
          }
        }
      }

      return fullResponse;
    } catch (err) {
      throw new Error('Local generation failed: ' + err.message);
    }
  }

  /**
   * Cloud inference via OpenAI-compatible API
   */
  async _chatCloud(messages, onToken) {
    if (!this.cloudEndpoint || !this.cloudApiKey) {
      throw new Error('Cloud API not configured. Set endpoint and API key in settings.');
    }

    const systemContent = SYSTEM_PROMPT + (this.promptContext || '');
    const fullMessages = [
      { role: 'system', content: systemContent },
      ...messages
    ];

    const endpointHost = this.cloudEndpoint.toLowerCase();
    if (endpointHost.includes('api.anthropic.com')) {
      return this._chatAnthropic(messages, systemContent, onToken);
    }

    // Ensure endpoint has /chat/completions
    let url = this.cloudEndpoint;
    if (!url.endsWith('/chat/completions')) {
      if (!url.endsWith('/')) url += '/';
      url += 'chat/completions';
    }

    try {
      const generationConfig = this._getGenerationConfig(fullMessages);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.cloudApiKey}`
        },
        body: JSON.stringify({
          model: this.cloudModel,
          messages: fullMessages,
          stream: true,
          temperature: generationConfig.temperature,
          max_tokens: generationConfig.max_tokens
        })
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Cloud API error (${response.status}): ${errorText}`);
      }

      // Handle streaming response (SSE)
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // keep incomplete line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullResponse += delta;
              if (onToken) {
                onToken(delta, fullResponse);
              }
            }
          } catch {
            // Skip malformed JSON chunks
          }
        }
      }

      return fullResponse;
    } catch (err) {
      if (err.message.startsWith('Cloud API error')) {
        throw err;
      }
      throw new Error('Cloud API request failed: ' + err.message);
    }
  }

  /**
   * Claude (Anthropic) inference using native Messages API with SSE streaming.
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

    try {
      const generationConfig = this._getGenerationConfig([{ role: 'system', content: systemContent }, ...anthropicMessages]);
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
          } catch {
            // Skip malformed chunks
          }
        }
      }

      return fullResponse;
    } catch (err) {
      if (err.message.startsWith('Cloud API error')) {
        throw err;
      }
      throw new Error('Cloud API request failed: ' + err.message);
    }
  }

  /**
   * Get engine status
   * @returns {object}
   */
  getStatus() {
    return {
      status: this.status,
      mode: this.mode,
      modelId: this.modelId,
      modelInfo: this.modelId ? MODELS[this.modelId] : null,
      webgpuAvailable: this.webgpuAvailable,
      cloudConfigured: this.cloudConfigured,
      cloudEndpoint: this.cloudEndpoint ? this.cloudEndpoint.replace(/\/.*$/, '/...') : '',
      cloudModel: this.cloudModel
    };
  }

  /**
   * Get available local models
   * @returns {object}
   */
  static getModels() {
    return MODELS;
  }

  static getDefaultModelId() {
    return DEFAULT_MODEL;
  }
}
