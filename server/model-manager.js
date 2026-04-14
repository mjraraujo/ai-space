/**
 * Model Manager — Ollama wrapper for the AI Space server.
 *
 * Responsibilities:
 *   - List models available on the Ollama sidecar.
 *   - Pull (download) models with SSE progress streaming.
 *   - Delete models.
 *   - Preload (warm) a model's KV context by sending a short prompt.
 *   - Auto-detect GPU (nvidia-smi / rocm-smi) to determine quantization tier.
 *
 * The Ollama service is reached at OLLAMA_HOST (env) or http://ollama:11434.
 */

import { createLogger } from './logger.js';

const log = createLogger('model-manager');

// ─── Model catalog ────────────────────────────────────────────────────────────

/**
 * Curated model catalog with recommended quantization by GPU tier.
 * tier: 'large' (≥12 GB VRAM), 'medium' (≥8 GB), 'small' (≥4 GB), 'cpu'
 */
export const SERVER_MODEL_CATALOG = [
  // ── Large ──────────────────────────────────────────────────────────────────
  { id: 'llama3.3:70b-instruct-q4_K_M', name: 'Llama 3.3 70B', tier: 'large', sizeGb: 42, description: 'State-of-the-art open instruction model at 70B.' },
  { id: 'qwen3:32b',                    name: 'Qwen 3 32B',     tier: 'large', sizeGb: 20, description: 'Alibaba Qwen 3 — excellent multilingual reasoning.' },
  { id: 'gemma3:27b',                   name: 'Gemma 3 27B',    tier: 'large', sizeGb: 17, description: "Google's Gemma 3 at 27B — strong coding + reasoning." },
  // ── Medium ────────────────────────────────────────────────────────────────
  { id: 'mistral-small:22b',            name: 'Mistral Small 22B',   tier: 'medium', sizeGb: 13, description: 'Fast and capable at 22B.' },
  { id: 'qwen3:14b',                    name: 'Qwen 3 14B',          tier: 'medium', sizeGb: 9,  description: 'Qwen 3 mid-range — great for long context.' },
  { id: 'gemma3:12b',                   name: 'Gemma 3 12B',         tier: 'medium', sizeGb: 8,  description: 'Gemma 3 compact — balanced quality and speed.' },
  // ── Small / CPU-capable ───────────────────────────────────────────────────
  { id: 'phi4:3.8b',                    name: 'Phi-4 3.8B',          tier: 'small',  sizeGb: 2.5, description: "Microsoft Phi-4 — best quality under 4B." },
  { id: 'gemma3:4b',                    name: 'Gemma 3 4B',          tier: 'small',  sizeGb: 2.5, description: 'Gemma 3 ultrafast — ideal for constrained hardware.' },
  { id: 'qwen3:1.7b',                   name: 'Qwen 3 1.7B',         tier: 'cpu',    sizeGb: 1.1, description: 'Runs entirely on CPU — works without a GPU.' },
  { id: 'llama3.2:1b',                  name: 'Llama 3.2 1B',        tier: 'cpu',    sizeGb: 0.7, description: 'Smallest Llama 3 — ultra-fast CPU inference.' },
];

// ─── GPU detection ────────────────────────────────────────────────────────────

/**
 * Attempt to detect GPU VRAM via nvidia-smi or rocm-smi.
 * @returns {Promise<{ vendor: string, vramGb: number }|null>}
 */
export async function detectGpu() {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const exec = promisify(execFile);

  // Try NVIDIA
  try {
    const { stdout } = await exec('nvidia-smi', [
      '--query-gpu=memory.total',
      '--format=csv,noheader,nounits'
    ], { timeout: 5000 });
    const mb = parseInt(stdout.trim().split('\n')[0], 10);
    if (!isNaN(mb)) {
      const vramGb = mb / 1024;
      log.info({ vendor: 'nvidia', vramGb }, 'GPU detected via nvidia-smi');
      return { vendor: 'nvidia', vramGb };
    }
  } catch {}

  // Try AMD ROCm
  try {
    const { stdout } = await exec('rocm-smi', ['--showmeminfo', 'vram', '--csv'], { timeout: 5000 });
    const match = stdout.match(/(\d+)/);
    if (match) {
      const mb = parseInt(match[1], 10);
      if (!isNaN(mb)) {
        const vramGb = mb / 1024;
        log.info({ vendor: 'amd', vramGb }, 'GPU detected via rocm-smi');
        return { vendor: 'amd', vramGb };
      }
    }
  } catch {}

  log.info('No GPU detected — CPU-only mode');
  return null;
}

/**
 * Select the best quantization tier for the available VRAM.
 * @param {number|null} vramGb
 * @returns {'large'|'medium'|'small'|'cpu'}
 */
export function selectTier(vramGb) {
  if (!vramGb || vramGb < 4) return 'cpu';
  if (vramGb < 8)  return 'small';
  if (vramGb < 12) return 'medium';
  return 'large';
}

// ─── ModelManager ─────────────────────────────────────────────────────────────

export class ModelManager {
  constructor(ollamaHost) {
    this._host = (ollamaHost || process.env.OLLAMA_HOST || 'http://ollama:11434').replace(/\/+$/, '');
    /** @type {{ vendor: string, vramGb: number }|null} */
    this._gpu = null;
    /** @type {'large'|'medium'|'small'|'cpu'} */
    this._tier = 'cpu';
  }

  /** Initialise: detect GPU and select tier. */
  async init() {
    this._gpu = await detectGpu();
    this._tier = selectTier(this._gpu?.vramGb ?? null);
    log.info({ tier: this._tier, gpu: this._gpu }, 'ModelManager initialised');
  }

  /** GPU info snapshot (for /api/models/gpu). */
  gpuInfo() {
    return { gpu: this._gpu, tier: this._tier };
  }

  /**
   * List all models currently available on the Ollama server.
   * @returns {Promise<object[]>}
   */
  async list() {
    const res = await this._fetch('/api/tags');
    const data = await res.json();
    return data.models || [];
  }

  /**
   * Stream a model pull from Ollama, yielding progress JSON lines.
   * @param {string} modelId
   * @param {(chunk: string) => void} onChunk  — raw NDJSON line from Ollama
   * @returns {Promise<void>}
   */
  async pull(modelId, onChunk) {
    log.info({ modelId }, 'Starting model pull');
    const res = await this._fetch('/api/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelId, stream: true })
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => 'unknown');
      throw new Error(`Ollama pull failed (${res.status}): ${txt}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        for (const line of text.split('\n')) {
          const t = line.trim();
          if (t) onChunk(t);
        }
      }
    } finally {
      reader.releaseLock();
    }
    log.info({ modelId }, 'Model pull complete');
  }

  /**
   * Delete a model from Ollama.
   * @param {string} modelId
   * @returns {Promise<void>}
   */
  async delete(modelId) {
    log.info({ modelId }, 'Deleting model');
    const res = await this._fetch('/api/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelId })
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`Delete failed (${res.status})`);
    }
  }

  /**
   * Warm a model by sending a minimal prompt — fills the KV cache for
   * instant first-token on the next real request.
   * @param {string} modelId
   * @returns {Promise<void>}
   */
  async preload(modelId) {
    log.info({ modelId }, 'Preloading model context');
    const res = await this._fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelId,
        prompt: 'Hello',
        stream: false,
        options: { num_predict: 1 }
      })
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Preload failed (${res.status}): ${txt}`);
    }
    await res.json();
    log.info({ modelId }, 'Model preloaded');
  }

  /**
   * Catalog of recommended models for this tier.
   * @returns {object[]}
   */
  catalog() {
    return SERVER_MODEL_CATALOG;
  }

  /** @private */
  async _fetch(path, init = {}) {
    return fetch(`${this._host}${path}`, { ...init, signal: AbortSignal.timeout(120_000) });
  }
}
