/**
 * crypto-utils.js — Comprehensive cryptography utilities
 * Hashing, encryption, encoding, key derivation, signatures, UUID generation
 */

// ─── Encoding utils ───────────────────────────────────────────────────────────
export const base64 = {
  encode(data) {
    if (typeof data === 'string') data = new TextEncoder().encode(data);
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let out = '';
    const len = bytes.length;
    for (let i = 0; i < len; i += 3) {
      const b0 = bytes[i], b1 = bytes[i + 1] ?? 0, b2 = bytes[i + 2] ?? 0;
      out += chars[b0 >> 2];
      out += chars[((b0 & 3) << 4) | (b1 >> 4)];
      out += i + 1 < len ? chars[((b1 & 15) << 2) | (b2 >> 6)] : '=';
      out += i + 2 < len ? chars[b2 & 63] : '=';
    }
    return out;
  },
  decode(str) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const table = new Uint8Array(256).fill(255);
    for (let i = 0; i < chars.length; i++) table[chars.charCodeAt(i)] = i;
    str = str.replace(/=/g, '');
    const n = str.length;
    const bytes = new Uint8Array(Math.floor(n * 3 / 4));
    let j = 0;
    for (let i = 0; i < n; i += 4) {
      const c0 = table[str.charCodeAt(i)];
      const c1 = table[str.charCodeAt(i + 1)] ?? 0;
      const c2 = table[str.charCodeAt(i + 2)] ?? 0;
      const c3 = table[str.charCodeAt(i + 3)] ?? 0;
      bytes[j++] = (c0 << 2) | (c1 >> 4);
      if (i + 2 < n) bytes[j++] = ((c1 & 15) << 4) | (c2 >> 2);
      if (i + 3 < n) bytes[j++] = ((c2 & 3) << 6) | c3;
    }
    return bytes.slice(0, j);
  },
  encodeUrl(data) { return this.encode(data).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''); },
  decodeUrl(str) { return this.decode(str.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(str.length / 4) * 4, '=')); },
  toString(data) { return new TextDecoder().decode(this.decode(data)); },
};

export const hex = {
  encode(data) {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  },
  decode(str) {
    const bytes = new Uint8Array(str.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(str.slice(i * 2, i * 2 + 2), 16);
    return bytes;
  },
};

// ─── Random bytes ─────────────────────────────────────────────────────────────
export function randomBytes(n) {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(n);
    crypto.getRandomValues(bytes);
    return bytes;
  }
  return new Uint8Array(n).map(() => Math.floor(Math.random() * 256));
}

export function randomInt(min, max) {
  const range = max - min;
  const bytes = randomBytes(4);
  const val = new DataView(bytes.buffer).getUint32(0);
  return min + (val % range);
}

export function randomFloat() {
  const bytes = randomBytes(8);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, (view.getUint32(0) & 0x000FFFFF) | 0x3FF00000);
  return view.getFloat64(0) - 1;
}

// ─── UUID ─────────────────────────────────────────────────────────────────────
export function uuidv4() {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = hex.encode(bytes);
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

export function uuidv5(namespace, name) {
  // Simplified deterministic UUID using namespace
  const ns = hex.decode(namespace.replace(/-/g, ''));
  const enc = new TextEncoder().encode(name);
  const data = new Uint8Array(ns.length + enc.length);
  data.set(ns); data.set(enc, ns.length);
  const hash = sha1Sync(data);
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const h = hex.encode(hash);
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
}

export function isValidUUID(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

export function nilUUID() { return '00000000-0000-0000-0000-000000000000'; }

// ─── SHA-1 (synchronous, pure JS) ────────────────────────────────────────────
function sha1Sync(data) {
  const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data));
  const words = [];
  for (let i = 0; i < bytes.length; i++) words[i >> 2] = ((words[i >> 2] ?? 0) | (bytes[i] << (24 - (i % 4) * 8)));
  const len = bytes.length * 8;
  words[len >> 5] = ((words[len >> 5] ?? 0) | (0x80 << (24 - len % 32)));
  words[((len + 64 >> 9) << 4) + 15] = len;
  let h0=0x67452301,h1=0xEFCDAB89,h2=0x98BADCFE,h3=0x10325476,h4=0xC3D2E1F0;
  const rotl = (n, b) => (n << b) | (n >>> (32 - b));
  for (let i = 0; i < words.length; i += 16) {
    let w = [...words.slice(i, i + 16)];
    for (let j = 16; j < 80; j++) w[j] = rotl(w[j-3]^w[j-8]^w[j-14]^w[j-16], 1);
    let a=h0,b=h1,c=h2,d=h3,e=h4;
    for (let j = 0; j < 80; j++) {
      let f, k;
      if (j < 20)      { f = (b & c) | (~b & d); k = 0x5A827999; }
      else if (j < 40) { f = b ^ c ^ d;           k = 0x6ED9EBA1; }
      else if (j < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
      else             { f = b ^ c ^ d;           k = 0xCA62C1D6; }
      const tmp = (rotl(a, 5) + f + e + k + (w[j] ?? 0)) >>> 0;
      e=d; d=c; c=rotl(b, 30); b=a; a=tmp;
    }
    h0=(h0+a)>>>0; h1=(h1+b)>>>0; h2=(h2+c)>>>0; h3=(h3+d)>>>0; h4=(h4+e)>>>0;
  }
  const out = new Uint8Array(20);
  [h0,h1,h2,h3,h4].forEach((h,i) => { out[i*4]=(h>>24)&0xff; out[i*4+1]=(h>>16)&0xff; out[i*4+2]=(h>>8)&0xff; out[i*4+3]=h&0xff; });
  return out;
}

// ─── SHA-256 (synchronous, pure JS) ──────────────────────────────────────────
const SHA256_K = [
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
];

export function sha256Sync(data) {
  const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data));
  const bitLen = bytes.length * 8;
  const padded = new Uint8Array(((bytes.length + 72) >> 6) * 64);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, bitLen, false);
  view.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000), false);

  let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a;
  let h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;

  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  const ch = (e,f,g) => (e & f) ^ (~e & g);
  const maj = (a,b,c) => (a & b) ^ (a & c) ^ (b & c);
  const S0 = x => rotr(x,2)^rotr(x,13)^rotr(x,22);
  const S1 = x => rotr(x,6)^rotr(x,11)^rotr(x,25);
  const s0 = x => rotr(x,7)^rotr(x,18)^(x>>>3);
  const s1 = x => rotr(x,17)^rotr(x,19)^(x>>>10);

  for (let i = 0; i < padded.length; i += 64) {
    const w = new Uint32Array(64);
    for (let j = 0; j < 16; j++) w[j] = view.getUint32(i + j * 4);
    for (let j = 16; j < 64; j++) w[j] = (s1(w[j-2]) + w[j-7] + s0(w[j-15]) + w[j-16]) >>> 0;
    let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;
    for (let j = 0; j < 64; j++) {
      const t1 = (h + S1(e) + ch(e,f,g) + SHA256_K[j] + w[j]) >>> 0;
      const t2 = (S0(a) + maj(a,b,c)) >>> 0;
      h=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
    }
    h0=(h0+a)>>>0; h1=(h1+b)>>>0; h2=(h2+c)>>>0; h3=(h3+d)>>>0;
    h4=(h4+e)>>>0; h5=(h5+f)>>>0; h6=(h6+g)>>>0; h7=(h7+h)>>>0;
  }
  const result = new Uint8Array(32);
  [h0,h1,h2,h3,h4,h5,h6,h7].forEach((h, i) => {
    result[i*4]=(h>>24)&0xff; result[i*4+1]=(h>>16)&0xff; result[i*4+2]=(h>>8)&0xff; result[i*4+3]=h&0xff;
  });
  return result;
}

export function sha256Hex(data) { return hex.encode(sha256Sync(data)); }

// ─── HMAC-SHA256 ──────────────────────────────────────────────────────────────
export function hmacSha256Sync(key, data) {
  const enc = new TextEncoder();
  let k = typeof key === 'string' ? enc.encode(key) : key;
  if (k.length > 64) k = sha256Sync(k);
  const ipad = new Uint8Array(64).fill(0x36);
  const opad = new Uint8Array(64).fill(0x5c);
  for (let i = 0; i < k.length; i++) { ipad[i] ^= k[i]; opad[i] ^= k[i]; }
  const msg = typeof data === 'string' ? enc.encode(data) : data;
  const inner = new Uint8Array(64 + msg.length);
  inner.set(ipad); inner.set(msg, 64);
  const outer = new Uint8Array(64 + 32);
  outer.set(opad); outer.set(sha256Sync(inner), 64);
  return sha256Sync(outer);
}

export function hmacSha256Hex(key, data) { return hex.encode(hmacSha256Sync(key, data)); }

// ─── Web Crypto wrappers ──────────────────────────────────────────────────────
export async function sha256(data) {
  if (typeof crypto?.subtle === 'undefined') return sha256Sync(data);
  const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return new Uint8Array(hash);
}

export async function sha384(data) {
  const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest('SHA-384', buf);
  return new Uint8Array(hash);
}

export async function sha512(data) {
  const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest('SHA-512', buf);
  return new Uint8Array(hash);
}

// ─── PBKDF2 ───────────────────────────────────────────────────────────────────
export async function pbkdf2(password, salt, iterations = 100000, keyLen = 32, hash = 'SHA-256') {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const saltBytes = typeof salt === 'string' ? enc.encode(salt) : salt;
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations, hash }, keyMaterial, keyLen * 8);
  return new Uint8Array(bits);
}

// ─── AES-GCM encryption ───────────────────────────────────────────────────────
export async function generateAESKey(bits = 256) {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: bits }, true, ['encrypt', 'decrypt']);
}

export async function aesEncrypt(key, data, additionalData) {
  const iv = randomBytes(12);
  const enc = new TextEncoder();
  const plaintext = typeof data === 'string' ? enc.encode(data) : data;
  const opts = { name: 'AES-GCM', iv };
  if (additionalData) opts.additionalData = typeof additionalData === 'string' ? enc.encode(additionalData) : additionalData;
  const ciphertext = await crypto.subtle.encrypt(opts, key, plaintext);
  const result = new Uint8Array(iv.length + ciphertext.byteLength);
  result.set(iv);
  result.set(new Uint8Array(ciphertext), iv.length);
  return result;
}

export async function aesDecrypt(key, data, additionalData) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const iv = bytes.slice(0, 12);
  const ciphertext = bytes.slice(12);
  const enc = new TextEncoder();
  const opts = { name: 'AES-GCM', iv };
  if (additionalData) opts.additionalData = typeof additionalData === 'string' ? enc.encode(additionalData) : additionalData;
  const plaintext = await crypto.subtle.decrypt(opts, key, ciphertext);
  return new Uint8Array(plaintext);
}

export async function aesEncryptText(key, text, additionalData) {
  const enc = await aesEncrypt(key, text, additionalData);
  return base64.encodeUrl(enc);
}

export async function aesDecryptText(key, b64, additionalData) {
  const bytes = base64.decodeUrl(b64);
  const dec = await aesDecrypt(key, bytes, additionalData);
  return new TextDecoder().decode(dec);
}

export async function exportKey(key, format = 'raw') {
  const exported = await crypto.subtle.exportKey(format, key);
  return new Uint8Array(exported);
}

export async function importAESKey(bytes, bits = 256) {
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM', length: bits }, false, ['encrypt', 'decrypt']);
}

// ─── RSA helpers ─────────────────────────────────────────────────────────────
export async function generateRSAKeyPair(bits = 2048, hash = 'SHA-256') {
  return crypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: bits, publicExponent: new Uint8Array([1, 0, 1]), hash }, true, ['encrypt', 'decrypt']);
}

export async function rsaEncrypt(publicKey, data) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const cipher = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, bytes);
  return new Uint8Array(cipher);
}

export async function rsaDecrypt(privateKey, data) {
  const plain = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, data);
  return new Uint8Array(plain);
}

// ─── ECDSA ───────────────────────────────────────────────────────────────────
export async function generateECDSAKeyPair(curve = 'P-256') {
  return crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: curve }, true, ['sign', 'verify']);
}

export async function ecdsaSign(privateKey, data, hash = 'SHA-256') {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash }, privateKey, bytes);
  return new Uint8Array(sig);
}

export async function ecdsaVerify(publicKey, signature, data, hash = 'SHA-256') {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return crypto.subtle.verify({ name: 'ECDSA', hash }, publicKey, signature, bytes);
}

// ─── JWT (simple implementation) ──────────────────────────────────────────────
export const jwt = {
  encode(header, payload, secret) {
    const h = base64.encodeUrl(JSON.stringify(header));
    const p = base64.encodeUrl(JSON.stringify(payload));
    const sig = base64.encodeUrl(hmacSha256Sync(secret, `${h}.${p}`));
    return `${h}.${p}.${sig}`;
  },
  decode(token) {
    const [h, p, s] = token.split('.');
    return {
      header: JSON.parse(base64.toString(h)),
      payload: JSON.parse(base64.toString(p)),
      signature: s,
    };
  },
  verify(token, secret) {
    const [h, p, s] = token.split('.');
    const expected = base64.encodeUrl(hmacSha256Sync(secret, `${h}.${p}`));
    if (s !== expected) throw new Error('Invalid signature');
    const payload = JSON.parse(base64.toString(p));
    if (payload.exp && Date.now() / 1000 > payload.exp) throw new Error('Token expired');
    return payload;
  },
  sign(payload, secret, opts = {}) {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'HS256', typ: 'JWT' };
    const fullPayload = { iat: now, ...payload };
    if (opts.expiresIn) fullPayload.exp = now + opts.expiresIn;
    return this.encode(header, fullPayload, secret);
  },
};

// ─── Password hashing ─────────────────────────────────────────────────────────
export async function hashPassword(password, saltBytes = 16, iterations = 100000) {
  const salt = randomBytes(saltBytes);
  const hash = await pbkdf2(password, salt, iterations, 32, 'SHA-256');
  const out = new Uint8Array(salt.length + hash.length);
  out.set(salt); out.set(hash, salt.length);
  return base64.encode(out);
}

export async function verifyPassword(password, stored, saltBytes = 16, iterations = 100000) {
  const bytes = base64.decode(stored);
  const salt = bytes.slice(0, saltBytes);
  const hash = bytes.slice(saltBytes);
  const computed = await pbkdf2(password, salt, iterations, 32, 'SHA-256');
  if (computed.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed[i] ^ hash[i];
  return diff === 0;
}

// ─── Checksum ────────────────────────────────────────────────────────────────
export function crc32(data) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  let crc = 0xFFFFFFFF;
  for (const b of bytes) crc = table[(crc ^ b) & 0xFF] ^ (crc >>> 8);
  return ((crc ^ 0xFFFFFFFF) >>> 0).toString(16).padStart(8, '0');
}

export function adler32(data) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  const MOD_ADLER = 65521;
  let a = 1, b = 0;
  for (const byte of bytes) { a = (a + byte) % MOD_ADLER; b = (b + a) % MOD_ADLER; }
  return ((b << 16) | a) >>> 0;
}

export function fnv1a(data) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  let h = 2166136261;
  for (const b of bytes) { h ^= b; h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

// ─── Secret sharing (Shamir's, simplified) ────────────────────────────────────
export function splitSecret(secret, n, k) {
  const PRIME = 257;
  const bytes = typeof secret === 'string' ? new TextEncoder().encode(secret) : new Uint8Array(secret);
  const shares = Array.from({ length: n }, (_, i) => ({ id: i + 1, data: [] }));
  for (const byte of bytes) {
    const coeffs = [byte];
    for (let i = 1; i < k; i++) coeffs.push(randomInt(0, PRIME - 1));
    for (const share of shares) {
      let val = 0;
      for (let i = coeffs.length - 1; i >= 0; i--) val = (val * share.id + coeffs[i]) % PRIME;
      share.data.push(val);
    }
  }
  return shares;
}

export function recoverSecret(shares) {
  const PRIME = 257;
  const k = shares.length;
  const len = shares[0].data.length;
  const result = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    let secret = 0;
    for (let j = 0; j < k; j++) {
      let num = 1, den = 1;
      for (let m = 0; m < k; m++) {
        if (m !== j) { num = (num * (-shares[m].id)) % PRIME; den = (den * (shares[j].id - shares[m].id)) % PRIME; }
      }
      const lagrange = (shares[j].data[i] * num * modInverse(den, PRIME)) % PRIME;
      secret = ((secret + lagrange) % PRIME + PRIME) % PRIME;
    }
    result[i] = secret;
  }
  return new TextDecoder().decode(result);
}

function modInverse(a, m) {
  a = ((a % m) + m) % m;
  for (let x = 1; x < m; x++) if ((a * x) % m === 1) return x;
  return 1;
}

// ─── Steganography helpers ────────────────────────────────────────────────────
export const stego = {
  encodeInBits(carrier, message) {
    const msgBytes = new TextEncoder().encode(message + '\0');
    const out = new Uint8Array(carrier);
    let bit = 0;
    for (const byte of msgBytes) {
      for (let b = 7; b >= 0; b--) {
        if (bit >= out.length) break;
        out[bit] = (out[bit] & 0xFE) | ((byte >> b) & 1);
        bit++;
      }
    }
    return out;
  },
  decodeFromBits(carrier) {
    const bytes = [];
    for (let i = 0; i < carrier.length; i += 8) {
      let byte = 0;
      for (let b = 0; b < 8 && i + b < carrier.length; b++) byte = (byte << 1) | (carrier[i + b] & 1);
      if (byte === 0) break;
      bytes.push(byte);
    }
    return new TextDecoder().decode(new Uint8Array(bytes));
  }
};

export default {
  base64, hex, randomBytes, randomInt, randomFloat,
  uuidv4, uuidv5, isValidUUID, nilUUID,
  sha256Sync, sha256Hex, sha256, sha384, sha512,
  hmacSha256Sync, hmacSha256Hex,
  pbkdf2, hashPassword, verifyPassword,
  generateAESKey, aesEncrypt, aesDecrypt, aesEncryptText, aesDecryptText,
  exportKey, importAESKey,
  generateRSAKeyPair, rsaEncrypt, rsaDecrypt,
  generateECDSAKeyPair, ecdsaSign, ecdsaVerify,
  jwt, crc32, adler32, fnv1a, splitSecret, recoverSecret, stego,
};
