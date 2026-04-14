/**
 * Route: /api/kv
 *
 * GET    /api/kv/stats  — Prometheus-compatible metrics snapshot
 * POST   /api/kv/flush  — Flush all cached slots (body: { confirm: true })
 * DELETE /api/kv/:model/:conv — Delete a specific slot
 */

import { createLogger } from '../logger.js';
import { kvStore } from '../kv-store.js';

const log = createLogger('route:kv');

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
export async function handleKV(req, res) {
  const { method, url } = req;
  const u = new URL(url, 'http://x');
  const pathname = u.pathname.replace(/\/$/, '');

  // GET /api/kv/stats
  if (method === 'GET' && pathname === '/api/kv/stats') {
    return json(res, 200, kvStore.getMetrics());
  }

  // POST /api/kv/flush
  if (method === 'POST' && pathname === '/api/kv/flush') {
    const body = await readBody(req);
    if (body.confirm !== true) {
      return json(res, 400, { error: 'Provide { "confirm": true } to flush' });
    }
    const count = await kvStore.flush();
    log.info({ count }, 'KV cache flushed via API');
    return json(res, 200, { ok: true, flushed: count });
  }

  // DELETE /api/kv/:model/:conv
  if (method === 'DELETE' && pathname.startsWith('/api/kv/')) {
    const parts = pathname.slice('/api/kv/'.length).split('/');
    if (parts.length < 2) return json(res, 400, { error: 'Provide model and conv parameters' });
    const [model, conv] = parts.map(decodeURIComponent);
    await kvStore.delete(model, conv);
    return json(res, 200, { ok: true, deleted: `${model}/${conv}` });
  }

  return json(res, 404, { error: 'Not found' });
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; if (data.length > 65536) req.destroy(); });
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}
