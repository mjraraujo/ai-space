/**
 * Audit - Transparent logging of all AI actions
 */

const AUDIT_TYPES = [
  'context_read',
  'suggestion',
  'action',
  'cloud_call',
  'approval',
  'model_load'
];

export class Audit {
  constructor() {
    this.memory = null;
    this.currentMode = 'local';
  }

  /**
   * Initialize with Memory instance
   * @param {Memory} memory
   */
  async init(memory) {
    this.memory = memory;
    return true;
  }

  /**
   * Set current mode
   */
  setMode(mode) {
    this.currentMode = mode;
  }

  /**
   * Log an audit entry
   * @param {string} type - One of AUDIT_TYPES
   * @param {object} details - Event details
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

    if (this.memory) {
      await this.memory.saveAuditEntry(entry);
    }

    return entry;
  }

  /**
   * Get audit log entries
   * @param {number} limit - Max entries to return
   */
  async getLog(limit) {
    if (!this.memory) return [];

    const all = await this.memory.getAuditLog();
    const sorted = all.sort((a, b) => (b.timestamp || b._timestamp) - (a.timestamp || a._timestamp));

    if (limit && limit > 0) {
      return sorted.slice(0, limit);
    }
    return sorted;
  }

  /**
   * Get count of cloud API calls
   */
  async getCloudCallCount() {
    const log = await this.getLog();
    return log.filter((entry) => entry.type === 'cloud_call').length;
  }

  /**
   * Get audit statistics
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
