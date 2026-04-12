/**
 * Scene Manager — Composes the avatar, particles, and background into a
 * unified rendering scene.
 *
 * Manages:
 *   - Canvas setup and DPI scaling
 *   - Animation loop with delta-time
 *   - Avatar rendering and positioning
 *   - Particle system integration
 *   - Background effects (gradient, stars, vignette)
 *   - Responsive resizing
 *   - Performance monitoring (FPS)
 */

import { Avatar } from './avatar.js';
import { ParticleSystem, EMITTER_PRESETS } from './particles.js';

// ─── Scene Config ────────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  showParticles: true,
  showBackground: true,
  showVignette: true,
  showFPS: false,
  maxFPS: 60,
  avatarScale: 1,
  backgroundColor: '#07080e',
  ambientParticleCount: 3 // particles per second
};

// ─── Scene Manager ───────────────────────────────────────────────────────────

export class SceneManager {
  /**
   * @param {HTMLCanvasElement|null} canvas
   * @param {Object} [config]
   */
  constructor(canvas = null, config = {}) {
    this.canvas = canvas;
    this.ctx = canvas?.getContext('2d') || null;
    this.config = { ...DEFAULT_CONFIG, ...config };

    /** @type {Avatar} */
    this.avatar = new Avatar();
    /** @type {ParticleSystem} */
    this.particles = new ParticleSystem(null); // Headless, renders via scene

    this._running = false;
    this._lastTime = 0;
    this._animFrameId = null;
    this._width = 0;
    this._height = 0;
    this._dpr = 1;
    this._fps = 0;
    this._frameCount = 0;
    this._fpsTime = 0;
    this._minFrameTime = 1000 / this.config.maxFPS;
    this._lastFrameTime = 0;

    // Callbacks
    this.onFrame = null;
  }

  // ─── Setup ─────────────────────────────────────────────────────────────

  /**
   * Initialize the scene with canvas.
   * @param {HTMLCanvasElement} canvas
   */
  attach(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this._setupDPI();
    this._setupParticles();
  }

  /**
   * Detach from canvas.
   */
  detach() {
    this.stop();
    this.canvas = null;
    this.ctx = null;
  }

  /** @private */
  _setupDPI() {
    if (!this.canvas) return;

    this._dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    const rect = this.canvas.getBoundingClientRect();
    this._width = rect.width;
    this._height = rect.height;
    this.canvas.width = this._width * this._dpr;
    this.canvas.height = this._height * this._dpr;
    if (this.ctx) {
      this.ctx.scale(this._dpr, this._dpr);
    }
  }

  /** @private */
  _setupParticles() {
    if (!this.config.showParticles) return;

    const cx = this._width / 2;
    const cy = this._height / 2;

    this.particles.addEmitter('ambient', {
      ...EMITTER_PRESETS.ambient,
      x: cx,
      y: cy,
      rate: this.config.ambientParticleCount,
      color: this.avatar.appearance.glowColor
    });
  }

  // ─── Animation Loop ────────────────────────────────────────────────────

  /**
   * Start the rendering loop.
   */
  start() {
    if (this._running) return;
    this._running = true;
    this._lastTime = performance.now();
    this._lastFrameTime = this._lastTime;
    this._tick();
  }

  /**
   * Stop the rendering loop.
   */
  stop() {
    this._running = false;
    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = null;
    }
  }

  /**
   * Check if scene is running.
   * @returns {boolean}
   */
  get running() {
    return this._running;
  }

  /** @private */
  _tick() {
    if (!this._running) return;

    this._animFrameId = requestAnimationFrame(() => this._tick());

    const now = performance.now();

    // Frame rate limiting
    if (now - this._lastFrameTime < this._minFrameTime) return;
    this._lastFrameTime = now;

    const dt = Math.min((now - this._lastTime) / 1000, 0.1);
    this._lastTime = now;

    // FPS counter
    this._frameCount++;
    this._fpsTime += dt;
    if (this._fpsTime >= 1) {
      this._fps = this._frameCount;
      this._frameCount = 0;
      this._fpsTime = 0;
    }

    // Update
    this._update(dt);

    // Render
    this._render();

    if (this.onFrame) this.onFrame(dt);
  }

  /** @private */
  _update(dt) {
    // Update avatar
    this.avatar.update(dt);

    // Update particles
    this.particles.update(dt);

    // Sync particle emitter position with avatar center
    const ambient = this.particles.getEmitter('ambient');
    if (ambient) {
      ambient.config.x = this._width / 2;
      ambient.config.y = this._height / 2;
      ambient.config.color = this.avatar.appearance.glowColor;
    }
  }

  /** @private */
  _render() {
    if (!this.ctx || !this.canvas) return;

    const ctx = this.ctx;
    const w = this._width;
    const h = this._height;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Background
    if (this.config.showBackground) {
      this._renderBackground(ctx, w, h);
    }

    // Particles (behind avatar)
    if (this.config.showParticles) {
      this._renderParticles(ctx);
    }

    // Avatar
    const cx = w / 2;
    const cy = h / 2;
    const baseSize = Math.min(w, h) * 0.18 * this.config.avatarScale;
    this.avatar.render(ctx, cx, cy, baseSize);

    // Vignette
    if (this.config.showVignette) {
      this._renderVignette(ctx, w, h);
    }

    // FPS
    if (this.config.showFPS) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '11px monospace';
      ctx.fillText(`${this._fps} FPS`, 8, 16);
      ctx.restore();
    }
  }

  /** @private */
  _renderBackground(ctx, w, h) {
    // Subtle radial gradient background
    const gradient = ctx.createRadialGradient(
      w / 2, h * 0.4, 0,
      w / 2, h * 0.4, Math.max(w, h) * 0.7
    );
    gradient.addColorStop(0, 'rgba(124, 92, 252, 0.04)');
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }

  /** @private */
  _renderParticles(ctx) {
    for (const p of this.particles.pool.particles) {
      if (!p.active) continue;

      ctx.save();
      ctx.globalAlpha = p.opacity * p.life;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);

      const size = p.size * (p.life * 0.5 + 0.5);

      ctx.beginPath();
      ctx.arc(0, 0, size, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();

      ctx.restore();
    }
  }

  /** @private */
  _renderVignette(ctx, w, h) {
    const gradient = ctx.createRadialGradient(
      w / 2, h / 2, Math.min(w, h) * 0.3,
      w / 2, h / 2, Math.max(w, h) * 0.7
    );
    gradient.addColorStop(0, 'transparent');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }

  // ─── Public API ────────────────────────────────────────────────────────

  /**
   * Resize the scene (call on window resize).
   */
  resize() {
    this._setupDPI();
    this._setupParticles();
  }

  /**
   * Trigger a particle burst (e.g., on state transition).
   * @param {number} [count=20]
   */
  burst(count = 20) {
    const ambient = this.particles.getEmitter('ambient');
    if (ambient) {
      ambient.burst(count);
    }
  }

  /**
   * Get current FPS.
   * @returns {number}
   */
  getFPS() {
    return this._fps;
  }

  /**
   * Get scene stats.
   * @returns {Object}
   */
  getStats() {
    return {
      fps: this._fps,
      particles: this.particles.getStats(),
      avatarState: this.avatar.state,
      avatarExpression: this.avatar.expressions.getExpression(),
      dimensions: { width: this._width, height: this._height }
    };
  }

  /**
   * Update scene configuration.
   * @param {Partial<typeof DEFAULT_CONFIG>} updates
   */
  updateConfig(updates) {
    this.config = { ...this.config, ...updates };
    if (typeof updates.maxFPS === 'number') {
      this._minFrameTime = 1000 / updates.maxFPS;
    }
  }

  /**
   * Perform a single render frame (for testing or static rendering).
   * @param {number} [dt=0.016]
   */
  renderFrame(dt = 0.016) {
    this._update(dt);
    this._render();
  }
}
