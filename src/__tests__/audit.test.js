import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Audit } from '../audit.js';

/** Build a minimal Memory mock */
function makeMockMemory(initialEntries = []) {
  const store = [...initialEntries];
  return {
    saveAuditEntry: vi.fn(async (entry) => { store.push(entry); }),
    getAuditLog: vi.fn(async () => [...store])
  };
}

describe('Audit', () => {
  let audit;

  beforeEach(() => {
    audit = new Audit();
  });

  // ─── initial state ────────────────────────────────────────────────────────

  it('starts not ready', () => {
    expect(audit._ready).toBe(false);
  });

  it('starts with empty queue', () => {
    expect(audit._queue).toHaveLength(0);
  });

  it('defaults to local mode', () => {
    expect(audit.currentMode).toBe('local');
  });

  // ─── setMode ─────────────────────────────────────────────────────────────

  describe('setMode()', () => {
    it('updates currentMode', () => {
      audit.setMode('cloud');
      expect(audit.currentMode).toBe('cloud');
    });

    it('persists mode for subsequent log entries', async () => {
      const memory = makeMockMemory();
      await audit.init(memory);
      audit.setMode('hybrid');
      const entry = await audit.log('context_read', {});
      expect(entry.mode).toBe('hybrid');
    });
  });

  // ─── log() before init — queue behavior ───────────────────────────────────

  describe('log() before init', () => {
    it('queues entries when not ready', async () => {
      await audit.log('context_read', { len: 10 });
      expect(audit._queue).toHaveLength(1);
    });

    it('queued entry has correct shape', async () => {
      const entry = await audit.log('model_load', { model: 'test' });
      expect(entry).toMatchObject({
        type: 'model_load',
        details: { model: 'test' },
        mode: 'local'
      });
      expect(typeof entry.id).toBe('string');
      expect(entry.id).toMatch(/^audit_/);
      expect(typeof entry.timestamp).toBe('number');
    });

    it('does NOT call memory.saveAuditEntry before init', async () => {
      const memory = makeMockMemory();
      await audit.log('context_read', {});
      expect(memory.saveAuditEntry).not.toHaveBeenCalled();
    });
  });

  // ─── init() — flushes queue ───────────────────────────────────────────────

  describe('init()', () => {
    it('sets _ready to true', async () => {
      const memory = makeMockMemory();
      await audit.init(memory);
      expect(audit._ready).toBe(true);
    });

    it('flushes queued entries to memory', async () => {
      await audit.log('context_read', { a: 1 });
      await audit.log('model_load', { b: 2 });
      expect(audit._queue).toHaveLength(2);

      const memory = makeMockMemory();
      await audit.init(memory);

      expect(memory.saveAuditEntry).toHaveBeenCalledTimes(2);
      expect(audit._queue).toHaveLength(0);
    });

    it('clears queue after flush', async () => {
      await audit.log('voice_input', {});
      const memory = makeMockMemory();
      await audit.init(memory);
      expect(audit._queue).toHaveLength(0);
    });
  });

  // ─── log() after init ─────────────────────────────────────────────────────

  describe('log() after init', () => {
    it('saves entry to memory immediately', async () => {
      const memory = makeMockMemory();
      await audit.init(memory);
      await audit.log('cloud_call', { endpoint: 'https://api.openai.com' });
      expect(memory.saveAuditEntry).toHaveBeenCalledTimes(1);
    });

    it('entry has correct shape', async () => {
      const memory = makeMockMemory();
      await audit.init(memory);
      const entry = await audit.log('suggestion', { length: 100, cloud: false });

      expect(entry.type).toBe('suggestion');
      expect(entry.details).toMatchObject({ length: 100, cloud: false });
      expect(entry.mode).toBe('local');
      expect(entry.id).toMatch(/^audit_/);
      expect(typeof entry.timestamp).toBe('number');
    });

    it('warns for unknown audit type but still creates entry', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const memory = makeMockMemory();
      await audit.init(memory);
      const entry = await audit.log('totally_unknown_type', {});
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('totally_unknown_type'));
      // Entry is still created and saved
      expect(memory.saveAuditEntry).toHaveBeenCalled();
      expect(entry.type).toBe('totally_unknown_type');
      warnSpy.mockRestore();
    });

    it('accepts all known audit types without warning', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const memory = makeMockMemory();
      await audit.init(memory);

      const knownTypes = [
        'context_read', 'suggestion', 'action', 'cloud_call',
        'approval', 'model_load', 'voice_input', 'image_input', 'internet_consult'
      ];
      for (const type of knownTypes) {
        await audit.log(type, {});
      }

      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  // ─── getLog ──────────────────────────────────────────────────────────────

  describe('getLog()', () => {
    it('returns empty array when not ready', async () => {
      expect(await audit.getLog()).toEqual([]);
    });

    it('returns all entries sorted by most recent first', async () => {
      const entries = [
        { id: 'a1', type: 'context_read', timestamp: 1000, mode: 'local' },
        { id: 'a2', type: 'suggestion', timestamp: 3000, mode: 'local' },
        { id: 'a3', type: 'cloud_call', timestamp: 2000, mode: 'cloud' }
      ];
      const memory = makeMockMemory(entries);
      await audit.init(memory);

      const log = await audit.getLog();
      expect(log[0].id).toBe('a2'); // timestamp 3000
      expect(log[1].id).toBe('a3'); // timestamp 2000
      expect(log[2].id).toBe('a1'); // timestamp 1000
    });

    it('respects the limit parameter', async () => {
      const entries = Array.from({ length: 10 }, (_, i) => ({
        id: `a${i}`,
        type: 'context_read',
        timestamp: i * 1000,
        mode: 'local'
      }));
      const memory = makeMockMemory(entries);
      await audit.init(memory);

      const log = await audit.getLog(3);
      expect(log).toHaveLength(3);
    });

    it('returns all entries when limit is 0', async () => {
      const entries = Array.from({ length: 5 }, (_, i) => ({
        id: `a${i}`, type: 'context_read', timestamp: i, mode: 'local'
      }));
      const memory = makeMockMemory(entries);
      await audit.init(memory);
      expect(await audit.getLog(0)).toHaveLength(5);
    });
  });

  // ─── getCloudCallCount ───────────────────────────────────────────────────

  describe('getCloudCallCount()', () => {
    it('returns 0 when not ready', async () => {
      expect(await audit.getCloudCallCount()).toBe(0);
    });

    it('counts only cloud_call entries', async () => {
      const entries = [
        { id: '1', type: 'cloud_call', timestamp: 1, mode: 'cloud' },
        { id: '2', type: 'context_read', timestamp: 2, mode: 'local' },
        { id: '3', type: 'cloud_call', timestamp: 3, mode: 'cloud' },
        { id: '4', type: 'suggestion', timestamp: 4, mode: 'local' }
      ];
      const memory = makeMockMemory(entries);
      await audit.init(memory);
      expect(await audit.getCloudCallCount()).toBe(2);
    });

    it('returns 0 when no cloud calls', async () => {
      const entries = [
        { id: '1', type: 'context_read', timestamp: 1, mode: 'local' }
      ];
      const memory = makeMockMemory(entries);
      await audit.init(memory);
      expect(await audit.getCloudCallCount()).toBe(0);
    });
  });

  // ─── getStats ─────────────────────────────────────────────────────────────

  describe('getStats()', () => {
    it('returns zero stats when not ready', async () => {
      const stats = await audit.getStats();
      expect(stats.total).toBe(0);
      expect(stats.cloudCalls).toBe(0);
    });

    it('counts total entries correctly', async () => {
      const entries = [
        { id: '1', type: 'context_read', timestamp: 1, mode: 'local' },
        { id: '2', type: 'cloud_call', timestamp: 2, mode: 'cloud' },
        { id: '3', type: 'suggestion', timestamp: 3, mode: 'local' }
      ];
      const memory = makeMockMemory(entries);
      await audit.init(memory);
      const stats = await audit.getStats();
      expect(stats.total).toBe(3);
    });

    it('groups by type correctly', async () => {
      const entries = [
        { id: '1', type: 'context_read', timestamp: 1, mode: 'local' },
        { id: '2', type: 'context_read', timestamp: 2, mode: 'local' },
        { id: '3', type: 'cloud_call', timestamp: 3, mode: 'cloud' }
      ];
      const memory = makeMockMemory(entries);
      await audit.init(memory);
      const stats = await audit.getStats();
      expect(stats.byType.context_read).toBe(2);
      expect(stats.byType.cloud_call).toBe(1);
    });

    it('groups by mode correctly', async () => {
      const entries = [
        { id: '1', type: 'context_read', timestamp: 1, mode: 'local' },
        { id: '2', type: 'cloud_call', timestamp: 2, mode: 'cloud' },
        { id: '3', type: 'suggestion', timestamp: 3, mode: 'hybrid' }
      ];
      const memory = makeMockMemory(entries);
      await audit.init(memory);
      const stats = await audit.getStats();
      expect(stats.byMode.local).toBe(1);
      expect(stats.byMode.cloud).toBe(1);
      expect(stats.byMode.hybrid).toBe(1);
    });

    it('cloudCalls in stats matches cloud_call type count', async () => {
      const entries = [
        { id: '1', type: 'cloud_call', timestamp: 1, mode: 'cloud' },
        { id: '2', type: 'cloud_call', timestamp: 2, mode: 'cloud' },
        { id: '3', type: 'context_read', timestamp: 3, mode: 'local' }
      ];
      const memory = makeMockMemory(entries);
      await audit.init(memory);
      const stats = await audit.getStats();
      expect(stats.cloudCalls).toBe(2);
      expect(stats.cloudCalls).toBe(stats.byType.cloud_call);
    });
  });
});

// ─── queue size cap ───────────────────────────────────────────────────────────

describe('queue size cap', () => {
  it('caps queue at MAX_QUEUE_SIZE (500) when init is never called', async () => {
    const audit = new Audit();
    // Queue 600 entries without calling init()
    for (let i = 0; i < 600; i++) {
      await audit.log('context_read', { i });
    }
    // Queue should be capped at 500
    expect(audit._queue.length).toBeLessThanOrEqual(500);
  });

  it('oldest entries are dropped when cap is exceeded', async () => {
    const audit = new Audit();
    for (let i = 0; i < 510; i++) {
      await audit.log('context_read', { seq: i });
    }
    // The first entry (seq: 0) should have been evicted
    const firstDetail = audit._queue[0].details?.seq ?? -1;
    expect(firstDetail).toBeGreaterThan(0);
  });
});

// ─── clearLog() ───────────────────────────────────────────────────────────────

describe('clearLog()', () => {
  it('returns false when not ready', async () => {
    const audit = new Audit();
    expect(await audit.clearLog()).toBe(false);
  });

  it('calls clearAuditLog on memory when ready', async () => {
    const audit = new Audit();
    const memory = { ...makeMockMemory(), clearAuditLog: vi.fn().mockResolvedValue(undefined) };
    await audit.init(memory);
    const result = await audit.clearLog();
    expect(result).toBe(true);
    expect(memory.clearAuditLog).toHaveBeenCalledOnce();
  });
});
