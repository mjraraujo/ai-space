/**
 * Avatar Voice Engine — Advanced TTS with emotion, pitch modulation,
 * and speaking rate adaptation.
 *
 * Extends the basic Voice module with:
 *   - Emotion-aware speech (adjust pitch/rate based on expression)
 *   - Phoneme-level timing for lip sync
 *   - Voice style presets (warm, professional, energetic, calm, dramatic)
 *   - Pause/emphasis control
 *   - Speech queue with priority
 *   - Integration with ExpressionController for reactive lip sync
 */

// ─── Voice Style Presets ─────────────────────────────────────────────────────

/**
 * @typedef {Object} VoiceStyle
 * @property {string} id
 * @property {string} name
 * @property {number} pitch - Base pitch (0.5-2)
 * @property {number} rate - Base rate (0.5-2)
 * @property {number} volume - Volume (0-1)
 * @property {number} emphasisStrength - How much to emphasize (0-1)
 * @property {number} pauseMultiplier - Pause duration multiplier
 */

export const VOICE_STYLES = {
  warm: {
    id: 'warm',
    name: 'Warm & Friendly',
    pitch: 1.05,
    rate: 0.95,
    volume: 0.85,
    emphasisStrength: 0.3,
    pauseMultiplier: 1.1
  },
  professional: {
    id: 'professional',
    name: 'Professional',
    pitch: 0.95,
    rate: 1.0,
    volume: 0.9,
    emphasisStrength: 0.2,
    pauseMultiplier: 1.0
  },
  energetic: {
    id: 'energetic',
    name: 'Energetic',
    pitch: 1.15,
    rate: 1.1,
    volume: 0.95,
    emphasisStrength: 0.5,
    pauseMultiplier: 0.8
  },
  calm: {
    id: 'calm',
    name: 'Calm & Soothing',
    pitch: 0.9,
    rate: 0.85,
    volume: 0.8,
    emphasisStrength: 0.15,
    pauseMultiplier: 1.3
  },
  dramatic: {
    id: 'dramatic',
    name: 'Dramatic',
    pitch: 1.0,
    rate: 0.9,
    volume: 1.0,
    emphasisStrength: 0.7,
    pauseMultiplier: 1.2
  }
};

export const VOICE_STYLE_IDS = Object.keys(VOICE_STYLES);

// ─── Emotion → Voice Modulation ──────────────────────────────────────────────

const EMOTION_MODIFIERS = {
  neutral: { pitchMod: 0, rateMod: 0, volumeMod: 0 },
  happy: { pitchMod: 0.1, rateMod: 0.05, volumeMod: 0.05 },
  sad: { pitchMod: -0.1, rateMod: -0.1, volumeMod: -0.1 },
  surprised: { pitchMod: 0.2, rateMod: 0.1, volumeMod: 0.1 },
  thinking: { pitchMod: 0, rateMod: -0.15, volumeMod: -0.05 },
  confused: { pitchMod: 0.05, rateMod: -0.05, volumeMod: 0 },
  excited: { pitchMod: 0.15, rateMod: 0.15, volumeMod: 0.1 },
  talking: { pitchMod: 0, rateMod: 0, volumeMod: 0 },
  listening: { pitchMod: 0, rateMod: 0, volumeMod: 0 },
  sleeping: { pitchMod: -0.2, rateMod: -0.3, volumeMod: -0.3 },
  angry: { pitchMod: -0.05, rateMod: 0.1, volumeMod: 0.15 },
  focused: { pitchMod: -0.05, rateMod: -0.05, volumeMod: 0 },
  empathetic: { pitchMod: 0.05, rateMod: -0.05, volumeMod: -0.05 }
};

// ─── Speech Queue ────────────────────────────────────────────────────────────

/**
 * @typedef {Object} SpeechQueueItem
 * @property {string} text
 * @property {number} priority - Lower = higher priority
 * @property {string} emotion - Emotion state
 * @property {Function|null} onStart
 * @property {Function|null} onEnd
 * @property {Function|null} onWord - Called per word boundary
 */

// ─── Avatar Voice Engine ─────────────────────────────────────────────────────

export class AvatarVoiceEngine {
  /**
   * @param {Object} [options]
   * @param {string} [options.styleId='warm']
   */
  constructor(options = {}) {
    this.synthesis = typeof window !== 'undefined' ? window.speechSynthesis : null;
    this.style = { ...VOICE_STYLES[options.styleId || 'warm'] };
    this.currentEmotion = 'neutral';
    this.speaking = false;
    this.paused = false;
    this.muted = false;
    this.enabled = true;

    /** @type {SpeechQueueItem[]} */
    this._queue = [];
    this._currentUtterance = null;
    this._voicesLoaded = false;
    this._preferredVoiceIndex = -1;
    this._lipSyncCallback = null;
    this._wordCallback = null;

    // Load voices
    if (this.synthesis) {
      const loadVoices = () => { this._voicesLoaded = true; };
      this.synthesis.addEventListener?.('voiceschanged', loadVoices);
      if (this.synthesis.getVoices?.().length > 0) {
        this._voicesLoaded = true;
      }
    }
  }

  get supported() {
    return !!this.synthesis;
  }

  // ─── Style Configuration ─────────────────────────────────────────────

  /**
   * Set voice style.
   * @param {string} styleId
   */
  setStyle(styleId) {
    const style = VOICE_STYLES[styleId];
    if (style) {
      this.style = { ...style };
    }
  }

  /**
   * Set the emotion for modulating speech.
   * @param {string} emotion
   */
  setEmotion(emotion) {
    this.currentEmotion = emotion;
  }

  /**
   * Set preferred voice index.
   * @param {number} index
   */
  setPreferredVoice(index) {
    this._preferredVoiceIndex = index;
  }

  /**
   * Set lip sync callback (called with amplitude 0-1 during speech).
   * @param {Function|null} callback
   */
  setLipSyncCallback(callback) {
    this._lipSyncCallback = callback;
  }

  /**
   * Get available voices.
   * @returns {Array<{name: string, lang: string, index: number}>}
   */
  getVoices() {
    if (!this.synthesis) return [];
    return this.synthesis.getVoices().map((v, i) => ({
      name: v.name,
      lang: v.lang,
      index: i
    }));
  }

  // ─── Speech ──────────────────────────────────────────────────────────

  /**
   * Speak text with emotion-modulated voice.
   * @param {string} text
   * @param {Object} [options]
   * @param {string} [options.emotion]
   * @param {number} [options.priority=5]
   * @param {Function} [options.onStart]
   * @param {Function} [options.onEnd]
   * @param {Function} [options.onWord]
   * @returns {boolean} true if queued/started
   */
  speak(text, options = {}) {
    if (!this.synthesis || !this.enabled || this.muted) return false;
    if (!text || typeof text !== 'string') return false;

    const emotion = options.emotion || this.currentEmotion;
    const item = {
      text: text.slice(0, 5000), // Limit length
      priority: options.priority ?? 5,
      emotion,
      onStart: options.onStart || null,
      onEnd: options.onEnd || null,
      onWord: options.onWord || null
    };

    // Insert by priority (lower = higher priority)
    let inserted = false;
    for (let i = 0; i < this._queue.length; i++) {
      if (item.priority < this._queue[i].priority) {
        this._queue.splice(i, 0, item);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      this._queue.push(item);
    }

    // Start processing if not already speaking
    if (!this.speaking) {
      this._processQueue();
    }

    return true;
  }

  /**
   * Stop all speech and clear queue.
   */
  stop() {
    this._queue = [];
    if (this.synthesis) {
      this.synthesis.cancel();
    }
    this.speaking = false;
    this._currentUtterance = null;
    if (this._lipSyncCallback) {
      this._lipSyncCallback(0);
    }
  }

  /**
   * Pause speech.
   */
  pause() {
    if (this.synthesis && this.speaking) {
      this.synthesis.pause();
      this.paused = true;
    }
  }

  /**
   * Resume speech.
   */
  resume() {
    if (this.synthesis && this.paused) {
      this.synthesis.resume();
      this.paused = false;
    }
  }

  /**
   * Toggle mute.
   * @returns {boolean} New muted state
   */
  toggleMute() {
    this.muted = !this.muted;
    if (this.muted) this.stop();
    return this.muted;
  }

  /** @private */
  _processQueue() {
    if (this._queue.length === 0) {
      this.speaking = false;
      return;
    }

    const item = this._queue.shift();
    this.speaking = true;

    const utterance = new SpeechSynthesisUtterance(item.text);
    this._currentUtterance = utterance;

    // Apply style + emotion modulation
    const emotionMod = EMOTION_MODIFIERS[item.emotion] || EMOTION_MODIFIERS.neutral;
    utterance.pitch = Math.max(0.1, Math.min(2, this.style.pitch + emotionMod.pitchMod));
    utterance.rate = Math.max(0.1, Math.min(3, this.style.rate + emotionMod.rateMod));
    utterance.volume = Math.max(0, Math.min(1, this.style.volume + emotionMod.volumeMod));

    // Voice selection
    const voices = this.synthesis.getVoices();
    if (voices.length > 0 && this._preferredVoiceIndex >= 0 && this._preferredVoiceIndex < voices.length) {
      utterance.voice = voices[this._preferredVoiceIndex];
    }

    // Callbacks
    utterance.onstart = () => {
      if (item.onStart) item.onStart();
      this._startLipSync();
    };

    utterance.onend = () => {
      if (item.onEnd) item.onEnd();
      this._stopLipSync();
      this._processQueue();
    };

    utterance.onerror = () => {
      this._stopLipSync();
      this._processQueue();
    };

    utterance.onboundary = (event) => {
      if (event.name === 'word' && item.onWord) {
        item.onWord(event.charIndex, event.charLength);
      }
      // Simulate lip movement on word boundaries
      if (this._lipSyncCallback) {
        this._lipSyncCallback(0.5 + Math.random() * 0.5);
      }
    };

    this.synthesis.speak(utterance);
  }

  /** @private */
  _startLipSync() {
    if (this._lipSyncCallback) {
      this._lipSyncCallback(0.3);
    }
  }

  /** @private */
  _stopLipSync() {
    if (this._lipSyncCallback) {
      this._lipSyncCallback(0);
    }
  }

  /**
   * Get current engine state.
   * @returns {{ speaking: boolean, paused: boolean, muted: boolean, queueLength: number, style: string, emotion: string }}
   */
  getState() {
    return {
      speaking: this.speaking,
      paused: this.paused,
      muted: this.muted,
      queueLength: this._queue.length,
      style: this.style.id,
      emotion: this.currentEmotion
    };
  }
}
