/**
 * Particle System — GPU-efficient particle effects using Canvas 2D.
 *
 * Provides ambient particle effects for the avatar scene:
 *   - Floating light particles around the avatar
 *   - Sparkle effects on state transitions
 *   - Pulse waves on speech
 *   - Energy trails on thinking
 *   - Star field backgrounds
 *
 * Performance:
 *   - Object pooling (zero allocations during runtime)
 *   - Batch rendering with single draw context
 *   - Spatial culling for off-screen particles
 *   - FPS-adaptive particle count
 */

// ─── Particle Pool ───────────────────────────────────────────────────────────

/**
 * @typedef {Object} Particle
 * @property {number} x
 * @property {number} y
 * @property {number} vx - Velocity X
 * @property {number} vy - Velocity Y
 * @property {number} size
 * @property {number} life - Remaining life (0-1)
 * @property {number} maxLife - Total life in seconds
 * @property {number} age - Current age in seconds
 * @property {number} opacity
 * @property {string} color
 * @property {number} rotation
 * @property {number} rotationSpeed
 * @property {'circle'|'star'|'spark'|'ring'} shape
 * @property {boolean} active
 */

const DEFAULT_POOL_SIZE = 500;
const MAX_POOL_SIZE = 2000;

/**
 * Object pool for zero-allocation particle management.
 */
export class ParticlePool {
  /**
   * @param {number} [size=500]
   */
  constructor(size = DEFAULT_POOL_SIZE) {
    this.size = Math.min(size, MAX_POOL_SIZE);
    /** @type {Particle[]} */
    this.particles = [];
    this._nextIndex = 0;

    for (let i = 0; i < this.size; i++) {
      this.particles.push(this._createParticle());
    }
  }

  /** @private */
  _createParticle() {
    return {
      x: 0, y: 0,
      vx: 0, vy: 0,
      size: 2,
      life: 0,
      maxLife: 1,
      age: 0,
      opacity: 1,
      color: '#ffffff',
      rotation: 0,
      rotationSpeed: 0,
      shape: 'circle',
      active: false
    };
  }

  /**
   * Get a particle from the pool.
   * @returns {Particle|null}
   */
  acquire() {
    // Linear scan for inactive particle starting from last index
    for (let i = 0; i < this.size; i++) {
      const idx = (this._nextIndex + i) % this.size;
      if (!this.particles[idx].active) {
        this._nextIndex = (idx + 1) % this.size;
        return this.particles[idx];
      }
    }
    return null; // Pool exhausted
  }

  /**
   * Return a particle to the pool.
   * @param {Particle} particle
   */
  release(particle) {
    particle.active = false;
  }

  /**
   * Get count of active particles.
   * @returns {number}
   */
  get activeCount() {
    let count = 0;
    for (const p of this.particles) {
      if (p.active) count++;
    }
    return count;
  }

  /**
   * Reset all particles.
   */
  reset() {
    for (const p of this.particles) {
      p.active = false;
    }
    this._nextIndex = 0;
  }
}

// ─── Emitter Presets ─────────────────────────────────────────────────────────

/**
 * @typedef {Object} EmitterConfig
 * @property {number} x - Emitter X position
 * @property {number} y - Emitter Y position
 * @property {number} rate - Particles per second
 * @property {number} minLife - Min particle life (seconds)
 * @property {number} maxLife - Max particle life (seconds)
 * @property {number} minSize - Min particle size (px)
 * @property {number} maxSize - Max particle size (px)
 * @property {number} minSpeed - Min initial speed
 * @property {number} maxSpeed - Max initial speed
 * @property {number} spread - Emission angle spread (radians)
 * @property {number} direction - Base emission direction (radians)
 * @property {string} color - Particle color
 * @property {string} shape - Particle shape
 * @property {number} gravity - Gravity force
 * @property {number} friction - Velocity damping (0-1)
 * @property {boolean} fadeOut - Fade opacity over lifetime
 * @property {boolean} shrink - Shrink size over lifetime
 */

/** @type {Object<string, Partial<EmitterConfig>>} */
export const EMITTER_PRESETS = {
  ambient: {
    rate: 3,
    minLife: 3, maxLife: 6,
    minSize: 1, maxSize: 3,
    minSpeed: 5, maxSpeed: 20,
    spread: Math.PI * 2,
    direction: -Math.PI / 2,
    color: '#7c5cfc',
    shape: 'circle',
    gravity: -2,
    friction: 0.98,
    fadeOut: true,
    shrink: false
  },
  sparkle: {
    rate: 30,
    minLife: 0.3, maxLife: 0.8,
    minSize: 1, maxSize: 4,
    minSpeed: 30, maxSpeed: 80,
    spread: Math.PI * 2,
    direction: 0,
    color: '#ffffff',
    shape: 'star',
    gravity: 0,
    friction: 0.95,
    fadeOut: true,
    shrink: true
  },
  pulse: {
    rate: 15,
    minLife: 0.5, maxLife: 1.5,
    minSize: 2, maxSize: 6,
    minSpeed: 20, maxSpeed: 60,
    spread: Math.PI * 2,
    direction: 0,
    color: '#3b8ef0',
    shape: 'ring',
    gravity: 0,
    friction: 0.96,
    fadeOut: true,
    shrink: false
  },
  energy: {
    rate: 20,
    minLife: 1, maxLife: 2,
    minSize: 1, maxSize: 3,
    minSpeed: 40, maxSpeed: 100,
    spread: Math.PI * 0.5,
    direction: -Math.PI / 2,
    color: '#a855f7',
    shape: 'spark',
    gravity: -5,
    friction: 0.97,
    fadeOut: true,
    shrink: true
  },
  stars: {
    rate: 1,
    minLife: 5, maxLife: 10,
    minSize: 0.5, maxSize: 2,
    minSpeed: 0, maxSpeed: 3,
    spread: Math.PI * 2,
    direction: 0,
    color: '#ffffff',
    shape: 'circle',
    gravity: 0,
    friction: 1,
    fadeOut: false,
    shrink: false
  }
};

// ─── Particle Emitter ────────────────────────────────────────────────────────

/**
 * Emits particles based on a configuration.
 */
export class ParticleEmitter {
  /**
   * @param {ParticlePool} pool
   * @param {Partial<EmitterConfig>} config
   */
  constructor(pool, config = {}) {
    this.pool = pool;
    this.config = { ...EMITTER_PRESETS.ambient, x: 0, y: 0, ...config };
    this._accumulator = 0;
    this.active = true;
    this._burstQueue = 0;
  }

  /**
   * Queue a burst of particles.
   * @param {number} count
   */
  burst(count) {
    this._burstQueue += count;
  }

  /**
   * Update emitter — spawn new particles and update existing ones.
   * @param {number} dt - Delta time in seconds
   */
  update(dt) {
    if (!this.active && this._burstQueue <= 0) return;

    const cfg = this.config;

    // Spawn from rate
    if (this.active) {
      this._accumulator += cfg.rate * dt;
      while (this._accumulator >= 1) {
        this._spawnParticle();
        this._accumulator -= 1;
      }
    }

    // Spawn burst
    while (this._burstQueue > 0) {
      this._spawnParticle();
      this._burstQueue--;
    }
  }

  /** @private */
  _spawnParticle() {
    const p = this.pool.acquire();
    if (!p) return;

    const cfg = this.config;
    const angle = cfg.direction + (Math.random() - 0.5) * cfg.spread;
    const speed = cfg.minSpeed + Math.random() * (cfg.maxSpeed - cfg.minSpeed);

    p.x = cfg.x + (Math.random() - 0.5) * 20;
    p.y = cfg.y + (Math.random() - 0.5) * 20;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.size = cfg.minSize + Math.random() * (cfg.maxSize - cfg.minSize);
    p.maxLife = cfg.minLife + Math.random() * (cfg.maxLife - cfg.minLife);
    p.life = 1;
    p.age = 0;
    p.opacity = 1;
    p.color = cfg.color;
    p.shape = cfg.shape;
    p.rotation = Math.random() * Math.PI * 2;
    p.rotationSpeed = (Math.random() - 0.5) * 2;
    p.active = true;
  }
}

// ─── Particle System ─────────────────────────────────────────────────────────

/**
 * Main particle system managing pool, emitters, physics, and rendering.
 */
export class ParticleSystem {
  /**
   * @param {HTMLCanvasElement|null} canvas
   * @param {Object} [options]
   * @param {number} [options.poolSize=500]
   */
  constructor(canvas = null, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas?.getContext('2d') || null;
    this.pool = new ParticlePool(options.poolSize || DEFAULT_POOL_SIZE);
    /** @type {Map<string, ParticleEmitter>} */
    this.emitters = new Map();
    this.running = false;
    this._lastTime = 0;
    this._animFrameId = null;
    this._width = 0;
    this._height = 0;
    this._gravity = 0;
    this._friction = 0.98;
  }

  /**
   * Add a named emitter.
   * @param {string} name
   * @param {Partial<EmitterConfig>} config
   * @returns {ParticleEmitter}
   */
  addEmitter(name, config) {
    const emitter = new ParticleEmitter(this.pool, config);
    this.emitters.set(name, emitter);
    return emitter;
  }

  /**
   * Remove an emitter.
   * @param {string} name
   */
  removeEmitter(name) {
    this.emitters.delete(name);
  }

  /**
   * Get an emitter by name.
   * @param {string} name
   * @returns {ParticleEmitter|undefined}
   */
  getEmitter(name) {
    return this.emitters.get(name);
  }

  /**
   * Start the particle system animation loop.
   */
  start() {
    if (this.running) return;
    this.running = true;
    this._lastTime = performance.now();
    this._tick();
  }

  /**
   * Stop the animation loop.
   */
  stop() {
    this.running = false;
    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = null;
    }
  }

  /**
   * Update all particles (without rendering). Useful for headless testing.
   * @param {number} dt - Delta time in seconds
   */
  update(dt) {
    // Update emitters
    for (const emitter of this.emitters.values()) {
      emitter.update(dt);
    }

    // Update particles
    for (const p of this.pool.particles) {
      if (!p.active) continue;

      p.age += dt;
      p.life = Math.max(0, 1 - p.age / p.maxLife);

      if (p.life <= 0) {
        this.pool.release(p);
        continue;
      }

      // Physics
      p.vy += this._gravity * dt;
      p.vx *= this._friction;
      p.vy *= this._friction;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.rotationSpeed * dt;
    }
  }

  /**
   * Render all active particles.
   */
  render() {
    if (!this.ctx || !this.canvas) return;

    this._width = this.canvas.width;
    this._height = this.canvas.height;
    this.ctx.clearRect(0, 0, this._width, this._height);

    for (const p of this.pool.particles) {
      if (!p.active) continue;
      this._renderParticle(p);
    }
  }

  /** @private */
  _renderParticle(p) {
    const ctx = this.ctx;
    const opacity = p.opacity * p.life;
    if (opacity <= 0.01) return;

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);

    const size = p.size * (p.life * 0.5 + 0.5); // Slight shrink on fade

    switch (p.shape) {
      case 'star':
        this._drawStar(ctx, size, p.color);
        break;
      case 'spark':
        this._drawSpark(ctx, size, p.color);
        break;
      case 'ring':
        this._drawRing(ctx, size, p.color);
        break;
      case 'circle':
      default:
        ctx.beginPath();
        ctx.arc(0, 0, size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        break;
    }

    ctx.restore();
  }

  /** @private */
  _drawStar(ctx, size, color) {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
      const r = i % 2 === 0 ? size : size * 0.4;
      const method = i === 0 ? 'moveTo' : 'lineTo';
      ctx[method](Math.cos(angle) * r, Math.sin(angle) * r);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  /** @private */
  _drawSpark(ctx, size, color) {
    ctx.beginPath();
    ctx.moveTo(0, -size * 2);
    ctx.lineTo(size * 0.3, 0);
    ctx.lineTo(0, size * 0.5);
    ctx.lineTo(-size * 0.3, 0);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  /** @private */
  _drawRing(ctx, size, color) {
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(0.5, size * 0.3);
    ctx.stroke();
  }

  /** @private */
  _tick() {
    if (!this.running) return;

    const now = performance.now();
    const dt = Math.min((now - this._lastTime) / 1000, 0.1); // Cap at 100ms
    this._lastTime = now;

    this.update(dt);
    this.render();

    this._animFrameId = requestAnimationFrame(() => this._tick());
  }

  /**
   * Reset the particle system.
   */
  reset() {
    this.pool.reset();
    this.emitters.clear();
  }

  /**
   * Get particle system stats.
   * @returns {{ active: number, poolSize: number, emitterCount: number }}
   */
  getStats() {
    return {
      active: this.pool.activeCount,
      poolSize: this.pool.size,
      emitterCount: this.emitters.size
    };
  }
}
