/**
 * Compute Mode — user-controlled switch between browser (WebGPU) and
 * server-side GPU inference.
 *
 * Modes:
 *   • 'auto'    — current behaviour: use WebGPU if present, else fall back
 *                 to the server client when `window.__SERVER_URL__` is set.
 *                 Default for new users.
 *   • 'server'  — always route chat / STT / TTS through the ai-server.
 *                 The browser does NOT initialise WebLLM / WebGPU.  Use this
 *                 when you want huge (70B-class) models hosted on a GPU box
 *                 and only need a thin client in the browser.
 *   • 'browser' — force the in-browser WebGPU path and never call the server
 *                 even if one is configured.  Useful for strict privacy.
 *
 * Persistence:
 *   The selected mode is saved in localStorage under `ai-space.compute-mode`.
 *   This module is framework-free and safe to import from anywhere.
 */

export const COMPUTE_MODES = Object.freeze(['auto', 'server', 'browser']);

/** Default mode for a fresh install. */
export const DEFAULT_COMPUTE_MODE = 'auto';

/** localStorage key. */
export const COMPUTE_MODE_STORAGE_KEY = 'ai-space.compute-mode';

/**
 * Return true when the given value is one of the recognised modes.
 * @param {unknown} mode
 * @returns {boolean}
 */
export function isValidComputeMode(mode) {
  return typeof mode === 'string' && COMPUTE_MODES.includes(mode);
}

/**
 * Read the persisted compute mode (or default).  Safe in non-browser
 * environments — returns the default when localStorage is unavailable.
 * @returns {'auto'|'server'|'browser'}
 */
export function getComputeMode() {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_COMPUTE_MODE;
    const raw = localStorage.getItem(COMPUTE_MODE_STORAGE_KEY);
    return isValidComputeMode(raw) ? raw : DEFAULT_COMPUTE_MODE;
  } catch {
    return DEFAULT_COMPUTE_MODE;
  }
}

/**
 * Persist a compute mode.  Invalid values are rejected.
 * @param {string} mode
 * @returns {boolean} true when the value was stored
 */
export function setComputeMode(mode) {
  if (!isValidComputeMode(mode)) return false;
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(COMPUTE_MODE_STORAGE_KEY, mode);
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether a server URL has been injected by the Docker entrypoint.
 * @returns {boolean}
 */
export function hasServerClient() {
  return typeof globalThis !== 'undefined' &&
    typeof globalThis.window !== 'undefined' &&
    Boolean(globalThis.window.__SERVER_URL__);
}

/**
 * Decide which backend to use right now, given the persisted mode and the
 * environment.  Pure function — no I/O.
 *
 * @param {object} env
 * @param {'auto'|'server'|'browser'} env.mode
 * @param {boolean} env.webgpuAvailable
 * @param {boolean} env.serverConfigured
 * @returns {'server'|'browser'}
 */
export function resolveBackend({ mode, webgpuAvailable, serverConfigured }) {
  if (mode === 'server')  return serverConfigured ? 'server' : 'browser';
  if (mode === 'browser') return 'browser';
  // auto — prefer browser when WebGPU is available, else server if possible
  if (webgpuAvailable) return 'browser';
  return serverConfigured ? 'server' : 'browser';
}

/**
 * Short human-readable label for UI surfaces.
 * @param {'auto'|'server'|'browser'} mode
 */
export function computeModeLabel(mode) {
  switch (mode) {
    case 'server':  return 'Server GPU (Docker)';
    case 'browser': return 'Browser WebGPU';
    case 'auto':
    default:        return 'Auto (prefer device)';
  }
}
