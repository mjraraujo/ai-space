/**
 * Skill Studio - local-first reusable workflow drafting inspired by advanced bundled skill systems.
 * Converts natural language into an approval-aware AI Space skill manifest + execution prompt.
 */

/** Maximum input length for skill drafting to prevent context overflow. */
const MAX_SKILL_INPUT_LENGTH = 4_000;

const RELAY_ACTION_HINTS = {
  shortcuts: ['Build relay artifact', 'Create reminder checklist', 'Save for Siri shortcut'],
  browser: ['Build browser relay', 'Extract page context', 'Prepare share summary'],
  device: ['Save as local skill', 'Create approval checklist', 'Prepare action plan']
};

function capitalize(word) {
  const value = String(word || '').trim();
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function slugifySkillName(value) {
  const cleaned = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return cleaned || 'workflow-skill';
}

export function inferRelayId(text) {
  const input = String(text || '');

  if (/(url|website|web|browser|page|article|tab|link|scrape|extract)/i.test(input)) {
    return 'browser';
  }

  if (/(shortcut|siri|clipboard|calendar|reminder|message|mail|email|reply|homekit)/i.test(input)) {
    return 'shortcuts';
  }

  return 'device';
}

export function stripSkillCommand(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';

  const stripped = raw
    .replace(/^(?:please\s+)?(?:create|build|draft|save|make|turn)\s+(?:me\s+)?(?:(?:a|an)\s+)?(?:local\s+|workflow\s+|reusable\s+)?skill(?:\s+(?:for|to|called|named))?\s*/i, '')
    .replace(/^workflow\s+studio[:\-\s]*/i, '')
    .trim();

  return stripped || raw;
}

export function inferSkillName(text) {
  const cleaned = stripSkillCommand(text)
    .replace(/[:.].*$/, '')
    .replace(/\b(?:my|me|the|a|an|please|something|that|this)\b/gi, ' ')
    .replace(/[^a-z0-9\s-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = cleaned.split(' ').filter(Boolean).slice(0, 4);
  if (!words.length) return 'Workflow Studio';

  return words.map((word) => capitalize(word.toLowerCase())).join(' ');
}

function inferArgumentHint(relayId) {
  if (relayId === 'browser') return '[url, page text, or shared article]';
  if (relayId === 'shortcuts') return '[clipboard text, calendar, or reminder context]';
  return '[task context, note, or device state]';
}

function buildStepPlan(relayId, goal) {
  const subject = String(goal || 'the workflow').trim();
  const relayInstruction = relayId === 'browser'
    ? 'prepare a browser-safe extraction or navigation step'
    : relayId === 'shortcuts'
      ? 'prepare a shortcut-friendly handoff for iOS automation'
      : 'prepare a device-safe local action plan';

  return [
    {
      title: 'Capture context safely',
      instruction: `Gather only the minimum local context needed for ${subject}.`,
      successCriteria: 'The request, constraints, and relevant local context are clearly captured.'
    },
    {
      title: 'Break the task into stages',
      instruction: 'Split the workflow into concrete stages the user can review and approve.',
      successCriteria: 'The task is organized into a small set of ordered steps with no hidden actions.'
    },
    {
      title: 'Prepare the execution handoff',
      instruction: `Translate the plan into a reusable runbook and ${relayInstruction}.`,
      successCriteria: 'The output includes a relay-safe command or checklist the user can reuse later.'
    },
    {
      title: 'Verify before acting',
      instruction: 'Add approval checkpoints and a quick verification pass before any external action.',
      successCriteria: 'The workflow clearly states what must be confirmed before acting and what proves success.'
    }
  ];
}

export function buildSkillPrompt(manifest, currentInput = '') {
  const safeManifest = manifest || {};
  const stepsText = (safeManifest.steps || [])
    .map((step, index) => [
      `${index + 1}. ${step.title}`,
      `   - Instruction: ${step.instruction}`,
      `   - Success criteria: ${step.successCriteria}`
    ].join('\n'))
    .join('\n');

  const skillManifestJson = JSON.stringify({
    id: safeManifest.id || 'workflow-skill',
    name: safeManifest.name || 'Workflow Studio',
    relay: safeManifest.relayId || 'device',
    whenToUse: safeManifest.whenToUse || 'Use when a repeatable workflow needs a local-first runbook.',
    argumentHint: safeManifest.argumentHint || '[context]',
    approvalRequired: true,
    steps: (safeManifest.steps || []).map((step) => ({
      title: step.title,
      successCriteria: step.successCriteria
    }))
  }, null, 2);

  const inputBlock = String(currentInput || '').trim()
    ? `\n## Current user input\n${String(currentInput || '').trim()}\n`
    : '';

  return [
    'You are AI Space Workflow Studio.',
    'Preserve the identity of AI Space: local-first, privacy-first, transparent, and approval-based.',
    'Do not claim actions were executed unless the user explicitly confirms it.',
    '',
    '## Workflow Draft',
    `Name: ${safeManifest.name || 'Workflow Studio'}`,
    `Description: ${safeManifest.description || 'Reusable local-first workflow'}`,
    `When to use: ${safeManifest.whenToUse || 'Use when the user wants a reusable workflow.'}`,
    `Preferred relay: ${safeManifest.relayId || 'device'}`,
    `Argument hint: ${safeManifest.argumentHint || '[context]'}`,
    '',
    '## Goal',
    safeManifest.goal || 'Turn the request into a reusable, approval-aware workflow.',
    '',
    '## Planned steps',
    stepsText,
    '',
    '## Output requirements',
    'Return the result using these sections exactly:',
    '1. Goal',
    '2. Inputs',
    '3. Workflow Steps',
    '4. Approval Checkpoints',
    '5. Success Criteria',
    '6. Relay Suggestion',
    '7. SkillManifestJSON',
    '',
    'The `SkillManifestJSON` block should follow this shape:',
    skillManifestJson,
    inputBlock,
    'Keep the plan concrete, compact, and device-safe. Prefer local actions; only suggest cloud escalation if clearly needed.'
  ].filter(Boolean).join('\n');
}

export function draftSkillFromText(text, options = {}) {
  const rawInput = String(text || '').trim().slice(0, MAX_SKILL_INPUT_LENGTH);
  const cleanedInput = stripSkillCommand(rawInput) || rawInput || 'Create a reusable local workflow';
  const relayId = options.relayId && options.relayId !== 'auto'
    ? options.relayId
    : inferRelayId(cleanedInput);
  const name = String(options.name || inferSkillName(cleanedInput)).trim() || 'Workflow Studio';
  const id = slugifySkillName(name);
  const goal = String(options.goal || cleanedInput).trim();
  const description = `Reusable local-first workflow for ${goal.slice(0, 100)}${goal.length > 100 ? '…' : ''}`;
  const whenToUse = `Use when you want AI Space to help with ${goal.toLowerCase()} while keeping approval checkpoints visible.`;
  const argumentHint = inferArgumentHint(relayId);
  const steps = buildStepPlan(relayId, goal);
  const suggestedActions = [...(RELAY_ACTION_HINTS[relayId] || RELAY_ACTION_HINTS.device)];

  const manifest = {
    id,
    type: 'skill-manifest',
    source: 'workflow-studio',
    name,
    description,
    goal,
    relayId,
    whenToUse,
    argumentHint,
    approvalRequired: true,
    suggestedActions,
    steps,
    createdAt: Date.now()
  };

  return {
    ...manifest,
    prompt: buildSkillPrompt(manifest, goal)
  };
}

export class SkillStudio {
  constructor() {
    this.builtInSkillId = 'workflow-studio';
  }

  getBuiltInDefinition() {
    const definition = draftSkillFromText('build a reusable workflow skill', {
      name: 'Workflow Studio',
      goal: 'turn a complex task into a reusable, approval-aware local skill',
      relayId: 'device'
    });

    return {
      id: this.builtInSkillId,
      name: 'Workflow Studio',
      description: 'Turn a complex routine into a reusable, approval-aware AI Space skill',
      icon: '🧠',
      sfIcon: 'square.stack.3d.up.badge.automatic',
      prompt: definition.prompt,
      whenToUse: 'Use when the user wants to convert a repeated task into a reusable plan or runbook.',
      argumentHint: '[task or routine]',
      suggestedActions: ['Save as local skill', 'Build relay artifact', 'Create approval checklist'],
      steps: definition.steps
    };
  }

  draftFromText(text, options = {}) {
    return draftSkillFromText(text, options);
  }

  normalizeSavedSkill(item) {
    if (!item) return null;

    const fallback = draftSkillFromText(item.goal || item.description || item.name || 'workflow', {
      name: item.name,
      relayId: item.relayId || inferRelayId(item.goal || item.description || '')
    });

    return {
      ...fallback,
      ...item,
      id: slugifySkillName(item.id || item.name || 'workflow-skill')
    };
  }

  summarizeSavedSkills(items = []) {
    const normalized = items
      .map((item) => this.normalizeSavedSkill(item))
      .filter(Boolean)
      .sort((a, b) => (b.createdAt || b._timestamp || 0) - (a.createdAt || a._timestamp || 0));

    if (!normalized.length) {
      return 'No saved local skills yet. Try “create a skill for my weekly review”.';
    }

    return [
      'Saved local skills:',
      ...normalized.slice(0, 8).map((item) => `- ${item.name} · relay: ${item.relayId} · ${item.argumentHint}`)
    ].join('\n');
  }
}
