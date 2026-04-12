/**
 * Tests for Avatar Renderer
 */
import { describe, it, expect, vi } from 'vitest';
import {
  renderAvatar,
  getAvailableStyles,
  hexToRgba,
  lightenHex,
  darkenHex,
  drawGlowAura,
  drawFaceCircle,
  drawEyes,
  drawMouth,
  STYLE_RENDERERS
} from '../avatar-renderer.js';

// ─── Mock Canvas Context ─────────────────────────────────────────────────────

function createMockCtx() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    ellipse: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    closePath: vi.fn(),
    fillRect: vi.fn(),
    createRadialGradient: vi.fn(() => ({
      addColorStop: vi.fn()
    })),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    globalAlpha: 1,
    lineCap: ''
  };
}

// ─── Color Utilities ─────────────────────────────────────────────────────────

describe('hexToRgba', () => {
  it('converts hex to rgba', () => {
    expect(hexToRgba('#ff0000', 0.5)).toBe('rgba(255,0,0,0.5)');
    expect(hexToRgba('#00ff00', 1)).toBe('rgba(0,255,0,1)');
  });

  it('handles null/short hex gracefully', () => {
    expect(hexToRgba(null, 0.5)).toContain('rgba(128,128,128');
    expect(hexToRgba('#fff', 0.5)).toContain('rgba(128,128,128');
  });
});

describe('lightenHex', () => {
  it('lightens color', () => {
    expect(lightenHex('#000000', 100)).toBe('#646464');
    expect(lightenHex('#800000', 50)).toBe('#b23232');
  });

  it('clamps at 255', () => {
    expect(lightenHex('#ffffff', 100)).toBe('#ffffff');
  });

  it('handles invalid input', () => {
    expect(lightenHex(null, 50)).toBe('#ffffff');
    expect(lightenHex('#ff', 50)).toBe('#ffffff');
  });
});

describe('darkenHex', () => {
  it('darkens color', () => {
    expect(darkenHex('#ffffff', 100)).toBe('#9b9b9b');
  });

  it('clamps at 0', () => {
    expect(darkenHex('#000000', 100)).toBe('#000000');
  });

  it('handles invalid input', () => {
    expect(darkenHex(null, 50)).toBe('#000000');
  });
});

// ─── Available Styles ────────────────────────────────────────────────────────

describe('getAvailableStyles', () => {
  it('returns array of style names', () => {
    const styles = getAvailableStyles();
    expect(styles).toContain('minimal');
    expect(styles).toContain('geometric');
    expect(styles).toContain('organic');
    expect(styles).toContain('holographic');
    expect(styles).toContain('pixel');
    expect(styles.length).toBe(5);
  });
});

describe('STYLE_RENDERERS', () => {
  it('has a renderer for each style', () => {
    const styles = getAvailableStyles();
    for (const style of styles) {
      expect(typeof STYLE_RENDERERS[style]).toBe('function');
    }
  });
});

// ─── renderAvatar ────────────────────────────────────────────────────────────

describe('renderAvatar', () => {
  const defaultOpts = {
    cx: 100,
    cy: 100,
    size: 50,
    expr: {
      eyeOpenL: 1, eyeOpenR: 1,
      mouthOpen: 0, mouthSmile: 0.5, mouthWidth: 0.5,
      pupilX: 0, pupilY: 0, pupilSize: 1,
      headTiltZ: 0, glow: 0.5
    },
    colors: {
      primary: '#7c5cfc',
      secondary: '#3b8ef0',
      eye: '#ffffff',
      glow: '#7c5cfc'
    }
  };

  it('renders minimal style without errors', () => {
    const ctx = createMockCtx();
    renderAvatar(ctx, { ...defaultOpts, style: 'minimal' });
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
  });

  it('renders geometric style without errors', () => {
    const ctx = createMockCtx();
    renderAvatar(ctx, { ...defaultOpts, style: 'geometric' });
    expect(ctx.save).toHaveBeenCalled();
  });

  it('renders organic style without errors', () => {
    const ctx = createMockCtx();
    renderAvatar(ctx, { ...defaultOpts, style: 'organic', time: 1.5 });
    expect(ctx.save).toHaveBeenCalled();
  });

  it('renders holographic style without errors', () => {
    const ctx = createMockCtx();
    renderAvatar(ctx, { ...defaultOpts, style: 'holographic', time: 2.0 });
    expect(ctx.save).toHaveBeenCalled();
  });

  it('renders pixel style without errors', () => {
    const ctx = createMockCtx();
    renderAvatar(ctx, { ...defaultOpts, style: 'pixel' });
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.fillRect).toHaveBeenCalled();
  });

  it('defaults to minimal for unknown style', () => {
    const ctx = createMockCtx();
    renderAvatar(ctx, { ...defaultOpts, style: 'nonexistent' });
    expect(ctx.save).toHaveBeenCalled();
  });

  it('applies head tilt rotation', () => {
    const ctx = createMockCtx();
    renderAvatar(ctx, {
      ...defaultOpts,
      expr: { ...defaultOpts.expr, headTiltZ: 0.5 }
    });
    expect(ctx.translate).toHaveBeenCalled();
    expect(ctx.rotate).toHaveBeenCalled();
  });

  it('handles missing expr gracefully', () => {
    const ctx = createMockCtx();
    renderAvatar(ctx, { ...defaultOpts, expr: {} });
    expect(ctx.save).toHaveBeenCalled();
  });

  it('handles missing colors gracefully', () => {
    const ctx = createMockCtx();
    renderAvatar(ctx, { ...defaultOpts, colors: {} });
    expect(ctx.save).toHaveBeenCalled();
  });

  it('renders closed eyes', () => {
    const ctx = createMockCtx();
    renderAvatar(ctx, {
      ...defaultOpts,
      expr: { ...defaultOpts.expr, eyeOpenL: 0, eyeOpenR: 0 }
    });
    expect(ctx.save).toHaveBeenCalled();
  });

  it('renders open mouth', () => {
    const ctx = createMockCtx();
    renderAvatar(ctx, {
      ...defaultOpts,
      expr: { ...defaultOpts.expr, mouthOpen: 0.5 }
    });
    expect(ctx.ellipse).toHaveBeenCalled();
  });

  it('renders with zero glow', () => {
    const ctx = createMockCtx();
    renderAvatar(ctx, {
      ...defaultOpts,
      expr: { ...defaultOpts.expr, glow: 0 }
    });
    // Should not create glow gradient
  });
});

// ─── Individual Drawing Functions ────────────────────────────────────────────

describe('drawGlowAura', () => {
  it('does nothing with zero intensity', () => {
    const ctx = createMockCtx();
    drawGlowAura(ctx, 100, 100, 50, '#ff0000', 0);
    expect(ctx.save).not.toHaveBeenCalled();
  });

  it('draws glow with positive intensity', () => {
    const ctx = createMockCtx();
    drawGlowAura(ctx, 100, 100, 50, '#ff0000', 0.5);
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.fillRect).toHaveBeenCalled();
  });
});

describe('drawFaceCircle', () => {
  it('draws circular face', () => {
    const ctx = createMockCtx();
    drawFaceCircle(ctx, 100, 100, 50, '#7c5cfc', '#3b8ef0');
    expect(ctx.arc).toHaveBeenCalled();
    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });
});

describe('drawEyes', () => {
  it('draws both eyes', () => {
    const ctx = createMockCtx();
    const expr = { eyeOpenL: 1, eyeOpenR: 1, pupilX: 0, pupilY: 0, pupilSize: 1 };
    const colors = { eye: '#ffffff', primary: '#7c5cfc' };
    drawEyes(ctx, 100, 100, 50, expr, colors);
    // Should draw two ellipses (eye whites) + two arcs (pupils) + two highlights
    expect(ctx.ellipse).toHaveBeenCalled();
    expect(ctx.arc).toHaveBeenCalled();
  });
});

describe('drawMouth', () => {
  it('draws closed mouth line', () => {
    const ctx = createMockCtx();
    const expr = { mouthOpen: 0, mouthSmile: 0.5, mouthWidth: 0.5 };
    const colors = { primary: '#7c5cfc' };
    drawMouth(ctx, 100, 120, 50, expr, colors);
    expect(ctx.quadraticCurveTo).toHaveBeenCalled();
  });

  it('draws open mouth ellipse', () => {
    const ctx = createMockCtx();
    const expr = { mouthOpen: 0.5, mouthSmile: 0, mouthWidth: 0.5 };
    const colors = { primary: '#7c5cfc' };
    drawMouth(ctx, 100, 120, 50, expr, colors);
    expect(ctx.ellipse).toHaveBeenCalled();
  });
});
