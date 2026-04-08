/**
 * Memory - Encrypted IndexedDB storage with session isolation
 * AES-256-GCM via Web Crypto API with PBKDF2 key derivation
 * 
 * Each user session gets isolated storage via a random session ID.
 * Stores: conversations, preferences, audit_log, shared_content, chat_history
 */

const DB_VERSION = 2;
const STORES = ['conversations', 'preferences', 'audit_log', 'shared_content', 'chat_history'];
const PBKDF2_ITERATIONS = 100000;

export class Memory {
  constructor() {
    this.db = null;
    this.cryptoKey = null;
    this.sessionId = null;
  }

  /**
   * Initialize the database and derive encryption key
   */
  async init() {
    this.sessionId = this._getOrCreateSessionId();
    this.cryptoKey = await this._deriveKey();
    this.db = await this._openDB();
    return true;
  }

  /**
   * Get or create a session ID for storage isolation
   */
  _getOrCreateSessionId() {
    const key = 'ai-space-session-id';
    let sessionId = localStorage.getItem(key);
    if (!sessionId) {
      // Generate a random session ID
      const arr = new Uint8Array(16);
      crypto.getRandomValues(arr);
      sessionId = Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(key, sessionId);
    }
    return sessionId;
  }

  /**
   * Get the DB name scoped to this session
   */
  _getDBName() {
    return `ai-space-${this.sessionId}`;
  }

  /**
   * Derive encryption key from device fingerprint + session using PBKDF2
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

    const salt = encoder.encode('ai-space-salt-v1-' + this.sessionId);
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: PBKDF2_ITERATIONS,
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
      'ai-space-device-key',
      this.sessionId
    ];
    return components.join('|');
  }

  /**
   * Open IndexedDB with all required stores
   */
  _openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this._getDBName(), DB_VERSION);

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

  // --- Conversation methods (legacy store) ---

  async saveConversation(id, messages) {
    return this._put('conversations', id, { id, messages, updatedAt: Date.now() });
  }

  async getConversation(id) {
    return this._get('conversations', id);
  }

  async getAllConversations() {
    return this._getAll('conversations');
  }

  /**
   * Delete a conversation from the **legacy** `conversations` store.
   * For conversations stored via the new `chat_history` store (see
   * saveChatHistory / getConversations / loadConversation), use
   * deleteChatHistory(id) instead.  Callers that need to clean both stores
   * (e.g. when the user deletes from the sidebar) should call both methods.
   */
  async deleteConversation(id) {
    return this._delete('conversations', id);
  }

  // --- Chat History methods (new enhanced store) ---

  /**
   * Save a chat to the chat_history store
   * Auto-generates a title from the first user message if not provided
   * @param {string} id - Conversation ID
   * @param {Array} messages - Array of {role, content} message objects
   * @param {string} [title] - Optional title, auto-generated if not provided
   */
  async saveChatHistory(id, messages, title) {
    // Auto-generate title from first user message
    if (!title) {
      const firstUserMsg = messages.find(m => m.role === 'user');
      if (firstUserMsg) {
        title = firstUserMsg.content.substring(0, 50);
        if (firstUserMsg.content.length > 50) {
          title += '...';
        }
      } else {
        title = 'New conversation';
      }
    }

    // Check if conversation already exists (to preserve createdAt)
    const existing = await this._get('chat_history', id);
    const createdAt = (existing && existing.createdAt) ? existing.createdAt : Date.now();

    const record = {
      id,
      title,
      messages,
      createdAt,
      updatedAt: Date.now()
    };

    return this._put('chat_history', id, record);
  }

  /**
   * Get list of past conversations (id, title, date) sorted by most recent
   * @returns {Promise<Array<{id: string, title: string, createdAt: number, updatedAt: number}>>}
   */
  async getConversations() {
    const all = await this._getAll('chat_history');
    return all
      .map(item => ({
        id: item.id,
        title: item.title || 'Untitled',
        createdAt: item.createdAt || item._timestamp,
        updatedAt: item.updatedAt || item._timestamp
      }))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  /**
   * Load full conversation including messages
   * @param {string} id - Conversation ID
   * @returns {Promise<{id: string, title: string, messages: Array, createdAt: number, updatedAt: number}|null>}
   */
  async loadConversation(id) {
    return this._get('chat_history', id);
  }

  /**
   * Delete a conversation from chat_history
   * @param {string} id - Conversation ID
   */
  async deleteChatHistory(id) {
    return this._delete('chat_history', id);
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
