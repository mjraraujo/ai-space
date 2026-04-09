/**
 * Skill Registry — plugin-style skills system for AI Space.
 *
 * All skills implement SkillProvider and register via SkillRegistry.
 * The registry routes user input to the appropriate skill, manages
 * permissions, and coordinates with the AIEngine and ToolRunner.
 *
 * Built-in skills:
 *   - WorkflowStudioSkill   (migrated from SkillStudio)
 *   - WebExtractorSkill
 *   - MorningBriefingSkill
 *   - ReplyDrafterSkill
 */

// ─── SkillProvider Interface ─────────────────────────────────────────────────

/**
 * @typedef {Object} SkillManifest
 * @property {string}   id
 * @property {string}   name
 * @property {string}   version
 * @property {string}   description
 * @property {string}   icon              - emoji or SF Symbol name
 * @property {string[]} permissions       - e.g. ['network','clipboard','filesystem']
 * @property {import('./model-adapter.js').ToolDef[]} [tools] - tool defs the skill exposes
 * @property {string}   [systemPrompt]    - injected into context when skill is active
 * @property {string}   [argumentHint]    - e.g. '[url, article, clipboard]'
 * @property {string}   [whenToUse]       - one-line trigger description
 * @property {boolean}  [approvalRequired]
 * @property {string[]} [suggestedActions]
 * @property {string[]} [relayTypes]      - ['shortcuts','browser','device']
 */

/**
 * @typedef {Object} SkillContext
 * @property {string}   conversationId
 * @property {import('./model-adapter.js').ChatMessage[]} messages
 * @property {object}   [adapter]         - current ModelAdapter
 * @property {object}   [memory]          - Memory instance
 * @property {object}   [audit]           - Audit instance
 */

/**
 * @typedef {Object} SkillResult
 * @property {string}  content            - markdown text injected into conversation
 * @property {boolean} [handled]          - if true, AIEngine skips its own LLM call
 * @property {object}  [artifact]         - structured data for a UI panel
 * @property {string[]} [suggestedActions]
 * @property {string}  [notification]
 */

export class SkillProvider {
  /** @returns {SkillManifest} */
  getManifest() {
    throw new Error('SkillProvider.getManifest() not implemented');
  }

  /**
   * Called once when the skill is activated / registered.
   * @param {SkillContext} _ctx
   * @returns {Promise<void>}
   */
  async onActivate(_ctx) {}

  /**
   * Determine if this skill should handle the current user input.
   * Return true to claim the message; AIEngine will call execute() instead of bare LLM.
   * @param {string} _userInput
   * @param {SkillContext} _ctx
   * @returns {Promise<boolean>}
   */
  async shouldHandle(_userInput, _ctx) {
    return false;
  }

  /**
   * Execute the skill's primary action.
   * @param {string} _userInput
   * @param {SkillContext} _ctx
   * @returns {Promise<SkillResult>}
   */
  async execute(_userInput, _ctx) {
    throw new Error('SkillProvider.execute() not implemented');
  }

  /**
   * Handle a tool-call result returned by the model.
   * @param {import('./model-adapter.js').ToolCall} _toolCall
   * @param {SkillContext} _ctx
   * @returns {Promise<string>}
   */
  async handleToolCall(_toolCall, _ctx) {
    return '';
  }

  /** Called when the skill is deactivated or uninstalled. */
  async onDeactivate() {}
}

// ─── SkillRegistry ───────────────────────────────────────────────────────────

export class SkillRegistry {
  constructor() {
    /** @type {Map<string, SkillProvider>} */
    this._skills = new Map();
    /** @type {Set<string>} disabled skill IDs */
    this._disabled = new Set();
  }

  /**
   * Register a skill provider.
   * @param {SkillProvider} provider
   */
  register(provider) {
    const manifest = provider.getManifest();
    if (!manifest?.id) throw new Error('SkillProvider manifest must have an id');
    this._skills.set(manifest.id, provider);
  }

  /**
   * Unregister a skill.
   * @param {string} id
   */
  async unregister(id) {
    const skill = this._skills.get(id);
    if (skill) {
      try {
        await skill.onDeactivate();
      } catch (err) {
        console.warn(`SkillRegistry: cleanup error for skill "${id}":`, err);
      }
      this._skills.delete(id);
      this._disabled.delete(id);
    }
  }

  /**
   * Resolve a skill by ID.
   * @param {string} id
   * @returns {SkillProvider|undefined}
   */
  resolve(id) {
    return this._skills.get(id);
  }

  /**
   * @returns {SkillManifest[]} all registered skill manifests (enabled + disabled)
   */
  listManifests() {
    return [...this._skills.values()].map((s) => ({
      ...s.getManifest(),
      enabled: !this._disabled.has(s.getManifest().id)
    }));
  }

  /**
   * @returns {SkillManifest[]} only enabled skill manifests
   */
  listEnabled() {
    return this.listManifests().filter((m) => !this._disabled.has(m.id));
  }

  /** Enable a skill. */
  enable(id) { this._disabled.delete(id); }

  /** Disable a skill without unregistering it. */
  disable(id) { this._disabled.add(id); }

  /** @returns {boolean} */
  isEnabled(id) { return this._skills.has(id) && !this._disabled.has(id); }

  /**
   * Find the first enabled skill that claims it should handle this input.
   * @param {string} input
   * @param {SkillContext} ctx
   * @returns {Promise<SkillProvider|null>}
   */
  async route(input, ctx) {
    for (const [id, skill] of this._skills.entries()) {
      if (this._disabled.has(id)) continue;
      try {
        if (await skill.shouldHandle(input, ctx)) return skill;
      } catch {}
    }
    return null;
  }

  /**
   * Collect all tool definitions from enabled skills.
   * Used to populate the `tools` array in chat requests.
   * @returns {import('./model-adapter.js').ToolDef[]}
   */
  collectToolDefs() {
    const defs = [];
    for (const [id, skill] of this._skills.entries()) {
      if (this._disabled.has(id)) continue;
      const manifest = skill.getManifest();
      if (manifest.tools) defs.push(...manifest.tools);
    }
    return defs;
  }

  /**
   * Dispatch a tool call to the skill that owns it.
   * @param {import('./model-adapter.js').ToolCall} toolCall
   * @param {SkillContext} ctx
   * @returns {Promise<string>}
   */
  async dispatchToolCall(toolCall, ctx) {
    const toolName = toolCall.function?.name;
    if (!toolName) return 'Error: missing tool name';

    for (const [id, skill] of this._skills.entries()) {
      if (this._disabled.has(id)) continue;
      const manifest = skill.getManifest();
      const owns = (manifest.tools || []).some((t) => t.function?.name === toolName);
      if (owns) {
        return skill.handleToolCall(toolCall, ctx).catch((e) => `Tool error: ${e.message}`);
      }
    }

    return `Error: no skill registered for tool "${toolName}"`;
  }

  /** Total number of registered skills. */
  get size() { return this._skills.size; }
}

// ─── Built-in Skills ─────────────────────────────────────────────────────────

/**
 * WorkflowStudioSkill
 * Turns a complex routine into a reusable, approval-aware local skill manifest.
 */
export class WorkflowStudioSkill extends SkillProvider {
  getManifest() {
    return {
      id: 'workflow-studio',
      name: 'Workflow Studio',
      version: '1.0.0',
      description: 'Turn a complex routine into a reusable, approval-aware AI Space skill',
      icon: '🧠',
      permissions: [],
      approvalRequired: true,
      relayTypes: ['device', 'shortcuts', 'browser'],
      argumentHint: '[task or routine]',
      whenToUse: 'Use when the user wants to convert a repeated task into a reusable runbook.',
      suggestedActions: ['Save as local skill', 'Build relay artifact', 'Create approval checklist'],
      systemPrompt: [
        'You are AI Space Workflow Studio.',
        'Your job is to turn the user\'s request into a structured, reusable, approval-aware local skill manifest.',
        'Always output a SkillManifestJSON block at the end of your response.',
        'Preserve the identity of AI Space: local-first, privacy-first, transparent, and approval-based.',
        'Do not claim actions were executed unless the user explicitly confirms it.'
      ].join('\n')
    };
  }

  async shouldHandle(userInput) {
    // Matches: "create/build/draft/save/make/turn ... skill/workflow/runbook/routine/automation"
    // or an explicit "workflow studio" invocation
    return /\b(create|build|draft|save|make|turn)\b.{0,30}\b(skill|workflow|runbook|routine|automation)\b/i.test(userInput)
      || /\bworkflow\s+studio\b/i.test(userInput);
  }

  async execute(userInput, _ctx) {
    const { draftSkillFromText } = await import('./skill-studio.js');
    const draft = draftSkillFromText(userInput);

    return {
      content: null, // let AIEngine produce the response using the skill's systemPrompt
      handled: false,
      artifact: {
        type: 'skill-manifest',
        data: draft
      },
      suggestedActions: draft.suggestedActions || [],
      notification: 'Workflow Studio ready — review the draft before saving.'
    };
  }
}

/**
 * WebExtractorSkill
 * Summarizes or analyses content from a shared URL or pasted webpage text.
 */
export class WebExtractorSkill extends SkillProvider {
  getManifest() {
    return {
      id: 'web-extractor',
      name: 'Web Extractor',
      version: '1.0.0',
      description: 'Extract, summarize, and analyse content from shared URLs or web pages',
      icon: '🌐',
      permissions: ['network'],
      approvalRequired: false,
      relayTypes: ['browser'],
      argumentHint: '[url or pasted article text]',
      whenToUse: 'Use when the user shares a URL or pastes webpage content and wants a summary or analysis.',
      suggestedActions: ['Summarize this page', 'Extract action items', 'Create notes'],
      systemPrompt: [
        'You are helping the user extract value from web content.',
        'Produce a concise summary with: key points, main takeaways, and suggested next actions.',
        'Keep it structured using markdown headings and bullets.',
        'Do not fabricate any information that is not in the provided content.'
      ].join('\n')
    };
  }

  async shouldHandle(userInput) {
    // Matches explicit URL share (https://...) or phrases like
    // "summarize this article from the site", "open this link", etc.
    return /https?:\/\/\S+/.test(userInput)
      || /\b(summarize|extract|analyse|analyze|read|parse|scrape|open|visit|article)\b.{0,40}\b(url|link|page|site|article|post)\b/i.test(userInput);
  }

  async execute(userInput, _ctx) {
    // Extract URL if present
    const urlMatch = userInput.match(/https?:\/\/\S+/);
    const url = urlMatch ? urlMatch[0] : null;

    if (url) {
      // Try to fetch the page via a proxy-free approach (share target) or
      // surface instructions to use the browser relay
      return {
        content: null,
        handled: false,
        artifact: { type: 'web-extract', url },
        suggestedActions: ['Summarize this page', 'Extract action items', 'List key quotes'],
        notification: `Web Extractor: processing ${url}`
      };
    }

    return {
      content: null,
      handled: false,
      suggestedActions: ['Summarize', 'Extract action items']
    };
  }
}

/**
 * MorningBriefingSkill
 * Generates a daily briefing from calendar context, reminders, and notes.
 */
export class MorningBriefingSkill extends SkillProvider {
  getManifest() {
    return {
      id: 'morning-briefing',
      name: 'Morning Briefing',
      version: '1.0.0',
      description: 'Get a concise daily briefing based on your context',
      icon: '☀️',
      permissions: [],
      approvalRequired: false,
      relayTypes: ['shortcuts', 'device'],
      argumentHint: '[calendar events, reminders, or date context]',
      whenToUse: 'Use when the user wants a morning summary of their day.',
      suggestedActions: ['Create today plan', 'Top 3 priorities', 'Set focus mode'],
      systemPrompt: [
        'You are preparing the user\'s morning briefing.',
        'Be concise and action-oriented.',
        'Structure: Today\'s date → Key events → Priorities → One motivating thought.',
        'Keep total length under 200 words.'
      ].join('\n')
    };
  }

  async shouldHandle(userInput) {
    // Matches phrases like: "morning briefing", "brief me", "today's plan/summary/schedule"
    return /\b(morning\s+briefing|daily\s+brief|brief\s+me|my\s+day|today\'s\s+(plan|summary|schedule))\b/i.test(userInput);
  }

  async execute(userInput, _ctx) {
    return {
      content: null,
      handled: false,
      suggestedActions: ['Create today plan', 'Top 3 priorities']
    };
  }
}

/**
 * ReplyDrafterSkill
 * Drafts a reply to a message on the clipboard or provided as context.
 */
export class ReplyDrafterSkill extends SkillProvider {
  getManifest() {
    return {
      id: 'reply-drafter',
      name: 'Reply Drafter',
      version: '1.0.0',
      description: 'Draft a polite, concise reply to a message',
      icon: '✉️',
      permissions: [],
      approvalRequired: false,
      relayTypes: ['shortcuts', 'device'],
      argumentHint: '[message text to reply to]',
      whenToUse: 'Use when the user wants AI to draft a reply to an email or message.',
      suggestedActions: ['Make it more formal', 'Make it shorter', 'Add a question'],
      systemPrompt: [
        'You are drafting a reply to the message provided by the user.',
        'Match the formality level of the original message.',
        'Keep the reply concise and direct.',
        'End with a clear next step or question if appropriate.',
        'Do not add filler phrases like "Certainly!" or "Of course!".'
      ].join('\n')
    };
  }

  async shouldHandle(userInput) {
    // Matches: "draft/write/compose a reply/response/email/message"
    // or "reply to/for [something]"
    return /\b(draft|write|compose)\s+(a\s+)?(reply|response|email|message)\b/i.test(userInput)
      || /\breply\s+(to|for)\b/i.test(userInput);
  }

  async execute(userInput, _ctx) {
    return {
      content: null,
      handled: false,
      suggestedActions: ['Make it more formal', 'Make it shorter', 'Add a question']
    };
  }
}

// ─── Registry factory ────────────────────────────────────────────────────────

/**
 * Create a SkillRegistry pre-loaded with all built-in skills.
 * @returns {SkillRegistry}
 */
export function createDefaultRegistry() {
  const registry = new SkillRegistry();
  registry.register(new WorkflowStudioSkill());
  registry.register(new WebExtractorSkill());
  registry.register(new MorningBriefingSkill());
  registry.register(new ReplyDrafterSkill());
  return registry;
}
