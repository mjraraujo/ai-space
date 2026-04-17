/**
 * ServerClient — Browser-side API client for the AI Space backend server.
 *
 * The server URL is injected by nginx as `window.__SERVER_URL__` when the
 * app is served from the Docker stack. If absent, all methods return null /
 * reject gracefully so the SPA falls back to its existing browser-native path
 * (WebLLM, browser Whisper WASM, in-browser KV).
 *
 * Usage:
 *   import { serverClient } from './server-client.js';
 *   if (serverClient.available) { ... }
 */

// ─── Detection ────────────────────────────────────────────────────────────────

const SERVER_URL = (
  (typeof window !== 'undefined' && window.__SERVER_URL__) ||
  ''
).replace(/\/+$/, '');

// ─── ServerClient ─────────────────────────────────────────────────────────────

export class ServerClient {
  constructor(serverUrl = SERVER_URL) {
    this._url = serverUrl.replace(/\/+$/, '');
    /** @type {boolean|null} null = not yet checked */
    this._healthy = null;
  }

  /** True when the server URL is configured. */
  get configured() {
    return Boolean(this._url);
  }

  /** True when the server was reachable on the last health check. */
  get available() {
    return this._healthy === true;
  }

  // ── Health ────────────────────────────────────────────────────────────────

  /**
   * Ping the server health endpoint.
   * @returns {Promise<{ ok: boolean, ts: number }>}
   */
  async ping() {
    if (!this._url) {
      this._healthy = false;
      return { ok: false, ts: 0 };
    }
    try {
      const res = await fetch(`${this._url}/health`, { signal: AbortSignal.timeout(3000) });
      const data = await res.json().catch(() => ({}));
      this._healthy = res.ok;
      return { ok: res.ok, ts: data.ts || 0 };
    } catch {
      this._healthy = false;
      return { ok: false, ts: 0 };
    }
  }

  /**
   * Aggregated health snapshot — pings every downstream backend (Ollama,
   * Whisper, Kokoro, PersonaPlex) via the ai-server's /api/health/full
   * route.  Returns `null` when the server is not configured.
   *
   * @returns {Promise<{ ts: number, gpu: object, backends: object }|null>}
   */
  async fullHealth() {
    if (!this._url) return null;
    try {
      const res = await fetch(`${this._url}/api/health/full`, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  // ── Instance helpers ──────────────────────────────────────────────────────

  /** @private */
  async _get(path) {
    const res = await fetch(`${this._url}${path}`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    return res.json();
  }

  /** @private */
  async _post(path, body) {
    const res = await fetch(`${this._url}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000)
    });
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    return res.json();
  }

  /** @private */
  async _delete(path) {
    const res = await fetch(`${this._url}${path}`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(10_000)
    });
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    return res.json();
  }

  // ── Models ────────────────────────────────────────────────────────────────

  /**
   * List models available on the server's Ollama instance.
   * @returns {Promise<object[]>}
   */
  async listModels() {
    const data = await this._get('/api/models');
    return data.models || [];
  }

  /**
   * Curated model catalog with tier info.
   * @returns {Promise<object[]>}
   */
  async getModelCatalog() {
    const data = await this._get('/api/models/catalog');
    return data.catalog || [];
  }

  /**
   * GPU info from the server.
   * @returns {Promise<{ gpu: object|null, tier: string }>}
   */
  async getGpuInfo() {
    return this._get('/api/models/gpu');
  }

  /**
   * Pull (download) a model. Streams SSE progress events.
   * @param {string} modelId
   * @param {(event: object) => void} onProgress
   * @returns {Promise<void>}
   */
  async pullModel(modelId, onProgress) {
    const res = await fetch(`${this._url}/api/models/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelId })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Pull failed (${res.status})`);
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
          if (!t.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(t.slice(6));
            if (onProgress) onProgress(evt);
            if (evt.done || evt.error) return;
          } catch {}
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Preload a model's KV context so first inference is instant.
   * @param {string} modelId
   * @returns {Promise<{ ok: boolean }>}
   */
  async preloadModel(modelId) {
    return this._post('/api/models/preload', { model: modelId });
  }

  /**
   * Delete a model from the server.
   * @param {string} modelId
   * @returns {Promise<{ ok: boolean }>}
   */
  async deleteModel(modelId) {
    return this._delete(`/api/models/${encodeURIComponent(modelId)}`);
  }

  // ── Chat ──────────────────────────────────────────────────────────────────

  /**
   * Send a chat request. Streams tokens via onToken when stream=true.
   * @param {object} params
   * @param {string} params.model
   * @param {object[]} params.messages
   * @param {boolean} [params.stream]
   * @param {string} [params.conversationId]
   * @param {(token: string, accumulated: string) => void} [onToken]
   * @returns {Promise<string>} full response text
   */
  async chat({ model, messages, stream = true, conversationId }, onToken) {
    const body = { model, messages, stream };
    if (conversationId) body.conversation_id = conversationId;

    const res = await fetch(`${this._url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(300_000)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Chat failed (${res.status})`);
    }

    if (!stream) {
      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    }

    // SSE streaming
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let accumulated = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        for (const line of text.split('\n')) {
          const t = line.trim();
          if (!t.startsWith('data: ')) continue;
          const payload = t.slice(6);
          if (payload === '[DONE]') return accumulated;
          try {
            const parsed = JSON.parse(payload);
            const delta = parsed.choices?.[0]?.delta?.content || '';
            if (delta) {
              accumulated += delta;
              if (onToken) onToken(delta, accumulated);
            }
          } catch {}
        }
      }
    } finally {
      reader.releaseLock();
    }

    return accumulated;
  }

  // ── Transcription ─────────────────────────────────────────────────────────

  /**
   * Transcribe an audio Blob using server-side faster-whisper.
   * @param {Blob} audioBlob
   * @returns {Promise<{ text: string, language: string, duration: number }>}
   */
  async transcribe(audioBlob) {
    const res = await fetch(`${this._url}/api/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': audioBlob.type || 'audio/webm' },
      body: audioBlob,
      signal: AbortSignal.timeout(120_000)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Transcription failed (${res.status})`);
    }
    return res.json();
  }

  // ── Voice / TTS ───────────────────────────────────────────────────────────

  /**
   * Synthesise speech from text using Kokoro-TTS.
   * @param {string} text
   * @param {string} [voice]
   * @param {number} [speed]
   * @returns {Promise<ArrayBuffer>} WAV audio data
   */
  async synthesise(text, voice, speed) {
    const res = await fetch(`${this._url}/api/voice/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice, speed }),
      signal: AbortSignal.timeout(60_000)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `TTS failed (${res.status})`);
    }
    return res.arrayBuffer();
  }

  /**
   * List available Kokoro-TTS voices.
   * @returns {Promise<object[]>}
   */
  async listVoices() {
    const data = await this._get('/api/voice/voices');
    return data.voices || [];
  }

  // ── KV cache ──────────────────────────────────────────────────────────────

  /**
   * Get KV cache metrics from the server.
   * @returns {Promise<object>}
   */
  async getKVStats() {
    return this._get('/api/kv/stats');
  }

  /**
   * Flush all KV cache slots.
   * @returns {Promise<{ ok: boolean, flushed: number }>}
   */
  async flushKVCache() {
    return this._post('/api/kv/flush', { confirm: true });
  }
}

/** Application-wide singleton. Available when `window.__SERVER_URL__` is set. */
export const serverClient = new ServerClient();
