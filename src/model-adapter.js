/**
 * Model Adapter Layer — unified interface for all inference backends.
 *
 * All model backends implement ModelAdapter.
 * The AIEngine uses a ModelAdapter instance; it never talks to web-llm, Ollama,
 * or cloud APIs directly — it goes through the adapter.
 *
 * Backends available:
 *   - WebLLMAdapter  : on-device WebGPU inference via @mlc-ai/web-llm
 *   - OllamaAdapter  : local Ollama server (http://localhost:11434)
 *   - CloudAdapter   : OpenAI-compatible REST API (OpenAI, Claude, Gemini, …)
 */

// ─── Base Interface ──────────────────────────────────────────────────────────

/**
 * @typedef {'webgpu'|'wasm'|'local-server'|'cloud'} AdapterBackend
 *
 * @typedef {Object} AdapterCapabilities
 * @property {AdapterBackend} backend
 * @property {boolean} streaming
 * @property {boolean} toolCalling   - native function-calling support
 * @property {boolean} multimodal    - image/vision input support
 * @property {number}  maxContextTokens
 * @property {string}  quantization  - e.g. 'q4f16_1', 'int8', 'fp16'
 */

/**
 * @typedef {'system'|'user'|'assistant'|'tool'} MessageRole
 *
 * @typedef {Object} ChatMessage
 * @property {MessageRole} role
 * @property {string} content
 * @property {string} [name]         - tool name when role === 'tool'
 * @property {ToolCall[]} [tool_calls]
 */

/**
 * @typedef {Object} ToolDef
 * @property {'function'} type
 * @property {{ name: string, description: string, parameters: object }} function
 */

/**
 * @typedef {Object} ToolCall
 * @property {string} id
 * @property {'function'} type
 * @property {{ name: string, arguments: string }} function
 */

/**
 * @typedef {Object} ChatOptions
 * @property {number}    [temperature]
 * @property {number}    [max_tokens]
 * @property {ToolDef[]} [tools]
 * @property {boolean}   [stream]
 * @property {boolean}   [forceCloud]   - used by AIEngine routing only
 */

/**
 * @typedef {Object} LoadProgress
 * @property {string} text
 * @property {number} ratio  - 0.0–1.0
 */

export class ModelAdapter {
  /** @returns {AdapterCapabilities} */
  getCapabilities() {
    throw new Error('ModelAdapter.getCapabilities() not implemented');
  }

  /**
   * Load / connect to the model. Resolves when the adapter is ready to chat.
   * @param {string} _modelId
   * @param {(progress: LoadProgress) => void} [_onProgress]
   * @returns {Promise<void>}
   */
  async init(_modelId, _onProgress) {
    throw new Error('ModelAdapter.init() not implemented');
  }

  /**
   * Generate a response. Streams tokens via onToken when provided.
   * @param {ChatMessage[]} _messages
   * @param {(token: string, accumulated: string) => void} [_onToken]
   * @param {ChatOptions} [_options]
   * @returns {Promise<string>} full response text
   */
  async chat(_messages, _onToken, _options) {
    throw new Error('ModelAdapter.chat() not implemented');
  }

  /** Cancel any in-progress generation. */
  abort() {}

  /** Release GPU / memory resources. */
  async dispose() {}

  /** Human-readable backend name for UI display. */
  get displayName() {
    return 'Unknown Adapter';
  }
}

// ─── WebLLM Adapter (WebGPU on-device inference) ────────────────────────────

/**
 * Known MLC-quantized models supported by @mlc-ai/web-llm.
 */
export const WEB_LLM_MODELS = {
  'Llama-3.2-1B-Instruct-q4f16_1-MLC': {
    name: 'Llama 3.2 1B',
    size: '700 MB',
    description: 'Best quality local reasoning. Recommended default.',
    quantization: 'q4f16_1',
    maxContextTokens: 8192
  },
  'Qwen2.5-1.5B-Instruct-q4f16_1-MLC': {
    name: 'Qwen 2.5 1.5B',
    size: '900 MB',
    description: 'Better quality than 0.5B, lighter than Llama 1B. Great middle ground.',
    quantization: 'q4f16_1',
    maxContextTokens: 8192
  },
  'Qwen2.5-0.5B-Instruct-q4f16_1-MLC': {
    name: 'Qwen 2.5 0.5B',
    size: '350 MB',
    description: 'Ultra-fast balance for everyday use.',
    quantization: 'q4f16_1',
    maxContextTokens: 4096
  },
  'SmolLM2-360M-Instruct-q4f16_1-MLC': {
    name: 'SmolLM2 360M',
    size: '200 MB',
    description: 'Fastest option for lightweight tasks.',
    quantization: 'q4f16_1',
    maxContextTokens: 2048
  },
  'Phi-3.5-mini-instruct-q4f16_1-MLC': {
    name: 'Phi 3.5 Mini 3.8B',
    size: '2.2 GB',
    description: 'Largest local model. Needs 4 GB+ RAM.',
    quantization: 'q4f16_1',
    maxContextTokens: 16384
  }
};

export const DEFAULT_WEB_LLM_MODEL = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';

export class WebLLMAdapter extends ModelAdapter {
  constructor() {
    super();
    /** @type {any} internal web-llm engine */
    this._engine = null;
    this._modelId = null;
    this._ready = false;
    this._abortController = null;
  }

  getCapabilities() {
    const info = WEB_LLM_MODELS[this._modelId] || {};
    return {
      backend: 'webgpu',
      streaming: true,
      toolCalling: false,
      multimodal: false,
      maxContextTokens: info.maxContextTokens || 4096,
      quantization: info.quantization || 'q4f16_1'
    };
  }

  get displayName() {
    const info = WEB_LLM_MODELS[this._modelId];
    return info ? `Local · ${info.name}` : 'Local · WebGPU';
  }

  async init(modelId, onProgress, options = {}) {
    if (!modelId) modelId = DEFAULT_WEB_LLM_MODEL;
    if (!WEB_LLM_MODELS[modelId]) {
      throw new Error(`WebLLMAdapter: unknown model "${modelId}"`);
    }

    // Return early if same model already loaded (ignore if kvMode changed)
    if (this._ready && this._engine && this._modelId === modelId && !options.kvMode) return;

    // Verify WebGPU availability
    if (!navigator.gpu) {
      throw new Error('WebGPU is not available on this device. Try Chrome 113+ on a supported device.');
    }
    const adapter = await navigator.gpu.requestAdapter().catch(() => null);
    if (!adapter) {
      throw new Error('WebGPU is not available on this device. Try Chrome 113+ on a supported device.');
    }

    this._ready = false;
    this._modelId = modelId;

    const webllm = await import('https://esm.run/@mlc-ai/web-llm');

    /** @type {import('@mlc-ai/web-llm').MLCEngineConfig} */
    const engineConfig = {
      initProgressCallback: (report) => {
        if (onProgress) {
          onProgress({ text: report.text || 'Loading…', ratio: report.progress || 0 });
        }
      }
    };

    // Apply KV context window size from TurboKV setting
    const kvMode = options && options.kvMode;
    if (kvMode === 'extended') {
      engineConfig.kvConfig = { maxTotalSequenceLength: 4096 };
    } else if (kvMode === 'ultra') {
      engineConfig.kvConfig = { maxTotalSequenceLength: 8192 };
    }

    this._engine = await webllm.CreateMLCEngine(modelId, engineConfig);

    this._ready = true;
  }

  async chat(messages, onToken, options = {}) {
    if (!this._ready || !this._engine) {
      throw new Error('WebLLMAdapter: engine not ready — call init() first.');
    }

    const temperature = options.temperature ?? 0.55;
    const max_tokens = options.max_tokens ?? 1024;

    let fullResponse = '';
    this._abortController = new AbortController();

    try {
      const stream = await this._engine.chat.completions.create({
        messages,
        stream: true,
        temperature,
        max_tokens
      });

      for await (const chunk of stream) {
        if (this._abortController.signal.aborted) break;
        const delta = chunk.choices[0]?.delta?.content || '';
        if (delta) {
          fullResponse += delta;
          if (onToken) onToken(delta, fullResponse);
        }
      }
    } finally {
      this._abortController = null;
    }

    return fullResponse;
  }

  abort() {
    if (this._abortController) {
      this._abortController.abort();
    }
  }

  async dispose() {
    if (this._engine) {
      try { await this._engine.unload?.(); } catch {}
      this._engine = null;
    }
    this._ready = false;
    this._modelId = null;
  }

  /** @returns {boolean} whether WebGPU is available */
  static async isAvailable() {
    if (!navigator.gpu) return false;
    try {
      const adapter = await navigator.gpu.requestAdapter();
      return !!adapter;
    } catch {
      return false;
    }
  }

  static getModels() { return WEB_LLM_MODELS; }
  static getDefaultModelId() { return DEFAULT_WEB_LLM_MODEL; }
}

// ─── Ollama Adapter (local server) ──────────────────────────────────────────

const OLLAMA_DEFAULT_HOST = 'http://localhost:11434';

export class OllamaAdapter extends ModelAdapter {
  /**
   * @param {string} [host] - Base URL for Ollama (default: http://localhost:11434)
   */
  constructor(host) {
    super();
    this._host = (host || OLLAMA_DEFAULT_HOST).replace(/\/+$/, '');
    this._modelId = null;
    this._ready = false;
    this._abortController = null;
  }

  getCapabilities() {
    return {
      backend: 'local-server',
      streaming: true,
      toolCalling: true,
      multimodal: false,
      maxContextTokens: 8192,
      quantization: 'server-side'
    };
  }

  get displayName() {
    return `Ollama · ${this._modelId || 'disconnected'}`;
  }

  async init(modelId, onProgress) {
    if (!modelId) throw new Error('OllamaAdapter: modelId is required');

    if (onProgress) onProgress({ text: 'Connecting to Ollama…', ratio: 0.1 });

    // Verify Ollama is reachable
    const res = await fetch(`${this._host}/api/tags`, {
      signal: AbortSignal.timeout(5000)
    }).catch(() => null);

    if (!res || !res.ok) {
      throw new Error(`OllamaAdapter: cannot reach Ollama at ${this._host}. Is it running?`);
    }

    this._modelId = modelId;
    this._ready = true;
    if (onProgress) onProgress({ text: `Connected to Ollama · ${modelId}`, ratio: 1 });
  }

  async chat(messages, onToken, options = {}) {
    if (!this._ready || !this._modelId) {
      throw new Error('OllamaAdapter: not initialized — call init() first.');
    }

    this._abortController = new AbortController();

    const body = {
      model: this._modelId,
      messages,
      stream: true,
      options: {
        temperature: options.temperature ?? 0.55,
        num_predict: options.max_tokens ?? 1024
      }
    };

    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools;
    }

    const res = await fetch(`${this._host}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: this._abortController.signal
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => 'Unknown error');
      throw new Error(`OllamaAdapter: API error (${res.status}): ${txt}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const lines = decoder.decode(value, { stream: true }).split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            const delta = parsed.message?.content || '';
            if (delta) {
              fullResponse += delta;
              if (onToken) onToken(delta, fullResponse);
            }
          } catch {}
        }
      }
    } finally {
      this._abortController = null;
    }

    return fullResponse;
  }

  abort() {
    if (this._abortController) this._abortController.abort();
  }

  async dispose() {
    this._ready = false;
    this._modelId = null;
  }

  /**
   * List models available on the local Ollama server.
   * @param {string} [host]
   * @returns {Promise<string[]>} model names
   */
  static async listModels(host = OLLAMA_DEFAULT_HOST) {
    try {
      const res = await fetch(`${host.replace(/\/+$/, '')}/api/tags`, {
        signal: AbortSignal.timeout(3000)
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.models || []).map((m) => m.name);
    } catch {
      return [];
    }
  }

  /** @returns {Promise<boolean>} */
  static async isAvailable(host = OLLAMA_DEFAULT_HOST) {
    try {
      const res = await fetch(`${host.replace(/\/+$/, '')}/api/tags`, {
        signal: AbortSignal.timeout(2000)
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// ─── Cloud Adapter (OpenAI-compatible + Anthropic) ───────────────────────────

/**
 * Supported cloud provider presets.
 */
export const CLOUD_PROVIDERS = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    defaultEndpoint: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    protocol: 'openai'
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    defaultEndpoint: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-5-sonnet-20241022',
    protocol: 'anthropic'
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    defaultEndpoint: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-1.5-flash',
    protocol: 'openai'
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    defaultEndpoint: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    protocol: 'openai'
  },
  custom: {
    id: 'custom',
    name: 'Custom OpenAI-compatible',
    defaultEndpoint: '',
    defaultModel: 'gpt-3.5-turbo',
    protocol: 'openai'
  }
};

export class CloudAdapter extends ModelAdapter {
  /**
   * @param {object} config
   * @param {string} config.endpoint  - API base URL
   * @param {string} config.apiKey    - API key (stored only in memory)
   * @param {string} [config.model]   - Model name
   * @param {string} [config.provider] - 'openai'|'anthropic'|'gemini'|'groq'|'custom'
   */
  constructor(config = {}) {
    super();
    this._endpoint = (config.endpoint || '').replace(/\/+$/, '');
    this._apiKey = config.apiKey || '';
    this._model = config.model || 'gpt-3.5-turbo';
    this._provider = config.provider || this._detectProvider(this._endpoint);
    this._abortController = null;
  }

  getCapabilities() {
    return {
      backend: 'cloud',
      streaming: true,
      toolCalling: this._provider !== 'anthropic',
      multimodal: ['openai', 'anthropic', 'gemini'].includes(this._provider),
      maxContextTokens: 128000,
      quantization: 'cloud'
    };
  }

  get displayName() {
    const preset = Object.values(CLOUD_PROVIDERS).find(p => p.id === this._provider);
    return `${preset?.name || 'Cloud'} · ${this._model}`;
  }

  /** @returns {boolean} */
  get isConfigured() {
    return !!(this._endpoint && this._apiKey);
  }

  /**
   * Update configuration (replaces in-place so AIEngine can hot-swap settings).
   */
  configure(config = {}) {
    if (config.endpoint !== undefined) this._endpoint = (config.endpoint || '').replace(/\/+$/, '');
    if (config.apiKey !== undefined) this._apiKey = config.apiKey || '';
    if (config.model !== undefined) this._model = config.model || this._model;
    if (config.provider !== undefined) {
      this._provider = config.provider;
    } else {
      this._provider = this._detectProvider(this._endpoint);
    }
  }

  async init(modelId, onProgress) {
    if (modelId) this._model = modelId;
    if (!this._endpoint || !this._apiKey) {
      throw new Error('CloudAdapter: endpoint and apiKey are required. Configure them in Settings.');
    }
    if (onProgress) onProgress({ text: `Ready · ${this.displayName}`, ratio: 1 });
  }

  async chat(messages, onToken, options = {}) {
    if (!this._endpoint || !this._apiKey) {
      throw new Error('CloudAdapter: not configured. Set endpoint and API key in Settings.');
    }

    this._abortController = new AbortController();

    try {
      if (this._provider === 'anthropic') {
        return await this._chatAnthropic(messages, onToken, options);
      }
      return await this._chatOpenAI(messages, onToken, options);
    } finally {
      this._abortController = null;
    }
  }

  abort() {
    if (this._abortController) this._abortController.abort();
  }

  async dispose() {}

  // ─── OpenAI-compatible streaming ─────────────────────────────────────────

  async _chatOpenAI(messages, onToken, options = {}) {
    let url = this._endpoint;
    if (!url.endsWith('/chat/completions')) {
      url = url.replace(/\/$/, '') + '/chat/completions';
    }

    const body = {
      model: this._model,
      messages,
      stream: true,
      temperature: options.temperature ?? 0.55,
      max_tokens: options.max_tokens ?? 1024
    };

    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools;
      body.tool_choice = 'auto';
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this._apiKey}`
      },
      body: JSON.stringify(body),
      signal: this._abortController?.signal
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => 'Unknown error');
      throw new Error(`Cloud API error (${res.status}): ${txt}`);
    }

    return this._consumeSSE(res, onToken, (parsed) => {
      return parsed.choices?.[0]?.delta?.content || '';
    });
  }

  // ─── Anthropic Messages API streaming ────────────────────────────────────

  async _chatAnthropic(messages, onToken, options = {}) {
    let url = this._endpoint;
    if (!url.endsWith('/messages')) {
      url = url.replace(/\/$/, '') + '/messages';
    }

    const anthropicMessages = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content || '' }));

    const systemMsg = messages.find((m) => m.role === 'system');

    const body = {
      model: this._model,
      max_tokens: options.max_tokens ?? 1024,
      temperature: options.temperature ?? 0.55,
      messages: anthropicMessages,
      stream: true
    };

    if (systemMsg) body.system = systemMsg.content;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this._apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body),
      signal: this._abortController?.signal
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => 'Unknown error');
      throw new Error(`Cloud API error (${res.status}): ${txt}`);
    }

    return this._consumeSSE(res, onToken, (parsed) => {
      if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
        return parsed.delta.text || '';
      }
      return '';
    });
  }

  // ─── SSE reader ──────────────────────────────────────────────────────────

  async _consumeSSE(res, onToken, extractDelta) {
    const reader = res.body.getReader();
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
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const delta = extractDelta(parsed);
          if (delta) {
            fullResponse += delta;
            if (onToken) onToken(delta, fullResponse);
          }
        } catch {}
      }
    }

    return fullResponse;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  _detectProvider(endpoint) {
    let hostname = '';
    try {
      hostname = new URL(endpoint || '').hostname.toLowerCase();
    } catch {
      return 'custom';
    }
    if (hostname === 'api.anthropic.com') return 'anthropic';
    if (hostname === 'api.openai.com') return 'openai';
    if (hostname === 'generativelanguage.googleapis.com') return 'gemini';
    if (hostname === 'api.groq.com') return 'groq';
    return 'custom';
  }

  static getProviders() {
    return Object.values(CLOUD_PROVIDERS);
  }
}

// ─── Adapter factory ─────────────────────────────────────────────────────────

/**
 * Detect and instantiate the best available adapter based on the current environment.
 * Priority: WebGPU → Ollama → Cloud
 *
 * @param {object} [cloudConfig] - { endpoint, apiKey, model, provider }
 * @returns {Promise<ModelAdapter>}
 */
export async function detectBestAdapter(cloudConfig = {}) {
  // 1. WebGPU
  if (await WebLLMAdapter.isAvailable()) {
    return new WebLLMAdapter();
  }

  // 2. Local Ollama
  if (await OllamaAdapter.isAvailable()) {
    return new OllamaAdapter();
  }

  // 3. Cloud fallback
  if (cloudConfig.endpoint && cloudConfig.apiKey) {
    return new CloudAdapter(cloudConfig);
  }

  // 4. Default to WebLLM even if GPU detection failed (init() will provide clear error)
  return new WebLLMAdapter();
}
