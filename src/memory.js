/**
 * Memory - Encrypted IndexedDB storage
 * AES-256-GCM via Web Crypto API with PBKDF2 key derivation
 */

const DB_NAME = 'ai-space-memory';
const DB_VERSION = 1;
const STORES = ['conversations', 'preferences', 'audit_log', 'shared_content'];

export class Memory {
  constructor() {
    this.db = null;
    this.cryptoKey = null;
  }

  /**
   * Initialize the database and derive encryption key
   */
  async init() {
    this.cryptoKey = await this._deriveKey();
    this.db = await this._openDB();
    return true;
  }

  /**
   * Derive encryption key from device fingerprint using PBKDF2
   */
  async _deriveKey() {
    const fingerprint = this._getDeviceFingerprint();
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(fingerprint),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    const salt = encoder.encode('ai-space-salt-v1');
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Generate a device fingerprint for key derivation
   */
  _getDeviceFingerprint() {
    const components = [
      navigator.userAgent,
      navigator.language,
      screen.width + 'x' + screen.height,
      screen.colorDepth,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      'ai-space-device-key'
    ];
    return components.join('|');
  }

  /**
   * Open IndexedDB
   */
  _openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        for (const storeName of STORES) {
          if (!db.objectStoreNames.contains(storeName)) {
            const store = db.createObjectStore(storeName, { keyPath: 'id' });
            store.createIndex('timestamp', 'timestamp', { unique: false });
          }
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Encrypt data with AES-256-GCM
   */
  async _encrypt(data) {
    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = encoder.encode(JSON.stringify(data));

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.cryptoKey,
      encoded
    );

    return {
      iv: Array.from(iv),
      data: Array.from(new Uint8Array(ciphertext))
    };
  }

  /**
   * Decrypt data
   */
  async _decrypt(encrypted) {
    const iv = new Uint8Array(encrypted.iv);
    const data = new Uint8Array(encrypted.data);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      this.cryptoKey,
      data
    );

    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(decrypted));
  }

  /**
   * Save an item to a store (encrypted)
   */
  async _put(storeName, id, value) {
    const encrypted = await this._encrypt(value);
    const record = {
      id,
      timestamp: Date.now(),
      encrypted
    };

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.put(record);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get an item from a store (decrypted)
   */
  async _get(storeName, id) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.get(id);
      request.onsuccess = async () => {
        if (!request.result) {
          resolve(null);
          return;
        }
        try {
          const decrypted = await this._decrypt(request.result.encrypted);
          resolve(decrypted);
        } catch {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all items from a store (decrypted)
   */
  async _getAll(storeName) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = async () => {
        const results = [];
        for (const record of request.result) {
          try {
            const decrypted = await this._decrypt(record.encrypted);
            results.push({ ...decrypted, _id: record.id, _timestamp: record.timestamp });
          } catch {
            // Skip corrupted entries
          }
        }
        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete an item from a store
   */
  async _delete(storeName, id) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.delete(id);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  // --- Conversation methods ---

  async saveConversation(id, messages) {
    return this._put('conversations', id, { id, messages, updatedAt: Date.now() });
  }

  async getConversation(id) {
    return this._get('conversations', id);
  }

  async getAllConversations() {
    return this._getAll('conversations');
  }

  async deleteConversation(id) {
    return this._delete('conversations', id);
  }

  // --- Preferences methods ---

  async savePreference(key, value) {
    return this._put('preferences', key, { key, value });
  }

  async getPreference(key) {
    const result = await this._get('preferences', key);
    return result ? result.value : null;
  }

  // --- Audit log methods ---

  async saveAuditEntry(entry) {
    return this._put('audit_log', entry.id, entry);
  }

  async getAuditLog() {
    return this._getAll('audit_log');
  }

  // --- Shared content methods ---

  async saveSharedContent(item) {
    return this._put('shared_content', item.id || Date.now().toString(), item);
  }

  async getSharedContent() {
    return this._getAll('shared_content');
  }

  // --- Utility methods ---

  async exportAll() {
    const data = {};
    for (const storeName of STORES) {
      data[storeName] = await this._getAll(storeName);
    }
    return data;
  }

  async clearAll() {
    for (const storeName of STORES) {
      await new Promise((resolve, reject) => {
        const tx = this.db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
    return true;
  }

  async getStats() {
    const stats = {};
    for (const storeName of STORES) {
      stats[storeName] = await new Promise((resolve, reject) => {
        const tx = this.db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    return stats;
  }
}
