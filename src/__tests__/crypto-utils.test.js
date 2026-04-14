import { describe, it, expect } from 'vitest';
import {
  base64,
  hex,
  randomBytes,
  randomInt,
  randomFloat,
  uuidv4,
  uuidv5,
  isValidUUID,
  nilUUID,
  sha256Sync,
  sha256Hex,
  hmacSha256Sync,
  hmacSha256Hex,
  crc32,
  adler32,
  fnv1a,
  splitSecret,
  recoverSecret,
} from '../crypto-utils.js';

// ─── base64 ───────────────────────────────────────────────────────────────────

describe('base64', () => {
  const cases = [
    ['', ''],
    ['f', 'Zg=='],
    ['fo', 'Zm8='],
    ['foo', 'Zm9v'],
    ['hello world', 'aGVsbG8gd29ybGQ='],
  ];

  it.each(cases)('encode(%s) === %s', (input, expected) => {
    expect(base64.encode(new TextEncoder().encode(input))).toBe(expected);
  });

  it.each(cases)('decode(encode(x)) === x', (input) => {
    if (!input) return;
    const encoded = base64.encode(new TextEncoder().encode(input));
    const decoded = new TextDecoder().decode(base64.decode(encoded));
    expect(decoded).toBe(input);
  });

  it('encodes Uint8Array directly', () => {
    const bytes = new Uint8Array([0, 1, 2, 255]);
    const b64 = base64.encode(bytes);
    expect(typeof b64).toBe('string');
    const rt = base64.decode(b64);
    expect(Array.from(rt)).toEqual([0, 1, 2, 255]);
  });

  it('URL-safe encode produces no +, /, = characters', () => {
    const bytes = new Uint8Array(64).fill(0xfb); // produces + and / in standard b64
    const url = base64.encodeUrl(bytes);
    expect(url).not.toContain('+');
    expect(url).not.toContain('/');
    expect(url).not.toContain('=');
  });

  it('URL-safe round-trip', () => {
    const original = new Uint8Array([0xfb, 0xff, 0x00, 0x3e, 0x3f]);
    const encoded = base64.encodeUrl(original);
    const decoded = base64.decodeUrl(encoded);
    expect(Array.from(decoded)).toEqual(Array.from(original));
  });

  it('toString decodes base64 string to UTF-8 text', () => {
    const text = 'hello';
    const encoded = base64.encode(new TextEncoder().encode(text));
    expect(base64.toString(encoded)).toBe(text);
  });
});

// ─── hex ──────────────────────────────────────────────────────────────────────

describe('hex', () => {
  it('encodes bytes to hex string', () => {
    expect(hex.encode(new Uint8Array([0, 255, 16, 127]))).toBe('00ff107f');
  });

  it('decodes hex string back to bytes', () => {
    const bytes = hex.decode('00ff107f');
    expect(Array.from(bytes)).toEqual([0, 255, 16, 127]);
  });

  it('round-trips arbitrary byte sequences', () => {
    const original = new Uint8Array([1, 2, 100, 200, 255, 0]);
    const rt = hex.decode(hex.encode(original));
    expect(Array.from(rt)).toEqual(Array.from(original));
  });

  it('produces lowercase hex', () => {
    const out = hex.encode(new Uint8Array([0xAB, 0xCD]));
    expect(out).toBe(out.toLowerCase());
  });
});

// ─── randomBytes ──────────────────────────────────────────────────────────────

describe('randomBytes', () => {
  it('returns a Uint8Array of the requested length', () => {
    const b = randomBytes(16);
    expect(b).toBeInstanceOf(Uint8Array);
    expect(b.length).toBe(16);
  });

  it('returns different values on each call', () => {
    const a = randomBytes(32);
    const b = randomBytes(32);
    // Probability of collision is astronomically low.
    expect(hex.encode(a)).not.toBe(hex.encode(b));
  });

  it('handles edge case of 0 bytes', () => {
    const b = randomBytes(0);
    expect(b.length).toBe(0);
  });
});

// ─── randomInt ────────────────────────────────────────────────────────────────

describe('randomInt', () => {
  it('returns an integer within [min, max)', () => {
    for (let i = 0; i < 50; i++) {
      const n = randomInt(5, 10);
      expect(n).toBeGreaterThanOrEqual(5);
      expect(n).toBeLessThan(10);
    }
  });
});

// ─── randomFloat ──────────────────────────────────────────────────────────────

describe('randomFloat', () => {
  it('returns a float in [0, 1)', () => {
    for (let i = 0; i < 20; i++) {
      const f = randomFloat();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });
});

// ─── UUID ─────────────────────────────────────────────────────────────────────

describe('uuidv4', () => {
  it('returns a valid UUID v4 string', () => {
    const id = uuidv4();
    expect(isValidUUID(id)).toBe(true);
  });

  it('sets version nibble to 4', () => {
    const id = uuidv4();
    expect(id[14]).toBe('4');
  });

  it('sets variant bits correctly (8, 9, a, or b)', () => {
    const id = uuidv4();
    expect(['8', '9', 'a', 'b']).toContain(id[19]);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => uuidv4()));
    expect(ids.size).toBe(100);
  });
});

describe('uuidv5', () => {
  const DNS_NS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

  it('returns a valid UUID v5 string', () => {
    const id = uuidv5(DNS_NS, 'example.com');
    expect(isValidUUID(id)).toBe(true);
  });

  it('is deterministic for the same input', () => {
    const a = uuidv5(DNS_NS, 'test.example');
    const b = uuidv5(DNS_NS, 'test.example');
    expect(a).toBe(b);
  });

  it('produces different UUIDs for different names', () => {
    expect(uuidv5(DNS_NS, 'a.com')).not.toBe(uuidv5(DNS_NS, 'b.com'));
  });
});

describe('isValidUUID', () => {
  it('accepts valid UUIDs', () => {
    expect(isValidUUID('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
    expect(isValidUUID(uuidv4())).toBe(true);
  });

  it('rejects invalid UUIDs', () => {
    expect(isValidUUID('')).toBe(false);
    expect(isValidUUID('not-a-uuid')).toBe(false);
    expect(isValidUUID('123e4567-e89b-12d3-a456')).toBe(false);
  });
});

describe('nilUUID', () => {
  it('returns the nil UUID', () => {
    expect(nilUUID()).toBe('00000000-0000-0000-0000-000000000000');
    expect(isValidUUID(nilUUID())).toBe(true);
  });
});

// ─── sha256Sync ───────────────────────────────────────────────────────────────

describe('sha256Sync', () => {
  it('returns a 32-byte Uint8Array', () => {
    const h = sha256Sync('hello');
    expect(h).toBeInstanceOf(Uint8Array);
    expect(h.length).toBe(32);
  });

  it('is deterministic', () => {
    expect(hex.encode(sha256Sync('test'))).toBe(hex.encode(sha256Sync('test')));
  });

  it('produces different hashes for different inputs', () => {
    expect(hex.encode(sha256Sync('a'))).not.toBe(hex.encode(sha256Sync('b')));
  });

  it('known SHA-256 hash of empty string', () => {
    // SHA-256('') = e3b0c44298fc1c149...
    const h = sha256Hex('');
    expect(h).toMatch(/^e3b0c44/);
  });

  it('known SHA-256 hash of "abc"', () => {
    const h = sha256Hex('abc');
    // SHA-256('abc') = ba7816bf8f01cfea414140de5dae2ec73b00361bbef0469352...
    expect(h).toMatch(/^ba7816bf/);
  });
});

// ─── hmacSha256Sync ───────────────────────────────────────────────────────────

describe('hmacSha256Sync', () => {
  it('returns a 32-byte Uint8Array', () => {
    const mac = hmacSha256Sync('key', 'data');
    expect(mac).toBeInstanceOf(Uint8Array);
    expect(mac.length).toBe(32);
  });

  it('is deterministic', () => {
    const a = hmacSha256Hex('key', 'message');
    const b = hmacSha256Hex('key', 'message');
    expect(a).toBe(b);
  });

  it('differs for different keys', () => {
    const a = hmacSha256Hex('keyA', 'msg');
    const b = hmacSha256Hex('keyB', 'msg');
    expect(a).not.toBe(b);
  });

  it('differs for different messages', () => {
    const a = hmacSha256Hex('key', 'msgA');
    const b = hmacSha256Hex('key', 'msgB');
    expect(a).not.toBe(b);
  });
});

// ─── crc32 / adler32 / fnv1a ─────────────────────────────────────────────────

describe('crc32', () => {
  it('returns a hex string', () => {
    expect(typeof crc32('hello')).toBe('string');
    expect(crc32('hello')).toMatch(/^[0-9a-f]+$/i);
  });

  it('is deterministic', () => {
    expect(crc32('test')).toBe(crc32('test'));
  });

  it('produces different values for different inputs', () => {
    expect(crc32('a')).not.toBe(crc32('b'));
  });

  it('returns a hex representation for empty input', () => {
    const r = crc32('');
    expect(typeof r).toBe('string');
  });
});

describe('adler32', () => {
  it('returns a value', () => {
    expect(adler32('Wikipedia')).toBeTruthy();
  });

  it('is deterministic', () => {
    expect(adler32('Wikipedia')).toBe(adler32('Wikipedia'));
  });
});

describe('fnv1a', () => {
  it('returns a hex string', () => {
    expect(typeof fnv1a('hello')).toBe('string');
  });

  it('is deterministic', () => {
    expect(fnv1a('foo')).toBe(fnv1a('foo'));
  });

  it('produces different values for different inputs', () => {
    expect(fnv1a('foo')).not.toBe(fnv1a('bar'));
  });
});

// ─── Secret sharing ───────────────────────────────────────────────────────────

describe('splitSecret / recoverSecret', () => {
  it('produces n shares from a secret string', () => {
    const shares = splitSecret('Hello', 5, 3);
    expect(shares.length).toBe(5);
    expect(typeof shares[0]).toBe('object');
  });

  it('recovers the original secret from k-of-n shares', () => {
    const secret = 'Hello';
    const shares = splitSecret(secret, 5, 3);
    // Take any 3 shares.
    const subset = [shares[0], shares[2], shares[4]];
    const recovered = recoverSecret(subset);
    expect(recovered).toBe(secret);
  });

  it('recovers with exactly k shares', () => {
    const secret = 'ABCD';
    const shares = splitSecret(secret, 3, 3);
    const recovered = recoverSecret(shares);
    expect(recovered).toBe(secret);
  });
});
