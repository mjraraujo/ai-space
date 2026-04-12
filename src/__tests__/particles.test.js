/**
 * Tests for Particle System
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ParticlePool,
  ParticleEmitter,
  ParticleSystem,
  EMITTER_PRESETS
} from '../particles.js';

// ─── ParticlePool ────────────────────────────────────────────────────────────

describe('ParticlePool', () => {
  it('creates pool with default size', () => {
    const pool = new ParticlePool();
    expect(pool.size).toBe(500);
    expect(pool.particles.length).toBe(500);
    expect(pool.activeCount).toBe(0);
  });

  it('creates pool with custom size', () => {
    const pool = new ParticlePool(100);
    expect(pool.size).toBe(100);
    expect(pool.particles.length).toBe(100);
  });

  it('caps pool at MAX_POOL_SIZE', () => {
    const pool = new ParticlePool(5000);
    expect(pool.size).toBe(2000);
  });

  it('acquire returns inactive particle', () => {
    const pool = new ParticlePool(10);
    const p = pool.acquire();
    expect(p).not.toBeNull();
    expect(pool.activeCount).toBe(0); // Not active until set
  });

  it('acquire returns null when pool exhausted', () => {
    const pool = new ParticlePool(2);
    pool.particles[0].active = true;
    pool.particles[1].active = true;
    expect(pool.acquire()).toBeNull();
  });

  it('release deactivates particle', () => {
    const pool = new ParticlePool(10);
    const p = pool.acquire();
    p.active = true;
    expect(pool.activeCount).toBe(1);
    pool.release(p);
    expect(pool.activeCount).toBe(0);
  });

  it('reset deactivates all particles', () => {
    const pool = new ParticlePool(10);
    pool.particles[0].active = true;
    pool.particles[1].active = true;
    pool.particles[2].active = true;
    expect(pool.activeCount).toBe(3);
    pool.reset();
    expect(pool.activeCount).toBe(0);
  });

  it('particles have expected default properties', () => {
    const pool = new ParticlePool(1);
    const p = pool.particles[0];
    expect(p.x).toBe(0);
    expect(p.y).toBe(0);
    expect(p.active).toBe(false);
    expect(p.shape).toBe('circle');
    expect(p.color).toBe('#ffffff');
  });
});

// ─── EmitterPresets ──────────────────────────────────────────────────────────

describe('EMITTER_PRESETS', () => {
  it('has ambient, sparkle, pulse, energy, stars presets', () => {
    expect(EMITTER_PRESETS.ambient).toBeDefined();
    expect(EMITTER_PRESETS.sparkle).toBeDefined();
    expect(EMITTER_PRESETS.pulse).toBeDefined();
    expect(EMITTER_PRESETS.energy).toBeDefined();
    expect(EMITTER_PRESETS.stars).toBeDefined();
  });

  it('presets have required fields', () => {
    for (const [name, preset] of Object.entries(EMITTER_PRESETS)) {
      expect(preset.rate).toBeGreaterThan(0);
      expect(preset.minLife).toBeGreaterThan(0);
      expect(preset.maxLife).toBeGreaterThanOrEqual(preset.minLife);
      expect(preset.shape).toBeTruthy();
      expect(preset.color).toBeTruthy();
    }
  });
});

// ─── ParticleEmitter ─────────────────────────────────────────────────────────

describe('ParticleEmitter', () => {
  it('spawns particles at rate', () => {
    const pool = new ParticlePool(100);
    const emitter = new ParticleEmitter(pool, {
      ...EMITTER_PRESETS.ambient,
      rate: 10,
      x: 50,
      y: 50
    });
    emitter.update(1); // 1 second should spawn ~10 particles
    expect(pool.activeCount).toBeGreaterThanOrEqual(8);
    expect(pool.activeCount).toBeLessThanOrEqual(12);
  });

  it('burst spawns immediate particles', () => {
    const pool = new ParticlePool(100);
    const emitter = new ParticleEmitter(pool, { ...EMITTER_PRESETS.sparkle, rate: 0 });
    emitter.burst(20);
    emitter.update(0.016);
    expect(pool.activeCount).toBe(20);
  });

  it('inactive emitter does not spawn', () => {
    const pool = new ParticlePool(100);
    const emitter = new ParticleEmitter(pool, { ...EMITTER_PRESETS.ambient, rate: 100 });
    emitter.active = false;
    emitter.update(1);
    expect(pool.activeCount).toBe(0);
  });

  it('spawned particles have position near emitter', () => {
    const pool = new ParticlePool(100);
    const emitter = new ParticleEmitter(pool, { ...EMITTER_PRESETS.ambient, rate: 100, x: 200, y: 300 });
    emitter.update(0.1);
    const active = pool.particles.filter(p => p.active);
    expect(active.length).toBeGreaterThan(0);
    for (const p of active) {
      expect(Math.abs(p.x - 200)).toBeLessThan(20);
      expect(Math.abs(p.y - 300)).toBeLessThan(20);
    }
  });

  it('burst works even when emitter inactive', () => {
    const pool = new ParticlePool(100);
    const emitter = new ParticleEmitter(pool, { ...EMITTER_PRESETS.sparkle, rate: 0 });
    emitter.active = false;
    emitter.burst(5);
    emitter.update(0.016);
    expect(pool.activeCount).toBe(5);
  });
});

// ─── ParticleSystem ──────────────────────────────────────────────────────────

describe('ParticleSystem', () => {
  it('creates system without canvas (headless)', () => {
    const system = new ParticleSystem();
    expect(system.canvas).toBeNull();
    expect(system.ctx).toBeNull();
    expect(system.running).toBe(false);
  });

  it('addEmitter / getEmitter / removeEmitter', () => {
    const system = new ParticleSystem();
    const emitter = system.addEmitter('test', EMITTER_PRESETS.ambient);
    expect(system.getEmitter('test')).toBe(emitter);
    system.removeEmitter('test');
    expect(system.getEmitter('test')).toBeUndefined();
  });

  it('update advances particles', () => {
    const system = new ParticleSystem();
    system.addEmitter('amb', { ...EMITTER_PRESETS.ambient, rate: 50 });
    system.update(1);
    expect(system.pool.activeCount).toBeGreaterThan(0);
  });

  it('particles die after lifetime', () => {
    const system = new ParticleSystem();
    system.addEmitter('test', { ...EMITTER_PRESETS.ambient, rate: 100, minLife: 0.1, maxLife: 0.1 });
    system.update(0.05); // Spawn particles
    const spawned = system.pool.activeCount;
    expect(spawned).toBeGreaterThan(0);
    system.update(0.2); // Particles should die
    // May have some new ones from continued emission, but net should decrease
    // Disable emitter to test pure death
    system.getEmitter('test').active = false;
    system.update(0.5); // All should be dead
    expect(system.pool.activeCount).toBe(0);
  });

  it('getStats returns useful info', () => {
    const system = new ParticleSystem();
    system.addEmitter('a', EMITTER_PRESETS.ambient);
    const stats = system.getStats();
    expect(stats.active).toBe(0);
    expect(stats.poolSize).toBe(500);
    expect(stats.emitterCount).toBe(1);
  });

  it('reset clears everything', () => {
    const system = new ParticleSystem();
    system.addEmitter('a', { ...EMITTER_PRESETS.ambient, rate: 100 });
    system.update(1);
    expect(system.pool.activeCount).toBeGreaterThan(0);
    system.reset();
    expect(system.pool.activeCount).toBe(0);
    expect(system.emitters.size).toBe(0);
  });

  it('render is no-op without canvas', () => {
    const system = new ParticleSystem();
    system.render(); // Should not throw
  });

  it('stop clears animation frame', () => {
    const system = new ParticleSystem();
    system.stop(); // Should not throw even if not running
    expect(system.running).toBe(false);
  });

  it('particles apply gravity', () => {
    const system = new ParticleSystem();
    system._gravity = 10;
    system.addEmitter('test', { ...EMITTER_PRESETS.ambient, rate: 50 });
    system.update(0.5);
    const active = system.pool.particles.filter(p => p.active);
    expect(active.length).toBeGreaterThan(0);
  });
});
