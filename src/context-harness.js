/**
 * Context Harness — Centralized context assembly, enrichment, and lifecycle
 * management for AI Space inference turns.
 *
 * The harness collects all context signals (user input, web context, skill
 * routing, personalization, images, conversation history) and produces a
 * fully-assembled, budget-aware context frame ready for inference.
 *
 * ## Why this exists
 * Before the harness, context assembly was scattered across app.js, ai-engine.js,
 * and kv-engine.js with no unified pipeline. The harness provides:
 *   - A single entry point for turn context assembly
 *   - Ordered enrichment pipeline (middlewares)
 *   - Token budget awareness before inference
 *   - Turn metadata and observability
 *   - Clean separation from UI and inference concerns
 *
 * ## Usage
 *   const harness = new ContextHarness();
 *   harness.use(webContextEnricher);      // add enrichment middleware
 *   harness.use(personalizeEnricher);
 *
 *   const frame = harness.beginTurn({ text, image, messages, mode, ... });
 *   await harness.enrich(frame);           // run all middleware
 *   const result = harness.finalize(frame); // produce inference-ready messages
 */

// ─── Constants ───────────────────────────────────────────────────────────────

/** Approximate characters per token (conservative, matches ai-engine.js). */
const CHARS_PER_TOKEN = 4;

/** Default context window when adapter reports none. */
const DEFAULT_CONTEXT_WINDOW = 4096;

/** Tokens reserved for the model response. */
const RESPONSE_RESERVE = 512;

/** Minimum token floor so the model always has something to work with. */
const MIN_TOKEN_FLOOR = 100;

/** Maximum enrichment middleware count to prevent unbounded chains. */
const MAX_MIDDLEWARES = 20;

/** Maximum number of completed frames to keep in history. */
const MAX_FRAME_HISTORY = 50;

// ─── Token estimation ────────────────────────────────────────────────────────

/**
 * Estimate token count from text.
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

// ─── Context Frame ───────────────────────────────────────────────────────────

/**
 * @typedef {Object} ContextFrame
 * @property {string} id - Unique turn identifier
 * @property {number} createdAt - Timestamp (ms)
 * @property {'pending'|'enriching'|'ready'|'sent'|'error'} status
 * @property {string} userText - Original user input
 * @property {string|null} image - Attached image data URL (if any)
 * @property {string} conversationId - Current conversation ID
 * @property {Array<{role:string, content:string}>} messages - Conversation history snapshot
 * @property {string} mode - Inference mode: local|cloud|hybrid|ollama
 * @property {Object} enrichments - Collected enrichment data keyed by enricher name
 * @property {string[]} enrichmentOrder - Order enrichments were applied
 * @property {number} tokenBudget - Available tokens for history after system prompt
 * @property {number} systemTokens - Estimated tokens used by system prompt
 * @property {number} historyTokens - Estimated tokens in conversation history
 * @property {Object} metadata - Arbitrary metadata from enrichers
 * @property {string|null} error - Error message if enrichment failed
 * @property {Array<{role:string, content:string}>|null} finalMessages - Inference-ready messages
 */

/**
 * Create a fresh context frame.
 * @param {Object} params
 * @returns {ContextFrame}
 */
function createFrame({
  text = '',
  image = null,
  conversationId = '',
  messages = [],
  mode = 'local',
  maxContextTokens = DEFAULT_CONTEXT_WINDOW,
  systemPrompt = ''
}) {
  const systemTokens = estimateTokens(systemPrompt);
  const budgetTokens = Math.max(
    maxContextTokens - systemTokens - RESPONSE_RESERVE,
    MIN_TOKEN_FLOOR
  );

  // Estimate tokens in current conversation history
  let historyTokens = 0;
  for (const msg of messages) {
    historyTokens += estimateTokens(
      typeof msg.content === 'string' ? msg.content : ''
    );
  }

  return {
    id: `turn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    status: 'pending',
    userText: text,
    image,
    conversationId,
    messages: messages.map(m => ({ ...m })), // shallow copy
    mode,
    enrichments: {},
    enrichmentOrder: [],
    tokenBudget: budgetTokens,
    systemTokens,
    historyTokens,
    metadata: {},
    error: null,
    finalMessages: null
  };
}

// ─── Enrichment Middleware ────────────────────────────────────────────────────

/**
 * @typedef {Object} Enricher
 * @property {string} name - Unique enricher identifier
 * @property {number} [priority] - Lower runs first (default: 100)
 * @property {(frame: ContextFrame, ctx: EnricherContext) => Promise<void>} enrich
 */

/**
 * @typedef {Object} EnricherContext
 * @property {Object|null} memory - Memory instance (if ready)
 * @property {Object|null} audit - Audit instance
 * @property {Object|null} engine - AIEngine instance
 * @property {Object|null} skillRegistry - SkillRegistry instance
 * @property {Object|null} toolRunner - ToolRunner instance
 */

// ─── Built-in Enrichers ─────────────────────────────────────────────────────

/**
 * Web context enricher — fetches Wikipedia snippets for factual/web-lookup
 * intents. Injects a [WEB_CONTEXT] system message at the top.
 *
 * @param {Object} deps - { isWebLookupIntent, isFactualQuestion, extractWebQuery, localInternetAssist }
 * @returns {Enricher}
 */
export function createWebContextEnricher(deps = {}) {
  const {
    isWebLookupIntent = () => false,
    isFactualQuestion = () => false,
    extractWebQuery = (t) => t,
    localInternetAssist = false,
    fetchFn = typeof fetch !== 'undefined' ? fetch : null
  } = deps;

  return {
    name: 'web-context',
    priority: 10,
    async enrich(frame) {
      const text = frame.userText;
      const factual = isFactualQuestion(text);
      const webIntent = isWebLookupIntent(text) || factual;

      if (!webIntent && !localInternetAssist) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      if (!fetchFn) return;

      const q = extractWebQuery(text);
      if (!q) return;

      try {
        const search = encodeURIComponent(q.slice(0, 150));
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${search}&srlimit=1&format=json&origin=*`;
        const res = await fetchFn(searchUrl, { method: 'GET' });
        if (!res.ok) return;

        const data = await res.json();
        const results = data?.query?.search || [];
        if (!results.length) return;

        const pageId = results[0]?.pageid;
        if (!pageId) return;

        const extractUrl = `https://en.wikipedia.org/w/api.php?action=query&pageids=${pageId}&prop=extracts&exintro=1&explaintext=1&exsentences=3&format=json&origin=*`;
        const extractRes = await fetchFn(extractUrl, { method: 'GET' });
        if (!extractRes.ok) return;

        const extractData = await extractRes.json();
        const page = Object.values(extractData?.query?.pages || {})[0];
        const snippet = page?.extract || '';

        if (snippet) {
          frame.enrichments['web-context'] = {
            query: q,
            snippet,
            source: 'wikipedia',
            autoTriggered: factual && !localInternetAssist
          };
          frame.metadata.hasWebContext = true;
        }
      } catch {
        // Silently fail — web context is optional enhancement
      }
    }
  };
}

/**
 * Skill routing enricher — checks if any registered skill wants to handle
 * the user's input. If a skill claims it, marks the frame so the harness
 * can short-circuit inference.
 *
 * @param {Object} deps - { skillRegistry }
 * @returns {Enricher}
 */
export function createSkillRoutingEnricher(deps = {}) {
  return {
    name: 'skill-routing',
    priority: 20,
    async enrich(frame, ctx) {
      const registry = deps.skillRegistry || ctx?.skillRegistry;
      if (!registry) return;

      const skillCtx = {
        conversationId: frame.conversationId,
        messages: frame.messages,
        memory: ctx?.memory || null,
        audit: ctx?.audit || null
      };

      try {
        const matched = await registry.route(frame.userText, skillCtx);
        if (matched) {
          const result = await matched.execute(frame.userText, skillCtx);
          if (result?.handled) {
            frame.enrichments['skill-routing'] = {
              skillId: matched.getManifest?.()?.id || 'unknown',
              handled: true,
              response: result.content || ''
            };
            frame.metadata.skillHandled = true;
            frame.metadata.skillId = matched.getManifest?.()?.id || 'unknown';
          }
        }
      } catch {
        // Skill routing failures are non-fatal
      }
    }
  };
}

/**
 * Personalization enricher — injects user preferences (name, tone, timezone)
 * into the context frame metadata.
 *
 * @param {Object} deps - { getPromptContext }
 * @returns {Enricher}
 */
export function createPersonalizationEnricher(deps = {}) {
  const { getPromptContext = () => '' } = deps;

  return {
    name: 'personalization',
    priority: 5, // Runs early — before web context
    async enrich(frame) {
      const promptContext = getPromptContext();
      if (promptContext) {
        frame.enrichments.personalization = { promptContext };
        frame.metadata.personalized = true;
      }
    }
  };
}

/**
 * Task type enricher — classifies the user's input type (question, code,
 * creative, etc.) so downstream enrichers and the inference config can adapt.
 *
 * @param {Object} deps - { detectTaskType }
 * @returns {Enricher}
 */
export function createTaskTypeEnricher(deps = {}) {
  const { detectTaskType = () => 'general' } = deps;

  return {
    name: 'task-type',
    priority: 3,
    async enrich(frame) {
      const taskType = detectTaskType(frame.userText);
      frame.enrichments['task-type'] = { taskType };
      frame.metadata.taskType = taskType;
    }
  };
}

// ─── Context Harness ─────────────────────────────────────────────────────────

export class ContextHarness {
  constructor() {
    /** @type {Enricher[]} */
    this._enrichers = [];

    /** @type {ContextFrame[]} */
    this._history = [];

    /** @type {ContextFrame|null} */
    this._activeTurn = null;
  }

  // ─── Middleware registration ─────────────────────────────────────────────

  /**
   * Register an enrichment middleware.
   * @param {Enricher} enricher
   * @throws {Error} if enricher is invalid or limit exceeded
   */
  use(enricher) {
    if (!enricher || typeof enricher.name !== 'string' || typeof enricher.enrich !== 'function') {
      throw new Error('Invalid enricher: must have name (string) and enrich (function)');
    }
    if (this._enrichers.length >= MAX_MIDDLEWARES) {
      throw new Error(`Maximum enricher count (${MAX_MIDDLEWARES}) exceeded`);
    }
    // Replace existing enricher with same name
    this._enrichers = this._enrichers.filter(e => e.name !== enricher.name);
    this._enrichers.push(enricher);
    // Keep sorted by priority (lower first)
    this._enrichers.sort((a, b) => (a.priority || 100) - (b.priority || 100));
  }

  /**
   * Remove an enricher by name.
   * @param {string} name
   * @returns {boolean} true if removed
   */
  remove(name) {
    const before = this._enrichers.length;
    this._enrichers = this._enrichers.filter(e => e.name !== name);
    return this._enrichers.length < before;
  }

  /**
   * List registered enrichers.
   * @returns {Array<{name: string, priority: number}>}
   */
  listEnrichers() {
    return this._enrichers.map(e => ({ name: e.name, priority: e.priority || 100 }));
  }

  // ─── Turn lifecycle ──────────────────────────────────────────────────────

  /**
   * Begin a new conversation turn. Creates a fresh context frame.
   *
   * @param {Object} params
   * @param {string} params.text - User input text
   * @param {string|null} [params.image] - Attached image data URL
   * @param {string} [params.conversationId] - Current conversation ID
   * @param {Array} [params.messages] - Conversation history
   * @param {string} [params.mode] - Inference mode (local|cloud|hybrid|ollama)
   * @param {number} [params.maxContextTokens] - Max tokens for the model
   * @param {string} [params.systemPrompt] - System prompt text
   * @returns {ContextFrame}
   */
  beginTurn(params = {}) {
    const frame = createFrame(params);
    this._activeTurn = frame;
    return frame;
  }

  /**
   * Run all registered enrichers on the frame, in priority order.
   *
   * @param {ContextFrame} frame
   * @param {EnricherContext} [ctx] - Shared context (memory, audit, etc.)
   * @returns {Promise<ContextFrame>} The enriched frame
   */
  async enrich(frame, ctx = {}) {
    if (!frame || frame.status === 'error') return frame;

    frame.status = 'enriching';

    for (const enricher of this._enrichers) {
      try {
        await enricher.enrich(frame, ctx);
        frame.enrichmentOrder.push(enricher.name);
      } catch (err) {
        // Record the error but continue — enrichers are non-fatal
        frame.metadata[`${enricher.name}_error`] = err.message;
      }

      // If a skill claimed the input, stop enrichment early
      if (frame.metadata.skillHandled) {
        break;
      }
    }

    frame.status = frame.metadata.skillHandled ? 'ready' : 'ready';
    return frame;
  }

  /**
   * Finalize the frame: assemble inference-ready messages array.
   *
   * @param {ContextFrame} frame
   * @param {Object} [opts]
   * @param {string} [opts.systemPrompt] - Override system prompt
   * @param {function} [opts.kvOptimize] - KV optimization function (messages, budget) => { messages }
   * @param {function} [opts.buildEnhancedQuery] - Query enhancement function
   * @returns {{ messages: Array, skipped: boolean, skillResponse: string|null, frame: ContextFrame }}
   */
  finalize(frame, opts = {}) {
    if (!frame) {
      return { messages: [], skipped: true, skillResponse: null, frame: null };
    }

    // If a skill handled it, return the skill response — no inference needed
    const skillData = frame.enrichments['skill-routing'];
    if (frame.metadata.skillHandled && skillData) {
      frame.status = 'sent';
      this._recordFrame(frame);
      return {
        messages: [],
        skipped: true,
        skillResponse: skillData.response || '',
        frame
      };
    }

    // Build system prompt with personalization
    let systemContent = opts.systemPrompt || '';
    const personalization = frame.enrichments.personalization;
    if (personalization?.promptContext) {
      systemContent += personalization.promptContext;
    }

    // Start with conversation messages
    let modelMessages = frame.messages.map(m => ({ ...m }));

    // Inject web context as first system message if available
    const webCtx = frame.enrichments['web-context'];
    if (webCtx?.snippet) {
      modelMessages.unshift({
        role: 'system',
        content: `[WEB_CONTEXT]\n${webCtx.snippet}\nUse these snippets as available web context for this turn. Do not claim full browsing access.`
      });
    }

    // Enhance the last user message with query enhancement
    if (typeof opts.buildEnhancedQuery === 'function') {
      const webContext = webCtx?.snippet || '';
      for (let i = modelMessages.length - 1; i >= 0; i--) {
        if (modelMessages[i]?.role === 'user') {
          modelMessages[i] = {
            ...modelMessages[i],
            content: opts.buildEnhancedQuery(frame.userText, webContext)
          };
          break;
        }
      }
    }

    // Run KV optimization if provided
    if (typeof opts.kvOptimize === 'function') {
      const result = opts.kvOptimize(modelMessages, frame.tokenBudget);
      modelMessages = result.messages || modelMessages;
    }

    // Prepend system prompt
    const finalMessages = [
      { role: 'system', content: systemContent },
      ...modelMessages
    ];

    frame.finalMessages = finalMessages;
    frame.status = 'sent';
    this._recordFrame(frame);

    return {
      messages: finalMessages,
      skipped: false,
      skillResponse: null,
      frame
    };
  }

  // ─── Turn completion ─────────────────────────────────────────────────────

  /**
   * Mark the active turn as complete with the model's response.
   * @param {ContextFrame} frame
   * @param {string} response - The model's generated response
   */
  completeTurn(frame, response) {
    if (frame) {
      frame.metadata.response = response;
      frame.metadata.completedAt = Date.now();
      frame.metadata.turnDurationMs = frame.metadata.completedAt - frame.createdAt;
      frame.status = 'sent';
    }
    if (this._activeTurn === frame) {
      this._activeTurn = null;
    }
  }

  /**
   * Mark the active turn as errored.
   * @param {ContextFrame} frame
   * @param {string} errorMessage
   */
  errorTurn(frame, errorMessage) {
    if (frame) {
      frame.error = errorMessage;
      frame.status = 'error';
      frame.metadata.completedAt = Date.now();
    }
    if (this._activeTurn === frame) {
      this._activeTurn = null;
    }
  }

  // ─── Observability ───────────────────────────────────────────────────────

  /**
   * Get the currently active turn frame, or null.
   * @returns {ContextFrame|null}
   */
  getActiveTurn() {
    return this._activeTurn;
  }

  /**
   * Get completed turn history (most recent first).
   * @param {number} [limit] - Max frames to return
   * @returns {ContextFrame[]}
   */
  getHistory(limit) {
    const frames = [...this._history].reverse();
    return typeof limit === 'number' ? frames.slice(0, limit) : frames;
  }

  /**
   * Get a summary snapshot of the harness state.
   * @returns {Object}
   */
  getSnapshot() {
    return {
      enricherCount: this._enrichers.length,
      enrichers: this._enrichers.map(e => e.name),
      historyCount: this._history.length,
      activeTurnId: this._activeTurn?.id || null,
      lastTurnId: this._history.length > 0 ? this._history[this._history.length - 1].id : null
    };
  }

  /**
   * Get token budget analysis for a given frame.
   * @param {ContextFrame} frame
   * @returns {{ systemTokens: number, historyTokens: number, budgetTokens: number, remaining: number, utilizationPct: number }}
   */
  getTokenAnalysis(frame) {
    if (!frame) {
      return { systemTokens: 0, historyTokens: 0, budgetTokens: 0, remaining: 0, utilizationPct: 0 };
    }

    const remaining = Math.max(0, frame.tokenBudget - frame.historyTokens);
    const utilizationPct = frame.tokenBudget > 0
      ? Math.round((frame.historyTokens / frame.tokenBudget) * 100)
      : 0;

    return {
      systemTokens: frame.systemTokens,
      historyTokens: frame.historyTokens,
      budgetTokens: frame.tokenBudget,
      remaining,
      utilizationPct
    };
  }

  /**
   * Reset the harness state. Clears history and active turn.
   */
  reset() {
    this._history = [];
    this._activeTurn = null;
  }

  // ─── Internal ────────────────────────────────────────────────────────────

  /** @private */
  _recordFrame(frame) {
    this._history.push(frame);
    if (this._history.length > MAX_FRAME_HISTORY) {
      this._history = this._history.slice(-MAX_FRAME_HISTORY);
    }
  }
}
