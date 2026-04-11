/**
 * Pure utility functions — no side effects, no browser API dependencies.
 * Extracted for testability and reuse.
 */

/**
 * Detect if user message is asking for a web lookup.
 * @param {string} text
 * @returns {boolean}
 */
export function isWebLookupIntent(text) {
  return /\b(search|find|lookup|look up|web|internet|wikipedia|google)\b/i.test(String(text || ''));
}

/**
 * Extract a clean search query from a natural-language web lookup request.
 * @param {string} text
 * @returns {string}
 */
export function extractWebQuery(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';

  const patterns = [
    /(?:search|find|lookup|look up)(?:\s+(?:on|in)\s+the\s+web)?\s+(?:(?:for|about)\s+)?(.+)/i,
    /(?:about|on)\s+(.+)/i
  ];

  for (const pattern of patterns) {
    const m = raw.match(pattern);
    if (m && m[1]) {
      return m[1].trim();
    }
  }

  return raw;
}

/**
 * Heuristic for fact-seeking questions that benefit from extra grounding.
 * @param {string} text
 * @returns {boolean}
 */
export function isFactualQuestion(text) {
  return /\b(capital|population|president|currency|distance|located|founded|born|when|where|who|what is|how many|year|date)\b/i.test(String(text || ''));
}

/**
 * Classify the user's request into a quality mode inspired by Claude's skill system.
 * @param {string} text
 * @returns {'debug'|'plan'|'verify'|'general'}
 */
export function detectTaskType(text) {
  const raw = String(text || '');

  if (/\b(debug|bug|fix|broken|failing|failure|issue|problem|error|why .* fail|root cause|diagnose)\b/i.test(raw)) {
    return 'debug';
  }

  if (/\b(plan|roadmap|strategy|checklist|step-by-step|steps|launch|organize|break down|workflow)\b/i.test(raw)) {
    return 'plan';
  }

  if (/\b(verify|review|check|validate|double-check|audit|prove|evidence)\b/i.test(raw)) {
    return 'verify';
  }

  return 'general';
}

/**
 * Suggest a smaller local model when downloads fail due to rate limits or device constraints.
 * @param {string} modelId
 * @param {{isRateLimit?: boolean, isStorage?: boolean, deviceMemory?: number}} [options]
 * @returns {string|null}
 */
export function recommendLocalModelFallback(modelId, options = {}) {
  const current = String(modelId || '');
  const { isRateLimit = false, isStorage = false, deviceMemory } = options;

  if (!current || current.includes('SmolLM2')) {
    return null;
  }

  if (isStorage || (typeof deviceMemory === 'number' && deviceMemory > 0 && deviceMemory < 4)) {
    return 'SmolLM2-360M-Instruct-q4f16_1-MLC';
  }

  if (current.includes('Phi')) {
    return isRateLimit ? 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC' : 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
  }

  if (current.includes('Llama')) {
    return 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';
  }

  if (current.includes('Qwen2.5-1.5B')) {
    return 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';
  }

  if (current.includes('Qwen')) {
    return 'SmolLM2-360M-Instruct-q4f16_1-MLC';
  }

  return 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';
}

function buildTaskModeGuidance(text) {
  const taskType = detectTaskType(text);

  if (taskType === 'debug') {
    return '\n[Mode: Debug]\n[Instruction: Use systematic debugging. Identify the root cause, separate known facts from assumptions, and propose the smallest next check.]';
  }

  if (taskType === 'plan') {
    return '\n[Mode: Plan]\n[Instruction: Break the answer into numbered steps, highlight dependencies, and end with the best first action.]';
  }

  if (taskType === 'verify') {
    return '\n[Mode: Verify]\n[Instruction: Separate evidence from assumptions, note any uncertainty clearly, and do not claim success without evidence.]';
  }

  return '';
}

/**
 * Wrap user text with lightweight reasoning scaffolding to improve small-model answers.
 * @param {string} userText
 * @param {string} [webContext]
 * @returns {string}
 */
export function buildEnhancedQuery(userText, webContext = '') {
  const raw = String(userText || '').slice(0, 16_000); // guard against enormous inputs
  if (!raw) return '';

  if (
    raw.length < 20 ||
    /^(hi|hello|hey|oi|olá)\b/i.test(raw.trim()) ||
    /^(System constraints:|You are AI Space Workflow Studio\.|\[WEB_CONTEXT\])/i.test(raw.trim())
  ) {
    return raw;
  }

  const contextBlock = webContext
    ? `\n\n[Web context available: ${webContext}]\n`
    : '';

  const factualGuard = isFactualQuestion(raw)
    ? '\n[Instruction: Answer only with verified facts from your training. If uncertain, say so.]'
    : '';

  const modeGuidance = buildTaskModeGuidance(raw);

  return `${raw}${contextBlock}${factualGuard}${modeGuidance}`.trim();
}

/**
 * Clean up common local-model artifacts before display.
 * @param {string} text
 * @returns {string}
 */
export function sanitizeModelOutput(text) {
  if (!text) return text;

  let output = String(text);

  output = output.replace(/\b(I am|I'm)\s+(Phi|GPT|ChatGPT|Gemini|Bard|Copilot|Claude|LLaMA|Llama|Mistral|Qwen|SmolLM|TinyLlama)\b/gi, 'I am AI Space');
  output = output.replace(/^As an AI language model,?\s*/i, '');
  output = output.replace(/^(Certainly!|Of course!|Sure!|Great question!|Absolutely!|Happy to help!)\s*/i, '');

  const sentences = output.split(/(?<=[.!?])\s+/).filter(Boolean);
  const seen = new Set();
  const deduped = sentences.filter((sentence) => {
    const key = sentence.trim().toLowerCase().slice(0, 60);
    if (!key) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  output = deduped.join(' ').replace(/\s+/g, ' ').trim();
  return output;
}

/**
 * Detect if a runtime script looks like legacy JS-style code rather than the DSL.
 * @param {string} script
 * @returns {boolean}
 */
export function looksLikeLegacyRuntimeScript(script) {
  const s = String(script || '');
  return /tools\.|\bawait\b|\bconst\b|;/.test(s);
}

/**
 * Parse a human-readable model size label into bytes.
 * @param {string} sizeLabel - e.g. "200 MB", "2.2 GB"
 * @returns {number} bytes, or 0 if unparseable
 */
export function parseModelSizeToBytes(sizeLabel) {
  if (!sizeLabel || typeof sizeLabel !== 'string') return 0;
  const match = sizeLabel.trim().match(/^([0-9]+(?:\.[0-9]+)?)\s*(MB|GB)$/i);
  if (!match) return 0;
  const value = Number(match[1]);
  const unit = match[2].toUpperCase();
  const base = 1024 * 1024;
  return unit === 'GB' ? value * base * 1024 : value * base;
}
