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
    const dataParam = urlParams.get('data');
    const inputParam = urlParams.get('input');
    const timeParam = urlParams.get('time');

    if (dataParam) {
      // Try to decode base64 data
      try {
        input = atob(dataParam);
      } catch {
        // If not valid base64, use as-is
        input = dataParam;
      }
    } else if (inputParam) {
      input = inputParam;
    } else if (timeParam) {
      input = timeParam;
    }

    return {
      skillId,
      skill: {
        id: skill.id,
        name: skill.name,
        prompt: skill.prompt
      },
      input,
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
    return `${invocation.skill.prompt}\n\n${invocation.input}`;
  }
}
