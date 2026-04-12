/**
 * AI Avatar — The complete avatar personality and visual identity system.
 *
 * The avatar represents the AI assistant as a visual entity:
 *   - Customizable appearance (face shape, color scheme, style)
 *   - Animated expressions driven by conversation context
 *   - Voice personality settings
 *   - Presence states (idle, listening, talking, thinking, sleeping)
 *   - Canvas-based 2D rendering with glow/particle effects
 *   - Persistence of avatar configuration
 *
 * The avatar is the visual "body" of the AI — it breathes, blinks, reacts to
 * what's being said, and provides a more human-like interaction experience.
 */

import {
  ExpressionController,
  EXPRESSIONS,
  EXPRESSION_NAMES,
  detectSentiment,
  NEUTRAL
} from './expressions.js';

// ─── Avatar Appearance Definitions ───────────────────────────────────────────

/**
 * @typedef {Object} AvatarAppearance
 * @property {string} faceShape - 'circle'|'rounded'|'square'|'oval'
 * @property {string} primaryColor - Main color hex
 * @property {string} secondaryColor - Accent color hex
 * @property {string} eyeColor - Eye color hex
 * @property {string} glowColor - Glow effect color hex
 * @property {string} style - 'minimal'|'geometric'|'organic'|'holographic'|'pixel'
 * @property {number} size - Base size multiplier (0.5-2)
 * @property {boolean} hasParticles - Whether to show particle effects
 * @property {string} name - Avatar name
 */

export const FACE_SHAPES = ['circle', 'rounded', 'square', 'oval'];
export const STYLES = ['minimal', 'geometric', 'organic', 'holographic', 'pixel'];

export const DEFAULT_APPEARANCE = {
  faceShape: 'circle',
  primaryColor: '#7c5cfc',
  secondaryColor: '#3b8ef0',
  eyeColor: '#ffffff',
  glowColor: '#7c5cfc',
  style: 'minimal',
  size: 1,
  hasParticles: true,
  name: 'Nova'
};

/** Preset avatar appearances. */
export const AVATAR_PRESETS = {
  nova: {
    ...DEFAULT_APPEARANCE,
    name: 'Nova',
    faceShape: 'circle',
    primaryColor: '#7c5cfc',
    secondaryColor: '#3b8ef0',
    glowColor: '#7c5cfc',
    style: 'minimal'
  },
  luna: {
    ...DEFAULT_APPEARANCE,
    name: 'Luna',
    faceShape: 'oval',
    primaryColor: '#00bcd4',
    secondaryColor: '#0097a7',
    glowColor: '#00bcd4',
    style: 'organic'
  },
  sol: {
    ...DEFAULT_APPEARANCE,
    name: 'Sol',
    faceShape: 'rounded',
    primaryColor: '#ff6b35',
    secondaryColor: '#ff9500',
    glowColor: '#ff9500',
    style: 'geometric'
  },
  sage: {
    ...DEFAULT_APPEARANCE,
    name: 'Sage',
    faceShape: 'rounded',
    primaryColor: '#4caf50',
    secondaryColor: '#66bb6a',
    glowColor: '#4caf50',
    style: 'organic'
  },
  echo: {
    ...DEFAULT_APPEARANCE,
    name: 'Echo',
    faceShape: 'circle',
    primaryColor: '#448aff',
    secondaryColor: '#2962ff',
    glowColor: '#448aff',
    style: 'holographic'
  },
  pixel: {
    ...DEFAULT_APPEARANCE,
    name: 'Pixel',
    faceShape: 'square',
    primaryColor: '#e040fb',
    secondaryColor: '#aa00ff',
    glowColor: '#e040fb',
    style: 'pixel'
  }
};

export const PRESET_NAMES = Object.keys(AVATAR_PRESETS);

// ─── Voice Personality ───────────────────────────────────────────────────────

/**
 * @typedef {Object} VoicePersonality
 * @property {number} pitch - Voice pitch multiplier (0.5-2)
 * @property {number} rate - Speaking rate multiplier (0.5-2)
 * @property {number} volume - Volume (0-1)
 * @property {string} voicePreference - Preferred voice name or 'auto'
 * @property {string} emotionStyle - 'neutral'|'expressive'|'dramatic'
 */

export const DEFAULT_VOICE_PERSONALITY = {
  pitch: 1,
  rate: 1,
  volume: 0.9,
  voicePreference: 'auto',
  emotionStyle: 'expressive'
};

// ─── Avatar State ────────────────────────────────────────────────────────────

/**
 * @typedef {'idle'|'listening'|'talking'|'thinking'|'sleeping'|'excited'|'greeting'} AvatarState
 */

const AVATAR_STATES = ['idle', 'listening', 'talking', 'thinking', 'sleeping', 'excited', 'greeting'];

// State → expression mapping
const STATE_EXPRESSION_MAP = {
  idle: 'neutral',
  listening: 'listening',
  talking: 'talking',
  thinking: 'thinking',
  sleeping: 'sleeping',
  excited: 'excited',
  greeting: 'happy'
};

// ─── Avatar ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'ai-space-avatar';

export class Avatar {
  /**
   * @param {Object} [options]
   * @param {AvatarAppearance} [options.appearance]
   * @param {VoicePersonality} [options.voice]
   */
  constructor(options = {}) {
    /** @type {AvatarAppearance} */
    this.appearance = { ...DEFAULT_APPEARANCE, ...(options.appearance || {}) };
    /** @type {VoicePersonality} */
    this.voicePersonality = { ...DEFAULT_VOICE_PERSONALITY, ...(options.voice || {}) };
    /** @type {AvatarState} */
    this.state = 'idle';
    /** @type {ExpressionController} */
    this.expressions = new ExpressionController();
    /** @type {string} */
    this.mood = 'neutral'; // Overall mood tracking
    this._moodHistory = [];
    this._stateTime = 0;
    this._greetingDone = false;
  }

  // ─── State Management ──────────────────────────────────────────────────

  /**
   * Transition to a new state.
   * @param {AvatarState} newState
   */
  setState(newState) {
    if (!AVATAR_STATES.includes(newState)) return;
    if (this.state === newState) return;

    this.state = newState;
    this._stateTime = 0;

    const expr = STATE_EXPRESSION_MAP[newState] || 'neutral';
    this.expressions.setExpression(expr);
  }

  /**
   * React to a piece of text (from AI response).
   * Updates expression based on sentiment analysis.
   * @param {string} text
   */
  reactToText(text) {
    const sentiment = detectSentiment(text);
    if (sentiment.confidence > 0.3) {
      this.expressions.setExpression(sentiment.expression, sentiment.confidence);
      this._trackMood(sentiment.expression);
    }
  }

  /**
   * Set lip sync value for talking animation.
   * @param {number} value - 0 to 1
   */
  setLipSync(value) {
    this.expressions.setLipSync(value);
  }

  /**
   * Trigger a reaction (micro-expression).
   * @param {string} type - 'blink', 'nod', 'glanceLeft', etc.
   */
  triggerReaction(type) {
    this.expressions.triggerMicro(type);
  }

  // ─── Appearance ────────────────────────────────────────────────────────

  /**
   * Apply a preset appearance.
   * @param {string} presetName
   */
  applyPreset(presetName) {
    const preset = AVATAR_PRESETS[presetName];
    if (!preset) return;
    this.appearance = { ...preset };
  }

  /**
   * Update appearance properties.
   * @param {Partial<AvatarAppearance>} updates
   */
  updateAppearance(updates) {
    this.appearance = { ...this.appearance, ...updates };
  }

  /**
   * Update voice personality.
   * @param {Partial<VoicePersonality>} updates
   */
  updateVoice(updates) {
    this.voicePersonality = { ...this.voicePersonality, ...updates };
  }

  // ─── Update ────────────────────────────────────────────────────────────

  /**
   * Update avatar animation state.
   * @param {number} dt - Delta time in seconds
   * @returns {ExpressionParams} Current expression parameters
   */
  update(dt) {
    this._stateTime += dt;

    // Auto-transition from greeting to idle
    if (this.state === 'greeting' && this._stateTime > 2) {
      this.setState('idle');
    }

    // Auto-transition from excited to idle
    if (this.state === 'excited' && this._stateTime > 3) {
      this.setState('idle');
    }

    return this.expressions.update(dt);
  }

  // ─── Rendering ─────────────────────────────────────────────────────────

  /**
   * Render the avatar to a canvas context.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} cx - Center X
   * @param {number} cy - Center Y
   * @param {number} baseSize - Base radius
   */
  render(ctx, cx, cy, baseSize) {
    const expr = this.expressions.current;
    const app = this.appearance;
    const size = baseSize * app.size;

    ctx.save();

    // Glow effect
    if (expr.glow > 0) {
      const gradient = ctx.createRadialGradient(cx, cy, size * 0.5, cx, cy, size * 1.8);
      gradient.addColorStop(0, this._withAlpha(app.glowColor, expr.glow * 0.15));
      gradient.addColorStop(1, this._withAlpha(app.glowColor, 0));
      ctx.fillStyle = gradient;
      ctx.fillRect(cx - size * 2, cy - size * 2, size * 4, size * 4);
    }

    // Head tilt
    ctx.translate(cx, cy);
    ctx.rotate((expr.headTiltZ || 0) * 0.3);
    ctx.translate(0, (expr.headTiltX || 0) * size * 0.1);

    // Face
    this._renderFace(ctx, 0, 0, size, app, expr);

    // Eyes
    this._renderEyes(ctx, 0, -size * 0.1, size, app, expr);

    // Mouth
    this._renderMouth(ctx, 0, size * 0.25, size, app, expr);

    // Blush
    if (expr.blush > 0) {
      this._renderBlush(ctx, 0, size * 0.1, size, expr.blush);
    }

    ctx.restore();
  }

  /** @private */
  _renderFace(ctx, x, y, size, app, expr) {
    ctx.beginPath();

    switch (app.faceShape) {
      case 'rounded':
        this._roundedRect(ctx, x - size, y - size, size * 2, size * 2, size * 0.4);
        break;
      case 'square':
        this._roundedRect(ctx, x - size, y - size, size * 2, size * 2, size * 0.15);
        break;
      case 'oval':
        ctx.ellipse(x, y, size * 0.85, size, 0, 0, Math.PI * 2);
        break;
      case 'circle':
      default:
        ctx.arc(x, y, size, 0, Math.PI * 2);
        break;
    }

    // Face fill with gradient
    const gradient = ctx.createRadialGradient(x, y - size * 0.3, 0, x, y, size);
    gradient.addColorStop(0, this._lighten(app.primaryColor, 0.2));
    gradient.addColorStop(1, app.primaryColor);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Subtle border
    ctx.strokeStyle = app.secondaryColor;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.3;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** @private */
  _renderEyes(ctx, x, y, size, app, expr) {
    const eyeSpacing = size * 0.35;
    const eyeSize = size * 0.12;

    // Left eye
    this._renderSingleEye(ctx, x - eyeSpacing, y, eyeSize, app, expr.eyeOpenL, expr.pupilX, expr.pupilY, expr.pupilSize, expr.eyebrowL);

    // Right eye
    this._renderSingleEye(ctx, x + eyeSpacing, y, eyeSize, app, expr.eyeOpenR, expr.pupilX, expr.pupilY, expr.pupilSize, expr.eyebrowR);
  }

  /** @private */
  _renderSingleEye(ctx, x, y, size, app, openness, pupilX, pupilY, pupilSize, eyebrow) {
    // Eye white
    ctx.save();
    ctx.beginPath();
    const height = size * Math.max(0, openness);
    ctx.ellipse(x, y, size, height, 0, 0, Math.PI * 2);
    ctx.fillStyle = app.eyeColor;
    ctx.globalAlpha = 0.9;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Pupil (if eye is open enough)
    if (openness > 0.2) {
      ctx.beginPath();
      const ps = size * 0.55 * (pupilSize || 1);
      ctx.arc(
        x + pupilX * size * 0.3,
        y + pupilY * size * 0.3,
        ps,
        0, Math.PI * 2
      );
      ctx.fillStyle = '#1a1a2e';
      ctx.fill();

      // Eye highlight
      ctx.beginPath();
      ctx.arc(
        x + pupilX * size * 0.3 + ps * 0.3,
        y + pupilY * size * 0.3 - ps * 0.3,
        ps * 0.25,
        0, Math.PI * 2
      );
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fill();
    }

    // Eyebrow
    if (typeof eyebrow === 'number' && Math.abs(eyebrow) > 0.05) {
      ctx.beginPath();
      const browY = y - size * 1.8 - eyebrow * size * 0.5;
      ctx.moveTo(x - size * 1.2, browY + eyebrow * size * 0.2);
      ctx.quadraticCurveTo(x, browY, x + size * 1.2, browY + eyebrow * size * 0.2);
      ctx.strokeStyle = this._darken(app.primaryColor, 0.3);
      ctx.lineWidth = Math.max(1, size * 0.15);
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    ctx.restore();
  }

  /** @private */
  _renderMouth(ctx, x, y, size, app, expr) {
    ctx.save();
    ctx.beginPath();

    const mouthWidth = size * 0.3 * (expr.mouthWidth || 0.5);
    const mouthOpen = expr.mouthOpen || 0;
    const smile = expr.mouthSmile || 0;

    if (mouthOpen > 0.1) {
      // Open mouth
      ctx.ellipse(x, y, mouthWidth, mouthOpen * size * 0.15, 0, 0, Math.PI * 2);
      ctx.fillStyle = this._darken(app.primaryColor, 0.5);
      ctx.fill();
    } else {
      // Closed mouth — line with smile curve
      ctx.moveTo(x - mouthWidth, y);
      ctx.quadraticCurveTo(x, y + smile * size * 0.15, x + mouthWidth, y);
      ctx.strokeStyle = this._darken(app.primaryColor, 0.4);
      ctx.lineWidth = Math.max(1, size * 0.05);
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    ctx.restore();
  }

  /** @private */
  _renderBlush(ctx, x, y, size, intensity) {
    ctx.save();
    ctx.globalAlpha = intensity * 0.3;
    ctx.beginPath();
    ctx.ellipse(x - size * 0.4, y, size * 0.15, size * 0.1, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#ff6b8a';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + size * 0.4, y, size * 0.15, size * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ─── Utility ───────────────────────────────────────────────────────────

  /** @private */
  _roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /** @private */
  _withAlpha(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  /** @private */
  _lighten(hex, amount) {
    const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + Math.round(255 * amount));
    const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + Math.round(255 * amount));
    const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + Math.round(255 * amount));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  /** @private */
  _darken(hex, amount) {
    const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - Math.round(255 * amount));
    const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - Math.round(255 * amount));
    const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - Math.round(255 * amount));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  /** @private */
  _trackMood(expression) {
    this._moodHistory.push({ expression, timestamp: Date.now() });
    if (this._moodHistory.length > 20) {
      this._moodHistory = this._moodHistory.slice(-20);
    }
    // Dominant mood in recent history
    const counts = {};
    for (const m of this._moodHistory) {
      counts[m.expression] = (counts[m.expression] || 0) + 1;
    }
    let dominant = 'neutral';
    let maxCount = 0;
    for (const [expr, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        dominant = expr;
      }
    }
    this.mood = dominant;
  }

  // ─── Serialization ─────────────────────────────────────────────────────

  /**
   * Serialize avatar config for persistence.
   * @returns {Object}
   */
  serialize() {
    return {
      appearance: { ...this.appearance },
      voicePersonality: { ...this.voicePersonality }
    };
  }

  /**
   * Load avatar config from serialized data.
   * @param {Object} data
   */
  deserialize(data) {
    if (data?.appearance) {
      this.appearance = { ...DEFAULT_APPEARANCE, ...data.appearance };
    }
    if (data?.voicePersonality) {
      this.voicePersonality = { ...DEFAULT_VOICE_PERSONALITY, ...data.voicePersonality };
    }
  }

  /**
   * Save avatar to localStorage.
   */
  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.serialize()));
    } catch {
      // localStorage not available
    }
  }

  /**
   * Load avatar from localStorage.
   * @returns {boolean} true if loaded successfully
   */
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      this.deserialize(JSON.parse(raw));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get avatar display info.
   * @returns {{ name: string, state: AvatarState, mood: string, expression: string }}
   */
  getInfo() {
    return {
      name: this.appearance.name,
      state: this.state,
      mood: this.mood,
      expression: this.expressions.getExpression()
    };
  }
}
