import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { BrowserModelLoader, getModelLoader } from '../model-loader.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeOpfsMock(hasCachedModel = false) {
  const fileContents = new Map();
  const dirs = new Map();

  // Mock directory handle
  const makeDir = (name) => {
    if (!dirs.has(name)) dirs.set(name, new Map());
    const files = dirs.get(name);

    return {
      kind: 'directory',
      name,
      getFileHandle: vi.fn().mockImplementation(async (fileName, opts = {}) => {
        if (!files.has(fileName) && !opts.create) throw new DOMException('Not found', 'NotFoundError');
        const handle = {
          kind: 'file',
          name: fileName,
          createWritable: vi.fn().mockResolvedValue({
            write: vi.fn().mockResolvedValue(undefined),
            close: vi.fn().mockResolvedValue(undefined)
          })
        };
        files.set(fileName, handle);
        return handle;
      }),
      keys: vi.fn().mockImplementation(() => ({ [Symbol.asyncIterator]: () => files.keys()[Symbol.iterator]() }))
    };
  };

  const rootDir = {
    getDirectoryHandle: vi.fn().mockImplementation(async (name, opts = {}) => {
      if (!hasCachedModel && !opts.create) throw new DOMException('Not found', 'NotFoundError');
      if (!hasCachedModel && name !== 'cached-model' && !opts.create) throw new DOMException('Not found', 'NotFoundError');
      return makeDir(name);
    }),
    removeEntry: vi.fn().mockResolvedValue(undefined),
    entries: vi.fn().mockImplementation(() => ({
      [Symbol.asyncIterator]: function* () {
        if (hasCachedModel) {
          yield ['cached-model', makeDir('cached-model')];
        }
      }
    }))
  };

  return rootDir;
}

// ─── BrowserModelLoader ───────────────────────────────────────────────────────

describe('BrowserModelLoader', () => {
  let loader;

  beforeEach(() => {
    loader = new BrowserModelLoader();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ─── init() ──────────────────────────────────────────────────────────────

  describe('init()', () => {
    it('initializes without OPFS gracefully', async () => {
      vi.stubGlobal('navigator', { storage: null });
      vi.stubGlobal('caches', undefined);
      await expect(loader.init()).resolves.not.toThrow();
      expect(loader._opfsRoot).toBeNull();
    });

    it('sets _opfsRoot when OPFS is available', async () => {
      const mockRoot = makeOpfsMock();
      vi.stubGlobal('navigator', {
        storage: { getDirectory: vi.fn().mockResolvedValue(mockRoot) }
      });
      await loader.init();
      expect(loader._opfsRoot).toBe(mockRoot);
    });
  });

  // ─── Model Catalog ────────────────────────────────────────────────────────

  describe('register() / registerDefaults()', () => {
    it('registers a model', () => {
      loader.register({ id: 'test-model', name: 'Test', quantization: 'q4f16_1', sizeBytes: 1024, paramsBillion: 0.5, backend: 'webllm' });
      expect(loader._registry.has('test-model')).toBe(true);
    });

    it('registerDefaults() adds 4 known models', () => {
      loader.registerDefaults();
      expect(loader._registry.size).toBe(4);
    });

    it('registerDefaults() includes Llama 3.2 1B', () => {
      loader.registerDefaults();
      expect(loader._registry.has('Llama-3.2-1B-Instruct-q4f16_1-MLC')).toBe(true);
    });

    it('each default model has required fields', () => {
      loader.registerDefaults();
      for (const [, record] of loader._registry.entries()) {
        expect(record).toHaveProperty('id');
        expect(record).toHaveProperty('name');
        expect(record).toHaveProperty('quantization');
        expect(record).toHaveProperty('sizeBytes');
        expect(record).toHaveProperty('paramsBillion');
        expect(record).toHaveProperty('backend');
      }
    });
  });

  // ─── negotiateQuantization() ──────────────────────────────────────────────

  describe('negotiateQuantization()', () => {
    it('returns wasm-int8 when WebGPU unavailable', async () => {
      vi.stubGlobal('navigator', { gpu: undefined });
      loader.registerDefaults();
      const quant = await loader.negotiateQuantization('Llama-3.2-1B-Instruct-q4f16_1-MLC');
      expect(quant).toBe('wasm-int8');
    });

    it('returns q4f16_1 for high-end GPU', async () => {
      vi.stubGlobal('navigator', {
        gpu: {
          requestAdapter: vi.fn().mockResolvedValue({
            info: { description: 'NVIDIA RTX 4090' }
          })
        }
      });
      loader.registerDefaults();
      const quant = await loader.negotiateQuantization('SmolLM2-360M-Instruct-q4f16_1-MLC');
      expect(quant).toBe('q4f16_1');
    });

    it('returns default when model is not in registry', async () => {
      vi.stubGlobal('navigator', { gpu: undefined });
      const quant = await loader.negotiateQuantization('unknown-model');
      expect(quant).toBeTruthy();
    });

    it('handles requestAdapter throwing', async () => {
      vi.stubGlobal('navigator', {
        gpu: { requestAdapter: vi.fn().mockRejectedValue(new Error('GPU gone')) }
      });
      loader.registerDefaults();
      const quant = await loader.negotiateQuantization('Llama-3.2-1B-Instruct-q4f16_1-MLC');
      // Falls through to cascade or wasm
      expect(typeof quant).toBe('string');
    });
  });

  // ─── isCached() ──────────────────────────────────────────────────────────

  describe('isCached()', () => {
    it('returns false when no storage backend', async () => {
      expect(await loader.isCached('any-model')).toBe(false);
    });

    it('returns false when OPFS does not have the directory', async () => {
      loader._opfsRoot = makeOpfsMock(false);
      expect(await loader.isCached('not-cached')).toBe(false);
    });

    it('returns true when OPFS has the directory', async () => {
      loader._opfsRoot = makeOpfsMock(true);
      expect(await loader.isCached('cached-model')).toBe(true);
    });
  });

  // ─── listCached() ────────────────────────────────────────────────────────

  describe('listCached()', () => {
    it('returns empty array when no storage', async () => {
      expect(await loader.listCached()).toEqual([]);
    });

    it('returns cached model names from OPFS', async () => {
      loader._opfsRoot = makeOpfsMock(true);
      const cached = await loader.listCached();
      expect(cached).toContain('cached-model');
    });
  });

  // ─── evict() ─────────────────────────────────────────────────────────────

  describe('evict()', () => {
    it('returns false when no storage', async () => {
      expect(await loader.evict('any')).toBe(false);
    });

    it('returns true and calls removeEntry when OPFS available', async () => {
      const mockRoot = makeOpfsMock(true);
      loader._opfsRoot = mockRoot;
      const result = await loader.evict('cached-model');
      expect(result).toBe(true);
      expect(mockRoot.removeEntry).toHaveBeenCalledWith('cached-model', { recursive: true });
    });
  });

  // ─── getStorageUsageBytes() ───────────────────────────────────────────────

  describe('getStorageUsageBytes()', () => {
    it('returns 0 when navigator.storage.estimate is unavailable', async () => {
      vi.stubGlobal('navigator', {});
      const bytes = await loader.getStorageUsageBytes();
      expect(bytes).toBe(0);
    });

    it('returns usage when estimate is available', async () => {
      vi.stubGlobal('navigator', {
        storage: { estimate: vi.fn().mockResolvedValue({ usage: 1024 * 1024 * 200 }) }
      });
      const bytes = await loader.getStorageUsageBytes();
      expect(bytes).toBe(1024 * 1024 * 200);
    });
  });

  // ─── abortDownload() ─────────────────────────────────────────────────────

  describe('abortDownload()', () => {
    it('does not throw when no active download', () => {
      expect(() => loader.abortDownload()).not.toThrow();
    });

    it('cancels active download', () => {
      const ctrl = new AbortController();
      loader._activeDownload = ctrl;
      loader.abortDownload();
      expect(ctrl.signal.aborted).toBe(true);
      expect(loader._activeDownload).toBeNull();
    });
  });

  // ─── _sanitizeId() ───────────────────────────────────────────────────────

  describe('_sanitizeId()', () => {
    it('replaces special characters with underscore', () => {
      expect(loader._sanitizeId('model/with:bad!chars')).toMatch(/^[a-zA-Z0-9._-]+$/);
    });

    it('keeps alphanumeric, dots, dashes, underscores', () => {
      const id = 'Llama-3.2-1B_q4f16';
      expect(loader._sanitizeId(id)).toBe(id);
    });
  });

  // ─── load() ──────────────────────────────────────────────────────────────

  describe('load()', () => {
    it('reports progress events', async () => {
      vi.stubGlobal('navigator', { gpu: undefined });
      loader.registerDefaults();

      const events = [];
      await loader.load('SmolLM2-360M-Instruct-q4f16_1-MLC', (p) => events.push(p.phase));

      expect(events).toContain('checking-cache');
      expect(events).toContain('ready');
    });

    it('returns modelId, quantization, cached fields', async () => {
      vi.stubGlobal('navigator', { gpu: undefined });
      loader.registerDefaults();

      const result = await loader.load('SmolLM2-360M-Instruct-q4f16_1-MLC');
      expect(result).toHaveProperty('modelId', 'SmolLM2-360M-Instruct-q4f16_1-MLC');
      expect(result).toHaveProperty('quantization');
      expect(result).toHaveProperty('cached');
    });
  });
});

// ─── getModelLoader() singleton ───────────────────────────────────────────────

describe('getModelLoader()', () => {
  it('returns a BrowserModelLoader instance', async () => {
    vi.stubGlobal('navigator', { storage: null });
    vi.stubGlobal('caches', undefined);
    const loader = await getModelLoader();
    expect(loader).toBeInstanceOf(BrowserModelLoader);
  });

  it('returns the same instance on subsequent calls', async () => {
    vi.stubGlobal('navigator', { storage: null });
    vi.stubGlobal('caches', undefined);
    const a = await getModelLoader();
    const b = await getModelLoader();
    expect(a).toBe(b);
  });
});
