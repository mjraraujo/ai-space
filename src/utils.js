/**
 * Pure utility functions — no side effects, no browser API dependencies.
 * Extracted for testability and reuse.
 */

/**
 * Detect if user message is asking for a web lookup.
 * @param {string} text
 * @returns {boolean}
 */
export function isWebLookupIntent(text) {
  return /\b(search|find|lookup|look up|web|internet|wikipedia|google)\b/i.test(String(text || ''));
}

/**
 * Extract a clean search query from a natural-language web lookup request.
 * @param {string} text
 * @returns {string}
 */
export function extractWebQuery(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';

  const patterns = [
    /(?:search|find|lookup|look up)(?:\s+(?:on|in)\s+the\s+web)?\s+(?:(?:for|about)\s+)?(.+)/i,
    /(?:about|on)\s+(.+)/i
  ];

  for (const pattern of patterns) {
    const m = raw.match(pattern);
    if (m && m[1]) {
      return m[1].trim();
    }
  }

  return raw;
}

/**
 * Detect if a runtime script looks like legacy JS-style code rather than the DSL.
 * @param {string} script
 * @returns {boolean}
 */
export function looksLikeLegacyRuntimeScript(script) {
  const s = String(script || '');
  return /tools\.|\bawait\b|\bconst\b|;/.test(s);
}

/**
 * Parse a human-readable model size label into bytes.
 * @param {string} sizeLabel - e.g. "200 MB", "2.2 GB"
 * @returns {number} bytes, or 0 if unparseable
 */
export function parseModelSizeToBytes(sizeLabel) {
  if (!sizeLabel || typeof sizeLabel !== 'string') return 0;
  const match = sizeLabel.trim().match(/^([0-9]+(?:\.[0-9]+)?)\s*(MB|GB)$/i);
  if (!match) return 0;
  const value = Number(match[1]);
  const unit = match[2].toUpperCase();
  const base = 1024 * 1024;
  return unit === 'GB' ? value * base * 1024 : value * base;
}
