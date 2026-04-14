/**
 * Route: /api/voice
 *
 * POST /api/voice/tts — Text-to-speech via Kokoro-TTS.
 *   Body: { text: string, voice?: string, speed?: number }
 *   Response: audio/wav binary stream
 *
 * GET  /api/voice/voices — List available voices from Kokoro-TTS.
 *
 * The Kokoro-TTS service runs at KOKORO_HOST (default: http://kokoro:8880).
 * API follows the standard Kokoro OpenAI-compatible TTS endpoint convention.
 */

import { createLogger } from '../logger.js';

const log = createLogger('route:voice');

const KOKORO_HOST = (process.env.KOKORO_HOST || 'http://kokoro:8880').replace(/\/+$/, '');
const DEFAULT_VOICE = process.env.KOKORO_DEFAULT_VOICE || 'af_heart';

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
export async function handleVoice(req, res) {
  const { method, url } = req;
  const u = new URL(url, 'http://x');
  const pathname = u.pathname.replace(/\/$/, '');

  // GET /api/voice/voices
  if (method === 'GET' && pathname === '/api/voice/voices') {
    try {
      const r = await fetch(`${KOKORO_HOST}/v1/audio/voices`, {
        signal: AbortSignal.timeout(5000)
      });
      if (!r.ok) throw new Error(`Kokoro returned ${r.status}`);
      const data = await r.json();
      return json(res, 200, data);
    } catch (err) {
      log.warn({ err }, 'Kokoro voices unavailable');
      // Return a static fallback list so the UI always has something
      return json(res, 200, {
        voices: [
          { id: 'af_heart', name: 'Heart (Female)', language: 'en-us' },
          { id: 'af_sky',   name: 'Sky (Female)',   language: 'en-us' },
          { id: 'am_adam',  name: 'Adam (Male)',     language: 'en-us' },
          { id: 'am_echo',  name: 'Echo (Male)',     language: 'en-us' },
          { id: 'bf_emma',  name: 'Emma (Female)',   language: 'en-gb' },
          { id: 'bm_george',name: 'George (Male)',   language: 'en-gb' }
        ]
      });
    }
  }

  // POST /api/voice/tts
  if (method === 'POST' && pathname === '/api/voice/tts') {
    const body = await readBody(req);
    const { text, voice = DEFAULT_VOICE, speed = 1.0 } = body;

    if (!text || typeof text !== 'string') {
      return json(res, 400, { error: 'text field required' });
    }
    if (text.length > 4096) {
      return json(res, 400, { error: 'text exceeds 4096 character limit' });
    }

    // Validate voice ID — alphanumeric, underscore, hyphen
    if (typeof voice !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(voice)) {
      return json(res, 400, { error: 'invalid voice id' });
    }

    log.info({ voice, length: text.length }, 'TTS request');

    let kokoroRes;
    try {
      kokoroRes = await fetch(`${KOKORO_HOST}/v1/audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'kokoro',
          input: text,
          voice,
          speed: Math.max(0.5, Math.min(2.0, Number(speed) || 1.0)),
          response_format: 'wav'
        }),
        signal: AbortSignal.timeout(60_000)
      });
    } catch (err) {
      log.error({ err }, 'Kokoro TTS unreachable');
      return json(res, 503, { error: 'TTS service unavailable', detail: err.message });
    }

    if (!kokoroRes.ok) {
      const txt = await kokoroRes.text().catch(() => '');
      log.error({ status: kokoroRes.status, txt }, 'Kokoro error');
      return json(res, 502, { error: 'TTS failed', detail: txt });
    }

    // Stream audio back
    res.writeHead(200, {
      'Content-Type': kokoroRes.headers.get('content-type') || 'audio/wav',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*'
    });

    const audioData = await kokoroRes.arrayBuffer();
    res.end(Buffer.from(audioData));
    return;
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
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 65536) req.destroy(new Error('Body too large'));
    });
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}
