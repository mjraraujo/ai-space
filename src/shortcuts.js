/**
 * Shortcuts - iOS Shortcuts integration for skill automation
 * 
 * Provides 5 skills with real shortcuts:// URLs.
 * Since we can't programmatically create Shortcuts, we provide:
 *   a) Step-by-step setup guides for each skill
 *   b) shortcuts:// URLs to run pre-configured shortcuts
 * 
 * The PWA listens for incoming data via URL params: ?skill=ID&data=BASE64
 */

import { SkillStudio } from './skill-studio.js';

const skillStudio = new SkillStudio();
const workflowStudio = skillStudio.getBuiltInDefinition();

const SKILLS = {
  'summarize-clipboard': {
    id: 'summarize-clipboard',
    name: 'Summarize Clipboard',
    description: 'Summarize whatever is on your clipboard',
    icon: '📋',
    sfIcon: 'doc.plaintext',
    prompt: 'Summarize the following text concisely, highlighting key points:',
    shortcutName: 'AI Space Summarize',
    steps: [
      'Open the Shortcuts app on your iPhone/iPad.',
      'Tap the "+" button to create a new shortcut.',
      'Name it "AI Space Summarize".',
      'Add action: "Get Clipboard".',
      'Add action: "URL" and set it to:\n{APP_URL}?skill=summarize-clipboard&data={clipboard_base64}',
      'Add action: "Get Contents of URL" — Method: GET.',
      'For easier use: Add action "Base64 Encode" after Get Clipboard, then use the encoded result in the URL.',
      'Alternatively, add action: "Open URLs" with the URL above.',
      'Tap "Done" to save. You can now run it from Shortcuts or add it to your Home Screen.'
    ]
  },
  'morning-briefing': {
    id: 'morning-briefing',
    name: 'Morning Briefing',
    description: 'Get a quick daily briefing based on your context',
    icon: '☀️',
    sfIcon: 'sun.max',
    prompt: 'Give me a concise morning briefing. Summarize any pending items and suggest priorities for today based on:',
    shortcutName: 'AI Space Briefing',
    steps: [
      'Open the Shortcuts app on your iPhone/iPad.',
      'Tap "+" to create a new shortcut.',
      'Name it "AI Space Briefing".',
      'Add action: "Date" — set to Current Date.',
      'Add action: "Format Date" — choose a readable format.',
      'Add action: "URL" and set it to:\n{APP_URL}?skill=morning-briefing&data={date_base64}',
      'Add action: "Open URLs".',
      'Tap "Done" to save.',
      'Tip: Set this as an automation that runs every morning at your preferred time.'
    ]
  },
  'reply-drafter': {
    id: 'reply-drafter',
    name: 'Reply Drafter',
    description: 'Draft a reply to a message on your clipboard',
    icon: '✉️',
    sfIcon: 'arrowshape.turn.up.left',
    prompt: 'Draft a polite, concise reply to the following message:',
    shortcutName: 'AI Space Reply',
    steps: [
      'Open the Shortcuts app on your iPhone/iPad.',
      'Tap "+" to create a new shortcut.',
      'Name it "AI Space Reply".',
      'Add action: "Get Clipboard".',
      'Add action: "Base64 Encode" (from Scripting).',
      'Add action: "URL" and set it to:\n{APP_URL}?skill=reply-drafter&data={encoded}',
      'Add action: "Open URLs".',
      'Tap "Done" to save.',
      'To use: Copy a message, then run this shortcut. AI Space will open with a draft reply.'
    ]
  },
  'quick-capture': {
    id: 'quick-capture',
    name: 'Quick Capture',
    description: 'Capture a thought or note quickly',
    icon: '📝',
    sfIcon: 'note.text',
    prompt: 'Store this note and acknowledge with a brief confirmation:',
    shortcutName: 'AI Space Capture',
    steps: [
      'Open the Shortcuts app on your iPhone/iPad.',
      'Tap "+" to create a new shortcut.',
      'Name it "AI Space Capture".',
      'Add action: "Ask for Input" — set prompt to "What do you want to capture?".',
      'Add action: "Base64 Encode" the input.',
      'Add action: "URL" and set it to:\n{APP_URL}?skill=quick-capture&data={encoded}',
      'Add action: "Open URLs".',
      'Tap "Done" to save.',
      'Add to Home Screen or use as a widget for quick access.'
    ]
  },
  'quick-note': {
    id: 'quick-note',
    name: 'Quick Note',
    description: 'Voice/text quick note saved locally',
    icon: '🗒️',
    sfIcon: 'note.text.badge.plus',
    prompt: 'Capture this note and organize it into: note text, tags, and one follow-up suggestion:',
    shortcutName: 'AI Space Quick Note',
    steps: [
      'Open the Shortcuts app on your iPhone/iPad.',
      'Tap "+" to create a new shortcut.',
      'Name it "AI Space Quick Note".',
      'Add action: "Dictate Text" or "Ask for Input".',
      'Add action: "Base64 Encode" the input.',
      'Add action: "URL" and set it to:\n{APP_URL}?skill=quick-note&data={encoded}',
      'Add action: "Open URLs".',
      'Tap "Done" to save.'
    ]
  },
  'calendar-sync': {
    id: 'calendar-sync',
    name: 'Calendar Sync',
    description: 'Review and summarize your upcoming calendar events',
    icon: '📅',
    sfIcon: 'calendar',
    prompt: 'Review these calendar events and give me a brief summary with any conflicts or suggestions:',
    shortcutName: 'AI Space Calendar',
    steps: [
      'Open the Shortcuts app on your iPhone/iPad.',
      'Tap "+" to create a new shortcut.',
      'Name it "AI Space Calendar".',
      'Add action: "Find Calendar Events" — set filter to events in the next 7 days.',
      'Add action: "Repeat with Each" over the events.',
      'Inside the loop: "Get Details of Calendar Events" — get Title, Start Date, End Date, Location.',
      'Add action: "Add to Variable" to collect event details as text.',
      'After the loop: "Base64 Encode" the combined text.',
      'Add action: "URL" and set it to:\n{APP_URL}?skill=calendar-sync&data={encoded}',
      'Add action: "Open URLs".',
      'Tap "Done" to save.'
    ]
  },
  'workflow-studio': {
    id: workflowStudio.id,
    name: workflowStudio.name,
    description: workflowStudio.description,
    icon: workflowStudio.icon,
    sfIcon: workflowStudio.sfIcon,
    prompt: workflowStudio.prompt,
    shortcutName: 'AI Space Workflow Studio',
    whenToUse: workflowStudio.whenToUse,
    argumentHint: workflowStudio.argumentHint,
    goal: 'Turn a complex routine into a reusable, approval-aware local skill.',
    suggestedActions: workflowStudio.suggestedActions,
    steps: [
      'Open the Shortcuts app on your iPhone/iPad.',
      'Tap "+" to create a new shortcut.',
      'Name it "AI Space Workflow Studio".',
      'Add action: "Ask for Input" and prompt for the workflow you want AI Space to turn into a skill.',
      'Add action: "Base64 Encode" the input.',
      'Add action: "URL" and set it to:\n{APP_URL}?skill=workflow-studio&data={encoded}',
      'Add action: "Open URLs".',
      'Tap "Done" to save. Running it will open AI Space with a ready-to-review workflow manifest prompt.'
    ]
  }
};

export class Shortcuts {
  constructor() {
    this.appURL = typeof window !== 'undefined'
      ? window.location.origin + window.location.pathname
      : 'https://ai-space.app';
    // Clean trailing slashes
    this.appURL = this.appURL.replace(/\/+$/, '');
  }

  _decodeBase64Flexible(raw) {
    if (!raw) return '';
    let value = String(raw).trim();
    // URL-safe base64 to standard base64
    value = value.replace(/-/g, '+').replace(/_/g, '/');
    while (value.length % 4 !== 0) {
      value += '=';
    }
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      // Fallback for legacy payloads that were encoded as latin-1 text.
      return binary;
    }
  }

  _safeJsonParse(text) {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  /**
   * Get all available skills
   * @returns {Array<{id: string, name: string, description: string, icon: string}>}
   */
  getSkills() {
    return Object.values(SKILLS).map(skill => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      icon: skill.icon
    }));
  }

  /**
   * Return the safe manifest metadata for a skill.
   * Inspired by bundled skill registries: expose when-to-use and argument hints
   * without leaking internal implementation details.
   * @param {string} skillId
   * @returns {object}
   */
  getSkillManifest(skillId) {
    const skill = SKILLS[skillId];
    if (!skill) {
      throw new Error(`Unknown skill: ${skillId}`);
    }

    return {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      whenToUse: skill.whenToUse || '',
      argumentHint: skill.argumentHint || '',
      goal: skill.goal || '',
      suggestedActions: Array.isArray(skill.suggestedActions) ? [...skill.suggestedActions] : [],
      steps: Array.isArray(skill.steps) ? [...skill.steps] : []
    };
  }

  /**
   * Generate a shortcuts:// URL to run a pre-configured shortcut
   * User must have already created the shortcut with the matching name.
   * @param {string} skillId
   * @returns {string} shortcuts:// URL
   */
  generateRunURL(skillId) {
    const skill = SKILLS[skillId];
    if (!skill) {
      throw new Error(`Unknown skill: ${skillId}`);
    }

    const shortcutName = encodeURIComponent(skill.shortcutName);
    return `shortcuts://x-callback-url/run-shortcut?name=${shortcutName}`;
  }

  /**
   * Generate step-by-step setup instructions for a skill
   * @param {string} skillId
   * @returns {object} {name, description, icon, steps: string[]}
   */
  generateGuide(skillId) {
    const skill = SKILLS[skillId];
    if (!skill) {
      throw new Error(`Unknown skill: ${skillId}`);
    }

    // Replace {APP_URL} placeholder in steps
    const steps = skill.steps.map(step =>
      step.replace(/\{APP_URL\}/g, this.appURL)
    );

    return {
      name: skill.name,
      description: skill.description,
      icon: skill.icon,
      shortcutName: skill.shortcutName,
      runURL: this.generateRunURL(skillId),
      steps
    };
  }

  /**
   * Parse incoming data from URL parameters (from Shortcuts callback)
   * Expected params: ?skill=SKILL_ID&data=BASE64_DATA
   * @param {URLSearchParams} urlParams
   * @returns {object|null} Parsed skill invocation data
   */
  parseIncoming(urlParams) {
    const skillId = urlParams.get('skill');
    if (!skillId) return null;

    const skill = SKILLS[skillId];
    if (!skill) return null;

    let input = '';
    let payload = null;
    const dataParam = urlParams.get('data');
    const payloadParam = urlParams.get('payload');
    const inputParam = urlParams.get('input');
    const timeParam = urlParams.get('time');
    const titleParam = urlParams.get('title');
    const urlParam = urlParams.get('url');
    const sourceParam = urlParams.get('source');

    if (payloadParam) {
      try {
        const decodedPayload = this._decodeBase64Flexible(payloadParam);
        payload = this._safeJsonParse(decodedPayload);
      } catch {
        payload = this._safeJsonParse(payloadParam);
      }
    }

    if (dataParam) {
      // Try to decode base64 data
      try {
        input = this._decodeBase64Flexible(dataParam);
      } catch {
        // If not valid base64, use as-is
        input = dataParam;
      }
    } else if (inputParam) {
      input = inputParam;
    } else if (timeParam) {
      input = timeParam;
    }

    if (!input && payload) {
      if (typeof payload === 'string') {
        input = payload;
      } else if (payload.text) {
        input = payload.text;
      } else if (payload.content) {
        input = payload.content;
      } else {
        input = JSON.stringify(payload);
      }
    }

    if (titleParam || urlParam || sourceParam) {
      payload = {
        ...(payload || {}),
        title: titleParam || payload?.title || '',
        url: urlParam || payload?.url || '',
        source: sourceParam || payload?.source || 'shortcut-url'
      };
    }

    return {
      skillId,
      skill: {
        id: skill.id,
        name: skill.name,
        prompt: skill.prompt,
        whenToUse: skill.whenToUse || '',
        argumentHint: skill.argumentHint || '',
        goal: skill.goal || '',
        suggestedActions: Array.isArray(skill.suggestedActions) ? [...skill.suggestedActions] : []
      },
      input,
      payload,
      timestamp: Date.now()
    };
  }

  /**
   * Build a full prompt from a skill invocation
   * @param {object} invocation - From parseIncoming()
   * @returns {string|null}
   */
  buildPrompt(invocation) {
    if (!invocation) return null;
    const payloadText = invocation.payload && typeof invocation.payload === 'object'
      ? JSON.stringify(invocation.payload, null, 2)
      : '';
    const metadata = [
      invocation.skill?.whenToUse ? `Use when: ${invocation.skill.whenToUse}` : '',
      invocation.skill?.argumentHint ? `Argument hint: ${invocation.skill.argumentHint}` : '',
      invocation.skill?.goal ? `Goal: ${invocation.skill.goal}` : ''
    ].filter(Boolean).join('\n');
    const body = [invocation.input, payloadText].filter(Boolean).join('\n\n');
    const header = [invocation.skill.prompt, metadata].filter(Boolean).join('\n\n');
    return `${header}\n\n${body}`.trim();
  }

  /**
   * Process a skill invocation into actionable app behavior.
   * @param {object} invocation
   * @param {object} deps - {memory, memoryReady}
   * @returns {Promise<{prompt: string|null, notification: string, suggestedActions: string[]}>}
   */
  async processInvocation(invocation, deps = {}) {
    if (!invocation) {
      return { prompt: null, notification: '', suggestedActions: [] };
    }

    const { memory, memoryReady } = deps;
    const suggestedActions = Array.isArray(invocation.skill?.suggestedActions)
      ? [...invocation.skill.suggestedActions]
      : [];
    const lowerSkill = (invocation.skillId || '').toLowerCase();

    if ((lowerSkill === 'quick-capture' || lowerSkill === 'quick-note') && memoryReady && memory) {
      const noteText = (invocation.input || '').trim();
      if (noteText) {
        await memory.saveSharedContent({
          id: 'note_' + Date.now(),
          type: 'quick-note',
          text: noteText,
          source: 'ios-shortcuts',
          createdAt: Date.now()
        });
      }
      suggestedActions.push('Expand this note');
      suggestedActions.push('Create TODO list');
      return {
        prompt: this.buildPrompt(invocation),
        notification: 'Quick note captured locally.',
        suggestedActions: Array.from(new Set(suggestedActions))
      };
    }

    if (lowerSkill === 'workflow-studio') {
      suggestedActions.push('Run in local mode');
      return {
        prompt: this.buildPrompt(invocation),
        notification: 'Workflow Studio is ready — review the draft and save it as a local skill.',
        suggestedActions: Array.from(new Set(suggestedActions))
      };
    }

    if (lowerSkill === 'reply-drafter') {
      suggestedActions.push('Make it more formal');
      suggestedActions.push('Make it shorter');
    } else if (lowerSkill === 'morning-briefing') {
      suggestedActions.push('Create today plan');
      suggestedActions.push('Top 3 priorities');
    } else if (lowerSkill === 'calendar-sync') {
      suggestedActions.push('Detect conflicts');
      suggestedActions.push('Draft agenda');
    }

    return {
      prompt: this.buildPrompt(invocation),
      notification: `Shortcut received: ${invocation.skill.name}`,
      suggestedActions: Array.from(new Set(suggestedActions))
    };
  }
}
