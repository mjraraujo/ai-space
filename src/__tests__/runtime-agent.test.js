import { describe, it, expect, beforeEach } from 'vitest';
import { RuntimeAgent } from '../runtime-agent.js';

describe('RuntimeAgent', () => {
  let agent;

  beforeEach(() => {
    agent = new RuntimeAgent();
  });

  // ─── getPresets ───────────────────────────────────────────────────────────

  describe('getPresets()', () => {
    it('returns exactly 4 presets', () => {
      expect(RuntimeAgent.getPresets()).toHaveLength(4);
    });

    it('includes health-check preset', () => {
      const ids = RuntimeAgent.getPresets().map(p => p.id);
      expect(ids).toContain('health-check');
    });

    it('includes relay-artifact preset', () => {
      const ids = RuntimeAgent.getPresets().map(p => p.id);
      expect(ids).toContain('relay-artifact');
    });

    it('includes navigate-flow preset', () => {
      const ids = RuntimeAgent.getPresets().map(p => p.id);
      expect(ids).toContain('navigate-flow');
    });

    it('includes workflow-audit preset', () => {
      const ids = RuntimeAgent.getPresets().map(p => p.id);
      expect(ids).toContain('workflow-audit');
    });

    it('each preset has id, name, script', () => {
      for (const preset of RuntimeAgent.getPresets()) {
        expect(preset).toHaveProperty('id');
        expect(preset).toHaveProperty('name');
        expect(preset).toHaveProperty('script');
        expect(typeof preset.id).toBe('string');
        expect(typeof preset.name).toBe('string');
        expect(typeof preset.script).toBe('string');
        expect(preset.script.length).toBeGreaterThan(0);
      }
    });

    it('preset scripts are valid DSL (contain known commands)', () => {
      const dslCommands = ['LOG', 'RUN', 'WAIT', 'NAVIGATE', 'RETURN', 'RETURNJSON'];
      for (const preset of RuntimeAgent.getPresets()) {
        const hasValidCommand = dslCommands.some(cmd => preset.script.includes(cmd));
        expect(hasValidCommand).toBe(true);
      }
    });

    it('preset scripts end with a RETURN or RETURNJSON statement', () => {
      for (const preset of RuntimeAgent.getPresets()) {
        const lastLine = preset.script.trim().split('\n').pop().trim();
        const isReturn = lastLine.startsWith('RETURN') || lastLine.startsWith('RETURNJSON');
        expect(isReturn).toBe(true);
      }
    });

    it('RETURNJSON values are valid JSON', () => {
      for (const preset of RuntimeAgent.getPresets()) {
        const lines = preset.script.split('\n');
        for (const line of lines) {
          if (line.trim().startsWith('RETURNJSON ')) {
            const jsonStr = line.trim().slice('RETURNJSON '.length);
            expect(() => JSON.parse(jsonStr)).not.toThrow();
          }
        }
      }
    });

    it('health-check script fetches from known URLs', () => {
      const preset = RuntimeAgent.getPresets().find(p => p.id === 'health-check');
      expect(preset.script).toContain('fetch');
    });
  });

  // ─── cancel() ────────────────────────────────────────────────────────────

  describe('cancel()', () => {
    it('returns false for non-existent job', () => {
      expect(agent.cancel('nonexistent_job_id')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(agent.cancel('')).toBe(false);
    });

    it('returns false for null', () => {
      expect(agent.cancel(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(agent.cancel(undefined)).toBe(false);
    });
  });

  // ─── activeJobs Map ───────────────────────────────────────────────────────

  describe('activeJobs', () => {
    it('starts with empty active jobs', () => {
      expect(agent.activeJobs.size).toBe(0);
    });
  });

  // ─── run() validation — no Worker in Node ────────────────────────────────

  describe('run()', () => {
    it('returns a string job ID', () => {
      // Worker will throw/fail in Node but we can check run() behavior up to that point
      // by providing a minimal Worker mock
      const originalWorker = globalThis.Worker;

      // Mock Worker to capture job creation without executing
      let terminateCallCount = 0;
      globalThis.Worker = class MockWorker {
        constructor() { this.onmessage = null; this.onerror = null; }
        postMessage() {}
        terminate() { terminateCallCount++; }
      };
      globalThis.URL = {
        createObjectURL: () => 'blob:mock',
        revokeObjectURL: () => {}
      };
      globalThis.Blob = class MockBlob {
        constructor(parts, opts) { this.size = parts.join('').length; }
      };

      const jobId = agent.run('LOG test', {
        onLog: () => {},
        onDone: () => {},
        onError: () => {}
      });

      expect(typeof jobId).toBe('string');
      expect(jobId).toMatch(/^job_/);

      // Cleanup
      if (originalWorker) globalThis.Worker = originalWorker;
      else delete globalThis.Worker;
    });

    it('registers job in activeJobs', () => {
      const originalWorker = globalThis.Worker;
      globalThis.Worker = class MockWorker {
        constructor() {}
        postMessage() {}
        terminate() {}
      };
      globalThis.URL = { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} };
      globalThis.Blob = class MockBlob { constructor() {} };

      const jobId = agent.run('LOG test', {});
      expect(agent.activeJobs.has(jobId)).toBe(true);

      if (originalWorker) globalThis.Worker = originalWorker;
      else delete globalThis.Worker;
    });

    it('cancel() removes job from activeJobs', () => {
      const originalWorker = globalThis.Worker;
      let statusCalled = false;
      globalThis.Worker = class MockWorker {
        constructor() {}
        postMessage() {}
        terminate() {}
      };
      globalThis.URL = { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} };
      globalThis.Blob = class MockBlob { constructor() {} };

      const jobId = agent.run('LOG test', {
        onStatus: () => { statusCalled = true; }
      });
      expect(agent.activeJobs.has(jobId)).toBe(true);

      const cancelled = agent.cancel(jobId);
      expect(cancelled).toBe(true);
      expect(agent.activeJobs.has(jobId)).toBe(false);

      if (originalWorker) globalThis.Worker = originalWorker;
      else delete globalThis.Worker;
    });
  });
});
