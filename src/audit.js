/**
 * Audit - Transparent logging of all AI actions
 * Non-blocking initialization. Logs are stored encrypted in IndexedDB via Memory.
 */

const AUDIT_TYPES = [
  'context_read',
  'suggestion',
  'action',
  'cloud_call',
  'approval',
  'model_load',
  'voice_input',
  'image_input'
];

export class Audit {
  constructor() {
    this.memory = null;
    this.currentMode = 'local';
    this._ready = false;
    this._queue = []; // buffer entries before memory is ready
  }

  /**
   * Initialize with Memory instance.
   * Does not block — if memory isn't ready, entries are queued.
   * @param {Memory} memory
   */
  async init(memory) {
    this.memory = memory;
    this._ready = true;

    // Flush any queued entries
    if (this._queue.length > 0) {
      const queued = [...this._queue];
      this._queue = [];
      for (const entry of queued) {
        try {
          await this.memory.saveAuditEntry(entry);
        } catch {
          // silently drop if save fails
        }
      }
    }

    return true;
  }

  /**
   * Set current operating mode
   * @param {string} mode - 'local' | 'hybrid' | 'cloud'
   */
  setMode(mode) {
    this.currentMode = mode;
  }

  /**
   * Log an audit entry
   * @param {string} type - One of AUDIT_TYPES
   * @param {object} details - Event details
   * @returns {Promise<object>} The created entry
   */
  async log(type, details) {
    if (!AUDIT_TYPES.includes(type)) {
      console.warn(`Unknown audit type: ${type}`);
    }

    const entry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      type,
      details: details || {},
      mode: this.currentMode
    };

    if (this._ready && this.memory) {
      try {
        await this.memory.saveAuditEntry(entry);
      } catch (err) {
        console.warn('Audit log save failed:', err);
      }
    } else {
      // Queue for later
      this._queue.push(entry);
    }

    return entry;
  }

  /**
   * Get audit log entries, sorted by most recent first
   * @param {number} [limit] - Max entries to return (all if not specified)
   * @returns {Promise<Array>}
   */
  async getLog(limit) {
    if (!this._ready || !this.memory) return [];

    try {
      const all = await this.memory.getAuditLog();
      const sorted = all.sort((a, b) =>
        (b.timestamp || b._timestamp || 0) - (a.timestamp || a._timestamp || 0)
      );

      if (limit && limit > 0) {
        return sorted.slice(0, limit);
      }
      return sorted;
    } catch {
      return [];
    }
  }

  /**
   * Get count of cloud API calls made
   * @returns {Promise<number>}
   */
  async getCloudCallCount() {
    const log = await this.getLog();
    return log.filter(entry => entry.type === 'cloud_call').length;
  }

  /**
   * Get audit statistics
   * @returns {Promise<object>}
   */
  async getStats() {
    const log = await this.getLog();
    const stats = {
      total: log.length,
      byType: {},
      byMode: {},
      cloudCalls: 0
    };

    for (const entry of log) {
      stats.byType[entry.type] = (stats.byType[entry.type] || 0) + 1;
      stats.byMode[entry.mode] = (stats.byMode[entry.mode] || 0) + 1;
      if (entry.type === 'cloud_call') {
        stats.cloudCalls++;
      }
    }

    return stats;
  }
}
