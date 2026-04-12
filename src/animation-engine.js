/**
 * Animation Engine — Keyframe animation, easing, state machines, and blend trees.
 *
 * Provides a high-performance animation runtime for the AI avatar system.
 * Supports:
 *   - Keyframe interpolation with pluggable easing
 *   - Animation state machines (idle → talking → thinking → reacting)
 *   - Blend trees for smooth transitions between states
 *   - Spring physics for natural motion
 *   - Timeline sequencing for complex animations
 *
 * All animations are frame-rate independent using delta-time.
 */

// ─── Easing Functions ────────────────────────────────────────────────────────

export const Easing = {
  linear: t => t,
  easeInQuad: t => t * t,
  easeOutQuad: t => t * (2 - t),
  easeInOutQuad: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  easeInCubic: t => t * t * t,
  easeOutCubic: t => (--t) * t * t + 1,
  easeInOutCubic: t => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  easeInQuart: t => t * t * t * t,
  easeOutQuart: t => 1 - (--t) * t * t * t,
  easeInOutQuart: t => t < 0.5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t,
  easeInElastic: t => t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * ((2 * Math.PI) / 3)),
  easeOutElastic: t => t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
  easeInOutElastic: t => {
    if (t === 0 || t === 1) return t;
    const c5 = (2 * Math.PI) / 4.5;
    return t < 0.5
      ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2
      : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1;
  },
  easeOutBounce: t => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    else if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    else if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    else return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
  spring: (t, damping = 0.5) => {
    const s = 1 - damping;
    return 1 - Math.exp(-6.9 * t) * Math.cos(t * Math.PI * 2 * (1 + s));
  }
};

/**
 * Resolve easing from string name or function.
 * @param {string|Function} easing
 * @returns {Function}
 */
export function resolveEasing(easing) {
  if (typeof easing === 'function') return easing;
  if (typeof easing === 'string' && Easing[easing]) return Easing[easing];
  return Easing.linear;
}

// ─── Keyframe Track ──────────────────────────────────────────────────────────

/**
 * A single animated property track with keyframes.
 */
export class KeyframeTrack {
  /**
   * @param {string} property - Property name (e.g. 'position.x', 'opacity')
   * @param {Array<{time: number, value: number, easing?: string|Function}>} keyframes
   */
  constructor(property, keyframes = []) {
    this.property = property;
    this.keyframes = [...keyframes].sort((a, b) => a.time - b.time);
  }

  /** Duration of this track in seconds. */
  get duration() {
    if (this.keyframes.length === 0) return 0;
    return this.keyframes[this.keyframes.length - 1].time;
  }

  /**
   * Sample the track value at a given time.
   * @param {number} time - Time in seconds
   * @returns {number}
   */
  sample(time) {
    const kf = this.keyframes;
    if (kf.length === 0) return 0;
    if (kf.length === 1) return kf[0].value;
    if (time <= kf[0].time) return kf[0].value;
    if (time >= kf[kf.length - 1].time) return kf[kf.length - 1].value;

    // Find surrounding keyframes
    let i = 0;
    while (i < kf.length - 1 && kf[i + 1].time <= time) i++;

    const from = kf[i];
    const to = kf[i + 1];
    const span = to.time - from.time;
    if (span <= 0) return from.value;

    const localT = (time - from.time) / span;
    const easingFn = resolveEasing(to.easing || 'linear');
    const easedT = easingFn(localT);

    return from.value + (to.value - from.value) * easedT;
  }

  /**
   * Add a keyframe.
   * @param {number} time
   * @param {number} value
   * @param {string|Function} [easing]
   */
  addKeyframe(time, value, easing) {
    this.keyframes.push({ time, value, easing });
    this.keyframes.sort((a, b) => a.time - b.time);
  }
}

// ─── Animation Clip ──────────────────────────────────────────────────────────

/**
 * A collection of keyframe tracks forming a complete animation.
 */
export class AnimationClip {
  /**
   * @param {string} name
   * @param {Object} [options]
   * @param {boolean} [options.loop=false]
   * @param {number} [options.speed=1]
   */
  constructor(name, options = {}) {
    this.name = name;
    /** @type {Map<string, KeyframeTrack>} */
    this.tracks = new Map();
    this.loop = options.loop ?? false;
    this.speed = options.speed ?? 1;
  }

  /** Duration of the clip (max track duration). */
  get duration() {
    let max = 0;
    for (const track of this.tracks.values()) {
      max = Math.max(max, track.duration);
    }
    return max;
  }

  /**
   * Add a keyframe track.
   * @param {KeyframeTrack} track
   */
  addTrack(track) {
    this.tracks.set(track.property, track);
  }

  /**
   * Create a track for a property if it doesn't exist.
   * @param {string} property
   * @returns {KeyframeTrack}
   */
  getOrCreateTrack(property) {
    if (!this.tracks.has(property)) {
      this.tracks.set(property, new KeyframeTrack(property));
    }
    return this.tracks.get(property);
  }

  /**
   * Sample all tracks at a given time.
   * @param {number} time
   * @returns {Object<string, number>}
   */
  sample(time) {
    const result = {};
    for (const [prop, track] of this.tracks) {
      result[prop] = track.sample(time);
    }
    return result;
  }
}

// ─── Animation Player ────────────────────────────────────────────────────────

/**
 * Plays an AnimationClip, tracking time and state.
 */
export class AnimationPlayer {
  /**
   * @param {AnimationClip} clip
   * @param {Object} [options]
   * @param {Function} [options.onComplete]
   * @param {Function} [options.onLoop]
   */
  constructor(clip, options = {}) {
    this.clip = clip;
    this.time = 0;
    this.playing = false;
    this.weight = 1;
    this.onComplete = options.onComplete || null;
    this.onLoop = options.onLoop || null;
    this._finished = false;
  }

  play() {
    this.playing = true;
    this._finished = false;
    return this;
  }

  pause() {
    this.playing = false;
    return this;
  }

  stop() {
    this.playing = false;
    this.time = 0;
    this._finished = false;
    return this;
  }

  /**
   * Advance time by delta seconds.
   * @param {number} dt - Delta time in seconds
   * @returns {Object<string, number>|null} Sampled values or null if not playing
   */
  update(dt) {
    if (!this.playing || this._finished) return null;

    this.time += dt * this.clip.speed;

    const dur = this.clip.duration;
    if (dur <= 0) return this.clip.sample(0);

    if (this.time >= dur) {
      if (this.clip.loop) {
        this.time = this.time % dur;
        if (this.onLoop) this.onLoop();
      } else {
        this.time = dur;
        this._finished = true;
        this.playing = false;
        if (this.onComplete) this.onComplete();
      }
    }

    return this.clip.sample(this.time);
  }

  get finished() {
    return this._finished;
  }

  get progress() {
    const dur = this.clip.duration;
    if (dur <= 0) return 1;
    return Math.min(this.time / dur, 1);
  }
}

// ─── Animation Mixer ─────────────────────────────────────────────────────────

/**
 * Blends multiple animation players together with weighted mixing.
 */
export class AnimationMixer {
  constructor() {
    /** @type {Map<string, AnimationPlayer>} */
    this.players = new Map();
    this._blendDuration = 0.3; // seconds for crossfade
    this._fadingOut = new Map(); // players being faded out
  }

  /**
   * Add a named animation player.
   * @param {string} name
   * @param {AnimationClip} clip
   * @param {Object} [options]
   * @returns {AnimationPlayer}
   */
  addClip(name, clip, options = {}) {
    const player = new AnimationPlayer(clip, options);
    this.players.set(name, player);
    return player;
  }

  /**
   * Get a player by name.
   * @param {string} name
   * @returns {AnimationPlayer|undefined}
   */
  getPlayer(name) {
    return this.players.get(name);
  }

  /**
   * Crossfade from current playing animations to the named one.
   * @param {string} name
   * @param {number} [duration] - Blend duration in seconds
   */
  crossFade(name, duration) {
    const fadeTime = duration ?? this._blendDuration;
    const target = this.players.get(name);
    if (!target) return;

    // Fade out all currently playing
    for (const [n, player] of this.players) {
      if (n !== name && player.playing) {
        this._fadingOut.set(n, { player, remaining: fadeTime, total: fadeTime });
      }
    }

    // Start target
    target.time = 0;
    target.weight = fadeTime > 0 ? 0 : 1;
    target.play();
  }

  /**
   * Update all active players and blend results.
   * @param {number} dt - Delta time in seconds
   * @returns {Object<string, number>} Blended property values
   */
  update(dt) {
    const blended = {};
    let totalWeight = 0;

    // Update fading-out players
    for (const [name, fade] of this._fadingOut) {
      fade.remaining -= dt;
      if (fade.remaining <= 0) {
        fade.player.stop();
        this._fadingOut.delete(name);
        continue;
      }
      fade.player.weight = fade.remaining / fade.total;
      const values = fade.player.update(dt);
      if (values) {
        for (const [prop, val] of Object.entries(values)) {
          blended[prop] = (blended[prop] || 0) + val * fade.player.weight;
        }
        totalWeight += fade.player.weight;
      }
    }

    // Update active players
    for (const player of this.players.values()) {
      if (!player.playing) continue;
      // Fade in if weight < 1
      if (player.weight < 1) {
        player.weight = Math.min(1, player.weight + dt / this._blendDuration);
      }
      const values = player.update(dt);
      if (values) {
        for (const [prop, val] of Object.entries(values)) {
          blended[prop] = (blended[prop] || 0) + val * player.weight;
        }
        totalWeight += player.weight;
      }
    }

    // Normalize
    if (totalWeight > 0 && totalWeight !== 1) {
      for (const prop of Object.keys(blended)) {
        blended[prop] /= totalWeight;
      }
    }

    return blended;
  }
}

// ─── Spring Physics ──────────────────────────────────────────────────────────

/**
 * Damped spring for natural motion (used for head tracking, eye follow, etc.).
 */
export class Spring {
  /**
   * @param {number} [stiffness=180]
   * @param {number} [damping=12]
   * @param {number} [mass=1]
   */
  constructor(stiffness = 180, damping = 12, mass = 1) {
    this.stiffness = stiffness;
    this.damping = damping;
    this.mass = mass;
    this.value = 0;
    this.target = 0;
    this.velocity = 0;
  }

  /**
   * Update spring physics.
   * @param {number} dt - Delta time in seconds
   * @returns {number} Current value
   */
  update(dt) {
    const springForce = -this.stiffness * (this.value - this.target);
    const dampingForce = -this.damping * this.velocity;
    const acceleration = (springForce + dampingForce) / this.mass;

    this.velocity += acceleration * dt;
    this.value += this.velocity * dt;

    return this.value;
  }

  /**
   * Check if spring has settled (velocity and displacement both near zero).
   * @param {number} [threshold=0.001]
   * @returns {boolean}
   */
  isSettled(threshold = 0.001) {
    return Math.abs(this.velocity) < threshold && Math.abs(this.value - this.target) < threshold;
  }

  /**
   * Snap to target immediately.
   */
  snap() {
    this.value = this.target;
    this.velocity = 0;
  }
}

// ─── Animation State Machine ─────────────────────────────────────────────────

/**
 * State machine for managing animation transitions.
 *
 * States: idle, talking, thinking, reacting, listening, sleeping
 * Transitions define how to move between states with crossfade durations.
 */
export class AnimationStateMachine {
  /**
   * @param {Object} [options]
   * @param {string} [options.initialState='idle']
   */
  constructor(options = {}) {
    this.currentState = options.initialState || 'idle';
    /** @type {Map<string, Object>} */
    this.states = new Map();
    /** @type {Map<string, Array<{to: string, condition?: Function, duration?: number}>>} */
    this.transitions = new Map();
    this.stateTime = 0;
    this.onTransition = null;
  }

  /**
   * Define a state.
   * @param {string} name
   * @param {Object} [config]
   * @param {string} [config.animation] - Animation clip name to play
   * @param {number} [config.minDuration] - Minimum time in state
   * @param {boolean} [config.interruptible=true]
   */
  addState(name, config = {}) {
    this.states.set(name, {
      animation: config.animation || name,
      minDuration: config.minDuration || 0,
      interruptible: config.interruptible !== false,
      ...config
    });
  }

  /**
   * Define a transition between states.
   * @param {string} from
   * @param {string} to
   * @param {Object} [options]
   * @param {Function} [options.condition] - () => boolean
   * @param {number} [options.duration=0.3] - Crossfade duration
   */
  addTransition(from, to, options = {}) {
    if (!this.transitions.has(from)) {
      this.transitions.set(from, []);
    }
    this.transitions.get(from).push({
      to,
      condition: options.condition || null,
      duration: options.duration ?? 0.3
    });
  }

  /**
   * Force transition to a state.
   * @param {string} stateName
   * @returns {{ from: string, to: string, duration: number }|null}
   */
  transitionTo(stateName) {
    if (!this.states.has(stateName)) return null;

    const currentConfig = this.states.get(this.currentState);
    if (currentConfig && !currentConfig.interruptible && this.stateTime < currentConfig.minDuration) {
      return null;
    }

    // Find transition config
    const transitions = this.transitions.get(this.currentState) || [];
    const trans = transitions.find(t => t.to === stateName);
    const duration = trans?.duration ?? 0.3;

    const from = this.currentState;
    this.currentState = stateName;
    this.stateTime = 0;

    if (this.onTransition) {
      this.onTransition({ from, to: stateName, duration });
    }

    return { from, to: stateName, duration };
  }

  /**
   * Update state time and check automatic transitions.
   * @param {number} dt
   * @returns {{ from: string, to: string, duration: number }|null} Transition if one fired
   */
  update(dt) {
    this.stateTime += dt;

    const transitions = this.transitions.get(this.currentState) || [];
    for (const trans of transitions) {
      if (trans.condition && trans.condition()) {
        return this.transitionTo(trans.to);
      }
    }

    return null;
  }

  /** Get the animation clip name for the current state. */
  get currentAnimation() {
    const state = this.states.get(this.currentState);
    return state?.animation || this.currentState;
  }
}

// ─── Timeline ────────────────────────────────────────────────────────────────

/**
 * A timeline for sequencing multiple animations and callbacks.
 */
export class Timeline {
  constructor() {
    /** @type {Array<{time: number, action: Function, fired: boolean}>} */
    this.events = [];
    this.time = 0;
    this.playing = false;
    this.duration = 0;
    this.loop = false;
    this.onComplete = null;
  }

  /**
   * Schedule an action at a specific time.
   * @param {number} time - Time in seconds
   * @param {Function} action
   * @returns {Timeline}
   */
  at(time, action) {
    this.events.push({ time, action, fired: false });
    this.events.sort((a, b) => a.time - b.time);
    this.duration = Math.max(this.duration, time);
    return this;
  }

  /**
   * Schedule after a delay from the last event.
   * @param {number} delay
   * @param {Function} action
   * @returns {Timeline}
   */
  after(delay, action) {
    return this.at(this.duration + delay, action);
  }

  play() {
    this.playing = true;
    return this;
  }

  stop() {
    this.playing = false;
    this.time = 0;
    for (const e of this.events) e.fired = false;
    return this;
  }

  /**
   * Update timeline.
   * @param {number} dt
   */
  update(dt) {
    if (!this.playing) return;

    this.time += dt;

    for (const event of this.events) {
      if (!event.fired && this.time >= event.time) {
        event.fired = true;
        event.action();
      }
    }

    if (this.time >= this.duration) {
      if (this.loop) {
        this.time = 0;
        for (const e of this.events) e.fired = false;
      } else {
        this.playing = false;
        if (this.onComplete) this.onComplete();
      }
    }
  }
}
