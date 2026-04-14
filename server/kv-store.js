/**
 * KV Store — server-side persistent KV cache for conversation slots.
 *
 * Tracks hit/miss metrics for each (model, conversation) pair. Slot state
 * (Ollama conversation context arrays) is kept in memory and flushed to disk
 * on change so restarts can warm up quickly.
 *
 * Prometheus-compatible metrics are exposed via getMetrics().
 */

import { createReadStream, createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger } from './logger.js';

const log = createLogger('kv-store');

const CACHE_DIR = process.env.KV_CACHE_DIR || '/data/kv-cache';
const MAX_SLOTS = parseInt(process.env.KV_MAX_SLOTS || '64', 10);

// ─── KVStore ─────────────────────────────────────────────────────────────────

export class KVStore {
  constructor(cacheDir = CACHE_DIR) {
    this._dir = cacheDir;
    /** @type {Map<string, { context: number[], model: string, ts: number }>} */
    this._slots = new Map();
    this._metrics = {
      hits: 0,
      misses: 0,
      evictions: 0,
      flushes: 0,
      writes: 0
    };
  }

  /** Ensure cache directory exists. */
  init() {
    try {
      mkdirSync(this._dir, { recursive: true });
    } catch (err) {
      log.warn({ err }, 'Could not create KV cache directory — running in memory-only mode');
    }
    this._loadPersistedSlots().catch((err) => log.warn({ err }, 'Failed to reload persisted slots'));
  }

  /**
   * Build a slot key from model + conversation hash.
   * @param {string} model
   * @param {string} convHash
   * @returns {string}
   */
  slotKey(model, convHash) {
    return `${model}::${convHash}`;
  }

  /**
   * Look up a cached context for a (model, convHash) pair.
   * @param {string} model
   * @param {string} convHash
   * @returns {number[]|null} Ollama context array or null on miss
   */
  get(model, convHash) {
    const key = this.slotKey(model, convHash);
    const slot = this._slots.get(key);
    if (!slot) {
      this._metrics.misses++;
      return null;
    }
    slot.ts = Date.now(); // refresh LRU timestamp
    this._metrics.hits++;
    log.debug({ key }, 'KV cache hit');
    return slot.context;
  }

  /**
   * Store a context in the cache.
   * @param {string} model
   * @param {string} convHash
   * @param {number[]} context  Ollama context array
   */
  async set(model, convHash, context) {
    // Evict LRU when at capacity
    if (this._slots.size >= MAX_SLOTS) {
      this._evictLRU();
    }

    const key = this.slotKey(model, convHash);
    this._slots.set(key, { context, model, ts: Date.now() });
    await this._persist(key, { context, model, ts: Date.now() }).catch((err) =>
      log.warn({ err, key }, 'KV slot persist failed')
    );
  }

  /**
   * Delete a specific slot.
   * @param {string} model
   * @param {string} convHash
   */
  async delete(model, convHash) {
    const key = this.slotKey(model, convHash);
    this._slots.delete(key);
    const file = this._slotPath(key);
    try {
      await unlink(file);
    } catch {}
  }

  /**
   * Flush all slots from memory and disk.
   * @returns {Promise<number>} count of slots flushed
   */
  async flush() {
    const count = this._slots.size;
    const keys = [...this._slots.keys()];
    this._slots.clear();
    this._metrics.flushes++;
    await Promise.all(
      keys.map((key) => unlink(this._slotPath(key)).catch(() => {}))
    );
    log.info({ count }, 'KV cache flushed');
    return count;
  }

  /**
   * Prometheus-compatible metrics snapshot.
   * @returns {object}
   */
  getMetrics() {
    const total = this._metrics.hits + this._metrics.misses;
    return {
      ...this._metrics,
      slots: this._slots.size,
      maxSlots: MAX_SLOTS,
      hitRate: total > 0 ? this._metrics.hits / total : 0
    };
  }

  // ─── Persistence ───────────────────────────────────────────────────────────

  _slotPath(key) {
    // Replace :: and slashes for a safe filename
    const safe = key.replace(/[:/\\]/g, '_').slice(0, 200);
    return join(this._dir, `${safe}.json`);
  }

  async _persist(key, data) {
    const file = this._slotPath(key);
    // Store the original key in the file so it can be recovered on reload
    await writeFile(file, JSON.stringify({ ...data, _key: key }), 'utf8');
    this._metrics.writes++;
  }

  async _loadPersistedSlots() {
    if (!existsSync(this._dir)) return;
    const { readdir } = await import('node:fs/promises');
    const files = await readdir(this._dir).catch(() => []);
    let loaded = 0;
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      try {
        const raw = await readFile(join(this._dir, f), 'utf8');
        const data = JSON.parse(raw);
        // Use the persisted key if present; otherwise skip (unrecoverable)
        const key = data._key;
        if (key && data.context && data.model && this._slots.size < MAX_SLOTS) {
          const { _key: _k, ...slot } = data;
          this._slots.set(key, slot);
          loaded++;
        }
      } catch {}
    }
    if (loaded > 0) log.info({ loaded }, 'Restored KV slots from disk');
  }

  _evictLRU() {
    let oldest = Infinity;
    let oldestKey = null;
    for (const [k, v] of this._slots) {
      if (v.ts < oldest) { oldest = v.ts; oldestKey = k; }
    }
    if (oldestKey) {
      this._slots.delete(oldestKey);
      this._metrics.evictions++;
      unlink(this._slotPath(oldestKey)).catch(() => {});
      log.debug({ key: oldestKey }, 'KV slot evicted (LRU)');
    }
  }
}

/** Application-wide singleton */
export const kvStore = new KVStore();
