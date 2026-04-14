/**
 * Route: /api/transcribe
 *
 * POST /api/transcribe — Accept audio upload (PCM/WAV/WebM) and return transcript.
 *
 * Forwards to a faster-whisper HTTP service running in Docker at
 * WHISPER_HOST (default: http://faster-whisper:9000).
 *
 * The faster-whisper service accepts multipart/form-data with an "audio_file"
 * field. This route acts as a transparent proxy, forwarding the raw request
 * body unchanged.
 *
 * Response: { text: string, language: string, duration: number }
 */

import { createLogger } from '../logger.js';

const log = createLogger('route:transcribe');

const WHISPER_HOST = (process.env.WHISPER_HOST || 'http://faster-whisper:9000').replace(/\/+$/, '');
const MAX_AUDIO_BYTES = 50 * 1024 * 1024; // 50 MB

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
export async function handleTranscribe(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  // Read raw audio body
  const chunks = [];
  let totalBytes = 0;

  try {
    await new Promise((resolve, reject) => {
      req.on('data', (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_AUDIO_BYTES) {
          req.destroy(new Error('Audio too large'));
          return reject(new Error('Audio file exceeds 50 MB limit'));
        }
        chunks.push(chunk);
      });
      req.on('end', resolve);
      req.on('error', reject);
    });
  } catch (err) {
    return json(res, 413, { error: err.message });
  }

  const audioBody = Buffer.concat(chunks);
  const contentType = req.headers['content-type'] || 'application/octet-stream';

  log.info({ bytes: audioBody.length, contentType }, 'Forwarding audio to faster-whisper');

  let whisperRes;
  try {
    whisperRes = await fetch(`${WHISPER_HOST}/asr?task=transcribe&output=json`, {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body: audioBody,
      signal: AbortSignal.timeout(120_000)
    });
  } catch (err) {
    log.error({ err }, 'faster-whisper unreachable');
    return json(res, 503, { error: 'Transcription service unavailable', detail: err.message });
  }

  if (!whisperRes.ok) {
    const txt = await whisperRes.text().catch(() => '');
    log.error({ status: whisperRes.status, txt }, 'Whisper error');
    return json(res, 502, { error: 'Transcription failed', detail: txt });
  }

  const data = await whisperRes.json().catch(() => null);
  if (!data) return json(res, 502, { error: 'Invalid transcription response' });

  // Normalise to a consistent shape
  return json(res, 200, {
    text:     data.text || data.transcription || '',
    language: data.language || 'en',
    duration: data.duration || 0
  });
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}
