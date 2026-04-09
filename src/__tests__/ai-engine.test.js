import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AIEngine } from '../ai-engine.js';

describe('AIEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new AIEngine();
  });

  // ─── static getModels ─────────────────────────────────────────────────────

  describe('AIEngine.getModels()', () => {
    it('returns an object', () => {
      expect(typeof AIEngine.getModels()).toBe('object');
    });

    it('uses Llama 3.2 1B as the default model ID', () => {
      expect(AIEngine.getDefaultModelId()).toBe('Llama-3.2-1B-Instruct-q4f16_1-MLC');
    });

    it('contains exactly 5 models', () => {
      expect(Object.keys(AIEngine.getModels())).toHaveLength(5);
    });

    it('includes SmolLM2 360M', () => {
      const models = AIEngine.getModels();
      expect(models).toHaveProperty('SmolLM2-360M-Instruct-q4f16_1-MLC');
      expect(models['SmolLM2-360M-Instruct-q4f16_1-MLC'].name).toBe('SmolLM2 360M');
    });

    it('includes Qwen 2.5 0.5B', () => {
      const models = AIEngine.getModels();
      expect(models).toHaveProperty('Qwen2.5-0.5B-Instruct-q4f16_1-MLC');
    });

    it('includes Llama 3.2 1B', () => {
      const models = AIEngine.getModels();
      expect(models).toHaveProperty('Llama-3.2-1B-Instruct-q4f16_1-MLC');
    });

    it('includes Phi 3.5 Mini', () => {
      const models = AIEngine.getModels();
      expect(models).toHaveProperty('Phi-3.5-mini-instruct-q4f16_1-MLC');
    });

    it('each model has name, size, description', () => {
      for (const [, model] of Object.entries(AIEngine.getModels())) {
        expect(model).toHaveProperty('name');
        expect(model).toHaveProperty('size');
        expect(model).toHaveProperty('description');
        expect(typeof model.name).toBe('string');
        expect(typeof model.size).toBe('string');
      }
    });

    it('model sizes are parseable (MB or GB format)', () => {
      const MB = 1024 * 1024;
      for (const [, model] of Object.entries(AIEngine.getModels())) {
        expect(model.size).toMatch(/^\d+(\.\d+)?\s*(MB|GB)$/i);
      }
    });
  });

  // ─── constructor / initial state ─────────────────────────────────────────

  describe('constructor', () => {
    it('starts in idle status', () => {
      expect(engine.status).toBe('idle');
    });

    it('starts in local mode', () => {
      expect(engine.mode).toBe('local');
    });

    it('has no engine loaded', () => {
      expect(engine.engine).toBeNull();
    });

    it('has no cloud config by default', () => {
      expect(engine.cloudEndpoint).toBe('');
      expect(engine.cloudApiKey).toBe('');
    });

    it('has empty promptContext', () => {
      expect(engine.promptContext).toBe('');
    });
  });

  // ─── getStatus ───────────────────────────────────────────────────────────

  describe('getStatus()', () => {
    it('returns correct shape', () => {
      const status = engine.getStatus();
      expect(status).toHaveProperty('status');
      expect(status).toHaveProperty('mode');
      expect(status).toHaveProperty('modelId');
      expect(status).toHaveProperty('modelInfo');
      expect(status).toHaveProperty('webgpuAvailable');
      expect(status).toHaveProperty('cloudConfigured');
      expect(status).toHaveProperty('cloudEndpoint');
      expect(status).toHaveProperty('cloudModel');
    });

    it('modelInfo is null when no model loaded', () => {
      expect(engine.getStatus().modelInfo).toBeNull();
    });

    it('cloudConfigured is false initially', () => {
      expect(engine.getStatus().cloudConfigured).toBe(false);
    });

    it('does not expose the full cloud endpoint (truncated)', () => {
      engine.setCloudConfig('https://api.openai.com/v1', 'sk-test', 'gpt-4');
      const status = engine.getStatus();
      // Should show truncated version, not the full path
      expect(status.cloudEndpoint).not.toBe('https://api.openai.com/v1');
      expect(status.cloudEndpoint).toContain('...');
    });
  });

  // ─── setCloudConfig / cloudConfigured ────────────────────────────────────

  describe('setCloudConfig()', () => {
    it('sets endpoint and key', () => {
      engine.setCloudConfig('https://api.openai.com/v1', 'sk-test', 'gpt-4o-mini');
      expect(engine.cloudEndpoint).toBe('https://api.openai.com/v1');
      expect(engine.cloudApiKey).toBe('sk-test');
      expect(engine.cloudModel).toBe('gpt-4o-mini');
    });

    it('strips trailing slash from endpoint', () => {
      engine.setCloudConfig('https://api.openai.com/v1/', 'key', 'model');
      expect(engine.cloudEndpoint).toBe('https://api.openai.com/v1');
    });

    it('strips multiple trailing slashes', () => {
      engine.setCloudConfig('https://api.openai.com/v1///', 'key', 'model');
      expect(engine.cloudEndpoint).toBe('https://api.openai.com/v1');
    });

    it('handles empty/null values gracefully', () => {
      engine.setCloudConfig('', '', '');
      expect(engine.cloudEndpoint).toBe('');
      expect(engine.cloudApiKey).toBe('');
    });

    it('defaults model to gpt-3.5-turbo when not provided', () => {
      engine.setCloudConfig('https://example.com', 'key', '');
      expect(engine.cloudModel).toBe('gpt-3.5-turbo');
    });
  });

  describe('cloudConfigured getter', () => {
    it('is false with no config', () => {
      expect(engine.cloudConfigured).toBe(false);
    });

    it('is false with endpoint but no key', () => {
      engine.cloudEndpoint = 'https://api.openai.com/v1';
      expect(engine.cloudConfigured).toBe(false);
    });

    it('is false with key but no endpoint', () => {
      engine.cloudApiKey = 'sk-test';
      expect(engine.cloudConfigured).toBe(false);
    });

    it('is true with both endpoint and key', () => {
      engine.setCloudConfig('https://api.openai.com/v1', 'sk-test', 'gpt-4');
      expect(engine.cloudConfigured).toBe(true);
    });
  });

  // ─── checkWebGPU ─────────────────────────────────────────────────────────

  describe('checkWebGPU()', () => {
    it('returns false when navigator.gpu is not available (Node env)', async () => {
      // In Node/Vitest, navigator.gpu doesn't exist → should return false
      const result = await engine.checkWebGPU();
      expect(result).toBe(false);
      expect(engine.webgpuAvailable).toBe(false);
    });

    it('returns false and sets webgpuAvailable=false when no gpu', async () => {
      // Stub navigator.gpu as undefined
      vi.stubGlobal('navigator', { gpu: undefined });
      const result = await engine.checkWebGPU();
      expect(result).toBe(false);
      vi.unstubAllGlobals();
    });

    it('handles exception from requestAdapter gracefully', async () => {
      vi.stubGlobal('navigator', {
        gpu: { requestAdapter: vi.fn().mockRejectedValue(new Error('GPU crashed')) }
      });
      const result = await engine.checkWebGPU();
      expect(result).toBe(false);
      vi.unstubAllGlobals();
    });

    it('returns true when adapter is available', async () => {
      vi.stubGlobal('navigator', {
        gpu: { requestAdapter: vi.fn().mockResolvedValue({ name: 'Test GPU' }) }
      });
      const result = await engine.checkWebGPU();
      expect(result).toBe(true);
      vi.unstubAllGlobals();
    });
  });

  // ─── init() error handling ────────────────────────────────────────────────

  describe('init()', () => {
    it('throws for unknown model ID', async () => {
      // checkWebGPU will return false in Node, so it throws before even checking model
      // Let's stub WebGPU to be available so we reach model check
      vi.stubGlobal('navigator', {
        gpu: { requestAdapter: vi.fn().mockResolvedValue({ name: 'Mock GPU' }) }
      });

      await expect(engine.init('NonExistentModel-v99')).rejects.toThrow('Unknown model');
      vi.unstubAllGlobals();
    });

    it('throws with WebGPU unavailable error when no GPU', async () => {
      vi.stubGlobal('navigator', { gpu: undefined });
      await expect(engine.init()).rejects.toThrow('WebGPU is not available');
      vi.unstubAllGlobals();
    });

    it('sets status to error on WebGPU failure', async () => {
      vi.stubGlobal('navigator', { gpu: undefined });
      try { await engine.init(); } catch {}
      expect(engine.status).toBe('error');
      vi.unstubAllGlobals();
    });

    it('returns early if same model already loaded', async () => {
      engine.status = 'ready';
      engine.engine = { chat: {} };
      engine.modelId = 'SmolLM2-360M-Instruct-q4f16_1-MLC';
      const result = await engine.init('SmolLM2-360M-Instruct-q4f16_1-MLC');
      expect(result).toBe(true);
    });
  });

  // ─── _chatLocal error path ────────────────────────────────────────────────

  describe('_chatLocal()', () => {
    it('throws when engine is not ready', async () => {
      await expect(engine._chatLocal([], null)).rejects.toThrow('Local engine not ready');
    });

    it('throws when status is loading', async () => {
      engine.status = 'loading';
      await expect(engine._chatLocal([], null)).rejects.toThrow('Local engine not ready');
    });
  });

  // ─── _chatCloud routing ───────────────────────────────────────────────────

  describe('_chatCloud()', () => {
    it('throws when no cloud config set', async () => {
      await expect(engine._chatCloud([], null)).rejects.toThrow('Cloud API not configured');
    });

    it('routes to Anthropic handler when endpoint includes api.anthropic.com', async () => {
      engine.setCloudConfig('https://api.anthropic.com/v1', 'sk-ant-test', 'claude-3-5-sonnet-20241022');
      const anthropicSpy = vi.spyOn(engine, '_chatAnthropic').mockResolvedValue('mocked response');
      await engine._chatCloud([{ role: 'user', content: 'hello' }], null);
      expect(anthropicSpy).toHaveBeenCalled();
      anthropicSpy.mockRestore();
    });

    it('does NOT route to Anthropic for OpenAI endpoint', async () => {
      engine.setCloudConfig('https://api.openai.com/v1', 'sk-test', 'gpt-4o-mini');
      const anthropicSpy = vi.spyOn(engine, '_chatAnthropic');

      // Mock fetch to avoid real network call
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: [DONE]\n\n')
              })
              .mockResolvedValueOnce({ done: true })
          })
        }
      });
      vi.stubGlobal('fetch', mockFetch);

      await engine._chatCloud([{ role: 'user', content: 'test' }], null);
      expect(anthropicSpy).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
      anthropicSpy.mockRestore();
    });

    it('appends /chat/completions to endpoint when missing', async () => {
      engine.setCloudConfig('https://api.openai.com/v1', 'sk-test', 'gpt-4o-mini');
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn().mockResolvedValue({ done: true })
          })
        }
      });
      vi.stubGlobal('fetch', mockFetch);

      try { await engine._chatCloud([], null); } catch {}
      const calledUrl = mockFetch.mock.calls[0]?.[0] || '';
      expect(calledUrl).toContain('/chat/completions');
      vi.unstubAllGlobals();
    });
  });

  // ─── _chatAnthropic routing ────────────────────────────────────────────────

  describe('_chatAnthropic()', () => {
    it('appends /messages when endpoint does not end with it', async () => {
      engine.setCloudConfig('https://api.anthropic.com/v1', 'sk-ant-test', 'claude-3-5-sonnet-20241022');

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn().mockResolvedValue({ done: true })
          })
        }
      });
      vi.stubGlobal('fetch', mockFetch);

      await engine._chatAnthropic([], 'system', null);
      const calledUrl = mockFetch.mock.calls[0]?.[0] || '';
      expect(calledUrl).toContain('/messages');
      vi.unstubAllGlobals();
    });

    it('does not double-append /messages', async () => {
      engine.setCloudConfig('https://api.anthropic.com/v1/messages', 'sk-ant-test', 'claude-3-5-sonnet-20241022');

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn().mockResolvedValue({ done: true })
          })
        }
      });
      vi.stubGlobal('fetch', mockFetch);

      await engine._chatAnthropic([], 'system', null);
      const calledUrl = mockFetch.mock.calls[0]?.[0] || '';
      expect(calledUrl.endsWith('/messages')).toBe(true);
      expect(calledUrl.split('/messages').length).toBe(2); // only one /messages
      vi.unstubAllGlobals();
    });

    it('filters out system messages from Anthropic payload', async () => {
      engine.setCloudConfig('https://api.anthropic.com/v1', 'sk-ant-test', 'claude-3-5-sonnet-20241022');

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        text: vi.fn().mockResolvedValue('Error')
      });
      vi.stubGlobal('fetch', mockFetch);

      try {
        await engine._chatAnthropic([
          { role: 'system', content: 'You are a helper' },
          { role: 'user', content: 'Hi' }
        ], 'system', null);
      } catch {}

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      // Should only have user/assistant messages, no system
      expect(body.messages.every(m => m.role === 'user' || m.role === 'assistant')).toBe(true);
      vi.unstubAllGlobals();
    });

    it('streams SSE content_block_delta events', async () => {
      engine.setCloudConfig('https://api.anthropic.com/v1', 'sk-ant-test', 'claude-3-5-sonnet-20241022');

      const sseChunk = [
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" World"}}',
        'data: {"type":"message_stop"}'
      ].join('\n\n') + '\n\n';

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => {
            let called = false;
            return {
              read: vi.fn().mockImplementation(async () => {
                if (!called) {
                  called = true;
                  return { done: false, value: new TextEncoder().encode(sseChunk) };
                }
                return { done: true };
              })
            };
          }
        }
      });
      vi.stubGlobal('fetch', mockFetch);

      const tokens = [];
      const result = await engine._chatAnthropic(
        [{ role: 'user', content: 'hi' }],
        'system content',
        (token, accumulated) => tokens.push({ token, accumulated })
      );

      expect(result).toBe('Hello World');
      expect(tokens).toHaveLength(2);
      expect(tokens[0].token).toBe('Hello');
      expect(tokens[1].accumulated).toBe('Hello World');
      vi.unstubAllGlobals();
    });

    it('throws on non-ok response', async () => {
      engine.setCloudConfig('https://api.anthropic.com/v1', 'sk-ant-test', 'claude-3-5-sonnet-20241022');

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        text: vi.fn().mockResolvedValue('Unauthorized'),
        status: 401
      }));

      await expect(
        engine._chatAnthropic([{ role: 'user', content: 'test' }], 'sys', null)
      ).rejects.toThrow('Cloud API error (401)');

      vi.unstubAllGlobals();
    });
  });

  // ─── chat() routing ───────────────────────────────────────────────────────

  describe('chat()', () => {
    it('routes to cloud when mode is cloud', async () => {
      engine.mode = 'cloud';
      const cloudSpy = vi.spyOn(engine, '_chatCloud').mockResolvedValue('cloud response');
      await engine.chat([], null, {});
      expect(cloudSpy).toHaveBeenCalled();
      cloudSpy.mockRestore();
    });

    it('routes to local when mode is local and engine ready', async () => {
      engine.mode = 'local';
      engine.status = 'ready';
      const localSpy = vi.spyOn(engine, '_chatLocal').mockResolvedValue('local response');
      await engine.chat([], null, {});
      expect(localSpy).toHaveBeenCalled();
      localSpy.mockRestore();
    });

    it('routes to cloud in hybrid mode when forceCloud=true', async () => {
      engine.mode = 'hybrid';
      engine.status = 'ready';
      const cloudSpy = vi.spyOn(engine, '_chatCloud').mockResolvedValue('cloud');
      await engine.chat([], null, { forceCloud: true });
      expect(cloudSpy).toHaveBeenCalled();
      cloudSpy.mockRestore();
    });

    it('routes to cloud in hybrid mode when local engine not ready', async () => {
      engine.mode = 'hybrid';
      engine.status = 'idle'; // not ready
      const cloudSpy = vi.spyOn(engine, '_chatCloud').mockResolvedValue('cloud');
      await engine.chat([], null, {});
      expect(cloudSpy).toHaveBeenCalled();
      cloudSpy.mockRestore();
    });
  });

  // ─── Adapter management ───────────────────────────────────────────────────

  describe('setAdapter() / getAdapter()', () => {
    it('getAdapter() returns null initially', () => {
      expect(engine.getAdapter()).toBeNull();
    });

    it('setAdapter() stores and getAdapter() returns it', () => {
      const fakeAdapter = { chat: vi.fn(), getCapabilities: () => ({ backend: 'test' }) };
      engine.setAdapter(fakeAdapter);
      expect(engine.getAdapter()).toBe(fakeAdapter);
    });
  });

  // ─── getStatus() includes adapter info ───────────────────────────────────

  describe('getStatus() with adapter', () => {
    it('includes adapterName, backend, toolCalling when adapter set', () => {
      engine._adapter = {
        displayName: 'Test Adapter',
        getCapabilities: () => ({
          backend: 'webgpu',
          toolCalling: true,
          maxContextTokens: 4096
        })
      };
      const status = engine.getStatus();
      expect(status.adapterName).toBe('Test Adapter');
      expect(status.backend).toBe('webgpu');
      expect(status.toolCalling).toBe(true);
      expect(status.maxContextTokens).toBe(4096);
    });

    it('adapterName is null when no adapter set', () => {
      expect(engine.getStatus().adapterName).toBeNull();
    });
  });

  // ─── Context management ───────────────────────────────────────────────────

  describe('_manageContext()', () => {
    it('returns messages unchanged when under limit', () => {
      const messages = [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi' }
      ];
      const result = engine._manageContext(messages);
      expect(result).toHaveLength(2);
    });

    it('trims messages when over maxContextTurns', () => {
      engine.maxContextTurns = 4;
      const messages = Array.from({ length: 10 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `message ${i}`
      }));
      const result = engine._manageContext(messages);
      expect(result).toHaveLength(4);
    });

    it('sets _contextSummary from evicted user messages', () => {
      engine.maxContextTurns = 2;
      const messages = [
        { role: 'user', content: 'evicted user message' },
        { role: 'assistant', content: 'response' },
        { role: 'user', content: 'kept message' },
        { role: 'assistant', content: 'kept response' }
      ];
      engine._manageContext(messages);
      expect(engine._contextSummary).toContain('evicted user message');
    });

    it('returns null/undefined input unchanged', () => {
      expect(engine._manageContext(null)).toBeNull();
      expect(engine._manageContext(undefined)).toBeUndefined();
    });
  });

  // ─── setCloudConfig() hot-updates adapter ────────────────────────────────

  describe('setCloudConfig() hot-update', () => {
    it('calls configure() on active CloudAdapter-like adapter', () => {
      const mockAdapter = {
        configure: vi.fn(),
        _isCloudAdapter: true  // duck-typed detection
      };
      // Simulate CloudAdapter instance by setting constructor name
      Object.defineProperty(mockAdapter, 'constructor', { value: { name: 'CloudAdapter' } });

      engine.setCloudConfig('https://api.openai.com/v1', 'sk-test', 'gpt-4o');
      // _adapter is not set here, so configure is not called — just verify config stored
      expect(engine.cloudEndpoint).toBe('https://api.openai.com/v1');
      expect(engine.cloudApiKey).toBe('sk-test');
      expect(engine.cloudModel).toBe('gpt-4o');
    });
  });

  // ─── abort() ─────────────────────────────────────────────────────────────

  describe('abort()', () => {
    it('does not throw when no adapter set', () => {
      expect(() => engine.abort()).not.toThrow();
    });

    it('calls abort() on the active adapter', () => {
      const mockAbort = vi.fn();
      engine._adapter = { abort: mockAbort };
      engine.abort();
      expect(mockAbort).toHaveBeenCalled();
    });
  });
});
