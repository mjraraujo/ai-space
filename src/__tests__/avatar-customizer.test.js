/**
 * Tests for Avatar Customizer
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AvatarCustomizer,
  AVATAR_COLORS,
  EYE_COLORS,
  isValidHex
} from '../avatar-customizer.js';
import { Avatar, FACE_SHAPES, STYLES, PRESET_NAMES } from '../avatar.js';

// ─── isValidHex ──────────────────────────────────────────────────────────────

describe('isValidHex', () => {
  it('accepts valid 6-digit hex', () => {
    expect(isValidHex('#ff0000')).toBe(true);
    expect(isValidHex('#00ff00')).toBe(true);
    expect(isValidHex('#7c5cfc')).toBe(true);
  });

  it('rejects invalid inputs', () => {
    expect(isValidHex(null)).toBe(false);
    expect(isValidHex('')).toBe(false);
    expect(isValidHex('#fff')).toBe(false);
    expect(isValidHex('ff0000')).toBe(false);
    expect(isValidHex('#gg0000')).toBe(false);
    expect(isValidHex(123)).toBe(false);
  });
});

// ─── Constants ───────────────────────────────────────────────────────────────

describe('Color Palettes', () => {
  it('AVATAR_COLORS has at least 20 colors', () => {
    expect(AVATAR_COLORS.length).toBeGreaterThanOrEqual(20);
  });

  it('all AVATAR_COLORS are valid hex', () => {
    for (const c of AVATAR_COLORS) {
      expect(isValidHex(c)).toBe(true);
    }
  });

  it('EYE_COLORS has entries', () => {
    expect(EYE_COLORS.length).toBeGreaterThanOrEqual(4);
  });
});

// ─── AvatarCustomizer ────────────────────────────────────────────────────────

describe('AvatarCustomizer', () => {
  let avatar;
  let customizer;
  let onChange;

  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: vi.fn(),
      removeItem: vi.fn()
    });
    avatar = new Avatar();
    onChange = vi.fn();
    customizer = new AvatarCustomizer(avatar, { onChange });
  });

  // ─── getConfig ────────────────────────────────────────────────────────

  it('getConfig returns current state', () => {
    const config = customizer.getConfig();
    expect(config.name).toBe('Nova');
    expect(config.faceShape).toBe('circle');
    expect(config.style).toBe('minimal');
    expect(config.primaryColor).toBe('#7c5cfc');
  });

  it('getOptions returns available options', () => {
    const opts = customizer.getOptions();
    expect(opts.faceShapes).toEqual(FACE_SHAPES);
    expect(opts.styles).toEqual(STYLES);
    expect(opts.presets).toEqual(PRESET_NAMES);
    expect(opts.colors).toBe(AVATAR_COLORS);
    expect(opts.eyeColors).toBe(EYE_COLORS);
  });

  // ─── Setters ──────────────────────────────────────────────────────────

  it('setName updates name', () => {
    customizer.setName('TestBot');
    expect(avatar.appearance.name).toBe('TestBot');
    expect(onChange).toHaveBeenCalled();
  });

  it('setName trims and caps at 20 chars', () => {
    customizer.setName('  A very very very long name that exceeds  ');
    expect(avatar.appearance.name.length).toBeLessThanOrEqual(20);
    expect(onChange).toHaveBeenCalled();
  });

  it('setName ignores empty/null', () => {
    customizer.setName('');
    expect(avatar.appearance.name).toBe('Nova'); // Unchanged
    customizer.setName(null);
    expect(avatar.appearance.name).toBe('Nova');
  });

  it('setFaceShape updates shape', () => {
    customizer.setFaceShape('oval');
    expect(avatar.appearance.faceShape).toBe('oval');
    expect(onChange).toHaveBeenCalled();
  });

  it('setFaceShape ignores invalid', () => {
    customizer.setFaceShape('triangle');
    expect(avatar.appearance.faceShape).toBe('circle');
  });

  it('setStyle updates style', () => {
    customizer.setStyle('holographic');
    expect(avatar.appearance.style).toBe('holographic');
  });

  it('setStyle ignores invalid', () => {
    customizer.setStyle('neon');
    expect(avatar.appearance.style).toBe('minimal');
  });

  it('setPrimaryColor updates color', () => {
    customizer.setPrimaryColor('#ff0000');
    expect(avatar.appearance.primaryColor).toBe('#ff0000');
  });

  it('setPrimaryColor ignores invalid', () => {
    customizer.setPrimaryColor('red');
    expect(avatar.appearance.primaryColor).toBe('#7c5cfc');
  });

  it('setSecondaryColor updates color', () => {
    customizer.setSecondaryColor('#00ff00');
    expect(avatar.appearance.secondaryColor).toBe('#00ff00');
  });

  it('setEyeColor updates color', () => {
    customizer.setEyeColor('#e8e8ff');
    expect(avatar.appearance.eyeColor).toBe('#e8e8ff');
  });

  it('setGlowColor updates color', () => {
    customizer.setGlowColor('#ff00ff');
    expect(avatar.appearance.glowColor).toBe('#ff00ff');
  });

  it('setSize clamps values', () => {
    customizer.setSize(0.1);
    expect(avatar.appearance.size).toBe(0.5);
    customizer.setSize(5);
    expect(avatar.appearance.size).toBe(2);
    customizer.setSize(1.5);
    expect(avatar.appearance.size).toBe(1.5);
  });

  it('setParticles toggles', () => {
    customizer.setParticles(false);
    expect(avatar.appearance.hasParticles).toBe(false);
    customizer.setParticles(true);
    expect(avatar.appearance.hasParticles).toBe(true);
  });

  it('applyPreset changes appearance', () => {
    customizer.applyPreset('luna');
    expect(avatar.appearance.name).toBe('Luna');
  });

  it('applyPreset ignores unknown', () => {
    customizer.applyPreset('nonexistent');
    expect(avatar.appearance.name).toBe('Nova');
  });

  it('setVoice updates voice params', () => {
    customizer.setVoice({ pitch: 1.5, rate: 0.8 });
    expect(avatar.voicePersonality.pitch).toBe(1.5);
    expect(avatar.voicePersonality.rate).toBe(0.8);
  });

  it('setVoice clamps values', () => {
    customizer.setVoice({ pitch: 10, rate: -1 });
    expect(avatar.voicePersonality.pitch).toBe(2);
    expect(avatar.voicePersonality.rate).toBe(0.5);
  });

  // ─── Randomize ────────────────────────────────────────────────────────

  it('randomize changes appearance', () => {
    const before = { ...avatar.appearance };
    // Run multiple times to increase chance of difference
    for (let i = 0; i < 10; i++) customizer.randomize();
    // At least something should have changed
    const after = avatar.appearance;
    const changed = before.name !== after.name ||
      before.primaryColor !== after.primaryColor ||
      before.faceShape !== after.faceShape;
    expect(changed).toBe(true);
  });

  // ─── Undo/Redo ────────────────────────────────────────────────────────

  it('undo reverts last change', () => {
    customizer.setName('Alpha');
    expect(avatar.appearance.name).toBe('Alpha');
    customizer.setName('Beta');
    expect(avatar.appearance.name).toBe('Beta');
    customizer.undo();
    expect(avatar.appearance.name).toBe('Alpha');
  });

  it('canUndo is false initially', () => {
    expect(customizer.canUndo).toBe(false);
  });

  it('canUndo is true after change', () => {
    customizer.setName('Test');
    expect(customizer.canUndo).toBe(true);
  });

  it('undo returns false when nothing to undo', () => {
    expect(customizer.undo()).toBe(false);
  });

  it('redo returns false when nothing to redo', () => {
    expect(customizer.redo()).toBe(false);
  });

  // ─── Export/Import ────────────────────────────────────────────────────

  it('exportConfig returns JSON', () => {
    const json = customizer.exportConfig();
    const data = JSON.parse(json);
    expect(data.appearance).toBeDefined();
    expect(data.appearance.name).toBe('Nova');
  });

  it('importConfig restores state', () => {
    const json = JSON.stringify({
      appearance: { name: 'Imported', primaryColor: '#123456' }
    });
    const result = customizer.importConfig(json);
    expect(result).toBe(true);
    expect(avatar.appearance.name).toBe('Imported');
    expect(avatar.appearance.primaryColor).toBe('#123456');
  });

  it('importConfig returns false for invalid JSON', () => {
    expect(customizer.importConfig('not-json')).toBe(false);
  });

  it('importConfig returns false for missing appearance', () => {
    expect(customizer.importConfig('{}')).toBe(false);
  });

  // ─── Reset ────────────────────────────────────────────────────────────

  it('reset restores defaults', () => {
    customizer.setName('Custom');
    customizer.setPrimaryColor('#ff0000');
    customizer.reset();
    expect(avatar.appearance.name).toBe('Nova');
    expect(avatar.appearance.primaryColor).toBe('#7c5cfc');
  });

  // ─── Save/Load ────────────────────────────────────────────────────────

  it('save calls avatar.save', () => {
    const spy = vi.spyOn(avatar, 'save');
    customizer.save();
    expect(spy).toHaveBeenCalled();
  });

  it('load calls avatar.load', () => {
    const spy = vi.spyOn(avatar, 'load');
    customizer.load();
    expect(spy).toHaveBeenCalled();
  });
});
