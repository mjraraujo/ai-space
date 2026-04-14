/**
 * Route: /api/models
 *
 * GET  /api/models          — list models on Ollama + catalog
 * GET  /api/models/catalog  — curated catalog with tier info
 * GET  /api/models/gpu      — GPU info (vendor, VRAM, tier)
 * POST /api/models/pull     — pull (download) a model; SSE progress stream
 * POST /api/models/preload  — warm model KV context
 * DELETE /api/models/:id    — delete a model from Ollama
 */

import { createLogger } from '../logger.js';

const log = createLogger('route:models');

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {import('../model-manager.js').ModelManager} modelManager
 */
export async function handleModels(req, res, modelManager) {
  const { method, url } = req;
  const u = new URL(url, 'http://x');
  const pathname = u.pathname.replace(/\/$/, '');

  // GET /api/models/catalog
  if (method === 'GET' && pathname === '/api/models/catalog') {
    return json(res, 200, { catalog: modelManager.catalog() });
  }

  // GET /api/models/gpu
  if (method === 'GET' && pathname === '/api/models/gpu') {
    return json(res, 200, modelManager.gpuInfo());
  }

  // GET /api/models
  if (method === 'GET' && pathname === '/api/models') {
    try {
      const models = await modelManager.list();
      return json(res, 200, { models });
    } catch (err) {
      log.error({ err }, 'Failed to list models');
      return json(res, 502, { error: 'Ollama unreachable', detail: err.message });
    }
  }

  // POST /api/models/pull — SSE stream
  if (method === 'POST' && pathname === '/api/models/pull') {
    const body = await readBody(req);
    const { model } = body;
    if (!model || typeof model !== 'string') {
      return json(res, 400, { error: 'model field required' });
    }

    // Validate model ID — alphanumeric, colon, dot, dash, underscore only
    if (!/^[a-zA-Z0-9:._/-]{1,200}$/.test(model)) {
      return json(res, 400, { error: 'invalid model id' });
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    const send = (data) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      }
    };

    try {
      await modelManager.pull(model, (chunk) => {
        try {
          const parsed = JSON.parse(chunk);
          send(parsed);
        } catch {
          send({ status: chunk });
        }
      });
      send({ status: 'success', done: true });
    } catch (err) {
      log.error({ err, model }, 'Pull failed');
      send({ status: 'error', error: err.message });
    }
    res.end();
    return;
  }

  // POST /api/models/preload
  if (method === 'POST' && pathname === '/api/models/preload') {
    const body = await readBody(req);
    const { model } = body;
    if (!model) return json(res, 400, { error: 'model required' });
    if (!/^[a-zA-Z0-9:._/-]{1,200}$/.test(model)) {
      return json(res, 400, { error: 'invalid model id' });
    }

    try {
      await modelManager.preload(model);
      return json(res, 200, { ok: true, model });
    } catch (err) {
      log.error({ err, model }, 'Preload failed');
      return json(res, 502, { error: err.message });
    }
  }

  // DELETE /api/models/:id
  if (method === 'DELETE' && pathname.startsWith('/api/models/')) {
    const modelId = decodeURIComponent(pathname.replace('/api/models/', ''));
    if (!modelId || !/^[a-zA-Z0-9:._/-]{1,200}$/.test(modelId)) {
      return json(res, 400, { error: 'invalid model id' });
    }
    try {
      await modelManager.delete(modelId);
      return json(res, 200, { ok: true, deleted: modelId });
    } catch (err) {
      log.error({ err, modelId }, 'Delete failed');
      return json(res, 502, { error: err.message });
    }
  }

  return json(res, 404, { error: 'Not found' });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; if (data.length > 1_048_576) req.destroy(); });
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}
