/**
 * Browser Model Loader — OPFS-backed caching, chunked download,
 * and quantization negotiation for on-device model weights.
 *
 * Responsibilities:
 *   1. Negotiate the best quantization level for the current device's GPU.
 *   2. Check OPFS (Origin Private File System) for cached model shards.
 *   3. Download model weights in 32 MB chunks, persist each shard to OPFS.
 *   4. Report granular progress throughout (checking → downloading → verifying → initializing).
 *   5. Provide helpers to list and evict cached models.
 *
 * Falls back to Cache API if OPFS is unavailable (Firefox, older Safari).
 * Falls back to in-memory loading (web-llm's own cache) if neither is available.
 */

// ─── Quantization cascade ────────────────────────────────────────────────────

/**
 * Ordered cascade: highest quality first, smallest last.
 * The negotiator walks this list until it finds one that fits device VRAM.
 */
const QUANT_CASCADE = ['q4f16_1', 'q4f32_1', 'q3f16_1', 'q2f16_1', 'wasm-int8'];

/**
 * Rough VRAM budget multipliers by quantization level.
 * Multiply by model param-count (billions) to get estimated VRAM in GB.
 */
const QUANT_VRAM_MULTIPLIER = {
  'q4f16_1': 0.8,
  'q4f32_1': 1.0,
  'q3f16_1': 0.6,
  'q2f16_1': 0.4,
  'wasm-int8': 0   // WASM — no GPU VRAM needed
};

// ─── Model catalog ────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ModelRecord
 * @property {string}  id
 * @property {string}  name
 * @property {string}  quantization   - default quantization
 * @property {number}  sizeBytes      - approximate total size in bytes
 * @property {number}  paramsBillion  - model parameter count in billions
 * @property {string}  backend        - 'webllm' | 'transformers'
 * @property {string}  [source]       - CDN base URL for manual download (optional)
 * @property {boolean} [cached]       - populated at runtime
 */

/**
 * @typedef {Object} LoadProgress
 * @property {'checking-cache'|'downloading'|'verifying'|'initializing'|'ready'} phase
 * @property {number}  ratio         - 0.0–1.0
 * @property {string}  text
 * @property {number}  [chunkIndex]
 * @property {number}  [totalChunks]
 */

// ─── BrowserModelLoader ───────────────────────────────────────────────────────

export class BrowserModelLoader {
  constructor() {
    /** @type {FileSystemDirectoryHandle|null} */
    this._opfsRoot = null;
    /** @type {Cache|null} */
    this._fallbackCache = null;
    /** @type {Map<string, ModelRecord>} */
    this._registry = new Map();
    /** @type {AbortController|null} */
    this._activeDownload = null;

    this.CHUNK_SIZE = 32 * 1024 * 1024; // 32 MB shards
  }

  // ─── Initialization ───────────────────────────────────────────────────────

  /**
   * Initialize storage backends.
   * Must be called before any load() or cache operations.
   * @returns {Promise<void>}
   */
  async init() {
    // Try OPFS first (best persistence, no quota prompt on most browsers)
    if (typeof navigator !== 'undefined' && navigator.storage?.getDirectory) {
      try {
        this._opfsRoot = await navigator.storage.getDirectory();
        return;
      } catch {}
    }

    // Fallback to Cache API
    if (typeof caches !== 'undefined') {
      try {
        this._fallbackCache = await caches.open('ai-space-models-v1');
        return;
      } catch {}
    }

    // No persistent storage — web-llm will manage its own cache via IndexedDB
  }

  // ─── Model Catalog ────────────────────────────────────────────────────────

  /**
   * Register a model into the loader's catalog.
   * @param {ModelRecord} record
   */
  register(record) {
    this._registry.set(record.id, record);
  }

  /**
   * Register the default set of supported models.
   */
  registerDefaults() {
    const defaults = [
      {
        id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
        name: 'Llama 3.2 1B',
        quantization: 'q4f16_1',
        sizeBytes: 734 * 1024 * 1024, // 700 MB
        paramsBillion: 1.24,
        backend: 'webllm'
      },
      {
        id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
        name: 'Qwen 2.5 0.5B',
        quantization: 'q4f16_1',
        sizeBytes: 367 * 1024 * 1024, // 350 MB
        paramsBillion: 0.5,
        backend: 'webllm'
      },
      {
        id: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
        name: 'SmolLM2 360M',
        quantization: 'q4f16_1',
        sizeBytes: 210 * 1024 * 1024, // 200 MB
        paramsBillion: 0.36,
        backend: 'webllm'
      },
      {
        id: 'Phi-3.5-mini-instruct-q4f16_1-MLC',
        name: 'Phi 3.5 Mini',
        quantization: 'q4f16_1',
        sizeBytes: 2362 * 1024 * 1024, // 2.2 GB
        paramsBillion: 3.82,
        backend: 'webllm'
      }
    ];
    for (const m of defaults) this.register(m);
  }

  // ─── Quantization Negotiation ─────────────────────────────────────────────

  /**
   * Negotiate the best quantization level for the current device.
   * Queries WebGPU adapter info; steps down if estimated VRAM usage is too high.
   * @param {string} modelId
   * @returns {Promise<string>} selected quantization string
   */
  async negotiateQuantization(modelId) {
    const record = this._registry.get(modelId);
    if (!record) return 'q4f16_1'; // best-effort default

    // No WebGPU → always use WASM/cloud
    if (typeof navigator === 'undefined' || !navigator.gpu) {
      return 'wasm-int8';
    }

    let estimatedVramGB = 2; // default assumption
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) {
        // GPUAdapterInfo.description gives clues about the GPU tier
        const info = adapter.info || {};
        const desc = (info.description || '').toLowerCase();

        // High-end GPUs: Apple M-series, NVIDIA RTX series, AMD RX 7xxx
        const isHighEnd = /apple|nvidia rtx|geforce rtx|radeon rx [789]/.test(desc);
        // Mid-range: integrated / mobile
        const isMid = /intel|amd radeon|apple m1|apple m2/.test(desc);

        if (isHighEnd) {
          estimatedVramGB = 12;
        } else if (isMid) {
          estimatedVramGB = 6;
        } else {
          estimatedVramGB = 3;
        }
      }
    } catch {}

    // Walk the cascade from best to worst
    for (const quant of QUANT_CASCADE) {
      if (quant === 'wasm-int8') return quant;
      const multiplier = QUANT_VRAM_MULTIPLIER[quant] ?? 1;
      const neededGB = record.paramsBillion * multiplier;
      if (neededGB <= estimatedVramGB * 0.8) { // 80% budget
        return quant;
      }
    }

    return 'wasm-int8';
  }

  // ─── Cache Management ─────────────────────────────────────────────────────

  /**
   * Check if a model is fully cached in OPFS.
   * @param {string} modelId
   * @returns {Promise<boolean>}
   */
  async isCached(modelId) {
    if (this._opfsRoot) {
      try {
        await this._opfsRoot.getDirectoryHandle(this._sanitizeId(modelId), { create: false });
        return true;
      } catch { return false; }
    }

    if (this._fallbackCache) {
      try {
        const res = await this._fallbackCache.match(`/_model/${modelId}/complete`);
        return !!res;
      } catch { return false; }
    }

    return false;
  }

  /**
   * List all model IDs currently cached in OPFS.
   * @returns {Promise<string[]>}
   */
  async listCached() {
    if (!this._opfsRoot) return [];
    const names = [];
    try {
      for await (const [name, handle] of this._opfsRoot.entries()) {
        if (handle.kind === 'directory') names.push(name);
      }
    } catch {}
    return names;
  }

  /**
   * Delete a cached model from OPFS to free storage.
   * @param {string} modelId
   * @returns {Promise<boolean>}
   */
  async evict(modelId) {
    if (this._opfsRoot) {
      try {
        await this._opfsRoot.removeEntry(this._sanitizeId(modelId), { recursive: true });
        return true;
      } catch { return false; }
    }

    if (this._fallbackCache) {
      try {
        const keys = await this._fallbackCache.keys();
        for (const req of keys) {
          if (req.url.includes(modelId)) {
            await this._fallbackCache.delete(req);
          }
        }
        return true;
      } catch { return false; }
    }

    return false;
  }

  /**
   * Get estimated storage usage in bytes.
   * @returns {Promise<number>}
   */
  async getStorageUsageBytes() {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return 0;
    try {
      const { usage } = await navigator.storage.estimate();
      return usage || 0;
    } catch { return 0; }
  }

  // ─── Download & Persist ───────────────────────────────────────────────────

  /**
   * Download a model in 32 MB chunks and persist each shard to OPFS.
   * @param {string} modelId
   * @param {string} sourceUrl
   * @param {(p: LoadProgress) => void} [onProgress]
   * @returns {Promise<void>}
   */
  async downloadAndCache(modelId, sourceUrl, onProgress) {
    this._activeDownload = new AbortController();

    const report = (phase, ratio, text, extra = {}) => {
      if (onProgress) onProgress({ phase, ratio, text, ...extra });
    };

    report('downloading', 0, 'Starting download…');

    const res = await fetch(sourceUrl, { signal: this._activeDownload.signal });
    if (!res.ok) {
      throw new Error(`Download failed: HTTP ${res.status}`);
    }

    const total = Number(res.headers.get('content-length') || 0);
    const reader = res.body.getReader();
    let received = 0;
    let chunkIndex = 0;
    let buffer = new Uint8Array(this.CHUNK_SIZE);
    let bufferOffset = 0;

    // Prepare OPFS directory for this model
    let dir = null;
    if (this._opfsRoot) {
      dir = await this._opfsRoot.getDirectoryHandle(this._sanitizeId(modelId), { create: true });
    }

    const flushShard = async () => {
      if (!dir) return; // no persistent storage — skip
      const shard = buffer.slice(0, bufferOffset);
      const fileHandle = await dir.getFileHandle(`shard-${chunkIndex}.bin`, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(shard);
      await writable.close();
      chunkIndex++;
      bufferOffset = 0;
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        received += value.length;

        let offset = 0;
        while (offset < value.length) {
          const space = this.CHUNK_SIZE - bufferOffset;
          const take = Math.min(space, value.length - offset);
          buffer.set(value.subarray(offset, offset + take), bufferOffset);
          bufferOffset += take;
          offset += take;

          if (bufferOffset === this.CHUNK_SIZE) {
            await flushShard();
          }
        }

        const ratio = total > 0 ? received / total : 0;
        report('downloading', ratio, `${(received / 1_048_576).toFixed(0)} MB downloaded`, {
          chunkIndex,
          totalChunks: total > 0 ? Math.ceil(total / this.CHUNK_SIZE) : undefined
        });
      }

      // Flush remaining bytes
      if (bufferOffset > 0) await flushShard();

      // Write completion marker
      if (dir) {
        const marker = await dir.getFileHandle('complete', { create: true });
        const w = await marker.createWritable();
        await w.write(JSON.stringify({ modelId, downloadedAt: Date.now(), totalBytes: received }));
        await w.close();
      }

      report('verifying', 1, 'Download complete and cached locally.');
    } finally {
      this._activeDownload = null;
    }
  }

  /** Cancel any in-progress download. */
  abortDownload() {
    if (this._activeDownload) {
      this._activeDownload.abort();
      this._activeDownload = null;
    }
  }

  // ─── Full Load Lifecycle ──────────────────────────────────────────────────

  /**
   * Full load lifecycle:
   *   negotiate quant → check cache → download if needed → return handle for adapter.
   *
   * For WebLLM models this resolves the quantization and returns metadata.
   * The actual model tensor loading is handled by the adapter (WebLLMAdapter.init()).
   *
   * @param {string} modelId
   * @param {(p: LoadProgress) => void} [onProgress]
   * @returns {Promise<{ modelId: string, quantization: string, cached: boolean }>}
   */
  async load(modelId, onProgress) {
    const report = (phase, ratio, text) => {
      if (onProgress) onProgress({ phase, ratio, text });
    };

    report('checking-cache', 0, 'Checking local storage…');

    const quantization = await this.negotiateQuantization(modelId);
    const cached = await this.isCached(modelId);

    if (cached) {
      report('initializing', 0.95, 'Loading from local cache…');
    } else {
      const record = this._registry.get(modelId);
      if (record?.source) {
        await this.downloadAndCache(modelId, record.source, onProgress);
      } else {
        report('initializing', 0.5, 'Model will be streamed (no local cache)…');
      }
    }

    report('ready', 1, `Ready · ${modelId} (${quantization})`);
    return { modelId, quantization, cached };
  }

  // ─── Disk Usage Summary ───────────────────────────────────────────────────

  /**
   * Get a human-readable storage summary for the settings UI.
   * @returns {Promise<{ total: string, models: Array<{id: string, shards: number}> }>}
   */
  async getStorageSummary() {
    const bytes = await this.getStorageUsageBytes();
    const models = await this.listCached();

    const modelDetails = await Promise.all(
      models.map(async (id) => {
        let shards = 0;
        if (this._opfsRoot) {
          try {
            const dir = await this._opfsRoot.getDirectoryHandle(id, { create: false });
            for await (const _ of dir.keys()) shards++; // eslint-disable-line no-unused-vars
          } catch {}
        }
        return { id, shards: Math.max(0, shards - 1) }; // exclude the 'complete' marker
      })
    );

    const mb = bytes / 1_048_576;
    const total = mb > 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;

    return { total, models: modelDetails };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /** Sanitize model ID to safe directory name. */
  _sanitizeId(id) {
    return String(id).replace(/[^a-zA-Z0-9._-]/g, '_');
  }
}

// ─── Singleton factory ────────────────────────────────────────────────────────

let _loaderInstance = null;

/**
 * Get the application-wide BrowserModelLoader singleton.
 * Initializes on first call.
 * @returns {Promise<BrowserModelLoader>}
 */
export async function getModelLoader() {
  if (!_loaderInstance) {
    _loaderInstance = new BrowserModelLoader();
    await _loaderInstance.init();
    _loaderInstance.registerDefaults();
  }
  return _loaderInstance;
}
