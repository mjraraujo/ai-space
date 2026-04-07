import { describe, it, expect } from 'vitest';
import {
  SkillStudio,
  buildSkillPrompt,
  draftSkillFromText,
  inferRelayId,
  slugifySkillName
} from '../skill-studio.js';

describe('SkillStudio', () => {
  it('slugifies skill names cleanly', () => {
    expect(slugifySkillName(' Weekly Review! ')).toBe('weekly-review');
  });

  it('infers browser relay from web/page language', () => {
    expect(inferRelayId('summarize this web page and extract the key links')).toBe('browser');
  });

  it('infers shortcuts relay from calendar/reminder language', () => {
    expect(inferRelayId('review my calendar and create a reminder')).toBe('shortcuts');
  });

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

  it('buildSkillPrompt keeps the AI Space identity constraints', () => {
    const draft = draftSkillFromText('build a skill to review a shared article URL');
    const prompt = buildSkillPrompt(draft, 'Review this article and make a plan');

    expect(prompt).toContain('local-first');
    expect(prompt).toContain('approval-based');
    expect(prompt).toContain('SkillManifestJSON');
  });

  it('exposes a built-in workflow studio definition', () => {
    const studio = new SkillStudio();
    const builtIn = studio.getBuiltInDefinition();

    expect(builtIn.id).toBe('workflow-studio');
    expect(builtIn.prompt).toContain('AI Space Workflow Studio');
    expect(builtIn.suggestedActions).toContain('Build relay artifact');
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
});
