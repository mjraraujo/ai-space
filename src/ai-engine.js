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

const MODELS = {
  'Qwen2.5-0.5B-Instruct-q4f16_1-MLC': {
    name: 'Qwen 2.5 0.5B',
    size: '~350MB',
    description: 'Default. Good balance of speed and quality.'
  },
  'Llama-3.2-1B-Instruct-q4f16_1-MLC': {
    name: 'Llama 3.2 1B',
    size: '~700MB',
    description: 'Larger model. Better reasoning, slower download.'
  },
  'SmolLM2-360M-Instruct-q4f16_1-MLC': {
    name: 'SmolLM2 360M',
    size: '~200MB',
    description: 'Smallest. Fastest download, basic tasks.'
  }
};

const SYSTEM_PROMPT = `You are the user's personal AI. You live on their device, privately. You remember everything they've told you in this conversation.

How you behave:
- Talk naturally, like a thoughtful friend who's genuinely helpful
- Be warm but not fake. No corporate pleasantries. No "How can I assist you today?"
- If you already know context from earlier in the conversation, use it. Don't ask again.
- Give direct answers. If they ask something, answer it — don't redirect with questions unless you truly need more info
- Be concise. Short responses when the question is simple. Longer when it matters.
- You can think out loud when reasoning through something complex
- If they share something personal, acknowledge it like a person would
- You're running locally on their phone. You're private. You're theirs. Act like it.

What you can do:
- Summarize, draft replies, plan, organize thoughts, brainstorm, explain
- Remember everything from this conversation
- Be proactive — if you see a way to help further, suggest it briefly

What you don't do:
- Don't start responses with "I'm an AI" or "As an AI language model"
- Don't ask "Is there anything else?" at the end of every response
- Don't pretend to have access to things you don't (internet, their apps, their files)
- Don't be sycophantic`;

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
      modelId = Object.keys(MODELS)[0];
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

    try {
      const stream = await this.engine.chat.completions.create({
        messages: fullMessages,
        stream: true,
        temperature: 0.7,
        max_tokens: 1024
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

    // Ensure endpoint has /chat/completions
    let url = this.cloudEndpoint;
    if (!url.endsWith('/chat/completions')) {
      if (!url.endsWith('/')) url += '/';
      url += 'chat/completions';
    }

    try {
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
          temperature: 0.7,
          max_tokens: 1024
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
}
