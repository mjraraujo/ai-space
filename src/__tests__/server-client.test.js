import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ServerClient } from '../server-client.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockFetch(status, body, headers = {}) {
  const response = {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (h) => headers[h.toLowerCase()] || null },
    json: () => Promise.resolve(typeof body === 'string' ? JSON.parse(body) : body),
    text: () => Promise.resolve(JSON.stringify(body)),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8))
  };
  return vi.fn().mockResolvedValue(response);
}

// ─── ServerClient construction ────────────────────────────────────────────────

describe('ServerClient construction', () => {
  it('is unconfigured when no URL is provided', () => {
    const client = new ServerClient('');
    expect(client.configured).toBe(false);
    expect(client.available).toBe(false);
  });

  it('is configured when a URL is provided', () => {
    const client = new ServerClient('http://localhost:3000');
    expect(client.configured).toBe(true);
  });

  it('strips trailing slash from URL', () => {
    const client = new ServerClient('http://localhost:3000/');
    expect(client._url).toBe('http://localhost:3000');
  });
});

// ─── ping ─────────────────────────────────────────────────────────────────────

describe('ServerClient.ping()', () => {
  it('returns ok:false when no URL configured', async () => {
    const client = new ServerClient('');
    const result = await client.ping();
    expect(result.ok).toBe(false);
    expect(client.available).toBe(false);
  });

  it('returns ok:true on successful health check', async () => {
    globalThis.fetch = mockFetch(200, { ok: true, ts: 12345 });
    const client = new ServerClient('http://localhost:3000');
    const result = await client.ping();
    expect(result.ok).toBe(true);
    expect(result.ts).toBe(12345);
    expect(client.available).toBe(true);
  });

  it('returns ok:false on network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    const client = new ServerClient('http://localhost:3000');
    const result = await client.ping();
    expect(result.ok).toBe(false);
    expect(client.available).toBe(false);
  });

  it('returns ok:false on 503 response', async () => {
    globalThis.fetch = mockFetch(503, { error: 'down' });
    const client = new ServerClient('http://localhost:3000');
    const result = await client.ping();
    expect(result.ok).toBe(false);
  });
});

// ─── listModels ───────────────────────────────────────────────────────────────

describe('ServerClient.listModels()', () => {
  it('returns models array from server', async () => {
    const models = [{ name: 'llama3.2:1b' }, { name: 'gemma3:4b' }];
    globalThis.fetch = mockFetch(200, { models });
    const client = new ServerClient('http://localhost:3000');
    const result = await client.listModels();
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('llama3.2:1b');
  });

  it('throws on server error', async () => {
    globalThis.fetch = mockFetch(502, { error: 'Ollama unreachable' });
    const client = new ServerClient('http://localhost:3000');
    await expect(client.listModels()).rejects.toThrow();
  });
});

// ─── getModelCatalog ──────────────────────────────────────────────────────────

describe('ServerClient.getModelCatalog()', () => {
  it('returns catalog array', async () => {
    const catalog = [{ id: 'phi4:3.8b', tier: 'small' }];
    globalThis.fetch = mockFetch(200, { catalog });
    const client = new ServerClient('http://localhost:3000');
    const result = await client.getModelCatalog();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('phi4:3.8b');
  });
});

// ─── getGpuInfo ───────────────────────────────────────────────────────────────

describe('ServerClient.getGpuInfo()', () => {
  it('returns gpu info object', async () => {
    const gpuInfo = { gpu: { vendor: 'nvidia', vramGb: 16 }, tier: 'large' };
    globalThis.fetch = mockFetch(200, gpuInfo);
    const client = new ServerClient('http://localhost:3000');
    const result = await client.getGpuInfo();
    expect(result.tier).toBe('large');
    expect(result.gpu.vendor).toBe('nvidia');
  });
});

// ─── preloadModel ─────────────────────────────────────────────────────────────

describe('ServerClient.preloadModel()', () => {
  it('posts to /api/models/preload', async () => {
    globalThis.fetch = mockFetch(200, { ok: true, model: 'gemma3:4b' });
    const client = new ServerClient('http://localhost:3000');
    const result = await client.preloadModel('gemma3:4b');
    expect(result.ok).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/models/preload'),
      expect.objectContaining({ method: 'POST' })
    );
  });
});

// ─── deleteModel ─────────────────────────────────────────────────────────────

describe('ServerClient.deleteModel()', () => {
  it('sends DELETE request with encoded model id', async () => {
    globalThis.fetch = mockFetch(200, { ok: true, deleted: 'phi4:3.8b' });
    const client = new ServerClient('http://localhost:3000');
    const result = await client.deleteModel('phi4:3.8b');
    expect(result.ok).toBe(true);
    const callUrl = fetch.mock.calls[0][0];
    expect(callUrl).toContain(encodeURIComponent('phi4:3.8b'));
  });
});

// ─── getKVStats ───────────────────────────────────────────────────────────────

describe('ServerClient.getKVStats()', () => {
  it('returns metrics snapshot', async () => {
    const stats = { hits: 10, misses: 3, slots: 7, hitRate: 0.77 };
    globalThis.fetch = mockFetch(200, stats);
    const client = new ServerClient('http://localhost:3000');
    const result = await client.getKVStats();
    expect(result.hits).toBe(10);
    expect(result.hitRate).toBeCloseTo(0.77);
  });
});

// ─── flushKVCache ─────────────────────────────────────────────────────────────

describe('ServerClient.flushKVCache()', () => {
  it('posts confirm:true to /api/kv/flush', async () => {
    globalThis.fetch = mockFetch(200, { ok: true, flushed: 5 });
    const client = new ServerClient('http://localhost:3000');
    const result = await client.flushKVCache();
    expect(result.flushed).toBe(5);
    const [, init] = fetch.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.confirm).toBe(true);
  });
});

// ─── chat (non-streaming) ─────────────────────────────────────────────────────

describe('ServerClient.chat() non-streaming', () => {
  it('returns assistant content from response', async () => {
    const response = {
      choices: [{ message: { role: 'assistant', content: 'Hello!' } }]
    };
    globalThis.fetch = mockFetch(200, response);
    const client = new ServerClient('http://localhost:3000');
    const text = await client.chat({
      model: 'gemma3:4b',
      messages: [{ role: 'user', content: 'Hi' }],
      stream: false
    });
    expect(text).toBe('Hello!');
  });
});

// ─── listVoices ───────────────────────────────────────────────────────────────

describe('ServerClient.listVoices()', () => {
  it('returns voices array', async () => {
    const voices = [{ id: 'af_heart', name: 'Heart' }];
    globalThis.fetch = mockFetch(200, { voices });
    const client = new ServerClient('http://localhost:3000');
    const result = await client.listVoices();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('af_heart');
  });
});
