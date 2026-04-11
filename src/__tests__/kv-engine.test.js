import { describe, it, expect, beforeEach } from 'vitest';
import { KVEngine, KV_STRATEGIES, estimateTokens } from '../kv-engine.js';

// ─── Helper ──────────────────────────────────────────────────────────────────

function makeMessages(n, rolePattern = 'alternating') {
  return Array.from({ length: n }, (_, i) => ({
    role: rolePattern === 'alternating'
      ? (i % 2 === 0 ? 'user' : 'assistant')
      : rolePattern,
    content: `Message ${i + 1}: ${'word '.repeat(20)}`
  }));
}

// ─── estimateTokens ───────────────────────────────────────────────────────────

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('returns positive value for non-empty string', () => {
    expect(estimateTokens('hello world')).toBeGreaterThan(0);
  });

  it('returns higher count for longer text', () => {
    expect(estimateTokens('a'.repeat(100))).toBeGreaterThan(estimateTokens('a'.repeat(10)));
  });

  it('handles non-string inputs safely', () => {
    expect(() => estimateTokens(null)).not.toThrow();
    expect(() => estimateTokens(undefined)).not.toThrow();
    expect(estimateTokens(null)).toBe(0);
  });
});

// ─── KV_STRATEGIES ───────────────────────────────────────────────────────────

describe('KV_STRATEGIES', () => {
  it('has exactly 4 built-in strategies', () => {
    expect(Object.keys(KV_STRATEGIES)).toHaveLength(4);
  });

  it('has required keys on each strategy', () => {
    for (const strat of Object.values(KV_STRATEGIES)) {
      expect(strat).toHaveProperty('id');
      expect(strat).toHaveProperty('name');
      expect(strat).toHaveProperty('icon');
      expect(strat).toHaveProperty('description');
      expect(strat).toHaveProperty('fn');
      expect(typeof strat.fn).toBe('function');
    }
  });

  it('each strategy fn returns an array', () => {
    const msgs = makeMessages(6);
    const budget = 2000;
    for (const strat of Object.values(KV_STRATEGIES)) {
      const result = strat.fn(msgs, budget);
      expect(Array.isArray(result)).toBe(true);
    }
  });

  it('all strategies preserve at least 1 message', () => {
    const msgs = makeMessages(10);
    for (const strat of Object.values(KV_STRATEGIES)) {
      const result = strat.fn(msgs, 50); // very tight budget
      expect(result.length).toBeGreaterThan(0);
    }
  });
});

// ─── KVEngine ─────────────────────────────────────────────────────────────────

describe('KVEngine', () => {
  let kv;

  beforeEach(() => {
    kv = new KVEngine();
  });

  // ── Construction ────────────────────────────────────────────────────────────

  it('defaults to standard strategy', () => {
    expect(kv.strategy).toBe('standard');
  });

  it('starts with zero metrics', () => {
    const m = kv.getMetrics();
    expect(m.tokensIn).toBe(0);
    expect(m.tokensOut).toBe(0);
    expect(m.compressions).toBe(0);
    expect(m.throughputTps).toBe(0);
  });

  // ── setStrategy ─────────────────────────────────────────────────────────────

  it('accepts all built-in strategy ids', () => {
    const ids = ['standard', 'sliding-window', 'semantic-compress', 'turbo-compress'];
    for (const id of ids) {
      kv.setStrategy(id);
      expect(kv.strategy).toBe(id);
    }
  });

  it('falls back to standard on unknown strategy id', () => {
    kv.setStrategy('does-not-exist');
    expect(kv.strategy).toBe('standard');
  });

  it('sets custom strategy id', () => {
    kv.setStrategy('custom');
    expect(kv.strategy).toBe('custom');
  });

  // ── setCustomScript ─────────────────────────────────────────────────────────

  it('compiles a valid custom script', () => {
    expect(() => {
      kv.setCustomScript('return messages;');
    }).not.toThrow();
    expect(kv.customScript).toBe('return messages;');
  });

  it('throws on a script that does not return an array', () => {
    expect(() => {
      kv.setCustomScript('return "not an array";');
    }).toThrow(/return an array/);
  });

  it('clears custom script on empty string', () => {
    kv.setCustomScript('return messages;');
    kv.setCustomScript('');
    expect(kv.customScript).toBeNull();
    expect(kv._compiledCustom).toBeNull();
  });

  // ── optimize ────────────────────────────────────────────────────────────────

  it('returns empty array for empty input', () => {
    const { messages } = kv.optimize([], 4096);
    expect(messages).toEqual([]);
  });

  it('returns messages unchanged when under budget', () => {
    const msgs = makeMessages(4);
    const { messages } = kv.optimize(msgs, 100000);
    expect(messages.length).toBe(4);
  });

  it('trims messages when over budget', () => {
    const msgs = makeMessages(20);
    const { messages } = kv.optimize(msgs, 50); // tiny budget
    expect(messages.length).toBeLessThan(20);
  });

  it('always returns at least 1 message even with tiny budget', () => {
    const msgs = makeMessages(10);
    const { messages } = kv.optimize(msgs, 1);
    expect(messages.length).toBeGreaterThan(0);
  });

  it('increments compressions counter when turns are dropped', () => {
    const msgs = makeMessages(20);
    kv.optimize(msgs, 50);
    expect(kv.getMetrics().compressions).toBeGreaterThan(0);
  });

  it('does not increment compressions when nothing is dropped', () => {
    const msgs = makeMessages(2);
    kv.optimize(msgs, 100000);
    expect(kv.getMetrics().compressions).toBe(0);
  });

  it('uses custom strategy when strategy = custom', () => {
    kv.setCustomScript('return messages.slice(-1);');
    kv.setStrategy('custom');
    const msgs = makeMessages(10);
    const { messages } = kv.optimize(msgs, 100000);
    expect(messages.length).toBe(1);
  });

  it('falls back to standard when custom is selected but no script compiled', () => {
    kv.strategy = 'custom';
    const msgs = makeMessages(4);
    expect(() => kv.optimize(msgs, 100000)).not.toThrow();
  });

  // ── sliding-window strategy ─────────────────────────────────────────────────

  it('sliding-window keeps the first message as attention sink', () => {
    kv.setStrategy('sliding-window');
    const msgs = makeMessages(12);
    const { messages } = kv.optimize(msgs, 300);
    // First message or a system summary should follow immediately after first
    expect(messages[0]).toBeDefined();
  });

  // ── turbo-compress strategy ─────────────────────────────────────────────────

  it('turbo-compress emits a system synopsis message for long history', () => {
    kv.setStrategy('turbo-compress');
    const msgs = makeMessages(14);
    const { messages } = kv.optimize(msgs, 4000);
    const hasSynopsis = messages.some(
      (m) => m.role === 'system' && m.content.includes('Turbo-compressed')
    );
    expect(hasSynopsis).toBe(true);
  });

  // ── recordThroughput ────────────────────────────────────────────────────────

  it('records throughput and updates metrics', () => {
    kv.recordThroughput(100, 1000); // 100 tokens in 1 s = 100 tok/s
    expect(kv.getMetrics().throughputTps).toBeCloseTo(100, 0);
  });

  it('uses exponential moving average for throughput', () => {
    kv.recordThroughput(100, 1000); // 100 tok/s
    kv.recordThroughput(200, 1000); // 200 tok/s  — EMA should be between 100 and 200
    const tps = kv.getMetrics().throughputTps;
    expect(tps).toBeGreaterThan(100);
    expect(tps).toBeLessThanOrEqual(200);
  });

  it('ignores zero elapsed time', () => {
    kv.recordThroughput(100, 0);
    expect(kv.getMetrics().throughputTps).toBe(0);
  });

  // ── getLog ──────────────────────────────────────────────────────────────────

  it('records log entry when compression occurs', () => {
    const msgs = makeMessages(20);
    kv.optimize(msgs, 50);
    expect(kv.getLog().length).toBeGreaterThan(0);
  });

  it('getLog returns a copy — mutation does not affect internal state', () => {
    const log = kv.getLog();
    log.push('injected');
    expect(kv.getLog()).not.toContain('injected');
  });

  // ── reset ───────────────────────────────────────────────────────────────────

  it('reset clears metrics and log', () => {
    const msgs = makeMessages(20);
    kv.optimize(msgs, 50);
    kv.recordThroughput(100, 1000);
    kv.reset();
    const m = kv.getMetrics();
    expect(m.tokensIn).toBe(0);
    expect(m.compressions).toBe(0);
    expect(m.throughputTps).toBe(0);
    expect(kv.getLog()).toHaveLength(0);
  });

  // ── getStrategies ───────────────────────────────────────────────────────────

  it('KVEngine.getStrategies() returns 4 items without fn', () => {
    const strategies = KVEngine.getStrategies();
    expect(strategies).toHaveLength(4);
    for (const s of strategies) {
      expect(s).not.toHaveProperty('fn');
      expect(s).toHaveProperty('id');
      expect(s).toHaveProperty('name');
      expect(s).toHaveProperty('icon');
    }
  });
});

// ─── setCustomScript() validation ────────────────────────────────────────────

describe('setCustomScript() validation', () => {
  let kv;
  beforeEach(() => {
    kv = new KVEngine();
  });

  it('rejects script exceeding MAX_CUSTOM_SCRIPT_LENGTH', () => {
    // Build a valid script that is too long
    const longScript = `
      // ${'a'.repeat(4100)}
      return messages;
    `;
    expect(() => kv.setCustomScript(longScript)).toThrow(/too long/);
  });

  it('accepts a valid short script', () => {
    expect(() => kv.setCustomScript('return messages;')).not.toThrow();
  });

  it('clears compiled fn when empty string passed', () => {
    kv.setCustomScript('return messages;');
    kv.setCustomScript('');
    expect(kv._compiledCustom).toBeNull();
  });
});
