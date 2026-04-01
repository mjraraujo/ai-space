/**
 * AI Engine - WebGPU local inference via web-llm
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

const SYSTEM_PROMPT = `You are a helpful, concise personal AI assistant running privately on the user's device. Keep responses clear and direct. You have no access to the internet or external services. Be honest about your limitations. Format responses for easy reading.`;

export class AIEngine {
  constructor() {
    this.engine = null;
    this.modelId = null;
    this.status = 'idle'; // idle | loading | ready | error
    this.webgpuAvailable = false;
  }

  /**
   * Check WebGPU availability
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
   * Initialize engine with a model
   * @param {string} modelId - Model identifier
   * @param {function} onProgress - Progress callback (progress: {text, progress})
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
   * Stream a chat completion
   * @param {Array} messages - Chat messages [{role, content}]
   * @param {function} onToken - Streaming token callback
   * @returns {string} Full response text
   */
  async chat(messages, onToken) {
    if (this.status !== 'ready' || !this.engine) {
      throw new Error('Engine not ready. Call init() first.');
    }

    const fullMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
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
      throw new Error('Generation failed: ' + err.message);
    }
  }

  /**
   * Get engine status
   */
  getStatus() {
    return {
      status: this.status,
      modelId: this.modelId,
      modelInfo: this.modelId ? MODELS[this.modelId] : null,
      webgpuAvailable: this.webgpuAvailable
    };
  }

  /**
   * Get available models
   */
  static getModels() {
    return MODELS;
  }
}
