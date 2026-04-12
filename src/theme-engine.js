/**
 * Theme Engine — Dynamic theming with real-time CSS custom property updates.
 *
 * Features:
 *   - Predefined theme palettes (cosmic, ocean, sunset, forest, midnight, aurora)
 *   - User-customizable accent colors, surfaces, borders
 *   - Dark/light mode with smooth transitions
 *   - Glassmorphism effects with configurable blur/opacity
 *   - Animated gradient backgrounds
 *   - Per-component theming
 *   - Theme persistence via localStorage
 *   - Accessible contrast checking (WCAG AA)
 */

// ─── Theme Palettes ──────────────────────────────────────────────────────────

export const THEME_PALETTES = {
  cosmic: {
    id: 'cosmic',
    name: 'Cosmic',
    description: 'Deep space with violet accents',
    bg: '#07080e',
    bg2: '#0c0d1a',
    fg: '#eaeaff',
    fgMuted: '#6868a0',
    fgDim: '#7676b0',
    accent: '#7c5cfc',
    accentAlt: '#3b8ef0',
    accentGlow: 'rgba(124, 92, 252, 0.28)',
    surface: 'rgba(255, 255, 255, 0.04)',
    surfaceSolid: '#0f1020',
    surfaceHover: 'rgba(255, 255, 255, 0.07)',
    surfaceGlass: 'rgba(7, 8, 14, 0.88)',
    border: 'rgba(255, 255, 255, 0.08)',
    borderBright: 'rgba(255, 255, 255, 0.14)',
    borderAccent: 'rgba(124, 92, 252, 0.45)',
    gradient: 'linear-gradient(135deg, #7c5cfc 0%, #3b8ef0 100%)',
    particleColor: '#7c5cfc',
    avatarGlow: '#7c5cfc',
    mode: 'dark'
  },
  ocean: {
    id: 'ocean',
    name: 'Ocean',
    description: 'Deep sea with teal highlights',
    bg: '#040e14',
    bg2: '#081820',
    fg: '#e0f4ff',
    fgMuted: '#5090a8',
    fgDim: '#6ca8c0',
    accent: '#00bcd4',
    accentAlt: '#0097a7',
    accentGlow: 'rgba(0, 188, 212, 0.25)',
    surface: 'rgba(0, 188, 212, 0.04)',
    surfaceSolid: '#081820',
    surfaceHover: 'rgba(0, 188, 212, 0.08)',
    surfaceGlass: 'rgba(4, 14, 20, 0.90)',
    border: 'rgba(0, 188, 212, 0.10)',
    borderBright: 'rgba(0, 188, 212, 0.20)',
    borderAccent: 'rgba(0, 188, 212, 0.45)',
    gradient: 'linear-gradient(135deg, #00bcd4 0%, #0097a7 100%)',
    particleColor: '#00bcd4',
    avatarGlow: '#00bcd4',
    mode: 'dark'
  },
  sunset: {
    id: 'sunset',
    name: 'Sunset',
    description: 'Warm twilight with amber glow',
    bg: '#12080a',
    bg2: '#1a0c10',
    fg: '#ffe8e0',
    fgMuted: '#a06850',
    fgDim: '#b08070',
    accent: '#ff6b35',
    accentAlt: '#ff9500',
    accentGlow: 'rgba(255, 107, 53, 0.25)',
    surface: 'rgba(255, 107, 53, 0.04)',
    surfaceSolid: '#1a0c10',
    surfaceHover: 'rgba(255, 107, 53, 0.08)',
    surfaceGlass: 'rgba(18, 8, 10, 0.90)',
    border: 'rgba(255, 107, 53, 0.10)',
    borderBright: 'rgba(255, 107, 53, 0.20)',
    borderAccent: 'rgba(255, 107, 53, 0.45)',
    gradient: 'linear-gradient(135deg, #ff6b35 0%, #ff9500 100%)',
    particleColor: '#ff6b35',
    avatarGlow: '#ff9500',
    mode: 'dark'
  },
  forest: {
    id: 'forest',
    name: 'Forest',
    description: 'Natural green with earth tones',
    bg: '#060e08',
    bg2: '#0a1610',
    fg: '#e0ffe8',
    fgMuted: '#508060',
    fgDim: '#70a880',
    accent: '#4caf50',
    accentAlt: '#66bb6a',
    accentGlow: 'rgba(76, 175, 80, 0.25)',
    surface: 'rgba(76, 175, 80, 0.04)',
    surfaceSolid: '#0a1610',
    surfaceHover: 'rgba(76, 175, 80, 0.08)',
    surfaceGlass: 'rgba(6, 14, 8, 0.90)',
    border: 'rgba(76, 175, 80, 0.10)',
    borderBright: 'rgba(76, 175, 80, 0.20)',
    borderAccent: 'rgba(76, 175, 80, 0.45)',
    gradient: 'linear-gradient(135deg, #4caf50 0%, #66bb6a 100%)',
    particleColor: '#4caf50',
    avatarGlow: '#66bb6a',
    mode: 'dark'
  },
  midnight: {
    id: 'midnight',
    name: 'Midnight',
    description: 'Pure dark with ice blue accents',
    bg: '#000000',
    bg2: '#080808',
    fg: '#e8eeff',
    fgMuted: '#5060a8',
    fgDim: '#6878c0',
    accent: '#448aff',
    accentAlt: '#2962ff',
    accentGlow: 'rgba(68, 138, 255, 0.25)',
    surface: 'rgba(68, 138, 255, 0.04)',
    surfaceSolid: '#080810',
    surfaceHover: 'rgba(68, 138, 255, 0.08)',
    surfaceGlass: 'rgba(0, 0, 0, 0.92)',
    border: 'rgba(68, 138, 255, 0.10)',
    borderBright: 'rgba(68, 138, 255, 0.20)',
    borderAccent: 'rgba(68, 138, 255, 0.45)',
    gradient: 'linear-gradient(135deg, #448aff 0%, #2962ff 100%)',
    particleColor: '#448aff',
    avatarGlow: '#448aff',
    mode: 'dark'
  },
  aurora: {
    id: 'aurora',
    name: 'Aurora',
    description: 'Northern lights with shifting colors',
    bg: '#050812',
    bg2: '#080c1a',
    fg: '#e8f0ff',
    fgMuted: '#6078a8',
    fgDim: '#7890c0',
    accent: '#7c4dff',
    accentAlt: '#00e5ff',
    accentGlow: 'rgba(124, 77, 255, 0.25)',
    surface: 'rgba(124, 77, 255, 0.04)',
    surfaceSolid: '#080c1a',
    surfaceHover: 'rgba(124, 77, 255, 0.08)',
    surfaceGlass: 'rgba(5, 8, 18, 0.90)',
    border: 'rgba(124, 77, 255, 0.10)',
    borderBright: 'rgba(124, 77, 255, 0.20)',
    borderAccent: 'rgba(0, 229, 255, 0.45)',
    gradient: 'linear-gradient(135deg, #7c4dff 0%, #00e5ff 100%)',
    particleColor: '#00e5ff',
    avatarGlow: '#7c4dff',
    mode: 'dark'
  }
};

/** List of palette IDs. */
export const PALETTE_IDS = Object.keys(THEME_PALETTES);

/** Default palette. */
export const DEFAULT_PALETTE = 'cosmic';

// ─── Color Utilities ─────────────────────────────────────────────────────────

/**
 * Parse hex color to RGB components.
 * @param {string} hex
 * @returns {{ r: number, g: number, b: number }|null}
 */
export function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return null;
  const clean = hex.replace('#', '');
  if (clean.length !== 6 && clean.length !== 3) return null;

  const full = clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean;

  const num = parseInt(full, 16);
  if (isNaN(num)) return null;

  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

/**
 * Calculate relative luminance per WCAG 2.1.
 * @param {{ r: number, g: number, b: number }} rgb
 * @returns {number}
 */
export function relativeLuminance(rgb) {
  if (!rgb) return 0;
  const [rs, gs, bs] = [rgb.r / 255, rgb.g / 255, rgb.b / 255].map(c =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * WCAG contrast ratio between two hex colors.
 * @param {string} hex1
 * @param {string} hex2
 * @returns {number}
 */
export function contrastRatio(hex1, hex2) {
  const l1 = relativeLuminance(hexToRgb(hex1));
  const l2 = relativeLuminance(hexToRgb(hex2));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check if a fg/bg pair meets WCAG AA (4.5:1 for normal text).
 * @param {string} fgHex
 * @param {string} bgHex
 * @returns {boolean}
 */
export function meetsWcagAA(fgHex, bgHex) {
  return contrastRatio(fgHex, bgHex) >= 4.5;
}

// ─── Theme Engine ────────────────────────────────────────────────────────────

const STORAGE_KEY = 'ai-space-theme';

export class ThemeEngine {
  constructor() {
    /** @type {Object} Current active palette */
    this._palette = { ...THEME_PALETTES[DEFAULT_PALETTE] };
    this._customOverrides = {};
    this._transitionEnabled = true;
    this._glassBlur = 20;
    this._glassOpacity = 0.88;
    this.onThemeChange = null;
  }

  /**
   * Initialize theme engine — load saved theme or apply default.
   */
  init() {
    const saved = this._loadSaved();
    if (saved) {
      if (saved.paletteId && THEME_PALETTES[saved.paletteId]) {
        this._palette = { ...THEME_PALETTES[saved.paletteId] };
      }
      if (saved.overrides) {
        this._customOverrides = saved.overrides;
      }
      if (typeof saved.glassBlur === 'number') {
        this._glassBlur = saved.glassBlur;
      }
      if (typeof saved.glassOpacity === 'number') {
        this._glassOpacity = saved.glassOpacity;
      }
    }
    this.apply();
  }

  /**
   * Apply a named palette.
   * @param {string} paletteId
   */
  setPalette(paletteId) {
    const palette = THEME_PALETTES[paletteId];
    if (!palette) return;
    this._palette = { ...palette };
    this._customOverrides = {};
    this.apply();
    this._save();
  }

  /**
   * Override individual theme properties.
   * @param {Object} overrides
   */
  setOverrides(overrides) {
    this._customOverrides = { ...this._customOverrides, ...overrides };
    this.apply();
    this._save();
  }

  /**
   * Set glassmorphism parameters.
   * @param {number} blur - Blur radius in px
   * @param {number} opacity - Background opacity 0-1
   */
  setGlass(blur, opacity) {
    this._glassBlur = Math.max(0, Math.min(100, blur));
    this._glassOpacity = Math.max(0, Math.min(1, opacity));
    this.apply();
    this._save();
  }

  /**
   * Get the current effective palette (base + overrides).
   * @returns {Object}
   */
  getEffectivePalette() {
    return { ...this._palette, ...this._customOverrides };
  }

  /**
   * Apply current theme to document CSS custom properties.
   */
  apply() {
    const p = this.getEffectivePalette();
    const root = typeof document !== 'undefined' ? document.documentElement : null;
    if (!root) return;

    if (this._transitionEnabled) {
      root.style.setProperty('--theme-transition', 'background 0.6s ease, color 0.4s ease, border-color 0.4s ease');
    }

    root.style.setProperty('--bg', p.bg);
    root.style.setProperty('--bg-2', p.bg2);
    root.style.setProperty('--fg', p.fg);
    root.style.setProperty('--fg-muted', p.fgMuted);
    root.style.setProperty('--fg-dim', p.fgDim);
    root.style.setProperty('--accent', p.accent);
    root.style.setProperty('--accent-alt', p.accentAlt);
    root.style.setProperty('--accent-glow', p.accentGlow);
    root.style.setProperty('--accent-gradient', p.gradient);
    root.style.setProperty('--surface', p.surface);
    root.style.setProperty('--surface-solid', p.surfaceSolid);
    root.style.setProperty('--surface-hover', p.surfaceHover);
    root.style.setProperty('--surface-glass', p.surfaceGlass);
    root.style.setProperty('--border', p.border);
    root.style.setProperty('--border-bright', p.borderBright);
    root.style.setProperty('--border-accent', p.borderAccent);
    root.style.setProperty('--glass-blur', `${this._glassBlur}px`);
    root.style.setProperty('--glass-opacity', String(this._glassOpacity));
    root.style.setProperty('--particle-color', p.particleColor);
    root.style.setProperty('--avatar-glow', p.avatarGlow);

    if (this.onThemeChange) {
      this.onThemeChange(p);
    }
  }

  /**
   * List available palettes with metadata.
   * @returns {Array<{id: string, name: string, description: string, accent: string}>}
   */
  listPalettes() {
    return Object.values(THEME_PALETTES).map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      accent: p.accent
    }));
  }

  /**
   * Get the current palette ID.
   * @returns {string}
   */
  get currentPalette() {
    return this._palette.id;
  }

  /** @private */
  _save() {
    try {
      const data = {
        paletteId: this._palette.id,
        overrides: this._customOverrides,
        glassBlur: this._glassBlur,
        glassOpacity: this._glassOpacity
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // localStorage not available
    }
  }

  /** @private */
  _loadSaved() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /**
   * Reset to default theme.
   */
  reset() {
    this._palette = { ...THEME_PALETTES[DEFAULT_PALETTE] };
    this._customOverrides = {};
    this._glassBlur = 20;
    this._glassOpacity = 0.88;
    this.apply();
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }
}
