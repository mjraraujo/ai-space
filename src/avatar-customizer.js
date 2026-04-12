/**
 * Avatar Customizer — Full avatar creation and editing widget.
 *
 * Provides a programmatic interface for the avatar builder:
 *   - Face shape selection
 *   - Color customization (primary, secondary, eye, glow)
 *   - Style selection (minimal, geometric, organic, holographic, pixel)
 *   - Name editing
 *   - Voice personality configuration
 *   - Live preview rendering
 *   - Export/import avatar configurations
 *   - Randomize for quick avatar generation
 */

import { Avatar, AVATAR_PRESETS, PRESET_NAMES, FACE_SHAPES, STYLES, DEFAULT_APPEARANCE } from './avatar.js';
import { VOICE_STYLES, VOICE_STYLE_IDS } from './avatar-voice.js';
import { getAvailableStyles } from './avatar-renderer.js';

// ─── Color Palette ───────────────────────────────────────────────────────────

/** Curated color palette for avatar customization. */
export const AVATAR_COLORS = [
  '#7c5cfc', '#3b8ef0', '#00bcd4', '#4caf50', '#66bb6a',
  '#ff6b35', '#ff9500', '#e040fb', '#aa00ff', '#448aff',
  '#2962ff', '#ff5252', '#ff1744', '#f50057', '#d500f9',
  '#651fff', '#6200ea', '#304ffe', '#00b8d4', '#00bfa5',
  '#00c853', '#64dd17', '#aeea00', '#ffd600', '#ffab00',
  '#ff6d00', '#dd2c00', '#3e2723', '#455a64', '#546e7a'
];

/** Eye colors. */
export const EYE_COLORS = [
  '#ffffff', '#e8e8ff', '#ffe8e8', '#e8ffe8', '#e8f4ff',
  '#fff0e0', '#f0e0ff', '#e0fff0'
];

// ─── Customizer State ────────────────────────────────────────────────────────

/**
 * @typedef {Object} CustomizerConfig
 * @property {string} name
 * @property {string} faceShape
 * @property {string} style
 * @property {string} primaryColor
 * @property {string} secondaryColor
 * @property {string} eyeColor
 * @property {string} glowColor
 * @property {number} size
 * @property {boolean} hasParticles
 * @property {string} voiceStyle
 * @property {number} voicePitch
 * @property {number} voiceRate
 */

// ─── Avatar Customizer ──────────────────────────────────────────────────────

export class AvatarCustomizer {
  /**
   * @param {Avatar} avatar - The avatar instance to customize
   * @param {Object} [options]
   */
  constructor(avatar, options = {}) {
    /** @type {Avatar} */
    this.avatar = avatar;
    this.onChange = options.onChange || null;
    this._history = [];
    this._historyIndex = -1;
    this._maxHistory = 30;
  }

  // ─── Getters ─────────────────────────────────────────────────────────

  /**
   * Get full current config.
   * @returns {CustomizerConfig}
   */
  getConfig() {
    return {
      name: this.avatar.appearance.name,
      faceShape: this.avatar.appearance.faceShape,
      style: this.avatar.appearance.style,
      primaryColor: this.avatar.appearance.primaryColor,
      secondaryColor: this.avatar.appearance.secondaryColor,
      eyeColor: this.avatar.appearance.eyeColor,
      glowColor: this.avatar.appearance.glowColor,
      size: this.avatar.appearance.size,
      hasParticles: this.avatar.appearance.hasParticles,
      voiceStyle: this.avatar.voicePersonality.emotionStyle || 'expressive',
      voicePitch: this.avatar.voicePersonality.pitch,
      voiceRate: this.avatar.voicePersonality.rate
    };
  }

  /**
   * Get available options.
   * @returns {Object}
   */
  getOptions() {
    return {
      faceShapes: FACE_SHAPES,
      styles: STYLES,
      presets: PRESET_NAMES,
      colors: AVATAR_COLORS,
      eyeColors: EYE_COLORS,
      voiceStyles: VOICE_STYLE_IDS
    };
  }

  // ─── Setters ─────────────────────────────────────────────────────────

  /**
   * Set avatar name.
   * @param {string} name
   */
  setName(name) {
    if (!name || typeof name !== 'string') return;
    const trimmed = name.trim().slice(0, 20);
    if (!trimmed) return;
    this._pushHistory();
    this.avatar.updateAppearance({ name: trimmed });
    this._notify();
  }

  /**
   * Set face shape.
   * @param {string} shape
   */
  setFaceShape(shape) {
    if (!FACE_SHAPES.includes(shape)) return;
    this._pushHistory();
    this.avatar.updateAppearance({ faceShape: shape });
    this._notify();
  }

  /**
   * Set visual style.
   * @param {string} style
   */
  setStyle(style) {
    if (!STYLES.includes(style)) return;
    this._pushHistory();
    this.avatar.updateAppearance({ style });
    this._notify();
  }

  /**
   * Set primary color.
   * @param {string} color - Hex color
   */
  setPrimaryColor(color) {
    if (!isValidHex(color)) return;
    this._pushHistory();
    this.avatar.updateAppearance({ primaryColor: color });
    this._notify();
  }

  /**
   * Set secondary/accent color.
   * @param {string} color
   */
  setSecondaryColor(color) {
    if (!isValidHex(color)) return;
    this._pushHistory();
    this.avatar.updateAppearance({ secondaryColor: color });
    this._notify();
  }

  /**
   * Set eye color.
   * @param {string} color
   */
  setEyeColor(color) {
    if (!isValidHex(color)) return;
    this._pushHistory();
    this.avatar.updateAppearance({ eyeColor: color });
    this._notify();
  }

  /**
   * Set glow color.
   * @param {string} color
   */
  setGlowColor(color) {
    if (!isValidHex(color)) return;
    this._pushHistory();
    this.avatar.updateAppearance({ glowColor: color });
    this._notify();
  }

  /**
   * Set size multiplier.
   * @param {number} size - 0.5 to 2
   */
  setSize(size) {
    const clamped = Math.max(0.5, Math.min(2, size));
    this._pushHistory();
    this.avatar.updateAppearance({ size: clamped });
    this._notify();
  }

  /**
   * Toggle particle effects.
   * @param {boolean} enabled
   */
  setParticles(enabled) {
    this._pushHistory();
    this.avatar.updateAppearance({ hasParticles: !!enabled });
    this._notify();
  }

  /**
   * Apply a preset by name.
   * @param {string} presetName
   */
  applyPreset(presetName) {
    const preset = AVATAR_PRESETS[presetName];
    if (!preset) return;
    this._pushHistory();
    this.avatar.applyPreset(presetName);
    this._notify();
  }

  /**
   * Set voice personality parameters.
   * @param {Object} params
   * @param {number} [params.pitch]
   * @param {number} [params.rate]
   * @param {string} [params.emotionStyle]
   */
  setVoice(params) {
    this._pushHistory();
    const updates = {};
    if (typeof params.pitch === 'number') updates.pitch = Math.max(0.5, Math.min(2, params.pitch));
    if (typeof params.rate === 'number') updates.rate = Math.max(0.5, Math.min(2, params.rate));
    if (params.emotionStyle) updates.emotionStyle = params.emotionStyle;
    this.avatar.updateVoice(updates);
    this._notify();
  }

  // ─── Randomize ───────────────────────────────────────────────────────

  /**
   * Generate a random avatar configuration.
   */
  randomize() {
    this._pushHistory();

    const names = ['Nova', 'Luna', 'Sol', 'Sage', 'Echo', 'Pixel', 'Astra', 'Orion', 'Vega', 'Atlas', 'Iris', 'Zen'];
    const name = names[Math.floor(Math.random() * names.length)];
    const faceShape = FACE_SHAPES[Math.floor(Math.random() * FACE_SHAPES.length)];
    const style = STYLES[Math.floor(Math.random() * STYLES.length)];
    const primary = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
    const secondary = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
    const eye = EYE_COLORS[Math.floor(Math.random() * EYE_COLORS.length)];

    this.avatar.updateAppearance({
      name,
      faceShape,
      style,
      primaryColor: primary,
      secondaryColor: secondary,
      eyeColor: eye,
      glowColor: primary,
      size: 0.8 + Math.random() * 0.4
    });

    this._notify();
  }

  // ─── Undo/Redo ───────────────────────────────────────────────────────

  /**
   * Undo last change.
   * @returns {boolean} true if undo was performed
   */
  undo() {
    if (this._historyIndex < 0 || this._history.length === 0) return false;

    const prev = this._history[this._historyIndex];
    this._historyIndex--;
    this.avatar.deserialize(prev);
    this._notify(false);
    return true;
  }

  /**
   * Redo last undone change.
   * @returns {boolean} true if redo was performed
   */
  redo() {
    if (this._historyIndex >= this._history.length - 2) return false;

    this._historyIndex += 2;
    const next = this._history[this._historyIndex];
    if (next) {
      this.avatar.deserialize(next);
      this._notify(false);
      return true;
    }
    return false;
  }

  get canUndo() {
    return this._historyIndex >= 0;
  }

  get canRedo() {
    return this._historyIndex < this._history.length - 2;
  }

  // ─── Export/Import ───────────────────────────────────────────────────

  /**
   * Export avatar config as JSON string.
   * @returns {string}
   */
  exportConfig() {
    return JSON.stringify(this.avatar.serialize(), null, 2);
  }

  /**
   * Import avatar config from JSON string.
   * @param {string} json
   * @returns {boolean} true if import succeeded
   */
  importConfig(json) {
    try {
      const data = JSON.parse(json);
      if (!data || !data.appearance) return false;
      this._pushHistory();
      this.avatar.deserialize(data);
      this._notify();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Reset to defaults.
   */
  reset() {
    this._pushHistory();
    this.avatar.updateAppearance({ ...DEFAULT_APPEARANCE });
    this._notify();
  }

  // ─── Save/Load ────────────────────────────────────────────────────────

  /**
   * Save current avatar to localStorage.
   */
  save() {
    this.avatar.save();
  }

  /**
   * Load avatar from localStorage.
   * @returns {boolean}
   */
  load() {
    return this.avatar.load();
  }

  // ─── Internal ─────────────────────────────────────────────────────────

  /** @private */
  _pushHistory() {
    // Trim future history on new action
    if (this._historyIndex < this._history.length - 1) {
      this._history = this._history.slice(0, this._historyIndex + 1);
    }
    this._history.push(this.avatar.serialize());
    if (this._history.length > this._maxHistory) {
      this._history.shift();
    }
    this._historyIndex = this._history.length - 1;
  }

  /** @private */
  _notify(saveHistory = true) {
    if (this.onChange) this.onChange(this.getConfig());
  }
}

// ─── Utilities ───────────────────────────────────────────────────────────────

/**
 * Validate hex color string.
 * @param {string} hex
 * @returns {boolean}
 */
function isValidHex(hex) {
  if (!hex || typeof hex !== 'string') return false;
  return /^#[0-9a-fA-F]{6}$/.test(hex);
}

export { isValidHex };
