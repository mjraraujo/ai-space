/**
 * Accelerator — "quantum" performance presets that combine a KV compression
 * strategy, a compute-mode preference, and Ollama big-model tuning knobs.
 *
 * The goal is "supercomputer on little hardware": give the user one knob
 * that trades quality for speed/throughput in a coherent way across every
 * layer of the stack (context compression, device selection, server-side
 * parallelism, KV-cache quantisation).
 *
 * Presets
 * -------
 *   eco        — cheapest: tiny KV, standard strategy, prefer browser.
 *   balanced   — default: sliding window + flash attention.
 *   turbo      — server GPU first, turbo-compress, 4-way parallel.
 *   quantum    — highest throughput: quantum-compress + q4 KV cache +
 *                max loaded models, intended for boxes with ≥24 GB VRAM.
 *
 * Each preset describes:
 *   • computeMode     — 'auto' | 'server' | 'browser'
 *   • kvStrategy      — one of the KV_STRATEGIES ids
 *   • quantumLevel    — 1..3 (only meaningful when kvStrategy='quantum-compress')
 *   • ollamaEnv       — env-var overrides to apply when provisioning the server
 *   • description     — short UI blurb
 *
 * The module is pure data + helpers; it intentionally does not import the
 * KV engine so it can be used safely from both browser and Node contexts.
 */

/** @typedef {'eco'|'balanced'|'turbo'|'quantum'} AcceleratorPresetId */

export const ACCELERATOR_PRESETS = Object.freeze({
  eco: {
    id: 'eco',
    name: 'Eco',
    icon: '🍃',
    description: 'Minimal resource usage — great for laptops and phones.',
    computeMode: 'browser',
    kvStrategy: 'standard',
    quantumLevel: 1,
    ollamaEnv: {
      OLLAMA_KEEP_ALIVE:        '5m',
      OLLAMA_NUM_PARALLEL:      '1',
      OLLAMA_MAX_LOADED_MODELS: '1',
      OLLAMA_FLASH_ATTENTION:   '0',
      OLLAMA_KV_CACHE_TYPE:     'f16'
    }
  },
  balanced: {
    id: 'balanced',
    name: 'Balanced',
    icon: '⚖︎',
    description: 'Sliding-window context + flash attention. Good default.',
    computeMode: 'auto',
    kvStrategy: 'sliding-window',
    quantumLevel: 1,
    ollamaEnv: {
      OLLAMA_KEEP_ALIVE:        '30m',
      OLLAMA_NUM_PARALLEL:      '2',
      OLLAMA_MAX_LOADED_MODELS: '2',
      OLLAMA_FLASH_ATTENTION:   '1',
      OLLAMA_KV_CACHE_TYPE:     'q8_0'
    }
  },
  turbo: {
    id: 'turbo',
    name: 'Turbo',
    icon: '⚡',
    description: 'Server GPU first, aggressive context compression.',
    computeMode: 'server',
    kvStrategy: 'turbo-compress',
    quantumLevel: 2,
    ollamaEnv: {
      OLLAMA_KEEP_ALIVE:        '24h',
      OLLAMA_NUM_PARALLEL:      '4',
      OLLAMA_MAX_LOADED_MODELS: '3',
      OLLAMA_FLASH_ATTENTION:   '1',
      OLLAMA_KV_CACHE_TYPE:     'q8_0'
    }
  },
  quantum: {
    id: 'quantum',
    name: 'Quantum',
    icon: '⟁',
    description: 'Supercomputer mode — q4 KV cache, quantum dedup, many parallel models.',
    computeMode: 'server',
    kvStrategy: 'quantum-compress',
    quantumLevel: 3,
    ollamaEnv: {
      OLLAMA_KEEP_ALIVE:        '24h',
      OLLAMA_NUM_PARALLEL:      '8',
      OLLAMA_MAX_LOADED_MODELS: '4',
      OLLAMA_FLASH_ATTENTION:   '1',
      OLLAMA_KV_CACHE_TYPE:     'q4_0'
    }
  }
});

/** Ordered list for UI rendering. */
export const ACCELERATOR_PRESET_ORDER = Object.freeze([
  'eco', 'balanced', 'turbo', 'quantum'
]);

export const DEFAULT_ACCELERATOR_PRESET = 'balanced';

export const ACCELERATOR_STORAGE_KEY = 'ai-space.accelerator-preset';

/**
 * Validate a preset id.
 * @param {unknown} id
 * @returns {boolean}
 */
export function isValidPreset(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(ACCELERATOR_PRESETS, id);
}

/**
 * Read the persisted preset (or default).
 * @returns {AcceleratorPresetId}
 */
export function getAcceleratorPreset() {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_ACCELERATOR_PRESET;
    const raw = localStorage.getItem(ACCELERATOR_STORAGE_KEY);
    return isValidPreset(raw) ? raw : DEFAULT_ACCELERATOR_PRESET;
  } catch {
    return DEFAULT_ACCELERATOR_PRESET;
  }
}

/**
 * Persist the preset id.
 * @param {string} id
 * @returns {boolean} true when stored
 */
export function setAcceleratorPreset(id) {
  if (!isValidPreset(id)) return false;
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(ACCELERATOR_STORAGE_KEY, id);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve a preset object by id.  Unknown ids fall back to the default.
 * @param {string} id
 * @returns {typeof ACCELERATOR_PRESETS[AcceleratorPresetId]}
 */
export function resolvePreset(id) {
  return ACCELERATOR_PRESETS[isValidPreset(id) ? id : DEFAULT_ACCELERATOR_PRESET];
}

/**
 * Recommend a preset based on a coarse hardware profile.  Pure function —
 * all inputs are numbers so it's safe in both browser and Node.
 *
 * @param {object} hw
 * @param {number} [hw.vramGb]     — detected GPU VRAM, or 0 for none
 * @param {boolean} [hw.webgpu]    — WebGPU available in the browser
 * @param {boolean} [hw.serverGpu] — server reports a CUDA/ROCm GPU
 * @returns {AcceleratorPresetId}
 */
export function recommendPreset({ vramGb = 0, webgpu = false, serverGpu = false } = {}) {
  if (serverGpu && vramGb >= 24) return 'quantum';
  if (serverGpu && vramGb >= 12) return 'turbo';
  if (webgpu) return 'balanced';
  return 'eco';
}

/**
 * Build a shell env fragment (e.g. for .env files) from a preset.  Useful
 * when users want to wire the recommended knobs into their compose stack.
 *
 * @param {AcceleratorPresetId} id
 * @returns {string}
 */
export function renderEnvFile(id) {
  const preset = resolvePreset(id);
  const lines = [`# AI Space accelerator preset: ${preset.name}`];
  for (const [k, v] of Object.entries(preset.ollamaEnv)) {
    lines.push(`${k}=${v}`);
  }
  return lines.join('\n') + '\n';
}
