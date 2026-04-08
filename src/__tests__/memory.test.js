/**
 * Tests for memory.js — encrypted IndexedDB storage layer.
 *
 * Strategy:
 *  - Global mocks for `localStorage`, `navigator`, `screen` (used in
 *    _getDeviceFingerprint / _getOrCreateSessionId).
 *  - `globalThis.crypto.subtle` is the real Node.js 18+ Web Crypto API, so
 *    _encrypt / _decrypt can be exercised without any mocking.
 *  - A hand-rolled fake IndexedDB replicates the IDBRequest callback pattern
 *    used by every DB method in Memory (put/get/getAll/delete/clear/count).
 *  - `buildMemory()` creates a fully initialised Memory instance by injecting
 *    a real AES-GCM key and the fake DB, bypassing `init()` so tests never
 *    touch the real browser environment.
 */

import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { Memory } from '../memory.js';

// ─── Global browser-API mocks ────────────────────────────────────────────────

const _localStore = new Map();
global.localStorage = {
  getItem: (k) => _localStore.get(k) ?? null,
  setItem: (k, v) => _localStore.set(k, String(v)),
  removeItem: (k) => _localStore.delete(k),
  clear: () => _localStore.clear()
};

Object.defineProperty(global, 'navigator', {
  value: { userAgent: 'test-agent/1.0', language: 'en-US' },
  configurable: true,
  writable: true
});
Object.defineProperty(global, 'screen', {
  value: { width: 1920, height: 1080, colorDepth: 24 },
  configurable: true,
  writable: true
});

// ─── Fake IndexedDB helpers ───────────────────────────────────────────────────

/**
 * Returns an IDBRequest-like object whose onsuccess/onerror callbacks are
 * invoked via a microtask (mimicking IDB async behaviour).
 */
function makeRequest(getResultFn, error = null) {
  const req = { result: undefined, error: null };
  Promise.resolve().then(() => {
    if (error) {
      req.error = error;
      if (req.onerror) req.onerror();
    } else {
      req.result = getResultFn();
      if (req.onsuccess) req.onsuccess();
    }
  });
  return req;
}

/**
 * Creates a fake IDBDatabase that keeps data in Maps.
 * Supports: put, get, getAll, delete, clear, count, createIndex (no-op).
 */
function makeFakeDB() {
  const storeData = {};

  const getStore = (name) => {
    if (!storeData[name]) storeData[name] = new Map();
    return storeData[name];
  };

  return {
    _storeData: storeData,
    transaction(storeName) {
      const s = getStore(storeName);
      return {
        objectStore() {
          return {
            put(record)  { return makeRequest(() => { s.set(record.id, { ...record }); }); },
            get(id)      { return makeRequest(() => s.get(id)); },
            getAll()     { return makeRequest(() => [...s.values()]); },
            delete(id)   { return makeRequest(() => { s.delete(id); }); },
            clear()      { return makeRequest(() => { s.clear(); }); },
            count()      { return makeRequest(() => s.size); },
            createIndex() {} // no-op
          };
        }
      };
    }
  };
}

// ─── Key and Memory helpers ───────────────────────────────────────────────────

async function makeAesKey() {
  return globalThis.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Build a ready Memory instance with a real crypto key and a fake DB.
 * Optionally pre-populates named stores with plaintext records.
 *
 * @param {Record<string, Record<string, object>>} [initial]
 *   e.g. { 'preferences': { 'key1': { key: 'key1', value: 'v' } } }
 */
async function buildMemory(initial = {}) {
  const mem = new Memory();
  mem.sessionId  = 'test-session-abc123';
  mem.cryptoKey  = await makeAesKey();
  mem.db         = makeFakeDB();

  for (const [storeName, records] of Object.entries(initial)) {
    for (const [id, value] of Object.entries(records)) {
      await mem._put(storeName, id, value);
    }
  }

  return mem;
}

// ─── _encrypt / _decrypt ─────────────────────────────────────────────────────

describe('_encrypt / _decrypt', () => {
  let mem;

  beforeEach(async () => {
    mem = await buildMemory();
  });

  it('round-trips a simple object', async () => {
    const data = { hello: 'world', num: 42 };
    const enc  = await mem._encrypt(data);
    const dec  = await mem._decrypt(enc);
    expect(dec).toEqual(data);
  });

  it('encrypted payload has iv and data arrays', async () => {
    const enc = await mem._encrypt({ x: 1 });
    expect(Array.isArray(enc.iv)).toBe(true);
    expect(Array.isArray(enc.data)).toBe(true);
    expect(enc.iv.length).toBe(12);   // 96-bit GCM IV
    expect(enc.data.length).toBeGreaterThan(0);
  });

  it('produces different ciphertext on each call (random IV)', async () => {
    const enc1 = await mem._encrypt({ x: 1 });
    const enc2 = await mem._encrypt({ x: 1 });
    expect(enc1.iv).not.toEqual(enc2.iv);
  });

  it('round-trips nested structures', async () => {
    const data = { arr: [1, 2, 3], nested: { a: true } };
    const enc  = await mem._encrypt(data);
    const dec  = await mem._decrypt(enc);
    expect(dec).toEqual(data);
  });

  it('throws when decrypting corrupted data', async () => {
    const fakeEnc = { iv: Array(12).fill(0), data: Array(16).fill(99) };
    await expect(mem._decrypt(fakeEnc)).rejects.toThrow();
  });

  it('round-trips with a second independent key', async () => {
    const mem2 = await buildMemory();
    const enc  = await mem._encrypt({ secret: 'abc' });
    // Different key — should fail to decrypt
    await expect(mem2._decrypt(enc)).rejects.toThrow();
  });
});

// ─── _put / _get / _getAll / _delete ─────────────────────────────────────────

describe('low-level DB operations', () => {
  let mem;

  beforeEach(async () => {
    mem = await buildMemory();
  });

  it('_put then _get returns the original value', async () => {
    await mem._put('preferences', 'theme', { key: 'theme', value: 'dark' });
    const result = await mem._get('preferences', 'theme');
    expect(result).toMatchObject({ key: 'theme', value: 'dark' });
  });

  it('_get returns null for missing id', async () => {
    const result = await mem._get('preferences', 'nonexistent');
    expect(result).toBeNull();
  });

  it('_getAll returns all stored items', async () => {
    await mem._put('preferences', 'a', { key: 'a', value: 1 });
    await mem._put('preferences', 'b', { key: 'b', value: 2 });
    const all = await mem._getAll('preferences');
    expect(all).toHaveLength(2);
    const values = all.map(r => r.value).sort();
    expect(values).toEqual([1, 2]);
  });

  it('_getAll returns empty array when store is empty', async () => {
    const all = await mem._getAll('preferences');
    expect(all).toEqual([]);
  });

  it('_delete removes the item', async () => {
    await mem._put('preferences', 'todelete', { key: 'todelete', value: 'x' });
    await mem._delete('preferences', 'todelete');
    const result = await mem._get('preferences', 'todelete');
    expect(result).toBeNull();
  });

  it('_delete is idempotent (does not throw for missing id)', async () => {
    await expect(mem._delete('preferences', 'ghost')).resolves.toBe(true);
  });

  it('_getAll skips corrupted entries gracefully', async () => {
    // Insert one valid entry
    await mem._put('preferences', 'good', { key: 'good', value: 'ok' });
    // Inject a corrupted record directly into the fake DB
    const store = mem.db._storeData['preferences'];
    store.set('bad', { id: 'bad', timestamp: Date.now(), encrypted: { iv: Array(12).fill(0), data: Array(8).fill(255) } });

    const all = await mem._getAll('preferences');
    // Only the valid entry should survive
    expect(all).toHaveLength(1);
    expect(all[0].value).toBe('ok');
  });
});

// ─── preferences ─────────────────────────────────────────────────────────────

describe('savePreference / getPreference', () => {
  let mem;

  beforeEach(async () => {
    mem = await buildMemory();
  });

  it('stores and retrieves a string preference', async () => {
    await mem.savePreference('mode', 'cloud');
    expect(await mem.getPreference('mode')).toBe('cloud');
  });

  it('stores and retrieves a numeric preference', async () => {
    await mem.savePreference('voice_index', 3);
    expect(await mem.getPreference('voice_index')).toBe(3);
  });

  it('stores and retrieves a boolean preference', async () => {
    await mem.savePreference('tts', false);
    expect(await mem.getPreference('tts')).toBe(false);
  });

  it('returns null for unknown preference key', async () => {
    expect(await mem.getPreference('unknown')).toBeNull();
  });

  it('overwrites an existing preference', async () => {
    await mem.savePreference('mode', 'local');
    await mem.savePreference('mode', 'hybrid');
    expect(await mem.getPreference('mode')).toBe('hybrid');
  });
});

// ─── chat_history ─────────────────────────────────────────────────────────────

describe('saveChatHistory / getConversations / loadConversation / deleteChatHistory', () => {
  let mem;

  beforeEach(async () => {
    mem = await buildMemory();
  });

  it('saves and loads a conversation by id', async () => {
    const msgs = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' }
    ];
    await mem.saveChatHistory('conv1', msgs, 'My chat');
    const loaded = await mem.loadConversation('conv1');
    expect(loaded.id).toBe('conv1');
    expect(loaded.title).toBe('My chat');
    expect(loaded.messages).toEqual(msgs);
  });

  it('auto-generates title from first user message (≤ 50 chars)', async () => {
    const msgs = [{ role: 'user', content: 'Short message' }];
    await mem.saveChatHistory('c2', msgs);
    const loaded = await mem.loadConversation('c2');
    expect(loaded.title).toBe('Short message');
  });

  it('truncates auto-generated title at 50 chars with ellipsis', async () => {
    const long = 'A'.repeat(60);
    const msgs = [{ role: 'user', content: long }];
    await mem.saveChatHistory('c3', msgs);
    const loaded = await mem.loadConversation('c3');
    expect(loaded.title).toBe('A'.repeat(50) + '...');
  });

  it('uses "New conversation" when no user message exists', async () => {
    const msgs = [{ role: 'assistant', content: 'Welcome!' }];
    await mem.saveChatHistory('c4', msgs);
    const loaded = await mem.loadConversation('c4');
    expect(loaded.title).toBe('New conversation');
  });

  it('preserves createdAt on update', async () => {
    const msgs = [{ role: 'user', content: 'First' }];
    await mem.saveChatHistory('c5', msgs);
    const first = await mem.loadConversation('c5');
    const origCreatedAt = first.createdAt;

    // Update the conversation
    await mem.saveChatHistory('c5', [...msgs, { role: 'assistant', content: 'Reply' }]);
    const updated = await mem.loadConversation('c5');
    expect(updated.createdAt).toBe(origCreatedAt);
  });

  it('getConversations returns metadata sorted by most recent updatedAt', async () => {
    await mem.saveChatHistory('old', [{ role: 'user', content: 'Old' }]);
    // Small delay to ensure different updatedAt timestamps
    await new Promise(r => setTimeout(r, 5));
    await mem.saveChatHistory('new', [{ role: 'user', content: 'New' }]);

    const convs = await mem.getConversations();
    expect(convs).toHaveLength(2);
    expect(convs[0].id).toBe('new');
    expect(convs[1].id).toBe('old');
  });

  it('getConversations returns id, title, createdAt, updatedAt fields', async () => {
    await mem.saveChatHistory('cx', [{ role: 'user', content: 'Test' }]);
    const convs = await mem.getConversations();
    expect(convs[0]).toHaveProperty('id', 'cx');
    expect(convs[0]).toHaveProperty('title');
    expect(convs[0]).toHaveProperty('createdAt');
    expect(convs[0]).toHaveProperty('updatedAt');
  });

  it('getConversations returns empty array when no conversations exist', async () => {
    const convs = await mem.getConversations();
    expect(convs).toEqual([]);
  });

  it('loadConversation returns null for missing id', async () => {
    const result = await mem.loadConversation('nope');
    expect(result).toBeNull();
  });

  it('deleteChatHistory removes the conversation', async () => {
    await mem.saveChatHistory('del', [{ role: 'user', content: 'Bye' }]);
    await mem.deleteChatHistory('del');
    const loaded = await mem.loadConversation('del');
    expect(loaded).toBeNull();
  });

  it('deleteChatHistory removes entry from getConversations listing', async () => {
    await mem.saveChatHistory('keep', [{ role: 'user', content: 'Keep' }]);
    await mem.saveChatHistory('remove', [{ role: 'user', content: 'Remove' }]);
    await mem.deleteChatHistory('remove');
    const convs = await mem.getConversations();
    expect(convs).toHaveLength(1);
    expect(convs[0].id).toBe('keep');
  });
});

// ─── legacy conversations store ──────────────────────────────────────────────

describe('saveConversation / getConversation / deleteConversation (legacy store)', () => {
  let mem;

  beforeEach(async () => {
    mem = await buildMemory();
  });

  it('saves and retrieves a conversation from the legacy store', async () => {
    const msgs = [{ role: 'user', content: 'Hi' }];
    await mem.saveConversation('leg1', msgs);
    const result = await mem.getConversation('leg1');
    expect(result.id).toBe('leg1');
    expect(result.messages).toEqual(msgs);
  });

  it('getConversation returns null for missing id', async () => {
    expect(await mem.getConversation('missing')).toBeNull();
  });

  it('getAllConversations returns all entries from the legacy store', async () => {
    await mem.saveConversation('a', []);
    await mem.saveConversation('b', []);
    const all = await mem.getAllConversations();
    expect(all).toHaveLength(2);
  });

  it('deleteConversation removes entry from the legacy store', async () => {
    await mem.saveConversation('del', []);
    await mem.deleteConversation('del');
    expect(await mem.getConversation('del')).toBeNull();
  });
});

// ─── shared content ───────────────────────────────────────────────────────────

describe('saveSharedContent / getSharedContent', () => {
  let mem;

  beforeEach(async () => {
    mem = await buildMemory();
  });

  it('saves and retrieves shared content', async () => {
    const item = { id: 'sc1', type: 'skill-manifest', text: 'hello' };
    await mem.saveSharedContent(item);
    const all = await mem.getSharedContent();
    expect(all).toHaveLength(1);
    expect(all[0].type).toBe('skill-manifest');
    expect(all[0].text).toBe('hello');
  });

  it('getSharedContent returns empty array when nothing stored', async () => {
    expect(await mem.getSharedContent()).toEqual([]);
  });

  it('multiple items can be stored and retrieved', async () => {
    await mem.saveSharedContent({ id: 'i1', type: 'note', text: 'a' });
    await mem.saveSharedContent({ id: 'i2', type: 'note', text: 'b' });
    const all = await mem.getSharedContent();
    expect(all).toHaveLength(2);
  });
});

// ─── audit log ────────────────────────────────────────────────────────────────

describe('saveAuditEntry / getAuditLog', () => {
  let mem;

  beforeEach(async () => {
    mem = await buildMemory();
  });

  it('saves and retrieves audit entries', async () => {
    const entry = { id: 'audit_001', type: 'cloud_call', timestamp: Date.now(), mode: 'cloud' };
    await mem.saveAuditEntry(entry);
    const log = await mem.getAuditLog();
    expect(log).toHaveLength(1);
    expect(log[0].type).toBe('cloud_call');
  });

  it('multiple entries are all retrievable', async () => {
    for (let i = 0; i < 3; i++) {
      await mem.saveAuditEntry({ id: `audit_${i}`, type: 'suggestion', timestamp: i, mode: 'local' });
    }
    const log = await mem.getAuditLog();
    expect(log).toHaveLength(3);
  });
});

// ─── exportAll / clearAll / getStats ─────────────────────────────────────────

describe('exportAll / clearAll / getStats', () => {
  let mem;

  beforeEach(async () => {
    mem = await buildMemory();
  });

  it('exportAll returns all five store keys', async () => {
    const data = await mem.exportAll();
    expect(Object.keys(data).sort()).toEqual(
      ['audit_log', 'chat_history', 'conversations', 'preferences', 'shared_content']
    );
  });

  it('exportAll includes data saved to each store', async () => {
    await mem.savePreference('test_key', 'test_value');
    await mem.saveChatHistory('exp1', [{ role: 'user', content: 'Hi' }]);
    const data = await mem.exportAll();
    expect(data.preferences).toHaveLength(1);
    expect(data.chat_history).toHaveLength(1);
  });

  it('clearAll empties every store', async () => {
    await mem.savePreference('k', 'v');
    await mem.saveChatHistory('c', [{ role: 'user', content: 'msg' }]);
    await mem.clearAll();
    const data = await mem.exportAll();
    for (const store of Object.values(data)) {
      expect(store).toHaveLength(0);
    }
  });

  it('clearAll returns true', async () => {
    expect(await mem.clearAll()).toBe(true);
  });

  it('getStats returns count per store', async () => {
    await mem.savePreference('x', 1);
    await mem.savePreference('y', 2);
    await mem.saveChatHistory('c1', [{ role: 'user', content: 'A' }]);
    const stats = await mem.getStats();
    expect(stats.preferences).toBe(2);
    expect(stats.chat_history).toBe(1);
    expect(stats.conversations).toBe(0);
    expect(stats.audit_log).toBe(0);
    expect(stats.shared_content).toBe(0);
  });
});

// ─── _getOrCreateSessionId ────────────────────────────────────────────────────

describe('_getOrCreateSessionId', () => {
  beforeEach(() => {
    _localStore.clear();
  });

  it('generates a new session id when none exists', () => {
    const mem = new Memory();
    const id = mem._getOrCreateSessionId();
    expect(typeof id).toBe('string');
    expect(id.length).toBe(32); // 16 bytes → 32 hex chars
  });

  it('persists the session id to localStorage', () => {
    const mem = new Memory();
    const id = mem._getOrCreateSessionId();
    expect(global.localStorage.getItem('ai-space-session-id')).toBe(id);
  });

  it('returns the same id on subsequent calls', () => {
    const mem = new Memory();
    const id1 = mem._getOrCreateSessionId();
    const id2 = mem._getOrCreateSessionId();
    expect(id1).toBe(id2);
  });

  it('reuses an existing session id from localStorage', () => {
    global.localStorage.setItem('ai-space-session-id', 'myexistingsession');
    const mem = new Memory();
    const id = mem._getOrCreateSessionId();
    expect(id).toBe('myexistingsession');
  });
});

// ─── _getDeviceFingerprint ────────────────────────────────────────────────────

describe('_getDeviceFingerprint', () => {
  it('includes userAgent in the fingerprint', () => {
    const mem = new Memory();
    mem.sessionId = 'fp-test';
    const fp = mem._getDeviceFingerprint();
    expect(fp).toContain('test-agent/1.0');
  });

  it('includes language in the fingerprint', () => {
    const mem = new Memory();
    mem.sessionId = 'fp-test';
    const fp = mem._getDeviceFingerprint();
    expect(fp).toContain('en-US');
  });

  it('includes screen dimensions in the fingerprint', () => {
    const mem = new Memory();
    mem.sessionId = 'fp-test';
    const fp = mem._getDeviceFingerprint();
    expect(fp).toContain('1920x1080');
  });

  it('includes the session id in the fingerprint', () => {
    const mem = new Memory();
    mem.sessionId = 'unique-session-xyz';
    const fp = mem._getDeviceFingerprint();
    expect(fp).toContain('unique-session-xyz');
  });

  it('two different session ids produce different fingerprints', () => {
    const mem1 = new Memory(); mem1.sessionId = 'session-A';
    const mem2 = new Memory(); mem2.sessionId = 'session-B';
    expect(mem1._getDeviceFingerprint()).not.toBe(mem2._getDeviceFingerprint());
  });
});

// ─── _getDBName ───────────────────────────────────────────────────────────────

describe('_getDBName', () => {
  it('prefixes the session id with ai-space-', () => {
    const mem = new Memory();
    mem.sessionId = 'abc123';
    expect(mem._getDBName()).toBe('ai-space-abc123');
  });
});
