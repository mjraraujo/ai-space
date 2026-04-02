import { describe, it, expect } from 'vitest';
import {
  isWebLookupIntent,
  extractWebQuery,
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
