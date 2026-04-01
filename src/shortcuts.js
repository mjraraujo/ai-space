/**
 * Shortcuts - iOS Shortcuts integration for skill automation
 */

const SKILLS = {
  'summarize-clipboard': {
    id: 'summarize-clipboard',
    name: 'Summarize Clipboard',
    description: 'Summarize whatever is on your clipboard',
    icon: 'doc.plaintext',
    prompt: 'Summarize the following text concisely, highlighting key points:',
    shortcutActions: [
      { type: 'getClipboard' },
      { type: 'openURL', template: '{{APP_URL}}?skill=summarize-clipboard&input={{CLIPBOARD}}' }
    ]
  },
  'morning-briefing': {
    id: 'morning-briefing',
    name: 'Morning Briefing',
    description: 'Get a quick daily briefing based on your notes',
    icon: 'sun.max',
    prompt: 'Give me a concise morning briefing. Summarize any pending items and suggest priorities for today based on:',
    shortcutActions: [
      { type: 'openURL', template: '{{APP_URL}}?skill=morning-briefing&time={{CURRENT_DATE}}' }
    ]
  },
  'reply-drafter': {
    id: 'reply-drafter',
    name: 'Reply Drafter',
    description: 'Draft a reply to a message on your clipboard',
    icon: 'arrowshape.turn.up.left',
    prompt: 'Draft a polite, concise reply to the following message:',
    shortcutActions: [
      { type: 'getClipboard' },
      { type: 'openURL', template: '{{APP_URL}}?skill=reply-drafter&input={{CLIPBOARD}}' }
    ]
  },
  'quick-capture': {
    id: 'quick-capture',
    name: 'Quick Capture',
    description: 'Capture a thought or note quickly',
    icon: 'note.text',
    prompt: 'Store this note and acknowledge with a brief confirmation:',
    shortcutActions: [
      { type: 'askForInput', prompt: 'What do you want to capture?' },
      { type: 'openURL', template: '{{APP_URL}}?skill=quick-capture&input={{INPUT}}' }
    ]
  },
  'email-summary': {
    id: 'email-summary',
    name: 'Email Summary',
    description: 'Summarize an email from your clipboard',
    icon: 'envelope',
    prompt: 'Summarize this email. Extract: sender intent, action items, and suggested reply approach:',
    shortcutActions: [
      { type: 'getClipboard' },
      { type: 'openURL', template: '{{APP_URL}}?skill=email-summary&input={{CLIPBOARD}}' }
    ]
  }
};

export class Shortcuts {
  constructor() {
    this.appURL = typeof window !== 'undefined' ? window.location.origin : 'https://ai-space.app';
  }

  /**
   * Get all available skills
   */
  getSkills() {
    return Object.values(SKILLS).map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      icon: skill.icon
    }));
  }

  /**
   * Generate an iOS Shortcuts install URL for a skill
   * @param {string} skillId
   * @returns {string} shortcuts:// URL
   */
  generateInstallURL(skillId) {
    const skill = SKILLS[skillId];
    if (!skill) {
      throw new Error(`Unknown skill: ${skillId}`);
    }

    // Build a shortcuts:// URL that creates a new shortcut
    // The shortcut will open AI Space with the skill parameters
    const shortcutName = encodeURIComponent(`AI Space: ${skill.name}`);
    const callbackURL = encodeURIComponent(
      `${this.appURL}?skill=${skill.id}&input={input}`
    );

    // shortcuts://x-callback-url/create with actions
    return `shortcuts://x-callback-url/open?name=${shortcutName}&x-success=${callbackURL}`;
  }

  /**
   * Parse incoming data from URL parameters (from Shortcuts callback)
   * @param {URLSearchParams} urlParams
   * @returns {object|null} Parsed skill invocation data
   */
  parseIncoming(urlParams) {
    const skillId = urlParams.get('skill');
    if (!skillId) return null;

    const skill = SKILLS[skillId];
    if (!skill) return null;

    const input = urlParams.get('input') || '';
    const time = urlParams.get('time') || '';

    return {
      skillId,
      skill: {
        id: skill.id,
        name: skill.name,
        prompt: skill.prompt
      },
      input: input || time,
      timestamp: Date.now()
    };
  }

  /**
   * Build a full prompt from a skill invocation
   * @param {object} invocation - From parseIncoming()
   * @returns {string}
   */
  buildPrompt(invocation) {
    if (!invocation) return null;
    return `${invocation.skill.prompt}\n\n${invocation.input}`;
  }
}
