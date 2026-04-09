import { describe, it, expect, beforeEach } from 'vitest';
import { RelayHub } from '../relays.js';

describe('RelayHub', () => {
  let hub;

  beforeEach(() => {
    hub = new RelayHub();
  });

  // ─── getRelays ──────────────────────────────────────────��───────────────────

  describe('getRelays()', () => {
    it('returns all 3 relay types', () => {
      const relays = hub.getRelays();
      expect(relays).toHaveLength(3);
    });

    it('includes shortcuts, browser, device', () => {
      const ids = hub.getRelays().map(r => r.id);
      expect(ids).toContain('shortcuts');
      expect(ids).toContain('browser');
      expect(ids).toContain('device');
    });

    it('each relay has id, name, description', () => {
      for (const relay of hub.getRelays()) {
        expect(relay).toHaveProperty('id');
        expect(relay).toHaveProperty('name');
        expect(relay).toHaveProperty('description');
        expect(typeof relay.id).toBe('string');
        expect(typeof relay.name).toBe('string');
      }
    });
  });

  // ─── getProviders ───────────────────────────────────────────────────────────

  describe('getProviders()', () => {
    it('returns 4 providers', () => {
      expect(hub.getProviders()).toHaveLength(4);
    });

    it('includes local, claude, openai, gemini', () => {
      const ids = hub.getProviders().map(p => p.id);
      expect(ids).toContain('local');
      expect(ids).toContain('claude');
      expect(ids).toContain('openai');
      expect(ids).toContain('gemini');
    });

    it('each provider has id, name, style', () => {
      for (const p of hub.getProviders()) {
        expect(p).toHaveProperty('id');
        expect(p).toHaveProperty('name');
        expect(p).toHaveProperty('style');
      }
    });
  });

  // ─── getActions ─────────────────────────────────────────────────────────────

  describe('getActions(relayId)', () => {
    it('shortcuts relay supports summarize, draft_reply, morning_briefing, create_reminder', () => {
      const ids = hub.getActions('shortcuts').map(a => a.id);
      expect(ids).toContain('summarize');
      expect(ids).toContain('draft_reply');
      expect(ids).toContain('morning_briefing');
      expect(ids).toContain('create_reminder');
    });

    it('shortcuts relay does NOT support web_extract', () => {
      const ids = hub.getActions('shortcuts').map(a => a.id);
      expect(ids).not.toContain('web_extract');
    });

    it('browser relay supports summarize, draft_reply, web_extract, workflow_plan', () => {
      const ids = hub.getActions('browser').map(a => a.id);
      expect(ids).toContain('summarize');
      expect(ids).toContain('draft_reply');
      expect(ids).toContain('web_extract');
      expect(ids).toContain('workflow_plan');
    });

    it('browser relay does NOT support morning_briefing or create_reminder', () => {
      const ids = hub.getActions('browser').map(a => a.id);
      expect(ids).not.toContain('morning_briefing');
      expect(ids).not.toContain('create_reminder');
    });

    it('device relay supports summarize, draft_reply, morning_briefing, create_reminder, workflow_plan', () => {
      const ids = hub.getActions('device').map(a => a.id);
      expect(ids).toContain('summarize');
      expect(ids).toContain('morning_briefing');
      expect(ids).toContain('create_reminder');
      expect(ids).toContain('workflow_plan');
    });

    it('device relay does NOT support web_extract', () => {
      const ids = hub.getActions('device').map(a => a.id);
      expect(ids).not.toContain('web_extract');
    });

    it('returns empty array for unknown relay', () => {
      expect(hub.getActions('unknown')).toEqual([]);
    });

    it('each action has id, label, relays, intent', () => {
      for (const action of hub.getActions('shortcuts')) {
        expect(action).toHaveProperty('id');
        expect(action).toHaveProperty('label');
        expect(action).toHaveProperty('relays');
        expect(action).toHaveProperty('intent');
        expect(Array.isArray(action.relays)).toBe(true);
      }
    });
  });

  // ─── buildControlEnvelope ───────────────────────────────────────────────────

  describe('buildControlEnvelope()', () => {
    it('returns correct shape', () => {
      const env = hub.buildControlEnvelope('shortcuts', 'summarize', 'some text');
      expect(env).toMatchObject({
        relay: 'shortcuts',
        action: 'summarize',
        content: 'some text',
        constraints: {
          localFirst: true,
          cloudOptional: true,
          requireConfirmationForRisky: true
        }
      });
    });

    it('includes a valid ISO 8601 createdAt timestamp', () => {
      const env = hub.buildControlEnvelope('browser', 'web_extract', 'test');
      expect(() => new Date(env.createdAt).toISOString()).not.toThrow();
      expect(env.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('trims whitespace from content', () => {
      const env = hub.buildControlEnvelope('device', 'summarize', '  padded  ');
      expect(env.content).toBe('padded');
    });

    it('handles empty content', () => {
      const env = hub.buildControlEnvelope('shortcuts', 'summarize', '');
      expect(env.content).toBe('');
    });

    it('handles null/undefined content gracefully', () => {
      const env = hub.buildControlEnvelope('shortcuts', 'summarize', null);
      expect(env.content).toBe('');
    });
  });

  // ─── buildArtifactPrompt ────────────────────────────────────────────────────

  describe('buildArtifactPrompt()', () => {
    it('returns a non-empty string', () => {
      const prompt = hub.buildArtifactPrompt({
        relayId: 'shortcuts',
        actionId: 'summarize',
        providerId: 'local',
        content: 'test content'
      });
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('includes the system constraints header', () => {
      const prompt = hub.buildArtifactPrompt({
        relayId: 'shortcuts',
        actionId: 'summarize',
        providerId: 'local',
        content: 'test'
      });
      expect(prompt).toContain('System constraints: local-first, cloud optional.');
    });

    it('includes relay name', () => {
      const prompt = hub.buildArtifactPrompt({
        relayId: 'browser',
        actionId: 'web_extract',
        providerId: 'openai',
        content: 'test'
      });
      expect(prompt).toContain('Browser Relay');
    });

    it('includes action intent', () => {
      const prompt = hub.buildArtifactPrompt({
        relayId: 'shortcuts',
        actionId: 'morning_briefing',
        providerId: 'claude',
        content: 'test'
      });
      expect(prompt).toContain('Build day briefing');
    });

    it('includes provider name and style', () => {
      const prompt = hub.buildArtifactPrompt({
        relayId: 'shortcuts',
        actionId: 'summarize',
        providerId: 'claude',
        content: 'test'
      });
      expect(prompt).toContain('Claude');
      expect(prompt).toContain('artifact-style');
    });

    it('includes the input payload JSON', () => {
      const prompt = hub.buildArtifactPrompt({
        relayId: 'shortcuts',
        actionId: 'summarize',
        providerId: 'local',
        content: 'my special content'
      });
      expect(prompt).toContain('my special content');
    });

    it('includes a RelayCommandJSON schema reference', () => {
      const prompt = hub.buildArtifactPrompt({
        relayId: 'shortcuts',
        actionId: 'summarize',
        providerId: 'local',
        content: 'test'
      });
      expect(prompt).toContain('RelayCommandJSON');
    });

    it('falls back to defaults for unknown relayId/actionId/providerId', () => {
      const prompt = hub.buildArtifactPrompt({
        relayId: 'UNKNOWN',
        actionId: 'UNKNOWN',
        providerId: 'UNKNOWN',
        content: 'test'
      });
      // Should not throw; falls back to shortcuts/summarize/local
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('claude provider uses artifact-style header', () => {
      const prompt = hub.buildArtifactPrompt({
        relayId: 'shortcuts',
        actionId: 'summarize',
        providerId: 'claude',
        content: 'test'
      });
      expect(prompt).toContain('artifact-style response');
    });

    it('non-claude providers use generic header', () => {
      const prompt = hub.buildArtifactPrompt({
        relayId: 'shortcuts',
        actionId: 'summarize',
        providerId: 'openai',
        content: 'test'
      });
      expect(prompt).not.toContain('artifact-style response');
      expect(prompt).toContain('RelayCommandJSON');
    });

    it('workflow_plan asks for approval checkpoints and success criteria', () => {
      const prompt = hub.buildArtifactPrompt({
        relayId: 'device',
        actionId: 'workflow_plan',
        providerId: 'claude',
        content: 'Plan a trip and create a reusable runbook'
      });
      expect(prompt).toContain('ApprovalCheckpoints');
      expect(prompt).toContain('SuccessCriteria');
      expect(prompt).toContain('workflow_plan');
    });
  });

  // ─── getToolDefs() ────────────────────────────────────────────────────────

  describe('getToolDefs()', () => {
    it('returns an array of tool definitions', () => {
      const defs = hub.getToolDefs();
      expect(Array.isArray(defs)).toBe(true);
      expect(defs.length).toBeGreaterThan(0);
    });

    it('each tool def has type function and function.name', () => {
      for (const def of hub.getToolDefs()) {
        expect(def.type).toBe('function');
        expect(def.function).toHaveProperty('name');
        expect(def.function).toHaveProperty('description');
        expect(def.function).toHaveProperty('parameters');
      }
    });

    it('tool names are prefixed with relay_', () => {
      for (const def of hub.getToolDefs()) {
        expect(def.function.name).toMatch(/^relay_/);
      }
    });

    it('filters by relayId when provided', () => {
      const browserDefs = hub.getToolDefs('browser');
      for (const def of browserDefs) {
        expect(def.function.description).toContain('browser');
      }
    });

    it('relay parameter is an enum of relay IDs', () => {
      const defs = hub.getToolDefs();
      for (const def of defs) {
        const relayParam = def.function.parameters.properties.relay;
        expect(relayParam).toHaveProperty('enum');
        expect(Array.isArray(relayParam.enum)).toBe(true);
      }
    });

    it('content is a required parameter', () => {
      const defs = hub.getToolDefs();
      for (const def of defs) {
        expect(def.function.parameters.required).toContain('content');
      }
    });
  });

  // ─── buildPromptFromToolCall() ────────────────────────────────────────────

  describe('buildPromptFromToolCall()', () => {
    it('builds a valid prompt from relay_summarize call', () => {
      const prompt = hub.buildPromptFromToolCall('relay_summarize', {
        relay: 'browser',
        content: 'some content'
      });
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain('RelayCommandJSON');
    });

    it('handles missing args gracefully', () => {
      expect(() => hub.buildPromptFromToolCall('relay_summarize', {})).not.toThrow();
    });

    it('strips relay_ prefix to get actionId', () => {
      const prompt = hub.buildPromptFromToolCall('relay_web_extract', {
        relay: 'browser',
        content: 'https://example.com'
      });
      expect(prompt).toContain('browser');
    });
  });
});
