import { describe, it, expect } from 'vitest';
import {
  SkillStudio,
  buildSkillPrompt,
  draftSkillFromText,
  inferRelayId,
  slugifySkillName,
  stripSkillCommand,
  inferSkillName,
} from '../skill-studio.js';

describe('slugifySkillName', () => {
  it('slugifies skill names cleanly', () => {
    expect(slugifySkillName(' Weekly Review! ')).toBe('weekly-review');
  });

  it('handles special characters and consecutive hyphens', () => {
    expect(slugifySkillName('My  --  Skill!!!')).toBe('my-skill');
  });

  it('lowercases all characters', () => {
    expect(slugifySkillName('UPPER CASE')).toBe('upper-case');
  });

  it('handles empty string gracefully', () => {
    const result = slugifySkillName('');
    expect(typeof result).toBe('string');
  });

  it('trims leading/trailing hyphens', () => {
    const r = slugifySkillName('---hello---');
    expect(r).not.toMatch(/^-|-$/);
    expect(r).toContain('hello');
  });
});

describe('inferRelayId', () => {
  it('infers browser relay from web/page language', () => {
    expect(inferRelayId('summarize this web page and extract the key links')).toBe('browser');
  });

  it('infers shortcuts relay from calendar/reminder language', () => {
    expect(inferRelayId('review my calendar and create a reminder')).toBe('shortcuts');
  });

  it('returns a string for any input', () => {
    expect(typeof inferRelayId('some random text')).toBe('string');
  });

  it('returns a string for empty input', () => {
    expect(typeof inferRelayId('')).toBe('string');
  });

  it('infers a relay ID for file/storage language', () => {
    const r = inferRelayId('read a file and process the content');
    expect(typeof r).toBe('string');
    expect(r.length).toBeGreaterThan(0);
  });
});

describe('draftSkillFromText', () => {
  it('creates a structured draft from natural language', () => {
    const draft = draftSkillFromText('create a skill to plan my weekly review and next actions');

    expect(draft).toMatchObject({
      type: 'skill-manifest',
      approvalRequired: true
    });
    expect(draft.steps.length).toBeGreaterThanOrEqual(4);
    expect(draft.prompt).toContain('SkillManifestJSON');
    expect(draft.whenToUse).toContain('Use when');
  });

  it('always sets approvalRequired to true', () => {
    const draft = draftSkillFromText('run a background task automatically');
    expect(draft.approvalRequired).toBe(true);
  });

  it('includes a non-empty name', () => {
    const draft = draftSkillFromText('send a daily digest email');
    expect(typeof draft.name).toBe('string');
    expect(draft.name.length).toBeGreaterThan(0);
  });

  it('includes a relayId', () => {
    const draft = draftSkillFromText('summarize a webpage');
    expect(typeof draft.relayId).toBe('string');
    expect(draft.relayId.length).toBeGreaterThan(0);
  });

  it('accepts custom name option', () => {
    const draft = draftSkillFromText('plan my morning', { name: 'Morning Planner' });
    expect(draft.name).toContain('Morning Planner');
  });

  it('accepts custom relayId option', () => {
    const draft = draftSkillFromText('do something', { relayId: 'device' });
    expect(draft.relayId).toBe('device');
  });

  it('includes a prompt that mentions AI Space constraints', () => {
    const draft = draftSkillFromText('create a review workflow');
    expect(draft.prompt).toContain('local-first');
    expect(draft.prompt).toContain('approval-based');
  });

  it('has at least 4 steps', () => {
    const draft = draftSkillFromText('process my inbox every morning');
    expect(Array.isArray(draft.steps)).toBe(true);
    expect(draft.steps.length).toBeGreaterThanOrEqual(4);
  });
});

describe('buildSkillPrompt', () => {
  it('keeps the AI Space identity constraints', () => {
    const draft = draftSkillFromText('build a skill to review a shared article URL');
    const prompt = buildSkillPrompt(draft, 'Review this article and make a plan');

    expect(prompt).toContain('local-first');
    expect(prompt).toContain('approval-based');
    expect(prompt).toContain('SkillManifestJSON');
  });

  it('includes user input context when provided', () => {
    const draft = draftSkillFromText('process a URL');
    const prompt = buildSkillPrompt(draft, 'https://example.com');
    expect(prompt).toContain('example.com');
  });

  it('returns a non-empty string even without current input', () => {
    const draft = draftSkillFromText('summarize articles');
    const prompt = buildSkillPrompt(draft, '');
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('includes the skill name in the prompt', () => {
    const draft = draftSkillFromText('my unique workflow', { name: 'UniqueWorkflow' });
    const prompt = buildSkillPrompt(draft, '');
    expect(prompt).toContain('UniqueWorkflow');
  });
});

describe('SkillStudio', () => {
  it('exposes a built-in workflow studio definition', () => {
    const studio = new SkillStudio();
    const builtIn = studio.getBuiltInDefinition();

    expect(builtIn.id).toBe('workflow-studio');
    expect(builtIn.prompt).toContain('AI Space Workflow Studio');
    expect(builtIn.suggestedActions).toContain('Build relay artifact');
  });

  it('built-in definition includes all required fields', () => {
    const studio = new SkillStudio();
    const builtIn = studio.getBuiltInDefinition();

    expect(typeof builtIn.name).toBe('string');
    expect(typeof builtIn.description).toBe('string');
    expect(typeof builtIn.icon).toBe('string');
    expect(Array.isArray(builtIn.steps)).toBe(true);
    expect(builtIn.steps.length).toBeGreaterThanOrEqual(1);
    expect(typeof builtIn.whenToUse).toBe('string');
  });

  it('summarizes saved skills for display', () => {
    const studio = new SkillStudio();
    const summary = studio.summarizeSavedSkills([
      { name: 'Trip Planner', relayId: 'shortcuts', argumentHint: '[calendar context]' },
      { name: 'Web Digest', relayId: 'browser', argumentHint: '[url]' }
    ]);

    expect(summary).toContain('Trip Planner');
    expect(summary).toContain('Web Digest');
    expect(summary).toContain('Saved local skills');
  });

  it('shows placeholder when no skills are saved', () => {
    const studio = new SkillStudio();
    const summary = studio.summarizeSavedSkills([]);
    expect(summary).toContain('No saved');
  });

  it('summarizeSavedSkills handles null/invalid items gracefully', () => {
    const studio = new SkillStudio();
    expect(() => studio.summarizeSavedSkills([null, undefined])).not.toThrow();
  });

  it('limits displayed skills to 8 entries', () => {
    const studio = new SkillStudio();
    const skills = Array.from({ length: 15 }, (_, i) => ({
      name: `Skill ${i}`,
      relayId: 'device',
      argumentHint: `[arg${i}]`
    }));
    const summary = studio.summarizeSavedSkills(skills);
    const lines = summary.split('\n').filter(l => l.startsWith('-'));
    expect(lines.length).toBeLessThanOrEqual(8);
  });

  it('normalizeSavedSkill returns null for falsy input', () => {
    const studio = new SkillStudio();
    expect(studio.normalizeSavedSkill(null)).toBeNull();
    expect(studio.normalizeSavedSkill(undefined)).toBeNull();
  });

  it('normalizeSavedSkill normalizes a minimal skill object', () => {
    const studio = new SkillStudio();
    const result = studio.normalizeSavedSkill({ name: 'My Skill', goal: 'do something' });
    expect(result).not.toBeNull();
    expect(typeof result.id).toBe('string');
    expect(result.name).toBe('My Skill');
  });

  it('normalizeSavedSkill preserves explicit relayId', () => {
    const studio = new SkillStudio();
    const result = studio.normalizeSavedSkill({ name: 'Test', relayId: 'browser', goal: 'web stuff' });
    expect(result.relayId).toBe('browser');
  });

  it('draftFromText delegates to draftSkillFromText', () => {
    const studio = new SkillStudio();
    const draft = studio.draftFromText('plan my morning routine');
    expect(draft).toMatchObject({ type: 'skill-manifest', approvalRequired: true });
  });
});

