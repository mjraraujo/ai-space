/**
 * Tests for Avatar
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  Avatar,
  DEFAULT_APPEARANCE,
  DEFAULT_VOICE_PERSONALITY,
  AVATAR_PRESETS,
  PRESET_NAMES,
  FACE_SHAPES,
  STYLES
} from '../avatar.js';

// ─── Constants ───────────────────────────────────────────────────────────────

describe('Avatar Constants', () => {
  it('DEFAULT_APPEARANCE has all fields', () => {
    expect(DEFAULT_APPEARANCE.faceShape).toBe('circle');
    expect(DEFAULT_APPEARANCE.primaryColor).toBeTruthy();
    expect(DEFAULT_APPEARANCE.name).toBe('Nova');
    expect(DEFAULT_APPEARANCE.style).toBe('minimal');
    expect(typeof DEFAULT_APPEARANCE.size).toBe('number');
    expect(typeof DEFAULT_APPEARANCE.hasParticles).toBe('boolean');
  });

  it('FACE_SHAPES has expected shapes', () => {
    expect(FACE_SHAPES).toContain('circle');
    expect(FACE_SHAPES).toContain('rounded');
    expect(FACE_SHAPES).toContain('square');
    expect(FACE_SHAPES).toContain('oval');
  });

  it('STYLES has expected styles', () => {
    expect(STYLES).toContain('minimal');
    expect(STYLES).toContain('geometric');
    expect(STYLES).toContain('organic');
    expect(STYLES).toContain('holographic');
    expect(STYLES).toContain('pixel');
  });

  it('has at least 5 presets', () => {
    expect(PRESET_NAMES.length).toBeGreaterThanOrEqual(5);
  });

  it('all presets have required fields', () => {
    for (const name of PRESET_NAMES) {
      const preset = AVATAR_PRESETS[name];
      expect(preset.name).toBeTruthy();
      expect(preset.faceShape).toBeTruthy();
      expect(preset.primaryColor).toBeTruthy();
      expect(preset.style).toBeTruthy();
    }
  });
});

// ─── Avatar ──────────────────────────────────────────────────────────────────

describe('Avatar', () => {
  let avatar;
  let mockStorage;

  beforeEach(() => {
    mockStorage = {};
    vi.stubGlobal('localStorage', {
      getItem: (key) => mockStorage[key] || null,
      setItem: (key, val) => { mockStorage[key] = val; },
      removeItem: (key) => { delete mockStorage[key]; }
    });
    avatar = new Avatar();
  });

  it('creates with defaults', () => {
    expect(avatar.appearance.name).toBe('Nova');
    expect(avatar.appearance.faceShape).toBe('circle');
    expect(avatar.state).toBe('idle');
    expect(avatar.mood).toBe('neutral');
  });

  it('creates with custom options', () => {
    const custom = new Avatar({
      appearance: { name: 'Luna', faceShape: 'oval' },
      voice: { pitch: 1.2 }
    });
    expect(custom.appearance.name).toBe('Luna');
    expect(custom.appearance.faceShape).toBe('oval');
    expect(custom.voicePersonality.pitch).toBe(1.2);
  });

  // ─── State Management ────────────────────────────────────────────────

  it('setState changes state', () => {
    avatar.setState('talking');
    expect(avatar.state).toBe('talking');
  });

  it('setState ignores invalid states', () => {
    avatar.setState('flying');
    expect(avatar.state).toBe('idle');
  });

  it('setState to same state is no-op', () => {
    avatar.setState('idle');
    expect(avatar.state).toBe('idle');
  });

  it('setState updates expression', () => {
    avatar.setState('thinking');
    expect(avatar.expressions.getExpression()).toBe('thinking');
  });

  // ─── Reactions ────────────────────────────────────────────────────────

  it('reactToText detects sentiment', () => {
    avatar.reactToText('This is great and wonderful!');
    expect(avatar.expressions.getExpression()).toBe('happy');
  });

  it('reactToText ignores low-confidence', () => {
    avatar.reactToText('The cat sat on the mat.');
    expect(avatar.expressions.getExpression()).toBe('neutral');
  });

  it('setLipSync passes to expression controller', () => {
    avatar.setLipSync(0.8);
    avatar.update(0.1);
    expect(avatar.expressions.current.mouthOpen).toBeGreaterThan(0);
  });

  it('triggerReaction triggers micro-expression', () => {
    avatar.triggerReaction('blink');
    avatar.update(0.05);
    // Should not throw
  });

  it('triggerReaction ignores unknown', () => {
    avatar.triggerReaction('fly');
    avatar.update(0.05);
  });

  // ─── Appearance ───────────────────────────────────────────────────────

  it('applyPreset changes appearance', () => {
    avatar.applyPreset('luna');
    expect(avatar.appearance.name).toBe('Luna');
    expect(avatar.appearance.faceShape).toBe('oval');
  });

  it('applyPreset ignores unknown', () => {
    avatar.applyPreset('nonexistent');
    expect(avatar.appearance.name).toBe('Nova');
  });

  it('updateAppearance merges partial updates', () => {
    avatar.updateAppearance({ primaryColor: '#ff0000' });
    expect(avatar.appearance.primaryColor).toBe('#ff0000');
    expect(avatar.appearance.name).toBe('Nova'); // Preserved
  });

  it('updateVoice merges partial updates', () => {
    avatar.updateVoice({ pitch: 1.5 });
    expect(avatar.voicePersonality.pitch).toBe(1.5);
    expect(avatar.voicePersonality.rate).toBe(DEFAULT_VOICE_PERSONALITY.rate); // Preserved
  });

  // ─── Update ───────────────────────────────────────────────────────────

  it('update returns expression params', () => {
    const params = avatar.update(0.016);
    expect(typeof params.eyeOpenL).toBe('number');
    expect(typeof params.mouthSmile).toBe('number');
    expect(typeof params.glow).toBe('number');
  });

  it('greeting auto-transitions to idle after 2s', () => {
    avatar.setState('greeting');
    expect(avatar.state).toBe('greeting');
    for (let i = 0; i < 200; i++) avatar.update(0.016);
    expect(avatar.state).toBe('idle');
  });

  it('excited auto-transitions to idle after 3s', () => {
    avatar.setState('excited');
    expect(avatar.state).toBe('excited');
    for (let i = 0; i < 250; i++) avatar.update(0.016);
    expect(avatar.state).toBe('idle');
  });

  // ─── Rendering ────────────────────────────────────────────────────────

  it('render does not throw with mock canvas context', () => {
    const ctx = {
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
    avatar.update(0.016);
    avatar.render(ctx, 100, 100, 50);
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
  });

  it('render with all face shapes', () => {
    const ctx = {
      save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
      beginPath: vi.fn(), arc: vi.fn(), ellipse: vi.fn(), fill: vi.fn(),
      stroke: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), quadraticCurveTo: vi.fn(),
      closePath: vi.fn(), fillRect: vi.fn(),
      createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      fillStyle: '', strokeStyle: '', lineWidth: 0, globalAlpha: 1, lineCap: ''
    };
    for (const shape of FACE_SHAPES) {
      avatar.updateAppearance({ faceShape: shape });
      avatar.update(0.016);
      avatar.render(ctx, 100, 100, 50); // Should not throw
    }
  });

  it('render with blush', () => {
    const ctx = {
      save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
      beginPath: vi.fn(), arc: vi.fn(), ellipse: vi.fn(), fill: vi.fn(),
      stroke: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), quadraticCurveTo: vi.fn(),
      closePath: vi.fn(), fillRect: vi.fn(),
      createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      fillStyle: '', strokeStyle: '', lineWidth: 0, globalAlpha: 1, lineCap: ''
    };
    avatar.expressions.current.blush = 0.5;
    avatar.render(ctx, 100, 100, 50);
  });

  it('render with open mouth', () => {
    const ctx = {
      save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
      beginPath: vi.fn(), arc: vi.fn(), ellipse: vi.fn(), fill: vi.fn(),
      stroke: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), quadraticCurveTo: vi.fn(),
      closePath: vi.fn(), fillRect: vi.fn(),
      createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      fillStyle: '', strokeStyle: '', lineWidth: 0, globalAlpha: 1, lineCap: ''
    };
    avatar.expressions.current.mouthOpen = 0.5;
    avatar.render(ctx, 100, 100, 50);
    expect(ctx.ellipse).toHaveBeenCalled();
  });

  // ─── Serialization ────────────────────────────────────────────────────

  it('serialize/deserialize round-trips', () => {
    avatar.updateAppearance({ name: 'TestBot', primaryColor: '#123456' });
    avatar.updateVoice({ pitch: 0.8 });
    const data = avatar.serialize();
    const other = new Avatar();
    other.deserialize(data);
    expect(other.appearance.name).toBe('TestBot');
    expect(other.appearance.primaryColor).toBe('#123456');
    expect(other.voicePersonality.pitch).toBe(0.8);
  });

  it('deserialize handles partial data', () => {
    const other = new Avatar();
    other.deserialize({ appearance: { name: 'Partial' } });
    expect(other.appearance.name).toBe('Partial');
    expect(other.appearance.faceShape).toBe('circle'); // Default preserved
  });

  it('deserialize handles null data', () => {
    const other = new Avatar();
    other.deserialize(null);
    expect(other.appearance.name).toBe('Nova'); // Unchanged
  });

  it('save persists to localStorage', () => {
    avatar.updateAppearance({ name: 'Saved' });
    avatar.save();
    expect(mockStorage['ai-space-avatar']).toBeDefined();
    const saved = JSON.parse(mockStorage['ai-space-avatar']);
    expect(saved.appearance.name).toBe('Saved');
  });

  it('load restores from localStorage', () => {
    mockStorage['ai-space-avatar'] = JSON.stringify({
      appearance: { name: 'Loaded', primaryColor: '#abcdef' }
    });
    const result = avatar.load();
    expect(result).toBe(true);
    expect(avatar.appearance.name).toBe('Loaded');
  });

  it('load returns false when no data', () => {
    expect(avatar.load()).toBe(false);
  });

  it('load handles corrupt data', () => {
    mockStorage['ai-space-avatar'] = 'not-json';
    expect(avatar.load()).toBe(false);
  });

  // ─── Mood Tracking ────────────────────────────────────────────────────

  it('mood tracks dominant expression', () => {
    for (let i = 0; i < 5; i++) {
      avatar.reactToText('This is great and wonderful!');
    }
    expect(avatar.mood).toBe('happy');
  });

  it('mood stays neutral without reactions', () => {
    expect(avatar.mood).toBe('neutral');
  });

  // ─── Info ──────────────────────────────────────────────────────────────

  it('getInfo returns summary', () => {
    const info = avatar.getInfo();
    expect(info.name).toBe('Nova');
    expect(info.state).toBe('idle');
    expect(info.mood).toBe('neutral');
    expect(info.expression).toBe('neutral');
  });
});

// ─── Avatar Voice Engine ─────────────────────────────────────────────────────

describe('Avatar Voice Engine (import test)', () => {
  it('module loads successfully', async () => {
    const mod = await import('../avatar-voice.js');
    expect(mod.AvatarVoiceEngine).toBeDefined();
    expect(mod.VOICE_STYLES).toBeDefined();
    expect(mod.VOICE_STYLE_IDS).toBeDefined();
    expect(mod.VOICE_STYLE_IDS.length).toBeGreaterThanOrEqual(4);
  });
});

// ─── Scene Manager ───────────────────────────────────────────────────────────

describe('Scene Manager (import test)', () => {
  it('module loads successfully', async () => {
    const mod = await import('../scene-manager.js');
    expect(mod.SceneManager).toBeDefined();
  });
});
