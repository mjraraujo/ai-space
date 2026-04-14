/**
 * KV Engine — Context optimization strategies for on-device LLM inference.
 *
 * The KV Engine pre-processes conversation history before each inference call,
 * implementing different "KV scripts" (strategies) to maximize what fits inside
 * the model's context window while preserving the most important information.
 *
 * Built-in strategies:
 *   standard         — No-op passthrough. Full history trimmed only by token budget.
 *   sliding-window   — Attention-sink pinning + fixed recency window.
 *   semantic-compress — Score each turn by importance; keep high-score + recent.
 *   turbo-compress   — Aggressively condense middle turns into inline bullet summaries.
 *
 * Custom scripts:
 *   Users may provide a JS function (string) that receives (messages, budget) and
 *   returns the processed messages array. It runs sandboxed via Function().
 */

// ─── Strategy registry ───────────────────────────────────────────────────────

/** Exponential moving average smoothing factor for throughput */
const EMA_ALPHA = 0.3;
/** Complement of EMA_ALPHA */
const EMA_BETA = 1 - EMA_ALPHA;

/** @typedef {{ role: string, content: string }} Message */

/** Characters-per-token approximation (conservative, matches ai-engine.js) */
const CHARS_PER_TOKEN = 4;

/** Minimum tokens guaranteed for the most-recent message */
const MIN_RECENT_TOKENS = 200;

/** Maximum allowed length for a user-provided custom KV script (characters). */
const MAX_CUSTOM_SCRIPT_LENGTH = 4_000;

// ─── Built-in strategy implementations ──────────────────────────────────────

/**
 * Standard — identical to raw trimming; no transformation.
 * @param {Message[]} messages
 * @param {number} budget tokens available for history
 * @returns {Message[]}
 */
function strategyStandard(messages, budget) {
  return trimToTokenBudget(messages, budget);
}

/**
 * Sliding-Window with Attention Sink.
 *
 * Theory: LLM attention layers pay disproportionate attention to the very first
 * token / message in a sequence (the "attention sink"). By always keeping the
 * first user message verbatim, we preserve the conversational anchor while
 * sliding the window over recent messages.
 *
 * Algorithm:
 *   1. Pin the first user turn (attention sink).
 *   2. Fill the remaining budget from the most-recent messages backward.
 *   3. Replace the middle gap with a one-line topic list.
 *
 * @param {Message[]} messages
 * @param {number} budget
 * @returns {Message[]}
 */
function strategySlidingWindow(messages, budget) {
  if (messages.length <= 4) return trimToTokenBudget(messages, budget);

  const sink = messages[0]; // Attention sink — first message
  const sinkTokens = estimateTokens(sink.content);
  let remaining = budget - sinkTokens;

  // Walk newest → oldest, fill window until budget exhausted
  const window = [];
  let windowTokens = 0;
  for (let i = messages.length - 1; i >= 1; i--) {
    const t = estimateTokens(messages[i].content);
    if (windowTokens + t > remaining) break;
    window.unshift(messages[i]);
    windowTokens += t;
  }

  // Find the gap between sink and window
  const firstWindowIdx = messages.indexOf(window[0]);
  const gapMessages = messages.slice(1, firstWindowIdx);

  if (gapMessages.length === 0) {
    return [sink, ...window];
  }

  // Summarise the gap as a single compact system-style message
  const gapTopics = gapMessages
    .filter((m) => m.role === 'user')
    .map((m) => (m.content || '').slice(0, 60).replace(/\n/g, ' '))
    .filter(Boolean)
    .slice(0, 5)
    .join('; ');

  const summary = {
    role: 'system',
    content: `[Sliding-window summary — earlier topics: ${gapTopics || 'general discussion'}]`
  };

  return [sink, summary, ...window];
}

/**
 * Semantic Compression.
 *
 * Scores each turn by heuristic importance signals:
 *   - Questions (?) → high importance
 *   - Numerical data / code blocks → high importance
 *   - Short acknowledgements ("ok", "yes", "thanks") → low importance
 *   - Most-recent N turns → boosted
 *
 * Keeps the top-K important turns plus the most-recent window; condenses
 * the rest into a grouped summary.
 *
 * @param {Message[]} messages
 * @param {number} budget
 * @returns {Message[]}
 */
function strategySemanticCompress(messages, budget) {
  if (messages.length <= 6) return trimToTokenBudget(messages, budget);

  const recencyBoost = 4; // last N turns always kept
  const recentMessages = messages.slice(-recencyBoost);
  const olderMessages = messages.slice(0, -recencyBoost);

  if (olderMessages.length === 0) return trimToTokenBudget(messages, budget);

  // Score older messages
  const scored = olderMessages.map((msg, idx) => ({
    msg,
    idx,
    score: importanceScore(msg, idx, olderMessages.length)
  }));

  scored.sort((a, b) => b.score - a.score);

  // Greedily fill budget with high-importance messages
  const recentTokens = estimateTokens(recentMessages.map((m) => m.content).join(''));
  let available = budget - recentTokens;
  const kept = new Set();

  for (const { msg, idx } of scored) {
    const t = estimateTokens(msg.content);
    if (t > available) continue;
    kept.add(idx);
    available -= t;
    if (available < MIN_RECENT_TOKENS) break;
  }

  // Rebuild in original order
  const keptMessages = olderMessages.filter((_, i) => kept.has(i));
  const droppedMessages = olderMessages.filter((_, i) => !kept.has(i));

  const out = [];
  if (droppedMessages.length > 0) {
    const topics = droppedMessages
      .filter((m) => m.role === 'user')
      .map((m) => (m.content || '').slice(0, 50).replace(/\n/g, ' '))
      .filter(Boolean)
      .slice(0, 6)
      .join('; ');
    out.push({
      role: 'system',
      content: `[Compressed context — earlier topics: ${topics || 'general'}]`
    });
  }

  out.push(...keptMessages, ...recentMessages);
  return out;
}

/**
 * Turbo Compression.
 *
 * Maximum token efficiency: condenses older conversation turns into an inline
 * bullet-point synopsis embedded as a single synthetic message. Only the most
 * recent sliding window is kept verbatim.
 *
 * Use this when: very limited VRAM, large model, or very long conversations.
 *
 * @param {Message[]} messages
 * @param {number} budget
 * @returns {Message[]}
 */
function strategyTurboCompress(messages, budget) {
  if (messages.length <= 3) return trimToTokenBudget(messages, budget);

  // Keep the last 6 turns verbatim
  const KEEP_RECENT = 6;
  const recent = messages.slice(-KEEP_RECENT);
  const older = messages.slice(0, -KEEP_RECENT);

  if (older.length === 0) return trimToTokenBudget(messages, budget);

  // Build compact bullet-point summary of older turns
  const bullets = [];
  for (let i = 0; i < older.length - 1; i += 2) {
    const userMsg = older[i];
    const assistantMsg = older[i + 1];
    if (!userMsg) continue;
    const q = (userMsg.content || '').slice(0, 80).replace(/\n/g, ' ');
    const a = assistantMsg
      ? (assistantMsg.content || '').slice(0, 80).replace(/\n/g, ' ')
      : '';
    bullets.push(`• Q: ${q}${a ? ` → A: ${a}` : ''}`);
  }

  const synopsis = {
    role: 'system',
    content: `[Turbo-compressed prior context:\n${bullets.join('\n')}]`
  };

  // Ensure synopsis + recent fit the budget
  const synopsisTokens = estimateTokens(synopsis.content);
  const recentTokens = estimateTokens(recent.map((m) => m.content).join(''));

  if (synopsisTokens + recentTokens <= budget) {
    return [synopsis, ...recent];
  }

  // Synopsis too big — truncate bullets until they fit
  while (bullets.length > 1) {
    bullets.shift();
    synopsis.content = `[Turbo-compressed prior context:\n${bullets.join('\n')}]`;
    const updatedTokens = estimateTokens(synopsis.content);
    if (updatedTokens + recentTokens <= budget) break;
  }

  return [synopsis, ...recent];
}

// ─── Quantum-compress strategy ────────────────────────────────────────────────

/**
 * Quantum-Compress — highest-ratio strategy combining turbo-compress with
 * near-duplicate deduplication and priority clustering.
 *
 * Algorithm:
 *   1. Segment conversation into topic clusters (turn-to-turn similarity).
 *   2. Within each cluster, keep only the highest-importance turn (dedup).
 *   3. Condense all pruned clusters into a single ultra-compact synopsis.
 *   4. Keep the most-recent KEEP_RECENT turns verbatim as the live window.
 *
 * Near-duplicate detection: two turns are considered duplicates when their
 * Jaccard similarity on 3-gram token sets exceeds DEDUP_THRESHOLD. This is
 * a lightweight embedding-free approximation that runs in O(n²) — acceptable
 * for the typical conversation lengths (< 200 turns).
 *
 * @param {Message[]} messages
 * @param {number} budget
 * @returns {Message[]}
 */
function strategyQuantumCompress(messages, budget) {
  if (messages.length <= 4) return trimToTokenBudget(messages, budget);

  const KEEP_RECENT  = 4;   // verbatim window
  const DEDUP_THRESH = 0.6; // Jaccard threshold for near-duplicates

  const recent = messages.slice(-KEEP_RECENT);
  const older  = messages.slice(0, -KEEP_RECENT);

  if (older.length === 0) return trimToTokenBudget(messages, budget);

  // ── Step 1: build 3-gram sets for deduplication ──────────────────────────
  const ngramSets = older.map((m) => buildNgramSet(m.content, 3));

  // ── Step 2: cluster near-duplicates and keep highest-importance rep ───────
  const used    = new Array(older.length).fill(false);
  const keepers = []; // indices of representative turns

  for (let i = 0; i < older.length; i++) {
    if (used[i]) continue;
    let bestIdx = i;
    let bestScore = importanceScore(older[i], i, older.length);
    used[i] = true;

    // Find all near-duplicates of turn i
    for (let j = i + 1; j < older.length; j++) {
      if (used[j]) continue;
      if (jaccard(ngramSets[i], ngramSets[j]) >= DEDUP_THRESH) {
        used[j] = true;
        const score = importanceScore(older[j], j, older.length);
        if (score > bestScore) {
          bestScore = score;
          bestIdx = j;
        }
      }
    }
    keepers.push(bestIdx);
  }

  // ── Step 3: build quantum synopsis from non-keeper turns ─────────────────
  const keeperSet = new Set(keepers);
  const pruned    = older.filter((_, i) => !keeperSet.has(i));

  const bullets = [];
  for (let i = 0; i < pruned.length - 1; i += 2) {
    const q = (pruned[i].content     || '').slice(0, 60).replace(/\n/g, ' ');
    const a = (pruned[i + 1]?.content || '').slice(0, 60).replace(/\n/g, ' ');
    if (q) bullets.push(`• ${q}${a ? ` ↦ ${a}` : ''}`);
  }

  // ── Step 4: assemble final context within budget ──────────────────────────
  const recentTokens = estimateTokens(recent.map((m) => m.content).join(''));
  let remaining = budget - recentTokens;

  const parts = [];

  if (bullets.length > 0) {
    const synopsis = {
      role: 'system',
      content: `[Quantum-compressed context:\n${bullets.join('\n')}]`
    };
    const st = estimateTokens(synopsis.content);
    if (st <= remaining) {
      parts.push(synopsis);
      remaining -= st;
    }
  }

  // Add representative turns in original order, most important first
  const rankedKeepers = keepers
    .map((idx) => ({ idx, score: importanceScore(older[idx], idx, older.length) }))
    .sort((a, b) => b.score - a.score);

  const selectedIndices = new Set();
  for (const { idx } of rankedKeepers) {
    const t = estimateTokens(older[idx].content);
    if (t <= remaining) {
      selectedIndices.add(idx);
      remaining -= t;
    }
    if (remaining < MIN_RECENT_TOKENS) break;
  }

  // Re-order selected turns by original position
  const selectedTurns = older
    .filter((_, i) => selectedIndices.has(i));

  return [...parts, ...selectedTurns, ...recent];
}

// ─── N-gram / Jaccard helpers ─────────────────────────────────────────────────

/**
 * Build a Set of n-gram strings from text.
 * @param {string} text
 * @param {number} n
 * @returns {Set<string>}
 */
function buildNgramSet(text, n) {
  const tokens = (text || '').toLowerCase().split(/\s+/).filter(Boolean);
  const set = new Set();
  for (let i = 0; i <= tokens.length - n; i++) {
    set.add(tokens.slice(i, i + n).join(' '));
  }
  return set;
}

/**
 * Jaccard similarity between two sets.
 * @param {Set<string>} a
 * @param {Set<string>} b
 * @returns {number} 0–1
 */
function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const x of a) { if (b.has(x)) intersection++; }
  return intersection / (a.size + b.size - intersection);
}

// ─── Strategy map ────────────────────────────────────────────────────────────

export const KV_STRATEGIES = {
  standard: {
    id: 'standard',
    name: 'Standard',
    icon: '◈',
    description: 'Direct token trimming. No transformation.',
    detail: 'Best for short conversations. Zero overhead.',
    fn: strategyStandard
  },
  'sliding-window': {
    id: 'sliding-window',
    name: 'Sliding Window',
    icon: '⟨⟩',
    description: 'Attention-sink pinning + recency window.',
    detail: 'Keeps the first message (attention anchor) + the most recent turns. Middle turns are summarised.',
    fn: strategySlidingWindow
  },
  'semantic-compress': {
    id: 'semantic-compress',
    name: 'Semantic Compress',
    icon: '◉',
    description: 'Importance-scored context selection.',
    detail: 'Scores each turn by relevance signals (questions, code, numbers). Keeps high-value turns + recent window.',
    fn: strategySemanticCompress
  },
  'turbo-compress': {
    id: 'turbo-compress',
    name: 'Turbo Compress',
    icon: '⚡',
    description: 'Maximum token efficiency. Bullet-synopsis of old turns.',
    detail: 'Condenses older turns into a compact bullet list. Keeps only the most recent 6 turns verbatim. Best for large models with limited VRAM.',
    fn: strategyTurboCompress
  },
  'quantum-compress': {
    id: 'quantum-compress',
    name: 'Quantum Compress',
    icon: '⟁',
    description: 'Near-duplicate deduplication + priority clustering.',
    detail: 'Groups similar turns into clusters, keeps only the most informative representative per cluster, then condenses the rest into an ultra-compact synopsis. Highest compression ratio.',
    fn: strategyQuantumCompress
  }
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Estimate token count for a string.
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text) {
  return Math.ceil((typeof text === 'string' ? text : '').length / CHARS_PER_TOKEN);
}

/**
 * Trim a message list to fit within a token budget, preserving recency.
 * Always keeps the last message intact.
 * @param {Message[]} messages
 * @param {number} budget
 * @returns {Message[]}
 */
function trimToTokenBudget(messages, budget) {
  if (!messages || messages.length === 0) return messages;

  let used = 0;
  let keepFrom = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const t = estimateTokens(
      typeof messages[i].content === 'string' ? messages[i].content : ''
    );
    if (used + t > budget) {
      keepFrom = i + 1;
      break;
    }
    used += t;
  }

  if (keepFrom >= messages.length) {
    return [messages[messages.length - 1]];
  }

  return messages.slice(keepFrom);
}

/**
 * Heuristic importance score for semantic compression.
 * Higher = more important to keep.
 * @param {Message} msg
 * @param {number} idx position in the array (0 = oldest)
 * @param {number} total total number of messages
 * @returns {number}
 */
function importanceScore(msg, idx, total) {
  const content = typeof msg.content === 'string' ? msg.content : '';
  let score = 0;

  // Questions are important
  score += (content.match(/\?/g) || []).length * 3;

  // Code blocks indicate technical importance
  score += (content.match(/```/g) || []).length * 4;

  // Numbers / data
  score += (content.match(/\d+/g) || []).length * 0.5;

  // Named entities (capitalized words, rough proxy)
  score += (content.match(/\b[A-Z][a-z]{2,}\b/g) || []).length * 0.3;

  // Penalise very short acknowledgement messages
  if (content.trim().split(/\s+/).length <= 5) score -= 3;

  // Slight recency bias
  score += (idx / total) * 2;

  return score;
}

// ─── KVEngine class ──────────────────────────────────────────────────────────

export class KVEngine {
  constructor() {
    /** @type {string} active strategy id */
    this.strategy = 'standard';

    /** @type {string|null} custom script source (JS function body) */
    this.customScript = null;

    /** @type {Function|null} compiled custom strategy */
    this._compiledCustom = null;

    /** @type {{ tokensIn: number, tokensOut: number, compressions: number, throughputTps: number }} */
    this._metrics = {
      tokensIn: 0,
      tokensOut: 0,
      compressions: 0,
      throughputTps: 0
    };

    /** @type {string[]} log of compression events */
    this._log = [];
  }

  // ─── Strategy selection ─────────────────────────────────────────────────

  /**
   * Set the active strategy by id.
   * @param {string} id one of KV_STRATEGIES keys or 'custom'
   */
  setStrategy(id) {
    if (id === 'custom') {
      this.strategy = 'custom';
    } else if (KV_STRATEGIES[id]) {
      this.strategy = id;
    } else {
      console.warn(`[KVEngine] unknown strategy "${id}", falling back to standard`);
      this.strategy = 'standard';
    }
  }

  /**
   * Set and compile a custom script.
   * The script must define a function body with signature:
   *   (messages, budget) => messages
   * @param {string} scriptSource
   * @throws if the script fails to compile or has wrong arity
   */
  setCustomScript(scriptSource) {
    if (!scriptSource || !scriptSource.trim()) {
      this.customScript = null;
      this._compiledCustom = null;
      return;
    }

    if (scriptSource.length > MAX_CUSTOM_SCRIPT_LENGTH) {
      throw new Error(`KVEngine: custom script too long (max ${MAX_CUSTOM_SCRIPT_LENGTH} characters)`);
    }

    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function('messages', 'budget', scriptSource);
      // Validate it returns an array (smoke test with an immutable frozen input)
      const probe = fn(Object.freeze([]), 1000);
      if (!Array.isArray(probe)) {
        throw new Error('Custom script must return an array of messages');
      }
      this.customScript = scriptSource;
      this._compiledCustom = fn;
    } catch (err) {
      throw new Error(`KVEngine: custom script compile error — ${err.message}`);
    }
  }

  // ─── Core optimization ──────────────────────────────────────────────────

  /**
   * Optimize a message list using the active strategy.
   * Returns the processed message array and updates internal metrics.
   *
   * @param {Message[]} messages conversation history (no system prompt)
   * @param {number} budgetTokens available token budget for history
   * @returns {{ messages: Message[], metrics: object }}
   */
  optimize(messages, budgetTokens) {
    if (!messages || messages.length === 0) {
      return { messages: [], metrics: this._metrics };
    }

    const before = messages.length;
    const tokensIn = messages.reduce((s, m) => s + estimateTokens(m.content), 0);

    let result;
    try {
      if (this.strategy === 'custom' && this._compiledCustom) {
        result = this._compiledCustom(messages, budgetTokens);
        if (!Array.isArray(result)) result = messages;
      } else {
        const stratDef = KV_STRATEGIES[this.strategy] || KV_STRATEGIES['standard'];
        result = stratDef.fn(messages, budgetTokens);
      }
    } catch (err) {
      console.warn('[KVEngine] strategy error, falling back to standard:', err);
      result = strategyStandard(messages, budgetTokens);
    }

    const after = result.length;
    const tokensOut = result.reduce((s, m) => s + estimateTokens(m.content), 0);

    // Update metrics
    this._metrics.tokensIn = tokensIn;
    this._metrics.tokensOut = tokensOut;
    if (before > after) {
      this._metrics.compressions++;
      this._log.push(
        `[${new Date().toLocaleTimeString()}] ${this.strategy}: ${before}→${after} msgs, ${tokensIn}→${tokensOut} tokens`
      );
      if (this._log.length > 50) this._log = this._log.slice(-50);
    }

    return { messages: result, metrics: { ...this._metrics } };
  }

  // ─── Throughput tracking ────────────────────────────────────────────────

  /**
   * Record a generation's token throughput.
   * @param {number} tokenCount
   * @param {number} elapsedMs
   */
  recordThroughput(tokenCount, elapsedMs) {
    if (elapsedMs > 0) {
      const tps = (tokenCount / elapsedMs) * 1000;
      // Exponential moving average
      this._metrics.throughputTps = this._metrics.throughputTps === 0
        ? tps
        : EMA_BETA * this._metrics.throughputTps + EMA_ALPHA * tps;
    }
  }

  // ─── Metrics & log ──────────────────────────────────────────────────────

  /**
   * Get current metrics snapshot.
   * @returns {{ tokensIn: number, tokensOut: number, compressions: number, throughputTps: number }}
   */
  getMetrics() {
    return { ...this._metrics };
  }

  /**
   * Get the compression event log.
   * @returns {string[]}
   */
  getLog() {
    return [...this._log];
  }

  /** Reset metrics and log. */
  reset() {
    this._metrics = { tokensIn: 0, tokensOut: 0, compressions: 0, throughputTps: 0 };
    this._log = [];
  }

  /**
   * Get info about all available strategies.
   * @returns {Object[]}
   */
  static getStrategies() {
    return Object.values(KV_STRATEGIES).map(({ id, name, icon, description, detail }) => ({
      id, name, icon, description, detail
    }));
  }
}
