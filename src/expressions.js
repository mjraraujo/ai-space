/**
 * Expression System — Emotional states, micro-expressions, and reactive animations
 * for the AI avatar.
 *
 * Maps AI response sentiment and conversation context to avatar facial expressions
 * and body language. Supports:
 *   - 12 primary emotional states
 *   - Micro-expression overlays (blink, twitch, glance)
 *   - Expression blending (happy + surprised = delighted)
 *   - Reactive expressions based on conversation content
 *   - Ambient idle expressions (breathing, subtle sway)
 *   - Intensity scaling (0-1)
 */

// ─── Expression Definitions ──────────────────────────────────────────────────

/**
 * @typedef {Object} ExpressionParams
 * @property {number} eyeOpenL - Left eye openness (0=closed, 1=normal, 1.5=wide)
 * @property {number} eyeOpenR - Right eye openness
 * @property {number} eyebrowL - Left eyebrow (-1=frown, 0=neutral, 1=raised)
 * @property {number} eyebrowR - Right eyebrow
 * @property {number} mouthOpen - Mouth openness (0-1)
 * @property {number} mouthSmile - Smile intensity (-1=frown, 0=neutral, 1=smile)
 * @property {number} mouthWidth - Mouth width (0=narrow, 1=wide)
 * @property {number} pupilX - Pupil X offset (-1 to 1)
 * @property {number} pupilY - Pupil Y offset (-1 to 1)
 * @property {number} pupilSize - Pupil scale (0.5-1.5)
 * @property {number} headTiltX - Head tilt X (-1 to 1)
 * @property {number} headTiltY - Head tilt Y (-1 to 1)
 * @property {number} headTiltZ - Head rotation Z (-1 to 1)
 * @property {number} blush - Blush intensity (0-1)
 * @property {number} glow - Glow intensity (0-2)
 * @property {number} breathRate - Breathing speed multiplier
 */

/** Neutral expression — all parameters at rest. */
export const NEUTRAL = {
  eyeOpenL: 1, eyeOpenR: 1,
  eyebrowL: 0, eyebrowR: 0,
  mouthOpen: 0, mouthSmile: 0, mouthWidth: 0.5,
  pupilX: 0, pupilY: 0, pupilSize: 1,
  headTiltX: 0, headTiltY: 0, headTiltZ: 0,
  blush: 0, glow: 0.3, breathRate: 1
};

/** All expression templates. */
export const EXPRESSIONS = {
  neutral: { ...NEUTRAL },

  happy: {
    ...NEUTRAL,
    eyeOpenL: 0.9, eyeOpenR: 0.9,
    eyebrowL: 0.2, eyebrowR: 0.2,
    mouthSmile: 0.8, mouthWidth: 0.7,
    glow: 0.6, breathRate: 1.1
  },

  sad: {
    ...NEUTRAL,
    eyeOpenL: 0.7, eyeOpenR: 0.7,
    eyebrowL: -0.6, eyebrowR: -0.6,
    mouthSmile: -0.5, mouthWidth: 0.4,
    pupilY: 0.2,
    glow: 0.15, breathRate: 0.8
  },

  surprised: {
    ...NEUTRAL,
    eyeOpenL: 1.4, eyeOpenR: 1.4,
    eyebrowL: 0.9, eyebrowR: 0.9,
    mouthOpen: 0.6, mouthWidth: 0.6,
    pupilSize: 1.3,
    glow: 0.7
  },

  thinking: {
    ...NEUTRAL,
    eyeOpenL: 0.8, eyeOpenR: 0.9,
    eyebrowL: 0.3, eyebrowR: -0.1,
    pupilX: 0.3, pupilY: -0.2,
    headTiltZ: 0.1,
    glow: 0.5, breathRate: 0.9
  },

  confused: {
    ...NEUTRAL,
    eyeOpenL: 1.1, eyeOpenR: 0.8,
    eyebrowL: 0.4, eyebrowR: -0.3,
    mouthSmile: -0.1, mouthWidth: 0.4,
    headTiltZ: -0.15,
    pupilX: -0.2,
    glow: 0.3
  },

  excited: {
    ...NEUTRAL,
    eyeOpenL: 1.3, eyeOpenR: 1.3,
    eyebrowL: 0.6, eyebrowR: 0.6,
    mouthOpen: 0.3, mouthSmile: 1, mouthWidth: 0.8,
    pupilSize: 1.2,
    glow: 1, breathRate: 1.3
  },

  talking: {
    ...NEUTRAL,
    mouthOpen: 0.4, mouthWidth: 0.6,
    glow: 0.5, breathRate: 1.1
  },

  listening: {
    ...NEUTRAL,
    eyeOpenL: 1.05, eyeOpenR: 1.05,
    eyebrowL: 0.15, eyebrowR: 0.15,
    headTiltZ: 0.05,
    glow: 0.4
  },

  sleeping: {
    ...NEUTRAL,
    eyeOpenL: 0, eyeOpenR: 0,
    eyebrowL: -0.2, eyebrowR: -0.2,
    mouthSmile: 0.1,
    glow: 0.1, breathRate: 0.5
  },

  angry: {
    ...NEUTRAL,
    eyeOpenL: 0.8, eyeOpenR: 0.8,
    eyebrowL: -0.8, eyebrowR: -0.8,
    mouthSmile: -0.6, mouthWidth: 0.7,
    pupilSize: 0.8,
    glow: 0.8, breathRate: 1.4
  },

  focused: {
    ...NEUTRAL,
    eyeOpenL: 0.95, eyeOpenR: 0.95,
    eyebrowL: -0.2, eyebrowR: -0.2,
    pupilSize: 0.9,
    glow: 0.6, breathRate: 0.85
  },

  empathetic: {
    ...NEUTRAL,
    eyeOpenL: 0.9, eyeOpenR: 0.9,
    eyebrowL: 0.3, eyebrowR: 0.3,
    mouthSmile: 0.3, mouthWidth: 0.55,
    headTiltZ: -0.08,
    blush: 0.2,
    glow: 0.45
  }
};

/** Expression names. */
export const EXPRESSION_NAMES = Object.keys(EXPRESSIONS);

// ─── Expression Blending ─────────────────────────────────────────────────────

/**
 * Blend two expression parameter sets.
 * @param {ExpressionParams} a
 * @param {ExpressionParams} b
 * @param {number} t - Blend factor (0=a, 1=b)
 * @returns {ExpressionParams}
 */
export function blendExpressions(a, b, t) {
  const result = {};
  const clampT = Math.max(0, Math.min(1, t));
  for (const key of Object.keys(NEUTRAL)) {
    const va = typeof a[key] === 'number' ? a[key] : NEUTRAL[key];
    const vb = typeof b[key] === 'number' ? b[key] : NEUTRAL[key];
    result[key] = va + (vb - va) * clampT;
  }
  return result;
}

/**
 * Mix multiple expressions with weights.
 * @param {Array<{expression: ExpressionParams, weight: number}>} layers
 * @returns {ExpressionParams}
 */
export function mixExpressions(layers) {
  if (!layers || layers.length === 0) return { ...NEUTRAL };
  if (layers.length === 1) {
    return blendExpressions(NEUTRAL, layers[0].expression, layers[0].weight);
  }

  const result = {};
  let totalWeight = 0;

  for (const key of Object.keys(NEUTRAL)) {
    result[key] = 0;
  }

  for (const layer of layers) {
    const w = Math.max(0, Math.min(1, layer.weight));
    totalWeight += w;
    for (const key of Object.keys(NEUTRAL)) {
      const val = typeof layer.expression[key] === 'number' ? layer.expression[key] : NEUTRAL[key];
      result[key] += val * w;
    }
  }

  if (totalWeight > 0) {
    for (const key of Object.keys(NEUTRAL)) {
      result[key] /= totalWeight;
    }
  }

  return result;
}

/**
 * Scale expression intensity (0 = neutral, 1 = full expression).
 * @param {ExpressionParams} expression
 * @param {number} intensity
 * @returns {ExpressionParams}
 */
export function scaleExpression(expression, intensity) {
  return blendExpressions(NEUTRAL, expression, intensity);
}

// ─── Micro-expressions ───────────────────────────────────────────────────────

/**
 * @typedef {Object} MicroExpression
 * @property {string} type
 * @property {number} duration - Duration in seconds
 * @property {number} intensity - 0-1
 * @property {ExpressionParams} params - Expression override for this micro-expression
 */

/** Built-in micro-expression templates. */
export const MICRO_EXPRESSIONS = {
  blink: {
    type: 'blink',
    duration: 0.15,
    intensity: 1,
    params: { eyeOpenL: 0, eyeOpenR: 0 }
  },
  blinkLeft: {
    type: 'blinkLeft',
    duration: 0.12,
    intensity: 1,
    params: { eyeOpenL: 0 }
  },
  blinkRight: {
    type: 'blinkRight',
    duration: 0.12,
    intensity: 1,
    params: { eyeOpenR: 0 }
  },
  glanceLeft: {
    type: 'glanceLeft',
    duration: 0.4,
    intensity: 0.7,
    params: { pupilX: -0.5, headTiltZ: -0.05 }
  },
  glanceRight: {
    type: 'glanceRight',
    duration: 0.4,
    intensity: 0.7,
    params: { pupilX: 0.5, headTiltZ: 0.05 }
  },
  squint: {
    type: 'squint',
    duration: 0.5,
    intensity: 0.5,
    params: { eyeOpenL: 0.6, eyeOpenR: 0.6, eyebrowL: -0.3, eyebrowR: -0.3 }
  },
  widenEyes: {
    type: 'widenEyes',
    duration: 0.3,
    intensity: 0.6,
    params: { eyeOpenL: 1.3, eyeOpenR: 1.3, eyebrowL: 0.5, eyebrowR: 0.5 }
  },
  nod: {
    type: 'nod',
    duration: 0.5,
    intensity: 0.4,
    params: { headTiltX: -0.2 }
  },
  headShake: {
    type: 'headShake',
    duration: 0.6,
    intensity: 0.3,
    params: { headTiltZ: 0.2 }
  }
};

// ─── Expression Controller ──────────────────────────────────────────────────

/**
 * Manages the avatar's current expression state with smooth transitions,
 * micro-expression scheduling, and ambient idle animations.
 */
export class ExpressionController {
  /**
   * @param {Object} [options]
   * @param {number} [options.transitionSpeed=3] - Expression transition speed
   * @param {number} [options.blinkInterval=4] - Average blink interval (seconds)
   * @param {boolean} [options.autoBlink=true]
   */
  constructor(options = {}) {
    /** Current expression parameters */
    this.current = { ...NEUTRAL };
    /** Target expression */
    this._target = { ...NEUTRAL };
    /** Active expression name */
    this._expressionName = 'neutral';
    /** Transition speed (higher = faster) */
    this._transitionSpeed = options.transitionSpeed ?? 3;

    // Micro-expressions
    /** @type {Array<{micro: MicroExpression, elapsed: number, active: boolean}>} */
    this._activeMicros = [];
    this._nextBlinkIn = 0;
    this._blinkInterval = options.blinkInterval ?? 4;
    this._autoBlink = options.autoBlink !== false;

    // Ambient
    this._idleTime = 0;
    this._breathPhase = 0;

    // Lip sync
    this._lipSyncValue = 0;
    this._lipSyncTarget = 0;

    this._scheduleNextBlink();
  }

  /**
   * Set the target expression.
   * @param {string} name - Expression name from EXPRESSIONS
   * @param {number} [intensity=1] - Intensity 0-1
   */
  setExpression(name, intensity = 1) {
    const expr = EXPRESSIONS[name];
    if (!expr) return;
    this._expressionName = name;
    this._target = scaleExpression(expr, intensity);
  }

  /**
   * Get the current expression name.
   * @returns {string}
   */
  getExpression() {
    return this._expressionName;
  }

  /**
   * Trigger a micro-expression overlay.
   * @param {string} microName - Micro-expression name
   */
  triggerMicro(microName) {
    const template = MICRO_EXPRESSIONS[microName];
    if (!template) return;
    this._activeMicros.push({
      micro: { ...template },
      elapsed: 0,
      active: true
    });
  }

  /**
   * Set lip sync value (for talking animation).
   * @param {number} value - 0 to 1
   */
  setLipSync(value) {
    this._lipSyncTarget = Math.max(0, Math.min(1, value));
  }

  /**
   * Update expression state.
   * @param {number} dt - Delta time in seconds
   * @returns {ExpressionParams} Current expression parameters
   */
  update(dt) {
    this._idleTime += dt;
    this._breathPhase += dt;

    // Smooth transition to target
    const speed = this._transitionSpeed * dt;
    for (const key of Object.keys(NEUTRAL)) {
      const target = typeof this._target[key] === 'number' ? this._target[key] : NEUTRAL[key];
      const current = typeof this.current[key] === 'number' ? this.current[key] : NEUTRAL[key];
      this.current[key] = current + (target - current) * Math.min(1, speed);
    }

    // Lip sync smoothing
    this._lipSyncValue += (this._lipSyncTarget - this._lipSyncValue) * Math.min(1, dt * 12);
    if (this._lipSyncValue > 0.01) {
      this.current.mouthOpen = Math.max(this.current.mouthOpen, this._lipSyncValue * 0.6);
      this.current.mouthWidth = Math.max(this.current.mouthWidth, 0.5 + this._lipSyncValue * 0.2);
    }

    // Auto-blink
    if (this._autoBlink) {
      this._nextBlinkIn -= dt;
      if (this._nextBlinkIn <= 0) {
        this.triggerMicro('blink');
        this._scheduleNextBlink();
      }
    }

    // Process micro-expressions
    this._processMicros(dt);

    // Ambient breathing
    const breathOffset = Math.sin(this._breathPhase * Math.PI * 2 * (this.current.breathRate || 1) / 4) * 0.02;
    this.current.headTiltX = (this.current.headTiltX || 0) + breathOffset;

    // Subtle idle sway
    if (this._expressionName === 'neutral' || this._expressionName === 'listening') {
      const sway = Math.sin(this._idleTime * 0.3) * 0.01;
      this.current.headTiltZ = (this.current.headTiltZ || 0) + sway;
    }

    return { ...this.current };
  }

  /** @private */
  _processMicros(dt) {
    for (let i = this._activeMicros.length - 1; i >= 0; i--) {
      const entry = this._activeMicros[i];
      entry.elapsed += dt;

      if (entry.elapsed >= entry.micro.duration) {
        this._activeMicros.splice(i, 1);
        continue;
      }

      // Calculate micro-expression intensity (bell curve)
      const progress = entry.elapsed / entry.micro.duration;
      const microIntensity = Math.sin(progress * Math.PI) * entry.micro.intensity;

      // Apply micro-expression params
      for (const [key, value] of Object.entries(entry.micro.params)) {
        if (typeof this.current[key] === 'number') {
          const neutral = NEUTRAL[key] || 0;
          this.current[key] = this.current[key] + (value - neutral) * microIntensity;
        }
      }
    }
  }

  /** @private */
  _scheduleNextBlink() {
    // Randomize blink interval with some variance
    this._nextBlinkIn = this._blinkInterval * (0.5 + Math.random());
  }

  /**
   * Reset to neutral.
   */
  reset() {
    this.current = { ...NEUTRAL };
    this._target = { ...NEUTRAL };
    this._expressionName = 'neutral';
    this._activeMicros = [];
    this._idleTime = 0;
    this._breathPhase = 0;
    this._lipSyncValue = 0;
    this._lipSyncTarget = 0;
  }
}

// ─── Sentiment Analyzer ──────────────────────────────────────────────────────

/**
 * Simple keyword-based sentiment detection to map AI responses to expressions.
 * Not a full NLP pipeline — just enough for reactive avatar expressions.
 */

const SENTIMENT_PATTERNS = [
  { expression: 'happy', keywords: ['great', 'awesome', 'wonderful', 'excellent', 'perfect', 'love', 'glad', 'happy', 'fantastic', '😊', '😃', '🎉'] },
  { expression: 'sad', keywords: ['sorry', 'unfortunately', 'sad', 'regret', 'apologize', 'can\'t', 'unable', 'impossible', '😢', '😞'] },
  { expression: 'surprised', keywords: ['wow', 'amazing', 'incredible', 'unexpected', 'fascinating', '!', '😮', '🤯'] },
  { expression: 'thinking', keywords: ['let me think', 'considering', 'hmm', 'interesting question', 'complex', 'analyzing'] },
  { expression: 'confused', keywords: ['unclear', 'ambiguous', 'not sure', 'confusing', 'mixed signals', '🤔'] },
  { expression: 'excited', keywords: ['exciting', 'breakthrough', 'revolutionary', 'game-changing', 'incredible', '🚀', '⚡'] },
  { expression: 'empathetic', keywords: ['understand', 'feel', 'difficult', 'tough', 'challenging', 'hang in there', 'take care'] },
  { expression: 'focused', keywords: ['analyzing', 'processing', 'computing', 'calculating', 'working on'] },
  { expression: 'angry', keywords: ['error', 'bug', 'broken', 'failed', 'crash', 'critical'] }
];

/**
 * Detect expression from text content.
 * @param {string} text
 * @returns {{ expression: string, confidence: number }}
 */
export function detectSentiment(text) {
  if (!text || typeof text !== 'string') {
    return { expression: 'neutral', confidence: 0 };
  }

  const lower = text.toLowerCase();
  let bestMatch = { expression: 'neutral', confidence: 0 };

  for (const pattern of SENTIMENT_PATTERNS) {
    let hits = 0;
    for (const kw of pattern.keywords) {
      if (lower.includes(kw.toLowerCase())) hits++;
    }
    const confidence = Math.min(1, hits / 2);
    if (confidence > bestMatch.confidence) {
      bestMatch = { expression: pattern.expression, confidence };
    }
  }

  return bestMatch;
}
