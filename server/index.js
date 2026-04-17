/**
 * AI Space — Backend API Server
 *
 * A pure Node.js HTTP server (no external framework) that provides:
 *   /api/models/*    — Ollama model management
 *   /api/chat        — OpenAI-compatible streaming chat
 *   /api/transcribe  — Audio transcription via faster-whisper
 *   /api/voice/*     — TTS via Kokoro-TTS
 *   /api/kv/*        — Server-side KV cache management
 *   /health          — Liveness probe
 *
 * Environment variables:
 *   PORT             Server port (default: 3000)
 *   OLLAMA_HOST      Ollama sidecar URL (default: http://ollama:11434)
 *   WHISPER_HOST     faster-whisper URL (default: http://faster-whisper:9000)
 *   KOKORO_HOST      Kokoro-TTS URL (default: http://kokoro:8880)
 *   KV_CACHE_DIR     KV slot persistence dir (default: /data/kv-cache)
 *   KV_MAX_SLOTS     Max in-memory KV slots (default: 64)
 *   RATE_LIMIT       Requests/min per IP (default: 600)
 *   CORS_ORIGINS     Comma-separated allowed origins (default: *)
 *   REQUEST_ID_HEADER Header to read/echo request IDs (default: x-request-id)
 */

import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

import { rootLogger } from './logger.js';
import { checkRateLimit, logRequest, clientIp } from './audit.js';
import { ModelManager } from './model-manager.js';
import { kvStore } from './kv-store.js';
import { handleModels } from './routes/models.js';
import { handleChat } from './routes/chat.js';
import { handleTranscribe } from './routes/transcribe.js';
import { handleVoice } from './routes/voice.js';
import { handleKV } from './routes/kv.js';

const log = rootLogger.child({ name: 'server' });

// ─── Configuration ────────────────────────────────────────────────────────────

const PORT           = parseInt(process.env.PORT || '3000', 10);
const CORS_ORIGINS   = (process.env.CORS_ORIGINS || '*').split(',').map((s) => s.trim());
const REQ_ID_HEADER  = (process.env.REQUEST_ID_HEADER || 'x-request-id').toLowerCase();

// ─── Initialise singletons ────────────────────────────────────────────────────

const modelManager = new ModelManager();

async function boot() {
  log.info('Booting AI Space server…');
  kvStore.init();
  await modelManager.init();
  log.info({ port: PORT }, 'Server ready');
}

// ─── HTTP server ──────────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  const startMs = Date.now();
  const reqId   = req.headers[REQ_ID_HEADER] || randomUUID();
  res.setHeader(REQ_ID_HEADER, reqId);

  // CORS
  const origin = req.headers.origin || '';
  if (CORS_ORIGINS.includes('*') || CORS_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Request-Id');
  }

  // Pre-flight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    logRequest(req, startMs, 204, reqId);
    return;
  }

  // Rate limit
  const ip = clientIp(req);
  if (!checkRateLimit(ip)) {
    res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '5' });
    res.end(JSON.stringify({ error: 'Too many requests' }));
    logRequest(req, startMs, 429, reqId);
    return;
  }

  const { url } = req;

  try {
    // ── Health check ───────────────────────────────────────────────────────
    if (url === '/health' || url === '/health/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, ts: Date.now() }));
      logRequest(req, startMs, 200, reqId);
      return;
    }

    // ── Aggregated health (ollama / whisper / kokoro / personaplex) ────────
    if (url === '/api/health/full' || url === '/api/health/full/') {
      const snapshot = await collectFullHealth(modelManager);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(snapshot));
      logRequest(req, startMs, 200, reqId);
      return;
    }

    // ── Route dispatch ────────────────────────────────────────────────────
    if (url.startsWith('/api/models')) {
      await handleModels(req, res, modelManager);
    } else if (url.startsWith('/api/chat')) {
      await handleChat(req, res);
    } else if (url.startsWith('/api/transcribe')) {
      await handleTranscribe(req, res);
    } else if (url.startsWith('/api/voice')) {
      await handleVoice(req, res);
    } else if (url.startsWith('/api/kv')) {
      await handleKV(req, res);
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  } catch (err) {
    log.error({ err, url, reqId }, 'Unhandled request error');
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }

  logRequest(req, startMs, res.statusCode, reqId);
});

// ─── Aggregated health ────────────────────────────────────────────────────────

/**
 * Ping every downstream backend (Ollama, faster-whisper, Kokoro, PersonaPlex)
 * in parallel and report a compact snapshot.  Each backend is treated as
 * optional — a failure is reported rather than thrown.
 *
 * @param {ModelManager} mm
 * @returns {Promise<object>}
 */
async function collectFullHealth(mm) {
  const endpoints = {
    ollama:      { url: `${process.env.OLLAMA_HOST      || 'http://ollama:11434'}/api/tags`,  timeoutMs: 3000 },
    whisper:     { url: `${process.env.WHISPER_HOST     || 'http://faster-whisper:9000'}/health`, timeoutMs: 3000 },
    kokoro:      { url: `${process.env.KOKORO_HOST      || 'http://kokoro:8880'}/health`,     timeoutMs: 3000 },
    personaplex: { url: `${process.env.PERSONAPLEX_HOST || 'http://personaplex:8998'}/`,      timeoutMs: 2000 }
  };

  const probe = async (entry) => {
    const started = Date.now();
    try {
      const res = await fetch(entry.url, { signal: AbortSignal.timeout(entry.timeoutMs) });
      return { ok: res.ok, status: res.status, latencyMs: Date.now() - started };
    } catch (err) {
      return { ok: false, status: 0, latencyMs: Date.now() - started, error: String(err.message || err) };
    }
  };

  const [ollama, whisper, kokoro, personaplex] = await Promise.all([
    probe(endpoints.ollama),
    probe(endpoints.whisper),
    probe(endpoints.kokoro),
    probe(endpoints.personaplex)
  ]);

  return {
    ts: Date.now(),
    gpu: mm.gpuInfo(),
    backends: { ollama, whisper, kokoro, personaplex }
  };
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

function shutdown(signal) {
  log.info({ signal }, 'Shutting down…');
  server.close(() => {
    log.info('Server closed');
    process.exit(0);
  });
  // Force-exit after 10 s
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// ─── Start ────────────────────────────────────────────────────────────────────

boot()
  .then(() => {
    server.listen(PORT, () => {
      log.info({ port: PORT }, `AI Space server listening on :${PORT}`);
    });
  })
  .catch((err) => {
    log.error({ err }, 'Boot failed');
    process.exit(1);
  });
