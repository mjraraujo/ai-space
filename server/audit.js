/**
 * Server Audit — request logging and token-bucket rate limiting.
 *
 * Rate limiter: each IP gets a bucket of `capacity` tokens that refills at
 * `refillRate` tokens/second. Each request consumes one token; when the bucket
 * is empty the request is rejected with 429.
 */

import { createLogger } from './logger.js';

const log = createLogger('audit');

// ─── Token-bucket rate limiter ───────────────────────────────────────────────

/** @type {Map<string, { tokens: number, last: number }>} */
const _buckets = new Map();

/** Default config */
const RATE_CAPACITY = 60;       // max burst tokens per IP
const RATE_REFILL   = 10;       // tokens refilled per second

/**
 * Check whether the given IP should be allowed.
 * @param {string} ip
 * @returns {boolean} true if allowed, false if rate-limited
 */
export function checkRateLimit(ip, capacity = RATE_CAPACITY, refillRate = RATE_REFILL) {
  const now = Date.now() / 1000;
  let bucket = _buckets.get(ip);

  if (!bucket) {
    bucket = { tokens: capacity, last: now };
    _buckets.set(ip, bucket);
  }

  // Refill based on elapsed time
  const elapsed = now - bucket.last;
  bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillRate);
  bucket.last = now;

  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

/** Periodically evict stale bucket entries to prevent unbounded memory growth. */
setInterval(() => {
  const cutoff = Date.now() / 1000 - 3600; // stale after 1 h
  for (const [ip, bucket] of _buckets) {
    if (bucket.last < cutoff) _buckets.delete(ip);
  }
}, 60_000).unref();

// ─── Request logger middleware ────────────────────────────────────────────────

/**
 * Log an incoming request.
 * @param {import('node:http').IncomingMessage} req
 * @param {number} startMs
 * @param {number} statusCode
 * @param {string} [reqId]
 */
export function logRequest(req, startMs, statusCode, reqId) {
  const durationMs = Date.now() - startMs;
  log.info(
    {
      reqId,
      method: req.method,
      url:    req.url,
      status: statusCode,
      durationMs,
      ip: clientIp(req)
    },
    `${req.method} ${req.url} ${statusCode} +${durationMs}ms`
  );
}

/** Extract client IP from request (respects X-Forwarded-For from nginx). */
export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}
