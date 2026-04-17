import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  COMPUTE_MODES,
  DEFAULT_COMPUTE_MODE,
  COMPUTE_MODE_STORAGE_KEY,
  isValidComputeMode,
  getComputeMode,
  setComputeMode,
  resolveBackend,
  computeModeLabel,
  hasServerClient
} from '../compute-mode.js';

// Minimal in-memory localStorage shim for the node test environment.
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

describe('compute-mode', () => {
  let store;
  beforeEach(() => { store = installLocalStorage(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('exposes exactly three modes', () => {
    expect(COMPUTE_MODES).toEqual(['auto', 'server', 'browser']);
  });

  it('defaults to auto', () => {
    expect(DEFAULT_COMPUTE_MODE).toBe('auto');
    expect(getComputeMode()).toBe('auto');
  });

  it('isValidComputeMode accepts only known modes', () => {
    expect(isValidComputeMode('auto')).toBe(true);
    expect(isValidComputeMode('server')).toBe(true);
    expect(isValidComputeMode('browser')).toBe(true);
    expect(isValidComputeMode('cloud')).toBe(false);
    expect(isValidComputeMode('')).toBe(false);
    expect(isValidComputeMode(null)).toBe(false);
    expect(isValidComputeMode(undefined)).toBe(false);
    expect(isValidComputeMode(42)).toBe(false);
  });

  it('setComputeMode persists a valid value', () => {
    expect(setComputeMode('server')).toBe(true);
    expect(localStorage.getItem(COMPUTE_MODE_STORAGE_KEY)).toBe('server');
    expect(getComputeMode()).toBe('server');
  });

  it('setComputeMode rejects invalid values', () => {
    expect(setComputeMode('nonsense')).toBe(false);
    expect(localStorage.getItem(COMPUTE_MODE_STORAGE_KEY)).toBe(null);
  });

  it('getComputeMode falls back to default for unknown stored values', () => {
    localStorage.setItem(COMPUTE_MODE_STORAGE_KEY, 'bogus');
    expect(getComputeMode()).toBe('auto');
  });

  it('computeModeLabel provides a label for each mode (and default)', () => {
    expect(computeModeLabel('auto')).toMatch(/Auto/);
    expect(computeModeLabel('server')).toMatch(/Server/);
    expect(computeModeLabel('browser')).toMatch(/Browser/);
    // default branch
    expect(computeModeLabel('unknown')).toMatch(/Auto/);
  });

  it('hasServerClient reflects window.__SERVER_URL__', () => {
    const hadWindow = typeof globalThis.window !== 'undefined';
    const prev = hadWindow ? globalThis.window.__SERVER_URL__ : undefined;
    try {
      if (!hadWindow) vi.stubGlobal('window', {});
      globalThis.window.__SERVER_URL__ = '';
      expect(hasServerClient()).toBe(false);
      globalThis.window.__SERVER_URL__ = 'http://x';
      expect(hasServerClient()).toBe(true);
    } finally {
      if (hadWindow) {
        globalThis.window.__SERVER_URL__ = prev;
      }
    }
  });
});

describe('resolveBackend', () => {
  it('mode=server returns server when configured, else browser', () => {
    expect(resolveBackend({ mode: 'server', webgpuAvailable: true,  serverConfigured: true })).toBe('server');
    expect(resolveBackend({ mode: 'server', webgpuAvailable: false, serverConfigured: true })).toBe('server');
    expect(resolveBackend({ mode: 'server', webgpuAvailable: true,  serverConfigured: false })).toBe('browser');
  });

  it('mode=browser always returns browser', () => {
    expect(resolveBackend({ mode: 'browser', webgpuAvailable: true,  serverConfigured: true })).toBe('browser');
    expect(resolveBackend({ mode: 'browser', webgpuAvailable: false, serverConfigured: true })).toBe('browser');
  });

  it('mode=auto prefers browser when WebGPU is available', () => {
    expect(resolveBackend({ mode: 'auto', webgpuAvailable: true,  serverConfigured: true })).toBe('browser');
    expect(resolveBackend({ mode: 'auto', webgpuAvailable: true,  serverConfigured: false })).toBe('browser');
  });

  it('mode=auto falls back to server when WebGPU is missing', () => {
    expect(resolveBackend({ mode: 'auto', webgpuAvailable: false, serverConfigured: true })).toBe('server');
  });

  it('mode=auto returns browser as last resort (no WebGPU, no server)', () => {
    expect(resolveBackend({ mode: 'auto', webgpuAvailable: false, serverConfigured: false })).toBe('browser');
  });
});
