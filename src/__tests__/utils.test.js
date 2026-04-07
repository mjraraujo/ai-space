import { describe, it, expect } from 'vitest';
import {
  isWebLookupIntent,
  extractWebQuery,
  isFactualQuestion,
  detectTaskType,
  recommendLocalModelFallback,
  buildEnhancedQuery,
  sanitizeModelOutput,
  looksLikeLegacyRuntimeScript,
  parseModelSizeToBytes
} from '../utils.js';

// ─── isWebLookupIntent ────────────────────────────────────────────────────────

describe('isWebLookupIntent', () => {
  it('detects "search" keyword', () => {
    expect(isWebLookupIntent('search for climate change data')).toBe(true);
  });

  it('detects "find" keyword', () => {
    expect(isWebLookupIntent('find me a recipe for pasta')).toBe(true);
  });

  it('detects "lookup" keyword', () => {
    expect(isWebLookupIntent('lookup the capital of France')).toBe(true);
  });

  it('detects "look up" (two words)', () => {
    expect(isWebLookupIntent('can you look up the weather')).toBe(true);
  });

  it('detects "web" keyword', () => {
    expect(isWebLookupIntent('check the web for news')).toBe(true);
  });

  it('detects "internet" keyword', () => {
    expect(isWebLookupIntent('search the internet for Python docs')).toBe(true);
  });

  it('detects "wikipedia" keyword', () => {
    expect(isWebLookupIntent('what does wikipedia say about quantum physics')).toBe(true);
  });

  it('detects "google" keyword', () => {
    expect(isWebLookupIntent('google this for me')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isWebLookupIntent('SEARCH for something')).toBe(true);
    expect(isWebLookupIntent('Search For Something')).toBe(true);
  });

  it('returns false for plain conversation text', () => {
    expect(isWebLookupIntent('what is the meaning of life')).toBe(false);
    expect(isWebLookupIntent('help me write an email')).toBe(false);
    expect(isWebLookupIntent('')).toBe(false);
  });

  it('does not match partial words (word boundary)', () => {
    // "finder" should not match "find" at word boundary — depends on \b
    // "look" alone should not trigger "look up" match
    expect(isWebLookupIntent('I am a researcher')).toBe(false);
  });

  it('handles null and undefined safely', () => {
    expect(isWebLookupIntent(null)).toBe(false);
    expect(isWebLookupIntent(undefined)).toBe(false);
  });
});

// ─── extractWebQuery ──────────────────────────────────────────────────────────

describe('extractWebQuery', () => {
  it('extracts query after "search for"', () => {
    expect(extractWebQuery('search for climate change')).toBe('climate change');
  });

  it('extracts query after "find"', () => {
    expect(extractWebQuery('find me a recipe for pasta')).toBe('me a recipe for pasta');
  });

  it('extracts query after "lookup"', () => {
    expect(extractWebQuery('lookup the capital of France')).toBe('the capital of France');
  });

  it('extracts query after "look up"', () => {
    expect(extractWebQuery('look up Python tutorials')).toBe('Python tutorials');
  });

  it('extracts query after "search on the web about"', () => {
    expect(extractWebQuery('search on the web about black holes')).toBe('black holes');
  });

  it('extracts query after "about"', () => {
    expect(extractWebQuery('tell me about quantum computing')).toBe('quantum computing');
  });

  it('returns raw text when no pattern matches', () => {
    expect(extractWebQuery('what is the meaning of life')).toBe('what is the meaning of life');
  });

  it('returns empty string for empty input', () => {
    expect(extractWebQuery('')).toBe('');
    expect(extractWebQuery(null)).toBe('');
    expect(extractWebQuery(undefined)).toBe('');
  });

  it('trims whitespace from result', () => {
    expect(extractWebQuery('search for   spaced query  ')).toBe('spaced query');
  });
});

// ─── isFactualQuestion ───────────────────────────────────────────────────────

describe('isFactualQuestion', () => {
  it('detects capital/population/date style questions', () => {
    expect(isFactualQuestion('what is the capital of Roraima?')).toBe(true);
    expect(isFactualQuestion('population of Japan')).toBe(true);
    expect(isFactualQuestion('when was Brazil founded?')).toBe(true);
  });

  it('returns false for non-factual creative prompts', () => {
    expect(isFactualQuestion('write me a poem about the ocean')).toBe(false);
    expect(isFactualQuestion('help me brainstorm a brand name')).toBe(false);
  });
});

// ─── detectTaskType ──────────────────────────────────────────────────────────

describe('detectTaskType', () => {
  it('detects debug-oriented requests', () => {
    expect(detectTaskType('help me debug why the login flow is failing')).toBe('debug');
  });

  it('detects planning requests', () => {
    expect(detectTaskType('plan my launch checklist for next week')).toBe('plan');
  });

  it('detects verification/review requests', () => {
    expect(detectTaskType('review this answer and verify it before I send')).toBe('verify');
  });
});

// ─── recommendLocalModelFallback ────────────────────────────────────────────

describe('recommendLocalModelFallback', () => {
  it('falls back from Llama to Qwen on rate limits', () => {
    expect(recommendLocalModelFallback('Llama-3.2-1B-Instruct-q4f16_1-MLC', { isRateLimit: true })).toBe('Qwen2.5-0.5B-Instruct-q4f16_1-MLC');
  });

  it('falls back to SmolLM when storage is tight', () => {
    expect(recommendLocalModelFallback('Phi-3.5-mini-instruct-q4f16_1-MLC', { isStorage: true })).toBe('SmolLM2-360M-Instruct-q4f16_1-MLC');
  });

  it('returns null when already on the smallest model', () => {
    expect(recommendLocalModelFallback('SmolLM2-360M-Instruct-q4f16_1-MLC', { isRateLimit: true })).toBeNull();
  });
});

// ─── buildEnhancedQuery ──────────────────────────────────────────────────────

describe('buildEnhancedQuery', () => {
  it('returns short greetings unchanged', () => {
    expect(buildEnhancedQuery('hello')).toBe('hello');
  });

  it('adds a factual guard for fact-seeking questions', () => {
    const result = buildEnhancedQuery('What is the capital of Roraima and where is it located?');
    expect(result).toContain('Answer only with verified facts');
  });

  it('injects provided web context for longer queries', () => {
    const result = buildEnhancedQuery('Explain the history of Recife in a concise way for me.', 'Recife is the capital of Pernambuco.');
    expect(result).toContain('[Web context available: Recife is the capital of Pernambuco.]');
  });

  it('adds debug guidance for troubleshooting questions', () => {
    const result = buildEnhancedQuery('Please debug why the local model keeps failing after download.');
    expect(result).toContain('Mode: Debug');
    expect(result).toContain('root cause');
  });

  it('adds planning guidance for multi-step requests', () => {
    const result = buildEnhancedQuery('Plan a step-by-step launch checklist for AI Space next week.');
    expect(result).toContain('Mode: Plan');
    expect(result).toContain('numbered steps');
  });

  it('adds verification guidance for review-style requests', () => {
    const result = buildEnhancedQuery('Verify this answer before I share it with the team.');
    expect(result).toContain('Mode: Verify');
    expect(result).toContain('evidence');
  });
});

// ─── sanitizeModelOutput ─────────────────────────────────────────────────────

describe('sanitizeModelOutput', () => {
  it('removes hallucinated model identity claims', () => {
    expect(sanitizeModelOutput("I'm ChatGPT and I can help")).toContain('I am AI Space');
  });

  it('removes filler openers', () => {
    expect(sanitizeModelOutput('Certainly! The capital is Boa Vista.')).toBe('The capital is Boa Vista.');
  });

  it('deduplicates repeated sentences', () => {
    const result = sanitizeModelOutput('Boa Vista is the capital. Boa Vista is the capital. Boa Vista is the capital.');
    expect(result).toBe('Boa Vista is the capital.');
  });

  it('removes generic AI disclaimers', () => {
    expect(sanitizeModelOutput('As an AI language model, I can help with that.')).not.toContain('As an AI language model');
  });
});

// ─── looksLikeLegacyRuntimeScript ────────────────────────────────────────────

describe('looksLikeLegacyRuntimeScript', () => {
  it('detects "tools." prefix', () => {
    expect(looksLikeLegacyRuntimeScript('tools.log("hello")')).toBe(true);
  });

  it('detects "await" keyword', () => {
    expect(looksLikeLegacyRuntimeScript('const result = await fetch(url)')).toBe(true);
  });

  it('detects "const" declaration', () => {
    expect(looksLikeLegacyRuntimeScript('const x = 42;')).toBe(true);
  });

  it('detects semicolons', () => {
    expect(looksLikeLegacyRuntimeScript('LOG hello;')).toBe(true);
  });

  it('returns false for clean DSL scripts', () => {
    expect(looksLikeLegacyRuntimeScript('LOG Starting health check...')).toBe(false);
    expect(looksLikeLegacyRuntimeScript('RUN fetch https://example.com -> result')).toBe(false);
    expect(looksLikeLegacyRuntimeScript('WAIT 1000')).toBe(false);
    expect(looksLikeLegacyRuntimeScript('RETURNJSON {"done":true}')).toBe(false);
  });

  it('handles empty and null safely', () => {
    expect(looksLikeLegacyRuntimeScript('')).toBe(false);
    expect(looksLikeLegacyRuntimeScript(null)).toBe(false);
    expect(looksLikeLegacyRuntimeScript(undefined)).toBe(false);
  });

  it('detects multi-line legacy scripts', () => {
    const script = [
      'const url = "https://example.com"',
      'const res = await fetch(url)',
      'tools.log(res.status)'
    ].join('\n');
    expect(looksLikeLegacyRuntimeScript(script)).toBe(true);
  });
});

// ─── parseModelSizeToBytes ───────────────────────────────────────────────────

describe('parseModelSizeToBytes', () => {
  const MB = 1024 * 1024;
  const GB = 1024 * 1024 * 1024;

  it('parses integer MB', () => {
    expect(parseModelSizeToBytes('200 MB')).toBe(200 * MB);
  });

  it('parses integer GB', () => {
    expect(parseModelSizeToBytes('2 GB')).toBe(2 * GB);
  });

  it('parses decimal GB', () => {
    expect(parseModelSizeToBytes('2.2 GB')).toBeCloseTo(2.2 * GB);
  });

  it('parses decimal MB', () => {
    expect(parseModelSizeToBytes('350 MB')).toBe(350 * MB);
  });

  it('is case-insensitive for units', () => {
    expect(parseModelSizeToBytes('200 mb')).toBe(200 * MB);
    expect(parseModelSizeToBytes('2 gb')).toBe(2 * GB);
  });

  it('handles no space between number and unit', () => {
    // The regex requires whitespace: `\s*` — let's verify the actual regex
    // Pattern: /^([0-9]+(?:\.[0-9]+)?)\s*(MB|GB)$/i
    // \s* allows no space
    expect(parseModelSizeToBytes('200MB')).toBe(200 * MB);
    expect(parseModelSizeToBytes('2GB')).toBe(2 * GB);
  });

  it('returns 0 for invalid input', () => {
    expect(parseModelSizeToBytes('')).toBe(0);
    expect(parseModelSizeToBytes(null)).toBe(0);
    expect(parseModelSizeToBytes(undefined)).toBe(0);
    expect(parseModelSizeToBytes('not a size')).toBe(0);
    expect(parseModelSizeToBytes('200 KB')).toBe(0);
    expect(parseModelSizeToBytes('200')).toBe(0);
  });

  it('returns 0 for non-string input', () => {
    expect(parseModelSizeToBytes(200)).toBe(0);
    expect(parseModelSizeToBytes({})).toBe(0);
  });

  it('parses real model sizes used in the app', () => {
    // From MODELS in ai-engine.js
    expect(parseModelSizeToBytes('200 MB')).toBe(200 * MB);   // SmolLM2
    expect(parseModelSizeToBytes('350 MB')).toBe(350 * MB);   // Qwen
    expect(parseModelSizeToBytes('700 MB')).toBe(700 * MB);   // Llama
    expect(parseModelSizeToBytes('2.2 GB')).toBeCloseTo(2.2 * GB); // Phi
  });
});
