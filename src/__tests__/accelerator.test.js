import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ACCELERATOR_PRESETS,
  ACCELERATOR_PRESET_ORDER,
  DEFAULT_ACCELERATOR_PRESET,
  ACCELERATOR_STORAGE_KEY,
  isValidPreset,
  getAcceleratorPreset,
  setAcceleratorPreset,
  resolvePreset,
  recommendPreset,
  renderEnvFile
} from '../accelerator.js';

function installLocalStorage() {
  const store = new Map();
  vi.stubGlobal('localStorage', {
    getItem:    (k) => (store.has(k) ? store.get(k) : null),
    setItem:    (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear:      () => store.clear()
  });
  return store;
}

describe('accelerator presets', () => {
  beforeEach(() => { installLocalStorage(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('has exactly four presets: eco / balanced / turbo / quantum', () => {
    expect(ACCELERATOR_PRESET_ORDER).toEqual(['eco', 'balanced', 'turbo', 'quantum']);
    expect(Object.keys(ACCELERATOR_PRESETS).sort()).toEqual(['balanced', 'eco', 'quantum', 'turbo']);
  });

  it('every preset has the required shape', () => {
    for (const p of Object.values(ACCELERATOR_PRESETS)) {
      expect(p).toHaveProperty('id');
      expect(p).toHaveProperty('name');
      expect(p).toHaveProperty('description');
      expect(['auto', 'server', 'browser']).toContain(p.computeMode);
      expect(typeof p.kvStrategy).toBe('string');
      expect(typeof p.quantumLevel).toBe('number');
      expect(p.ollamaEnv).toHaveProperty('OLLAMA_KEEP_ALIVE');
      expect(p.ollamaEnv).toHaveProperty('OLLAMA_NUM_PARALLEL');
      expect(p.ollamaEnv).toHaveProperty('OLLAMA_MAX_LOADED_MODELS');
      expect(p.ollamaEnv).toHaveProperty('OLLAMA_FLASH_ATTENTION');
      expect(p.ollamaEnv).toHaveProperty('OLLAMA_KV_CACHE_TYPE');
    }
  });

  it('quantum uses quantum-compress at level 3 with q4 KV cache', () => {
    const p = ACCELERATOR_PRESETS.quantum;
    expect(p.kvStrategy).toBe('quantum-compress');
    expect(p.quantumLevel).toBe(3);
    expect(p.ollamaEnv.OLLAMA_KV_CACHE_TYPE).toBe('q4_0');
  });

  it('parallelism grows eco → quantum', () => {
    const toInt = (s) => parseInt(s, 10);
    expect(toInt(ACCELERATOR_PRESETS.eco.ollamaEnv.OLLAMA_NUM_PARALLEL))
      .toBeLessThan(toInt(ACCELERATOR_PRESETS.balanced.ollamaEnv.OLLAMA_NUM_PARALLEL));
    expect(toInt(ACCELERATOR_PRESETS.balanced.ollamaEnv.OLLAMA_NUM_PARALLEL))
      .toBeLessThan(toInt(ACCELERATOR_PRESETS.turbo.ollamaEnv.OLLAMA_NUM_PARALLEL));
    expect(toInt(ACCELERATOR_PRESETS.turbo.ollamaEnv.OLLAMA_NUM_PARALLEL))
      .toBeLessThan(toInt(ACCELERATOR_PRESETS.quantum.ollamaEnv.OLLAMA_NUM_PARALLEL));
  });

  it('isValidPreset only accepts known ids', () => {
    expect(isValidPreset('eco')).toBe(true);
    expect(isValidPreset('quantum')).toBe(true);
    expect(isValidPreset('nope')).toBe(false);
    expect(isValidPreset(null)).toBe(false);
    expect(isValidPreset(undefined)).toBe(false);
  });

  it('defaults to balanced and persists', () => {
    expect(DEFAULT_ACCELERATOR_PRESET).toBe('balanced');
    expect(getAcceleratorPreset()).toBe('balanced');
    expect(setAcceleratorPreset('turbo')).toBe(true);
    expect(localStorage.getItem(ACCELERATOR_STORAGE_KEY)).toBe('turbo');
    expect(getAcceleratorPreset()).toBe('turbo');
  });

  it('setAcceleratorPreset rejects invalid ids', () => {
    expect(setAcceleratorPreset('hyperdrive')).toBe(false);
    expect(localStorage.getItem(ACCELERATOR_STORAGE_KEY)).toBe(null);
  });

  it('resolvePreset returns default for unknown ids', () => {
    expect(resolvePreset('xxx').id).toBe('balanced');
    expect(resolvePreset('quantum').id).toBe('quantum');
  });

  it('recommendPreset tracks hardware class', () => {
    expect(recommendPreset({ serverGpu: true, vramGb: 48 })).toBe('quantum');
    expect(recommendPreset({ serverGpu: true, vramGb: 16 })).toBe('turbo');
    expect(recommendPreset({ webgpu: true })).toBe('balanced');
    expect(recommendPreset({})).toBe('eco');
  });

  it('renderEnvFile produces KEY=VALUE lines for all ollama knobs', () => {
    const env = renderEnvFile('quantum');
    expect(env).toMatch(/OLLAMA_KEEP_ALIVE=/);
    expect(env).toMatch(/OLLAMA_NUM_PARALLEL=/);
    expect(env).toMatch(/OLLAMA_MAX_LOADED_MODELS=/);
    expect(env).toMatch(/OLLAMA_FLASH_ATTENTION=/);
    expect(env).toMatch(/OLLAMA_KV_CACHE_TYPE=q4_0/);
    // unknown id still works (falls back to default)
    expect(renderEnvFile('nope')).toMatch(/OLLAMA_KEEP_ALIVE=/);
  });
});
