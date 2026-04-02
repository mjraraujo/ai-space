import { describe, it, expect, beforeEach } from 'vitest';
import { Shortcuts } from '../shortcuts.js';

// Polyfill atob/btoa for Node environment
import { Buffer } from 'buffer';
if (typeof globalThis.atob === 'undefined') {
  globalThis.atob = (b64) => Buffer.from(b64, 'base64').toString('latin1');
  globalThis.btoa = (str) => Buffer.from(str, 'latin1').toString('base64');
}

// Polyfill TextDecoder if needed
if (typeof globalThis.TextDecoder === 'undefined') {
  const { TextDecoder, TextEncoder } = await import('util');
  globalThis.TextDecoder = TextDecoder;
  globalThis.TextEncoder = TextEncoder;
}

/** Encode a UTF-8 string to standard base64 */
function b64(str) {
  return Buffer.from(str, 'utf-8').toString('base64');
}

/** Encode a UTF-8 string to URL-safe base64 (no padding) */
function b64url(str) {
  return Buffer.from(str, 'utf-8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

describe('Shortcuts', () => {
  let shortcuts;

  beforeEach(() => {
    shortcuts = new Shortcuts();
  });

  // ─── getSkills ─────────────────────────────────────────────────────────────

  describe('getSkills()', () => {
    it('returns 6 skills', () => {
      expect(shortcuts.getSkills()).toHaveLength(6);
    });

    it('includes all expected skill IDs', () => {
      const ids = shortcuts.getSkills().map(s => s.id);
      expect(ids).toContain('summarize-clipboard');
      expect(ids).toContain('morning-briefing');
      expect(ids).toContain('reply-drafter');
      expect(ids).toContain('quick-capture');
      expect(ids).toContain('quick-note');
      expect(ids).toContain('calendar-sync');
    });

    it('each skill has id, name, description, icon', () => {
      for (const skill of shortcuts.getSkills()) {
        expect(skill).toHaveProperty('id');
        expect(skill).toHaveProperty('name');
        expect(skill).toHaveProperty('description');
        expect(skill).toHaveProperty('icon');
      }
    });

    it('does NOT expose internal prompt or steps', () => {
      for (const skill of shortcuts.getSkills()) {
        expect(skill).not.toHaveProperty('prompt');
        expect(skill).not.toHaveProperty('steps');
      }
    });
  });

  // ─── generateRunURL ────────────────────────────────────────────────────────

  describe('generateRunURL()', () => {
    it('returns a shortcuts:// URL', () => {
      const url = shortcuts.generateRunURL('summarize-clipboard');
      expect(url).toMatch(/^shortcuts:\/\/x-callback-url\/run-shortcut\?name=/);
    });

    it('encodes the shortcut name in the URL', () => {
      const url = shortcuts.generateRunURL('summarize-clipboard');
      expect(url).toContain('AI%20Space%20Summarize');
    });

    it('throws for unknown skill ID', () => {
      expect(() => shortcuts.generateRunURL('nonexistent-skill')).toThrow('Unknown skill');
    });

    it('generates unique URLs for different skills', () => {
      const url1 = shortcuts.generateRunURL('summarize-clipboard');
      const url2 = shortcuts.generateRunURL('morning-briefing');
      expect(url1).not.toBe(url2);
    });
  });

  // ─── generateGuide ─────────────────────────────────────────────────────────

  describe('generateGuide()', () => {
    it('returns a guide object with all required fields', () => {
      const guide = shortcuts.generateGuide('summarize-clipboard');
      expect(guide).toHaveProperty('name');
      expect(guide).toHaveProperty('description');
      expect(guide).toHaveProperty('icon');
      expect(guide).toHaveProperty('shortcutName');
      expect(guide).toHaveProperty('runURL');
      expect(guide).toHaveProperty('steps');
      expect(Array.isArray(guide.steps)).toBe(true);
    });

    it('replaces {APP_URL} placeholder in steps', () => {
      const guide = shortcuts.generateGuide('summarize-clipboard');
      const stepsText = guide.steps.join('\n');
      expect(stepsText).not.toContain('{APP_URL}');
    });

    it('throws for unknown skill ID', () => {
      expect(() => shortcuts.generateGuide('not-a-real-skill')).toThrow('Unknown skill');
    });

    it('guide steps are non-empty strings', () => {
      const guide = shortcuts.generateGuide('morning-briefing');
      expect(guide.steps.length).toBeGreaterThan(0);
      for (const step of guide.steps) {
        expect(typeof step).toBe('string');
        expect(step.length).toBeGreaterThan(0);
      }
    });

    it('runURL is a shortcuts:// URL', () => {
      const guide = shortcuts.generateGuide('reply-drafter');
      expect(guide.runURL).toMatch(/^shortcuts:\/\//);
    });
  });

  // ─── _decodeBase64Flexible ─────────────────────────────────────────────────

  describe('_decodeBase64Flexible()', () => {
    it('decodes standard base64', () => {
      const encoded = b64('Hello, World!');
      expect(shortcuts._decodeBase64Flexible(encoded)).toBe('Hello, World!');
    });

    it('decodes URL-safe base64 (no padding)', () => {
      const encoded = b64url('Hello, World!');
      // URL-safe: + -> -, / -> _, no padding
      expect(shortcuts._decodeBase64Flexible(encoded)).toBe('Hello, World!');
    });

    it('decodes UTF-8 text correctly', () => {
      const text = 'café résumé naïve';
      const encoded = b64(text);
      expect(shortcuts._decodeBase64Flexible(encoded)).toBe(text);
    });

    it('returns empty string for null/undefined/empty', () => {
      expect(shortcuts._decodeBase64Flexible(null)).toBe('');
      expect(shortcuts._decodeBase64Flexible(undefined)).toBe('');
      expect(shortcuts._decodeBase64Flexible('')).toBe('');
    });

    it('handles base64 with missing padding', () => {
      // Remove padding characters
      const encoded = b64('test').replace(/=/g, '');
      expect(shortcuts._decodeBase64Flexible(encoded)).toBe('test');
    });
  });

  // ─── parseIncoming ─────────────────────────────────────────────────────────

  describe('parseIncoming()', () => {
    it('returns null when no skill param', () => {
      const params = new URLSearchParams('');
      expect(shortcuts.parseIncoming(params)).toBeNull();
    });

    it('returns null for unknown skill ID', () => {
      const params = new URLSearchParams('skill=not-a-real-skill&data=SGVsbG8=');
      expect(shortcuts.parseIncoming(params)).toBeNull();
    });

    it('parses skill + base64 data correctly', () => {
      const text = 'Please summarize this text.';
      const params = new URLSearchParams(`skill=summarize-clipboard&data=${b64(text)}`);
      const result = shortcuts.parseIncoming(params);

      expect(result).not.toBeNull();
      expect(result.skillId).toBe('summarize-clipboard');
      expect(result.input).toBe(text);
      expect(result.skill.id).toBe('summarize-clipboard');
      expect(result.skill.prompt).toContain('Summarize');
    });

    it('parses URL-safe base64 data', () => {
      const text = 'Hello from URL-safe base64!';
      const params = new URLSearchParams(`skill=summarize-clipboard&data=${b64url(text)}`);
      const result = shortcuts.parseIncoming(params);
      expect(result.input).toBe(text);
    });

    it('uses inputParam when no data param', () => {
      const params = new URLSearchParams('skill=morning-briefing&input=2026-04-02');
      const result = shortcuts.parseIncoming(params);
      expect(result.input).toBe('2026-04-02');
    });

    it('uses timeParam as fallback input', () => {
      const params = new URLSearchParams('skill=morning-briefing&time=08:00');
      const result = shortcuts.parseIncoming(params);
      expect(result.input).toBe('08:00');
    });

    it('includes title, url, source from URL params', () => {
      const params = new URLSearchParams(
        `skill=summarize-clipboard&data=${b64('content')}&title=My%20Title&url=https%3A%2F%2Fexample.com&source=ios`
      );
      const result = shortcuts.parseIncoming(params);
      expect(result.payload.title).toBe('My Title');
      expect(result.payload.url).toBe('https://example.com');
      expect(result.payload.source).toBe('ios');
    });

    it('returns a timestamp', () => {
      const params = new URLSearchParams(`skill=summarize-clipboard&data=${b64('test')}`);
      const result = shortcuts.parseIncoming(params);
      expect(typeof result.timestamp).toBe('number');
      expect(result.timestamp).toBeGreaterThan(0);
    });

    it('handles non-base64 data gracefully (uses as-is)', () => {
      const params = new URLSearchParams('skill=quick-capture&data=plain+text');
      const result = shortcuts.parseIncoming(params);
      // Falls back to using data param as-is when base64 decode fails
      expect(result).not.toBeNull();
    });

    it('parses JSON payload param', () => {
      const payload = JSON.stringify({ text: 'from payload' });
      const params = new URLSearchParams(`skill=summarize-clipboard&payload=${b64(payload)}`);
      const result = shortcuts.parseIncoming(params);
      expect(result.input).toBe('from payload');
    });
  });

  // ─── buildPrompt ──────────────────────────────────────────────────────────

  describe('buildPrompt()', () => {
    it('returns null for null invocation', () => {
      expect(shortcuts.buildPrompt(null)).toBeNull();
    });

    it('combines skill prompt with input', () => {
      const invocation = {
        skill: { prompt: 'Summarize the following:' },
        input: 'Some text to summarize.',
        payload: null
      };
      const prompt = shortcuts.buildPrompt(invocation);
      expect(prompt).toContain('Summarize the following:');
      expect(prompt).toContain('Some text to summarize.');
    });

    it('includes JSON payload when present', () => {
      const invocation = {
        skill: { prompt: 'Process this:' },
        input: 'main text',
        payload: { title: 'Test', url: 'https://example.com' }
      };
      const prompt = shortcuts.buildPrompt(invocation);
      expect(prompt).toContain('"title": "Test"');
      expect(prompt).toContain('"url": "https://example.com"');
    });

    it('works without payload', () => {
      const invocation = {
        skill: { prompt: 'Reply to:' },
        input: 'Hello, how are you?',
        payload: null
      };
      const prompt = shortcuts.buildPrompt(invocation);
      expect(prompt).toContain('Reply to:');
      expect(prompt).toContain('Hello, how are you?');
      expect(prompt).not.toContain('null');
    });
  });

  // ─── processInvocation ────────────────────────────────────────────────────

  describe('processInvocation()', () => {
    it('returns empty result for null invocation', async () => {
      const result = await shortcuts.processInvocation(null);
      expect(result.prompt).toBeNull();
      expect(result.suggestedActions).toEqual([]);
    });

    it('includes suggested actions for reply-drafter', async () => {
      const params = new URLSearchParams(`skill=reply-drafter&data=${b64('Hello!')}`);
      const invocation = shortcuts.parseIncoming(params);
      const result = await shortcuts.processInvocation(invocation, {});
      expect(result.suggestedActions).toContain('Make it more formal');
      expect(result.suggestedActions).toContain('Make it shorter');
    });

    it('includes suggested actions for morning-briefing', async () => {
      const params = new URLSearchParams(`skill=morning-briefing&data=${b64('today')}`);
      const invocation = shortcuts.parseIncoming(params);
      const result = await shortcuts.processInvocation(invocation, {});
      expect(result.suggestedActions).toContain('Create today plan');
      expect(result.suggestedActions).toContain('Top 3 priorities');
    });

    it('includes suggested actions for calendar-sync', async () => {
      const params = new URLSearchParams(`skill=calendar-sync&data=${b64('events')}`);
      const invocation = shortcuts.parseIncoming(params);
      const result = await shortcuts.processInvocation(invocation, {});
      expect(result.suggestedActions).toContain('Detect conflicts');
      expect(result.suggestedActions).toContain('Draft agenda');
    });

    it('builds a prompt for summarize-clipboard', async () => {
      const params = new URLSearchParams(`skill=summarize-clipboard&data=${b64('article text here')}`);
      const invocation = shortcuts.parseIncoming(params);
      const result = await shortcuts.processInvocation(invocation, {});
      expect(result.prompt).toContain('article text here');
    });
  });
});
