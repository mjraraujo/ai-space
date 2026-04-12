/**
 * Tests for Theme Engine
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  THEME_PALETTES,
  PALETTE_IDS,
  DEFAULT_PALETTE,
  hexToRgb,
  relativeLuminance,
  contrastRatio,
  meetsWcagAA,
  ThemeEngine
} from '../theme-engine.js';

// ─── Color Utilities ─────────────────────────────────────────────────────────

describe('hexToRgb', () => {
  it('parses 6-digit hex', () => {
    expect(hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
    expect(hexToRgb('#00ff00')).toEqual({ r: 0, g: 255, b: 0 });
    expect(hexToRgb('#0000ff')).toEqual({ r: 0, g: 0, b: 255 });
  });

  it('parses without hash', () => {
    expect(hexToRgb('ff8800')).toEqual({ r: 255, g: 136, b: 0 });
  });

  it('parses 3-digit hex', () => {
    expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb('#000')).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('returns null for invalid input', () => {
    expect(hexToRgb(null)).toBeNull();
    expect(hexToRgb('')).toBeNull();
    expect(hexToRgb('#gg0000')).toBeNull();
    expect(hexToRgb('#ff')).toBeNull();
    expect(hexToRgb(123)).toBeNull();
  });
});

describe('relativeLuminance', () => {
  it('white has luminance ~1', () => {
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 1);
  });

  it('black has luminance 0', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBe(0);
  });

  it('returns 0 for null', () => {
    expect(relativeLuminance(null)).toBe(0);
  });
});

describe('contrastRatio', () => {
  it('black/white is 21:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });

  it('same color is 1:1', () => {
    expect(contrastRatio('#ff0000', '#ff0000')).toBeCloseTo(1, 0);
  });
});

describe('meetsWcagAA', () => {
  it('white on black passes', () => {
    expect(meetsWcagAA('#ffffff', '#000000')).toBe(true);
  });

  it('light gray on white fails', () => {
    expect(meetsWcagAA('#cccccc', '#ffffff')).toBe(false);
  });
});

// ─── Theme Palettes ──────────────────────────────────────────────────────────

describe('Theme Palettes', () => {
  it('has at least 5 palettes', () => {
    expect(PALETTE_IDS.length).toBeGreaterThanOrEqual(5);
  });

  it('default palette exists', () => {
    expect(THEME_PALETTES[DEFAULT_PALETTE]).toBeDefined();
    expect(DEFAULT_PALETTE).toBe('cosmic');
  });

  it('all palettes have required fields', () => {
    for (const id of PALETTE_IDS) {
      const p = THEME_PALETTES[id];
      expect(p.id).toBe(id);
      expect(p.name).toBeTruthy();
      expect(p.bg).toBeTruthy();
      expect(p.fg).toBeTruthy();
      expect(p.accent).toBeTruthy();
      expect(p.mode).toBe('dark');
    }
  });

  it('all palettes have sufficient text contrast', () => {
    for (const id of PALETTE_IDS) {
      const p = THEME_PALETTES[id];
      // fg on bg should pass WCAG AA
      const ratio = contrastRatio(p.fg, p.bg);
      expect(ratio).toBeGreaterThan(4.5);
    }
  });
});

// ─── ThemeEngine ─────────────────────────────────────────────────────────────

describe('ThemeEngine', () => {
  let engine;
  let mockStorage;

  beforeEach(() => {
    mockStorage = {};
    vi.stubGlobal('localStorage', {
      getItem: (key) => mockStorage[key] || null,
      setItem: (key, val) => { mockStorage[key] = val; },
      removeItem: (key) => { delete mockStorage[key]; }
    });
    // Mock document.documentElement
    const mockRoot = { style: { setProperty: vi.fn() } };
    vi.stubGlobal('document', { documentElement: mockRoot });
    engine = new ThemeEngine();
  });

  it('starts with default cosmic palette', () => {
    expect(engine.currentPalette).toBe('cosmic');
  });

  it('init loads saved theme', () => {
    mockStorage['ai-space-theme'] = JSON.stringify({ paletteId: 'ocean' });
    engine.init();
    expect(engine.currentPalette).toBe('ocean');
  });

  it('init with no saved data uses default', () => {
    engine.init();
    expect(engine.currentPalette).toBe('cosmic');
  });

  it('init with invalid saved data uses default', () => {
    mockStorage['ai-space-theme'] = 'not-json';
    engine.init();
    expect(engine.currentPalette).toBe('cosmic');
  });

  it('setPalette changes and saves', () => {
    engine.setPalette('sunset');
    expect(engine.currentPalette).toBe('sunset');
    expect(mockStorage['ai-space-theme']).toBeDefined();
    const saved = JSON.parse(mockStorage['ai-space-theme']);
    expect(saved.paletteId).toBe('sunset');
  });

  it('setPalette ignores unknown', () => {
    engine.setPalette('nonexistent');
    expect(engine.currentPalette).toBe('cosmic');
  });

  it('setOverrides merges with palette', () => {
    engine.setOverrides({ accent: '#ff0000' });
    const effective = engine.getEffectivePalette();
    expect(effective.accent).toBe('#ff0000');
    expect(effective.bg).toBe(THEME_PALETTES.cosmic.bg);
  });

  it('setGlass clamps values', () => {
    engine.setGlass(200, 5);
    const saved = JSON.parse(mockStorage['ai-space-theme']);
    expect(saved.glassBlur).toBe(100);
    expect(saved.glassOpacity).toBe(1);
  });

  it('setGlass saves both params', () => {
    engine.setGlass(30, 0.75);
    const saved = JSON.parse(mockStorage['ai-space-theme']);
    expect(saved.glassBlur).toBe(30);
    expect(saved.glassOpacity).toBe(0.75);
  });

  it('apply sets CSS custom properties', () => {
    engine.apply();
    const root = document.documentElement;
    expect(root.style.setProperty).toHaveBeenCalledWith('--bg', expect.any(String));
    expect(root.style.setProperty).toHaveBeenCalledWith('--accent', expect.any(String));
    expect(root.style.setProperty).toHaveBeenCalledWith('--fg', expect.any(String));
  });

  it('apply calls onThemeChange callback', () => {
    const cb = vi.fn();
    engine.onThemeChange = cb;
    engine.apply();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ bg: expect.any(String) }));
  });

  it('listPalettes returns array with metadata', () => {
    const list = engine.listPalettes();
    expect(list.length).toBe(PALETTE_IDS.length);
    expect(list[0]).toHaveProperty('id');
    expect(list[0]).toHaveProperty('name');
    expect(list[0]).toHaveProperty('accent');
  });

  it('reset restores default', () => {
    engine.setPalette('ocean');
    engine.setOverrides({ accent: '#123456' });
    engine.reset();
    expect(engine.currentPalette).toBe('cosmic');
    const effective = engine.getEffectivePalette();
    expect(effective.accent).toBe(THEME_PALETTES.cosmic.accent);
    expect(mockStorage['ai-space-theme']).toBeUndefined();
  });

  it('init loads glass params', () => {
    mockStorage['ai-space-theme'] = JSON.stringify({ paletteId: 'cosmic', glassBlur: 50, glassOpacity: 0.5 });
    engine.init();
    const root = document.documentElement;
    engine.apply();
    expect(root.style.setProperty).toHaveBeenCalledWith('--glass-blur', '50px');
    expect(root.style.setProperty).toHaveBeenCalledWith('--glass-opacity', '0.5');
  });

  it('setPalette clears overrides', () => {
    engine.setOverrides({ accent: '#ff0000' });
    engine.setPalette('forest');
    const effective = engine.getEffectivePalette();
    expect(effective.accent).toBe(THEME_PALETTES.forest.accent);
  });
});
