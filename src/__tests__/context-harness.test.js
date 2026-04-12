/**
 * Context Harness — Test Suite
 *
 * Tests the context assembly pipeline: frame creation, enrichment middleware,
 * turn lifecycle, token budgeting, and finalization.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ContextHarness,
  estimateTokens,
  createWebContextEnricher,
  createSkillRoutingEnricher,
  createPersonalizationEnricher,
  createTaskTypeEnricher
} from '../context-harness.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildHarness(...enrichers) {
  const h = new ContextHarness();
  for (const e of enrichers) h.use(e);
  return h;
}

function simpleEnricher(name, priority, fn) {
  return {
    name,
    priority,
    enrich: fn || (async (frame) => {
      frame.enrichments[name] = { ran: true };
    })
  };
}

// ─── estimateTokens ──────────────────────────────────────────────────────────

describe('estimateTokens', () => {
  it('returns 0 for empty/null/undefined input', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens(null)).toBe(0);
    expect(estimateTokens(undefined)).toBe(0);
  });

  it('returns 0 for non-string input', () => {
    expect(estimateTokens(123)).toBe(0);
    expect(estimateTokens({})).toBe(0);
  });

  it('estimates tokens at ~4 chars per token (ceiling)', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
    expect(estimateTokens('a'.repeat(100))).toBe(25);
    expect(estimateTokens('a'.repeat(101))).toBe(26);
  });
});

// ─── ContextHarness basics ───────────────────────────────────────────────────

describe('ContextHarness', () => {
  let harness;

  beforeEach(() => {
    harness = new ContextHarness();
  });

  describe('constructor', () => {
    it('starts with empty enrichers and history', () => {
      const snap = harness.getSnapshot();
      expect(snap.enricherCount).toBe(0);
      expect(snap.enrichers).toEqual([]);
      expect(snap.historyCount).toBe(0);
      expect(snap.activeTurnId).toBeNull();
    });
  });

  // ─── Middleware registration ─────────────────────────────────────────────

  describe('use / remove / listEnrichers', () => {
    it('registers an enricher', () => {
      harness.use(simpleEnricher('test-a', 10));
      expect(harness.listEnrichers()).toEqual([
        { name: 'test-a', priority: 10 }
      ]);
    });

    it('sorts enrichers by priority (lower first)', () => {
      harness.use(simpleEnricher('high', 200));
      harness.use(simpleEnricher('low', 5));
      harness.use(simpleEnricher('mid', 50));
      const names = harness.listEnrichers().map(e => e.name);
      expect(names).toEqual(['low', 'mid', 'high']);
    });

    it('replaces enricher with same name', () => {
      harness.use(simpleEnricher('dup', 10));
      harness.use(simpleEnricher('dup', 20));
      expect(harness.listEnrichers()).toEqual([
        { name: 'dup', priority: 20 }
      ]);
    });

    it('defaults priority to 100 when not specified', () => {
      harness.use({ name: 'no-prio', enrich: async () => {} });
      expect(harness.listEnrichers()).toEqual([
        { name: 'no-prio', priority: 100 }
      ]);
    });

    it('throws on invalid enricher (missing name)', () => {
      expect(() => harness.use({ enrich: async () => {} }))
        .toThrow('Invalid enricher');
    });

    it('throws on invalid enricher (missing enrich function)', () => {
      expect(() => harness.use({ name: 'bad' }))
        .toThrow('Invalid enricher');
    });

    it('throws on null enricher', () => {
      expect(() => harness.use(null)).toThrow('Invalid enricher');
    });

    it('enforces maximum enricher count', () => {
      for (let i = 0; i < 20; i++) {
        harness.use(simpleEnricher(`e${i}`, i));
      }
      expect(() => harness.use(simpleEnricher('overflow', 999)))
        .toThrow('Maximum enricher count');
    });

    it('removes an enricher by name', () => {
      harness.use(simpleEnricher('a', 1));
      harness.use(simpleEnricher('b', 2));
      const removed = harness.remove('a');
      expect(removed).toBe(true);
      expect(harness.listEnrichers().map(e => e.name)).toEqual(['b']);
    });

    it('returns false when removing non-existent enricher', () => {
      expect(harness.remove('ghost')).toBe(false);
    });
  });

  // ─── beginTurn ──────────────────────────────────────────────────────────

  describe('beginTurn', () => {
    it('creates a frame with correct defaults', () => {
      const frame = harness.beginTurn({ text: 'Hello' });
      expect(frame.id).toMatch(/^turn_/);
      expect(frame.status).toBe('pending');
      expect(frame.userText).toBe('Hello');
      expect(frame.image).toBeNull();
      expect(frame.conversationId).toBe('');
      expect(frame.messages).toEqual([]);
      expect(frame.mode).toBe('local');
      expect(frame.enrichments).toEqual({});
      expect(frame.enrichmentOrder).toEqual([]);
      expect(frame.error).toBeNull();
      expect(frame.finalMessages).toBeNull();
    });

    it('copies messages (shallow) to prevent external mutation', () => {
      const msgs = [{ role: 'user', content: 'hi' }];
      const frame = harness.beginTurn({ text: 'hi', messages: msgs });
      msgs.push({ role: 'assistant', content: 'hello' });
      expect(frame.messages).toHaveLength(1);
    });

    it('sets the active turn', () => {
      const frame = harness.beginTurn({ text: 'test' });
      expect(harness.getActiveTurn()).toBe(frame);
    });

    it('computes token budget from system prompt', () => {
      const systemPrompt = 'a'.repeat(400); // 100 tokens
      const frame = harness.beginTurn({
        text: 'hi',
        maxContextTokens: 4096,
        systemPrompt
      });
      expect(frame.systemTokens).toBe(100);
      // budget = 4096 - 100 - 512 = 3484
      expect(frame.tokenBudget).toBe(3484);
    });

    it('enforces minimum token floor', () => {
      const systemPrompt = 'a'.repeat(16000); // 4000 tokens, exceeds 4096
      const frame = harness.beginTurn({
        text: 'hi',
        maxContextTokens: 4096,
        systemPrompt
      });
      // budget would be negative, clamped to 100
      expect(frame.tokenBudget).toBe(100);
    });

    it('calculates history tokens', () => {
      const msgs = [
        { role: 'user', content: 'a'.repeat(40) },   // 10 tokens
        { role: 'assistant', content: 'b'.repeat(80) } // 20 tokens
      ];
      const frame = harness.beginTurn({ text: 'hi', messages: msgs });
      expect(frame.historyTokens).toBe(30);
    });

    it('accepts image parameter', () => {
      const frame = harness.beginTurn({ text: 'look', image: 'data:image/png;base64,...' });
      expect(frame.image).toBe('data:image/png;base64,...');
    });

    it('accepts mode and conversationId', () => {
      const frame = harness.beginTurn({
        text: 'hi',
        mode: 'cloud',
        conversationId: 'conv_123'
      });
      expect(frame.mode).toBe('cloud');
      expect(frame.conversationId).toBe('conv_123');
    });
  });

  // ─── enrich ─────────────────────────────────────────────────────────────

  describe('enrich', () => {
    it('runs enrichers in priority order', async () => {
      const order = [];
      harness.use({
        name: 'second', priority: 20,
        async enrich() { order.push('second'); }
      });
      harness.use({
        name: 'first', priority: 10,
        async enrich() { order.push('first'); }
      });

      const frame = harness.beginTurn({ text: 'test' });
      await harness.enrich(frame);

      expect(order).toEqual(['first', 'second']);
      expect(frame.enrichmentOrder).toEqual(['first', 'second']);
    });

    it('sets frame status to enriching then ready', async () => {
      harness.use(simpleEnricher('check', 10, async (frame) => {
        expect(frame.status).toBe('enriching');
      }));

      const frame = harness.beginTurn({ text: 'test' });
      await harness.enrich(frame);
      expect(frame.status).toBe('ready');
    });

    it('passes enricher context through', async () => {
      let receivedCtx;
      harness.use({
        name: 'ctx-check', priority: 10,
        async enrich(_frame, ctx) { receivedCtx = ctx; }
      });

      const frame = harness.beginTurn({ text: 'test' });
      const mockCtx = { memory: { fake: true }, audit: { log: true } };
      await harness.enrich(frame, mockCtx);

      expect(receivedCtx).toBe(mockCtx);
    });

    it('records enricher errors without stopping pipeline', async () => {
      harness.use({
        name: 'fail', priority: 10,
        async enrich() { throw new Error('boom'); }
      });
      harness.use(simpleEnricher('success', 20));

      const frame = harness.beginTurn({ text: 'test' });
      await harness.enrich(frame);

      expect(frame.metadata.fail_error).toBe('boom');
      expect(frame.enrichments.success).toEqual({ ran: true });
      expect(frame.status).toBe('ready');
    });

    it('short-circuits when skill claims the input', async () => {
      harness.use({
        name: 'skill', priority: 10,
        async enrich(frame) {
          frame.metadata.skillHandled = true;
          frame.enrichments['skill-routing'] = { handled: true, response: 'done' };
        }
      });
      harness.use({
        name: 'should-not-run', priority: 20,
        async enrich(frame) {
          frame.enrichments['should-not-run'] = { ran: true };
        }
      });

      const frame = harness.beginTurn({ text: 'test' });
      await harness.enrich(frame);

      expect(frame.enrichments['should-not-run']).toBeUndefined();
      expect(frame.enrichmentOrder).toEqual(['skill']);
    });

    it('returns frame unchanged when status is error', async () => {
      harness.use(simpleEnricher('nope', 10));
      const frame = harness.beginTurn({ text: 'test' });
      frame.status = 'error';
      await harness.enrich(frame);
      expect(frame.enrichments).toEqual({});
    });

    it('handles null frame gracefully', async () => {
      const result = await harness.enrich(null);
      expect(result).toBeNull();
    });
  });

  // ─── finalize ───────────────────────────────────────────────────────────

  describe('finalize', () => {
    it('returns skipped result for null frame', () => {
      const result = harness.finalize(null);
      expect(result.skipped).toBe(true);
      expect(result.messages).toEqual([]);
      expect(result.skillResponse).toBeNull();
    });

    it('returns skill response when skill handled', async () => {
      harness.use({
        name: 'skill-routing', priority: 10,
        async enrich(frame) {
          frame.metadata.skillHandled = true;
          frame.enrichments['skill-routing'] = {
            handled: true,
            response: 'Skill result here'
          };
        }
      });

      const frame = harness.beginTurn({ text: 'test' });
      await harness.enrich(frame);
      const result = harness.finalize(frame);

      expect(result.skipped).toBe(true);
      expect(result.skillResponse).toBe('Skill result here');
      expect(result.messages).toEqual([]);
    });

    it('builds inference messages with system prompt', () => {
      const msgs = [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi' }
      ];
      const frame = harness.beginTurn({ text: 'hello', messages: msgs });
      const result = harness.finalize(frame, { systemPrompt: 'You are helpful.' });

      expect(result.skipped).toBe(false);
      expect(result.messages[0]).toEqual({ role: 'system', content: 'You are helpful.' });
      expect(result.messages[1]).toEqual({ role: 'user', content: 'hello' });
      expect(result.messages[2]).toEqual({ role: 'assistant', content: 'hi' });
    });

    it('injects personalization into system prompt', async () => {
      harness.use(createPersonalizationEnricher({
        getPromptContext: () => '\n\nUser is Alice.'
      }));

      const frame = harness.beginTurn({ text: 'hi' });
      await harness.enrich(frame);
      const result = harness.finalize(frame, { systemPrompt: 'Base prompt.' });

      expect(result.messages[0].content).toBe('Base prompt.\n\nUser is Alice.');
    });

    it('injects web context as first system message', async () => {
      harness.use({
        name: 'web-context', priority: 10,
        async enrich(frame) {
          frame.enrichments['web-context'] = { snippet: 'Wiki says: Paris is the capital.' };
        }
      });

      const msgs = [{ role: 'user', content: 'What is the capital of France?' }];
      const frame = harness.beginTurn({ text: 'What is the capital of France?', messages: msgs });
      await harness.enrich(frame);
      const result = harness.finalize(frame, { systemPrompt: 'AI here.' });

      // System prompt first, then web context, then user
      expect(result.messages[0].content).toBe('AI here.');
      expect(result.messages[1].content).toContain('[WEB_CONTEXT]');
      expect(result.messages[1].content).toContain('Wiki says: Paris is the capital.');
      expect(result.messages[2].content).toBe('What is the capital of France?');
    });

    it('applies query enhancement to last user message', async () => {
      const msgs = [
        { role: 'user', content: 'old question' },
        { role: 'assistant', content: 'old answer' },
        { role: 'user', content: 'new question' }
      ];
      const frame = harness.beginTurn({ text: 'new question', messages: msgs });
      const result = harness.finalize(frame, {
        systemPrompt: 'AI',
        buildEnhancedQuery: (text, _web) => `[Enhanced] ${text}`
      });

      // Last user message should be enhanced
      const userMsgs = result.messages.filter(m => m.role === 'user');
      expect(userMsgs[0].content).toBe('old question'); // first user msg unchanged
      expect(userMsgs[1].content).toBe('[Enhanced] new question');
    });

    it('runs KV optimization when provided', () => {
      const msgs = [
        { role: 'user', content: 'a' },
        { role: 'assistant', content: 'b' },
        { role: 'user', content: 'c' }
      ];
      const frame = harness.beginTurn({ text: 'c', messages: msgs });
      const result = harness.finalize(frame, {
        systemPrompt: 'AI',
        kvOptimize: (messages, _budget) => ({
          messages: messages.slice(-2) // keep only last 2
        })
      });

      // system + 2 kept messages
      expect(result.messages).toHaveLength(3);
      expect(result.messages[1].content).toBe('b');
      expect(result.messages[2].content).toBe('c');
    });

    it('records frame to history', () => {
      const frame = harness.beginTurn({ text: 'hi' });
      harness.finalize(frame, { systemPrompt: 'AI' });
      expect(harness.getHistory()).toHaveLength(1);
      expect(harness.getHistory()[0].id).toBe(frame.id);
    });

    it('sets frame status to sent', () => {
      const frame = harness.beginTurn({ text: 'hi' });
      harness.finalize(frame, { systemPrompt: 'AI' });
      expect(frame.status).toBe('sent');
    });
  });

  // ─── completeTurn / errorTurn ────────────────────────────────────────────

  describe('completeTurn', () => {
    it('records response and timing', () => {
      const frame = harness.beginTurn({ text: 'hi' });
      harness.completeTurn(frame, 'Model says hello');

      expect(frame.metadata.response).toBe('Model says hello');
      expect(frame.metadata.completedAt).toBeGreaterThan(0);
      expect(frame.metadata.turnDurationMs).toBeGreaterThanOrEqual(0);
      expect(frame.status).toBe('sent');
    });

    it('clears active turn', () => {
      const frame = harness.beginTurn({ text: 'hi' });
      expect(harness.getActiveTurn()).toBe(frame);
      harness.completeTurn(frame, 'done');
      expect(harness.getActiveTurn()).toBeNull();
    });

    it('handles null frame gracefully', () => {
      expect(() => harness.completeTurn(null, 'x')).not.toThrow();
    });
  });

  describe('errorTurn', () => {
    it('records error and clears active turn', () => {
      const frame = harness.beginTurn({ text: 'hi' });
      harness.errorTurn(frame, 'Something broke');

      expect(frame.error).toBe('Something broke');
      expect(frame.status).toBe('error');
      expect(harness.getActiveTurn()).toBeNull();
    });

    it('handles null frame gracefully', () => {
      expect(() => harness.errorTurn(null, 'err')).not.toThrow();
    });
  });

  // ─── Observability ──────────────────────────────────────────────────────

  describe('getHistory', () => {
    it('returns most recent frames first', () => {
      const f1 = harness.beginTurn({ text: 'first' });
      harness.finalize(f1, { systemPrompt: 'AI' });
      const f2 = harness.beginTurn({ text: 'second' });
      harness.finalize(f2, { systemPrompt: 'AI' });

      const history = harness.getHistory();
      expect(history[0].userText).toBe('second');
      expect(history[1].userText).toBe('first');
    });

    it('respects limit parameter', () => {
      for (let i = 0; i < 5; i++) {
        const f = harness.beginTurn({ text: `msg ${i}` });
        harness.finalize(f, { systemPrompt: 'AI' });
      }
      expect(harness.getHistory(2)).toHaveLength(2);
    });

    it('caps at MAX_FRAME_HISTORY', () => {
      for (let i = 0; i < 55; i++) {
        const f = harness.beginTurn({ text: `msg ${i}` });
        harness.finalize(f, { systemPrompt: 'AI' });
      }
      expect(harness.getHistory().length).toBeLessThanOrEqual(50);
    });
  });

  describe('getSnapshot', () => {
    it('reflects current state', () => {
      harness.use(simpleEnricher('a', 10));
      harness.use(simpleEnricher('b', 20));

      const f1 = harness.beginTurn({ text: 'hi' });
      harness.finalize(f1, { systemPrompt: 'AI' });

      const f2 = harness.beginTurn({ text: 'there' });

      const snap = harness.getSnapshot();
      expect(snap.enricherCount).toBe(2);
      expect(snap.enrichers).toEqual(['a', 'b']);
      expect(snap.historyCount).toBe(1);
      expect(snap.activeTurnId).toBe(f2.id);
      expect(snap.lastTurnId).toBe(f1.id);
    });
  });

  describe('getTokenAnalysis', () => {
    it('returns analysis for a frame', () => {
      const frame = harness.beginTurn({
        text: 'hi',
        messages: [{ role: 'user', content: 'a'.repeat(200) }], // 50 tokens
        maxContextTokens: 4096,
        systemPrompt: 'a'.repeat(80) // 20 tokens
      });

      const analysis = harness.getTokenAnalysis(frame);
      expect(analysis.systemTokens).toBe(20);
      expect(analysis.historyTokens).toBe(50);
      expect(analysis.budgetTokens).toBe(4096 - 20 - 512); // 3564
      expect(analysis.remaining).toBe(3564 - 50); // 3514
      expect(analysis.utilizationPct).toBe(Math.round((50 / 3564) * 100));
    });

    it('returns zeros for null frame', () => {
      const analysis = harness.getTokenAnalysis(null);
      expect(analysis).toEqual({
        systemTokens: 0, historyTokens: 0, budgetTokens: 0,
        remaining: 0, utilizationPct: 0
      });
    });
  });

  describe('reset', () => {
    it('clears history and active turn', () => {
      harness.beginTurn({ text: 'hi' });
      const f = harness.beginTurn({ text: 'there' });
      harness.finalize(f, { systemPrompt: 'AI' });

      harness.reset();

      expect(harness.getHistory()).toHaveLength(0);
      expect(harness.getActiveTurn()).toBeNull();
    });
  });
});

// ─── Built-in Enrichers ──────────────────────────────────────────────────────

describe('Built-in Enrichers', () => {

  describe('createWebContextEnricher', () => {
    it('skips when not a web intent', async () => {
      const enricher = createWebContextEnricher({
        isWebLookupIntent: () => false,
        isFactualQuestion: () => false,
        localInternetAssist: false
      });

      const frame = { userText: 'hello', enrichments: {}, metadata: {} };
      await enricher.enrich(frame);
      expect(frame.enrichments['web-context']).toBeUndefined();
    });

    it('fetches wiki snippet for factual questions', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ query: { search: [{ pageid: 42 }] } })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ query: { pages: { 42: { extract: 'Paris is the capital of France.' } } } })
        });

      const enricher = createWebContextEnricher({
        isWebLookupIntent: () => false,
        isFactualQuestion: () => true,
        extractWebQuery: (t) => t,
        fetchFn: mockFetch
      });

      const frame = { userText: 'What is the capital of France?', enrichments: {}, metadata: {} };
      await enricher.enrich(frame);

      expect(frame.enrichments['web-context'].snippet).toBe('Paris is the capital of France.');
      expect(frame.metadata.hasWebContext).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('silently fails on network error', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const enricher = createWebContextEnricher({
        isWebLookupIntent: () => true,
        isFactualQuestion: () => false,
        extractWebQuery: (t) => t,
        fetchFn: mockFetch
      });

      const frame = { userText: 'search this', enrichments: {}, metadata: {} };
      await enricher.enrich(frame);
      expect(frame.enrichments['web-context']).toBeUndefined();
    });

    it('skips when fetch result is not ok', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: false });

      const enricher = createWebContextEnricher({
        isWebLookupIntent: () => true,
        isFactualQuestion: () => false,
        extractWebQuery: (t) => t,
        fetchFn: mockFetch
      });

      const frame = { userText: 'query', enrichments: {}, metadata: {} };
      await enricher.enrich(frame);
      expect(frame.enrichments['web-context']).toBeUndefined();
    });

    it('skips when no search results', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ query: { search: [] } })
      });

      const enricher = createWebContextEnricher({
        isWebLookupIntent: () => true,
        extractWebQuery: (t) => t,
        fetchFn: mockFetch
      });

      const frame = { userText: 'nothing', enrichments: {}, metadata: {} };
      await enricher.enrich(frame);
      expect(frame.enrichments['web-context']).toBeUndefined();
    });

    it('skips when extract is empty', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ query: { search: [{ pageid: 1 }] } })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ query: { pages: { 1: { extract: '' } } } })
        });

      const enricher = createWebContextEnricher({
        isWebLookupIntent: () => true,
        extractWebQuery: (t) => t,
        fetchFn: mockFetch
      });

      const frame = { userText: 'query', enrichments: {}, metadata: {} };
      await enricher.enrich(frame);
      expect(frame.enrichments['web-context']).toBeUndefined();
    });

    it('skips when extractWebQuery returns empty', async () => {
      const enricher = createWebContextEnricher({
        isWebLookupIntent: () => true,
        extractWebQuery: () => '',
        fetchFn: vi.fn()
      });

      const frame = { userText: 'search', enrichments: {}, metadata: {} };
      await enricher.enrich(frame);
      expect(frame.enrichments['web-context']).toBeUndefined();
    });

    it('has priority 10', () => {
      const enricher = createWebContextEnricher();
      expect(enricher.priority).toBe(10);
    });
  });

  describe('createSkillRoutingEnricher', () => {
    it('marks frame when skill handles input', async () => {
      const mockSkill = {
        getManifest: () => ({ id: 'test-skill' }),
        execute: vi.fn().mockResolvedValue({ handled: true, content: 'Done!' })
      };
      const mockRegistry = {
        route: vi.fn().mockResolvedValue(mockSkill)
      };

      const enricher = createSkillRoutingEnricher({ skillRegistry: mockRegistry });
      const frame = {
        userText: 'do skill',
        conversationId: 'c1',
        messages: [],
        enrichments: {},
        metadata: {}
      };

      await enricher.enrich(frame, {});

      expect(frame.metadata.skillHandled).toBe(true);
      expect(frame.metadata.skillId).toBe('test-skill');
      expect(frame.enrichments['skill-routing'].response).toBe('Done!');
    });

    it('does nothing when no skill matches', async () => {
      const mockRegistry = {
        route: vi.fn().mockResolvedValue(null)
      };

      const enricher = createSkillRoutingEnricher({ skillRegistry: mockRegistry });
      const frame = {
        userText: 'random text',
        conversationId: 'c1',
        messages: [],
        enrichments: {},
        metadata: {}
      };

      await enricher.enrich(frame, {});
      expect(frame.metadata.skillHandled).toBeUndefined();
    });

    it('does nothing when skill returns non-handled', async () => {
      const mockSkill = {
        getManifest: () => ({ id: 'half-skill' }),
        execute: vi.fn().mockResolvedValue({ handled: false })
      };
      const mockRegistry = {
        route: vi.fn().mockResolvedValue(mockSkill)
      };

      const enricher = createSkillRoutingEnricher({ skillRegistry: mockRegistry });
      const frame = {
        userText: 'try this',
        conversationId: 'c1',
        messages: [],
        enrichments: {},
        metadata: {}
      };

      await enricher.enrich(frame, {});
      expect(frame.metadata.skillHandled).toBeUndefined();
    });

    it('uses registry from enricher context if not in deps', async () => {
      const mockRegistry = {
        route: vi.fn().mockResolvedValue(null)
      };

      const enricher = createSkillRoutingEnricher({});
      const frame = {
        userText: 'hi',
        conversationId: 'c1',
        messages: [],
        enrichments: {},
        metadata: {}
      };

      await enricher.enrich(frame, { skillRegistry: mockRegistry });
      expect(mockRegistry.route).toHaveBeenCalled();
    });

    it('silently handles skill execution errors', async () => {
      const mockRegistry = {
        route: vi.fn().mockRejectedValue(new Error('skill broke'))
      };

      const enricher = createSkillRoutingEnricher({ skillRegistry: mockRegistry });
      const frame = {
        userText: 'broken',
        conversationId: 'c1',
        messages: [],
        enrichments: {},
        metadata: {}
      };

      await enricher.enrich(frame, {});
      expect(frame.metadata.skillHandled).toBeUndefined();
    });

    it('has priority 20', () => {
      const enricher = createSkillRoutingEnricher();
      expect(enricher.priority).toBe(20);
    });
  });

  describe('createPersonalizationEnricher', () => {
    it('adds prompt context to enrichments', async () => {
      const enricher = createPersonalizationEnricher({
        getPromptContext: () => '\n\nUser prefers casual tone.'
      });

      const frame = { userText: 'hi', enrichments: {}, metadata: {} };
      await enricher.enrich(frame);

      expect(frame.enrichments.personalization.promptContext).toBe('\n\nUser prefers casual tone.');
      expect(frame.metadata.personalized).toBe(true);
    });

    it('does nothing when prompt context is empty', async () => {
      const enricher = createPersonalizationEnricher({
        getPromptContext: () => ''
      });

      const frame = { userText: 'hi', enrichments: {}, metadata: {} };
      await enricher.enrich(frame);
      expect(frame.enrichments.personalization).toBeUndefined();
      expect(frame.metadata.personalized).toBeUndefined();
    });

    it('has priority 5', () => {
      const enricher = createPersonalizationEnricher();
      expect(enricher.priority).toBe(5);
    });
  });

  describe('createTaskTypeEnricher', () => {
    it('classifies task type', async () => {
      const enricher = createTaskTypeEnricher({
        detectTaskType: (text) => text.includes('code') ? 'code' : 'general'
      });

      const frame = { userText: 'write some code', enrichments: {}, metadata: {} };
      await enricher.enrich(frame);

      expect(frame.enrichments['task-type'].taskType).toBe('code');
      expect(frame.metadata.taskType).toBe('code');
    });

    it('defaults to general task type', async () => {
      const enricher = createTaskTypeEnricher();

      const frame = { userText: 'hello', enrichments: {}, metadata: {} };
      await enricher.enrich(frame);
      expect(frame.metadata.taskType).toBe('general');
    });

    it('has priority 3', () => {
      const enricher = createTaskTypeEnricher();
      expect(enricher.priority).toBe(3);
    });
  });
});

// ─── Integration: full pipeline ──────────────────────────────────────────────

describe('Full pipeline integration', () => {
  it('assembles a complete context through the full pipeline', async () => {
    const harness = buildHarness(
      createTaskTypeEnricher({ detectTaskType: () => 'factual' }),
      createPersonalizationEnricher({ getPromptContext: () => '\n\nTimezone: UTC.' }),
      createWebContextEnricher({
        isWebLookupIntent: () => false,
        isFactualQuestion: () => true,
        extractWebQuery: (t) => t,
        fetchFn: vi.fn()
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ query: { search: [{ pageid: 7 }] } })
          })
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ query: { pages: { 7: { extract: 'The answer is 42.' } } } })
          })
      })
    );

    const messages = [
      { role: 'user', content: 'What is the meaning of life?' }
    ];

    // 1. Begin turn
    const frame = harness.beginTurn({
      text: 'What is the meaning of life?',
      messages,
      conversationId: 'conv_test',
      mode: 'local',
      maxContextTokens: 4096,
      systemPrompt: 'You are an AI assistant.'
    });

    expect(frame.status).toBe('pending');

    // 2. Enrich
    await harness.enrich(frame);
    expect(frame.status).toBe('ready');
    expect(frame.metadata.taskType).toBe('factual');
    expect(frame.metadata.personalized).toBe(true);
    expect(frame.metadata.hasWebContext).toBe(true);

    // 3. Finalize
    const result = harness.finalize(frame, {
      systemPrompt: 'You are an AI assistant.',
      buildEnhancedQuery: (text) => `[ENHANCED] ${text}`
    });

    expect(result.skipped).toBe(false);
    expect(result.messages).toHaveLength(3); // system + web_context + user
    expect(result.messages[0].content).toContain('You are an AI assistant.');
    expect(result.messages[0].content).toContain('Timezone: UTC.');
    expect(result.messages[1].content).toContain('[WEB_CONTEXT]');
    expect(result.messages[1].content).toContain('The answer is 42.');
    expect(result.messages[2].content).toBe('[ENHANCED] What is the meaning of life?');

    // 4. Complete turn
    harness.completeTurn(frame, 'The meaning of life is 42.');
    expect(frame.metadata.response).toBe('The meaning of life is 42.');
    expect(harness.getActiveTurn()).toBeNull();

    // 5. Check history
    const history = harness.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].userText).toBe('What is the meaning of life?');
  });

  it('handles skill short-circuit through full pipeline', async () => {
    const mockSkill = {
      getManifest: () => ({ id: 'greeting-skill' }),
      execute: vi.fn().mockResolvedValue({ handled: true, content: 'Hello from skill!' })
    };

    const harness = buildHarness(
      createTaskTypeEnricher(),
      createSkillRoutingEnricher({
        skillRegistry: { route: vi.fn().mockResolvedValue(mockSkill) }
      }),
      createWebContextEnricher({
        isWebLookupIntent: () => true,
        extractWebQuery: (t) => t,
        fetchFn: vi.fn()
      })
    );

    const frame = harness.beginTurn({
      text: 'hello',
      messages: [{ role: 'user', content: 'hello' }]
    });

    await harness.enrich(frame);

    // Web context enricher should NOT have run (skill short-circuited)
    expect(frame.enrichments['web-context']).toBeUndefined();
    expect(frame.metadata.skillHandled).toBe(true);

    const result = harness.finalize(frame);
    expect(result.skipped).toBe(true);
    expect(result.skillResponse).toBe('Hello from skill!');
  });

  it('handles multi-turn conversation with growing history', async () => {
    const harness = new ContextHarness();

    // Turn 1
    const f1 = harness.beginTurn({
      text: 'Hi',
      messages: [{ role: 'user', content: 'Hi' }],
      maxContextTokens: 4096,
      systemPrompt: 'AI'
    });
    const r1 = harness.finalize(f1, { systemPrompt: 'AI' });
    expect(r1.messages).toHaveLength(2);
    harness.completeTurn(f1, 'Hello!');

    // Turn 2 — growing history
    const f2 = harness.beginTurn({
      text: 'How are you?',
      messages: [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello!' },
        { role: 'user', content: 'How are you?' }
      ],
      maxContextTokens: 4096,
      systemPrompt: 'AI'
    });
    const r2 = harness.finalize(f2, { systemPrompt: 'AI' });
    expect(r2.messages).toHaveLength(4); // system + 3 history
    harness.completeTurn(f2, 'I am well!');

    expect(harness.getHistory()).toHaveLength(2);
  });
});
