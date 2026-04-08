import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ModelAdapter,
  WebLLMAdapter,
  OllamaAdapter,
  CloudAdapter,
  WEB_LLM_MODELS,
  DEFAULT_WEB_LLM_MODEL,
  CLOUD_PROVIDERS,
  detectBestAdapter
} from '../model-adapter.js';

// ─── Base ModelAdapter interface ─────────────────────────────────────────────

describe('ModelAdapter (base interface)', () => {
  let adapter;

  beforeEach(() => {
    adapter = new ModelAdapter();
  });

  it('getCapabilities() throws by default', () => {
    expect(() => adapter.getCapabilities()).toThrow('not implemented');
  });

  it('init() throws by default', async () => {
    await expect(adapter.init('model')).rejects.toThrow('not implemented');
  });

  it('chat() throws by default', async () => {
    await expect(adapter.chat([])).rejects.toThrow('not implemented');
  });

  it('abort() is a no-op by default', () => {
    expect(() => adapter.abort()).not.toThrow();
  });

  it('dispose() resolves by default', async () => {
    await expect(adapter.dispose()).resolves.not.toThrow();
  });

  it('displayName returns Unknown Adapter', () => {
    expect(adapter.displayName).toBe('Unknown Adapter');
  });
});

// ─── WebLLMAdapter ────────────────────────────────────────────────────────────

describe('WebLLMAdapter', () => {
  it('getCapabilities() returns correct shape when no model loaded', () => {
    const adapter = new WebLLMAdapter();
    const caps = adapter.getCapabilities();
    expect(caps).toHaveProperty('backend', 'webgpu');
    expect(caps).toHaveProperty('streaming', true);
    expect(caps).toHaveProperty('toolCalling', false);
    expect(caps).toHaveProperty('multimodal', false);
    expect(caps).toHaveProperty('maxContextTokens');
    expect(caps).toHaveProperty('quantization');
  });

  it('getModels() returns known models', () => {
    const models = WebLLMAdapter.getModels();
    expect(models).toHaveProperty('Llama-3.2-1B-Instruct-q4f16_1-MLC');
    expect(models).toHaveProperty('SmolLM2-360M-Instruct-q4f16_1-MLC');
    expect(models).toHaveProperty('Qwen2.5-0.5B-Instruct-q4f16_1-MLC');
    expect(models).toHaveProperty('Phi-3.5-mini-instruct-q4f16_1-MLC');
  });

  it('getDefaultModelId() returns Llama 3.2 1B', () => {
    expect(WebLLMAdapter.getDefaultModelId()).toBe('Llama-3.2-1B-Instruct-q4f16_1-MLC');
  });

  it('each model has name, size, description, quantization, maxContextTokens', () => {
    for (const [, model] of Object.entries(WEB_LLM_MODELS)) {
      expect(model).toHaveProperty('name');
      expect(model).toHaveProperty('size');
      expect(model).toHaveProperty('description');
      expect(model).toHaveProperty('quantization');
      expect(model).toHaveProperty('maxContextTokens');
      expect(typeof model.maxContextTokens).toBe('number');
      expect(model.maxContextTokens).toBeGreaterThan(0);
    }
  });

  it('DEFAULT_WEB_LLM_MODEL matches Llama 3.2 1B', () => {
    expect(DEFAULT_WEB_LLM_MODEL).toBe('Llama-3.2-1B-Instruct-q4f16_1-MLC');
  });

  it('isAvailable() returns false when navigator.gpu is absent', async () => {
    vi.stubGlobal('navigator', { gpu: undefined });
    const result = await WebLLMAdapter.isAvailable();
    expect(result).toBe(false);
    vi.unstubAllGlobals();
  });

  it('isAvailable() returns true when adapter resolves', async () => {
    vi.stubGlobal('navigator', {
      gpu: { requestAdapter: vi.fn().mockResolvedValue({ name: 'Test GPU' }) }
    });
    const result = await WebLLMAdapter.isAvailable();
    expect(result).toBe(true);
    vi.unstubAllGlobals();
  });

  it('isAvailable() returns false when requestAdapter throws', async () => {
    vi.stubGlobal('navigator', {
      gpu: { requestAdapter: vi.fn().mockRejectedValue(new Error('GPU error')) }
    });
    const result = await WebLLMAdapter.isAvailable();
    expect(result).toBe(false);
    vi.unstubAllGlobals();
  });

  it('init() throws for unknown model', async () => {
    vi.stubGlobal('navigator', {
      gpu: { requestAdapter: vi.fn().mockResolvedValue({ name: 'GPU' }) }
    });
    const adapter = new WebLLMAdapter();
    await expect(adapter.init('NonExistent-Model')).rejects.toThrow('unknown model');
    vi.unstubAllGlobals();
  });

  it('init() throws when WebGPU unavailable', async () => {
    vi.stubGlobal('navigator', { gpu: undefined });
    const adapter = new WebLLMAdapter();
    await expect(adapter.init('SmolLM2-360M-Instruct-q4f16_1-MLC')).rejects.toThrow('WebGPU is not available');
    vi.unstubAllGlobals();
  });

  it('chat() throws when not initialized', async () => {
    const adapter = new WebLLMAdapter();
    await expect(adapter.chat([])).rejects.toThrow('engine not ready');
  });

  it('abort() does not throw when no active generation', () => {
    const adapter = new WebLLMAdapter();
    expect(() => adapter.abort()).not.toThrow();
  });

  it('dispose() resolves cleanly when not initialized', async () => {
    const adapter = new WebLLMAdapter();
    await expect(adapter.dispose()).resolves.not.toThrow();
  });

  it('displayName shows "Local · model name" when model loaded', () => {
    const adapter = new WebLLMAdapter();
    adapter._modelId = 'SmolLM2-360M-Instruct-q4f16_1-MLC';
    expect(adapter.displayName).toContain('Local');
    expect(adapter.displayName).toContain('SmolLM2');
  });

  it('displayName falls back gracefully when modelId is null', () => {
    const adapter = new WebLLMAdapter();
    expect(adapter.displayName).toContain('Local');
  });
});

// ─── OllamaAdapter ───────────────────────────────────────────────────────────

describe('OllamaAdapter', () => {
  it('getCapabilities() returns correct shape', () => {
    const adapter = new OllamaAdapter();
    const caps = adapter.getCapabilities();
    expect(caps.backend).toBe('local-server');
    expect(caps.streaming).toBe(true);
    expect(caps.toolCalling).toBe(true);
  });

  it('displays host and model in displayName', () => {
    const adapter = new OllamaAdapter('http://localhost:11434');
    adapter._modelId = 'llama3';
    expect(adapter.displayName).toContain('Ollama');
    expect(adapter.displayName).toContain('llama3');
  });

  it('init() throws when Ollama is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    const adapter = new OllamaAdapter();
    await expect(adapter.init('llama3')).rejects.toThrow('cannot reach Ollama');
    vi.unstubAllGlobals();
  });

  it('init() throws when no modelId provided', async () => {
    const adapter = new OllamaAdapter();
    await expect(adapter.init('')).rejects.toThrow('modelId is required');
  });

  it('chat() throws when not initialized', async () => {
    const adapter = new OllamaAdapter();
    await expect(adapter.chat([])).rejects.toThrow('not initialized');
  });

  it('isAvailable() returns false when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const result = await OllamaAdapter.isAvailable();
    expect(result).toBe(false);
    vi.unstubAllGlobals();
  });

  it('isAvailable() returns true when Ollama responds ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    const result = await OllamaAdapter.isAvailable();
    expect(result).toBe(true);
    vi.unstubAllGlobals();
  });

  it('listModels() returns empty array on error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
    const models = await OllamaAdapter.listModels();
    expect(models).toEqual([]);
    vi.unstubAllGlobals();
  });

  it('listModels() returns model names on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: [{ name: 'llama3' }, { name: 'mistral' }] })
    }));
    const models = await OllamaAdapter.listModels();
    expect(models).toEqual(['llama3', 'mistral']);
    vi.unstubAllGlobals();
  });

  it('abort() does not throw', () => {
    const adapter = new OllamaAdapter();
    expect(() => adapter.abort()).not.toThrow();
  });
});

// ─── CloudAdapter ─────────────────────────────────────────────────────────────

describe('CloudAdapter', () => {
  it('getCapabilities() returns cloud backend', () => {
    const adapter = new CloudAdapter({ endpoint: 'https://api.openai.com/v1', apiKey: 'k' });
    const caps = adapter.getCapabilities();
    expect(caps.backend).toBe('cloud');
    expect(caps.streaming).toBe(true);
    expect(caps.maxContextTokens).toBeGreaterThan(0);
  });

  it('detects OpenAI provider from endpoint', () => {
    const adapter = new CloudAdapter({ endpoint: 'https://api.openai.com/v1', apiKey: 'k' });
    expect(adapter._provider).toBe('openai');
  });

  it('detects Anthropic provider from endpoint', () => {
    const adapter = new CloudAdapter({ endpoint: 'https://api.anthropic.com/v1', apiKey: 'k' });
    expect(adapter._provider).toBe('anthropic');
  });

  it('detects Groq provider from endpoint', () => {
    const adapter = new CloudAdapter({ endpoint: 'https://api.groq.com/openai/v1', apiKey: 'k' });
    expect(adapter._provider).toBe('groq');
  });

  it('isConfigured is true with endpoint and key', () => {
    const adapter = new CloudAdapter({ endpoint: 'https://api.openai.com/v1', apiKey: 'sk-test' });
    expect(adapter.isConfigured).toBe(true);
  });

  it('isConfigured is false without key', () => {
    const adapter = new CloudAdapter({ endpoint: 'https://api.openai.com/v1', apiKey: '' });
    expect(adapter.isConfigured).toBe(false);
  });

  it('configure() updates endpoint and key', () => {
    const adapter = new CloudAdapter({ endpoint: '', apiKey: '' });
    adapter.configure({ endpoint: 'https://api.openai.com/v1/', apiKey: 'sk-new', model: 'gpt-4o' });
    expect(adapter._endpoint).toBe('https://api.openai.com/v1');
    expect(adapter._apiKey).toBe('sk-new');
    expect(adapter._model).toBe('gpt-4o');
  });

  it('chat() throws when not configured', async () => {
    const adapter = new CloudAdapter({ endpoint: '', apiKey: '' });
    await expect(adapter.chat([])).rejects.toThrow('not configured');
  });

  it('displayName includes provider name and model', () => {
    const adapter = new CloudAdapter({ endpoint: 'https://api.openai.com/v1', apiKey: 'k', model: 'gpt-4o' });
    expect(adapter.displayName).toContain('OpenAI');
    expect(adapter.displayName).toContain('gpt-4o');
  });

  it('dispose() resolves cleanly', async () => {
    const adapter = new CloudAdapter({ endpoint: 'x', apiKey: 'k' });
    await expect(adapter.dispose()).resolves.not.toThrow();
  });

  it('strips trailing slashes from endpoint', () => {
    const adapter = new CloudAdapter({ endpoint: 'https://api.openai.com/v1///', apiKey: 'k' });
    expect(adapter._endpoint).toBe('https://api.openai.com/v1');
  });

  describe('_chatOpenAI', () => {
    it('appends /chat/completions when missing', async () => {
      const adapter = new CloudAdapter({ endpoint: 'https://api.openai.com/v1', apiKey: 'sk' });
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: [DONE]\n\n')
              })
              .mockResolvedValue({ done: true })
          })
        }
      });
      vi.stubGlobal('fetch', mockFetch);
      adapter._abortController = null;
      await adapter._chatOpenAI([], null, {});
      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('/chat/completions');
      vi.unstubAllGlobals();
    });

    it('throws on non-ok response', async () => {
      const adapter = new CloudAdapter({ endpoint: 'https://api.openai.com/v1', apiKey: 'sk' });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized'
      }));
      adapter._abortController = null;
      await expect(adapter._chatOpenAI([], null, {})).rejects.toThrow('Cloud API error (401)');
      vi.unstubAllGlobals();
    });
  });

  describe('_chatAnthropic', () => {
    it('appends /messages when missing', async () => {
      const adapter = new CloudAdapter({ endpoint: 'https://api.anthropic.com/v1', apiKey: 'sk-ant' });
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: { getReader: () => ({ read: vi.fn().mockResolvedValue({ done: true }) }) }
      });
      vi.stubGlobal('fetch', mockFetch);
      adapter._abortController = null;
      await adapter._chatAnthropic([], null, {});
      expect(mockFetch.mock.calls[0][0]).toContain('/messages');
      vi.unstubAllGlobals();
    });

    it('filters system messages from payload', async () => {
      const adapter = new CloudAdapter({ endpoint: 'https://api.anthropic.com/v1', apiKey: 'sk-ant' });
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'bad request'
      });
      vi.stubGlobal('fetch', mockFetch);
      adapter._abortController = null;
      try {
        await adapter._chatAnthropic(
          [{ role: 'system', content: 'be helpful' }, { role: 'user', content: 'hello' }],
          null, {}
        );
      } catch {}
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.messages.every(m => m.role !== 'system')).toBe(true);
      vi.unstubAllGlobals();
    });
  });

  it('getProviders() returns all cloud providers', () => {
    const providers = CloudAdapter.getProviders();
    expect(providers.length).toBeGreaterThanOrEqual(4);
    const ids = providers.map(p => p.id);
    expect(ids).toContain('openai');
    expect(ids).toContain('anthropic');
    expect(ids).toContain('groq');
    expect(ids).toContain('gemini');
  });

  it('CLOUD_PROVIDERS is exported and has expected shape', () => {
    for (const [, provider] of Object.entries(CLOUD_PROVIDERS)) {
      expect(provider).toHaveProperty('id');
      expect(provider).toHaveProperty('name');
      expect(provider).toHaveProperty('defaultEndpoint');
      expect(provider).toHaveProperty('defaultModel');
      expect(provider).toHaveProperty('protocol');
    }
  });
});

// ─── detectBestAdapter ────────────────────────────────────────────────────────

describe('detectBestAdapter()', () => {
  it('returns a ModelAdapter instance', async () => {
    vi.stubGlobal('navigator', { gpu: undefined });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no ollama')));
    const adapter = await detectBestAdapter();
    expect(adapter).toBeInstanceOf(ModelAdapter);
    vi.unstubAllGlobals();
  });

  it('returns CloudAdapter when cloud config is provided and no local options', async () => {
    vi.stubGlobal('navigator', { gpu: undefined });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no ollama')));
    const adapter = await detectBestAdapter({
      endpoint: 'https://api.openai.com/v1',
      apiKey: 'sk-test'
    });
    expect(adapter).toBeInstanceOf(CloudAdapter);
    vi.unstubAllGlobals();
  });
});
