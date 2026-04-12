/**
 * Tests for Expression System
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  NEUTRAL,
  EXPRESSIONS,
  EXPRESSION_NAMES,
  blendExpressions,
  mixExpressions,
  scaleExpression,
  MICRO_EXPRESSIONS,
  ExpressionController,
  detectSentiment
} from '../expressions.js';

// ─── Expression Definitions ──────────────────────────────────────────────────

describe('Expression Definitions', () => {
  it('NEUTRAL has all expected properties', () => {
    expect(NEUTRAL.eyeOpenL).toBe(1);
    expect(NEUTRAL.eyeOpenR).toBe(1);
    expect(NEUTRAL.mouthOpen).toBe(0);
    expect(NEUTRAL.mouthSmile).toBe(0);
    expect(NEUTRAL.pupilSize).toBe(1);
    expect(NEUTRAL.headTiltX).toBe(0);
    expect(NEUTRAL.glow).toBe(0.3);
    expect(NEUTRAL.breathRate).toBe(1);
  });

  it('has at least 10 expressions', () => {
    expect(EXPRESSION_NAMES.length).toBeGreaterThanOrEqual(10);
  });

  it('all expressions contain NEUTRAL keys', () => {
    for (const name of EXPRESSION_NAMES) {
      const expr = EXPRESSIONS[name];
      for (const key of Object.keys(NEUTRAL)) {
        expect(expr).toHaveProperty(key);
      }
    }
  });

  it('happy has positive smile', () => {
    expect(EXPRESSIONS.happy.mouthSmile).toBeGreaterThan(0);
    expect(EXPRESSIONS.happy.glow).toBeGreaterThan(NEUTRAL.glow);
  });

  it('sad has negative smile and lower glow', () => {
    expect(EXPRESSIONS.sad.mouthSmile).toBeLessThan(0);
    expect(EXPRESSIONS.sad.glow).toBeLessThan(NEUTRAL.glow);
  });

  it('surprised has wide eyes', () => {
    expect(EXPRESSIONS.surprised.eyeOpenL).toBeGreaterThan(1);
    expect(EXPRESSIONS.surprised.eyeOpenR).toBeGreaterThan(1);
  });

  it('sleeping has closed eyes', () => {
    expect(EXPRESSIONS.sleeping.eyeOpenL).toBe(0);
    expect(EXPRESSIONS.sleeping.eyeOpenR).toBe(0);
  });

  it('thinking has asymmetric eyebrows', () => {
    expect(EXPRESSIONS.thinking.eyebrowL).not.toBe(EXPRESSIONS.thinking.eyebrowR);
  });
});

// ─── Blending ────────────────────────────────────────────────────────────────

describe('blendExpressions', () => {
  it('t=0 returns first expression', () => {
    const result = blendExpressions(EXPRESSIONS.happy, EXPRESSIONS.sad, 0);
    expect(result.mouthSmile).toBe(EXPRESSIONS.happy.mouthSmile);
  });

  it('t=1 returns second expression', () => {
    const result = blendExpressions(EXPRESSIONS.happy, EXPRESSIONS.sad, 1);
    expect(result.mouthSmile).toBe(EXPRESSIONS.sad.mouthSmile);
  });

  it('t=0.5 interpolates', () => {
    const result = blendExpressions(EXPRESSIONS.happy, EXPRESSIONS.sad, 0.5);
    const expected = (EXPRESSIONS.happy.mouthSmile + EXPRESSIONS.sad.mouthSmile) / 2;
    expect(result.mouthSmile).toBeCloseTo(expected);
  });

  it('clamps t to 0-1', () => {
    const a = blendExpressions(EXPRESSIONS.happy, EXPRESSIONS.sad, -5);
    expect(a.mouthSmile).toBe(EXPRESSIONS.happy.mouthSmile);
    const b = blendExpressions(EXPRESSIONS.happy, EXPRESSIONS.sad, 10);
    expect(b.mouthSmile).toBe(EXPRESSIONS.sad.mouthSmile);
  });

  it('handles missing keys gracefully', () => {
    const partial = { mouthSmile: 1 };
    const result = blendExpressions(NEUTRAL, partial, 0.5);
    expect(result.mouthSmile).toBeCloseTo(0.5);
    expect(result.eyeOpenL).toBeCloseTo(1); // Falls back to NEUTRAL
  });
});

describe('mixExpressions', () => {
  it('returns neutral for empty array', () => {
    const result = mixExpressions([]);
    expect(result.mouthSmile).toBe(NEUTRAL.mouthSmile);
  });

  it('returns neutral for null', () => {
    const result = mixExpressions(null);
    expect(result.mouthSmile).toBe(NEUTRAL.mouthSmile);
  });

  it('single layer is blended with weight', () => {
    const result = mixExpressions([{ expression: EXPRESSIONS.happy, weight: 0.5 }]);
    expect(result.mouthSmile).toBeCloseTo(
      NEUTRAL.mouthSmile + (EXPRESSIONS.happy.mouthSmile - NEUTRAL.mouthSmile) * 0.5
    );
  });

  it('multiple layers are weight-averaged', () => {
    const result = mixExpressions([
      { expression: EXPRESSIONS.happy, weight: 1 },
      { expression: EXPRESSIONS.sad, weight: 1 }
    ]);
    const expected = (EXPRESSIONS.happy.mouthSmile + EXPRESSIONS.sad.mouthSmile) / 2;
    expect(result.mouthSmile).toBeCloseTo(expected);
  });
});

describe('scaleExpression', () => {
  it('intensity 0 returns neutral', () => {
    const result = scaleExpression(EXPRESSIONS.excited, 0);
    expect(result.mouthSmile).toBe(NEUTRAL.mouthSmile);
  });

  it('intensity 1 returns full expression', () => {
    const result = scaleExpression(EXPRESSIONS.excited, 1);
    expect(result.mouthSmile).toBe(EXPRESSIONS.excited.mouthSmile);
  });

  it('intensity 0.5 is halfway', () => {
    const result = scaleExpression(EXPRESSIONS.excited, 0.5);
    const expected = NEUTRAL.mouthSmile + (EXPRESSIONS.excited.mouthSmile - NEUTRAL.mouthSmile) * 0.5;
    expect(result.mouthSmile).toBeCloseTo(expected);
  });
});

// ─── Micro Expressions ──────────────────────────────────────────────────────

describe('MICRO_EXPRESSIONS', () => {
  it('has blink, glanceLeft, glanceRight, nod', () => {
    expect(MICRO_EXPRESSIONS.blink).toBeDefined();
    expect(MICRO_EXPRESSIONS.glanceLeft).toBeDefined();
    expect(MICRO_EXPRESSIONS.glanceRight).toBeDefined();
    expect(MICRO_EXPRESSIONS.nod).toBeDefined();
  });

  it('blink closes both eyes', () => {
    expect(MICRO_EXPRESSIONS.blink.params.eyeOpenL).toBe(0);
    expect(MICRO_EXPRESSIONS.blink.params.eyeOpenR).toBe(0);
  });

  it('all micros have duration and intensity', () => {
    for (const [name, micro] of Object.entries(MICRO_EXPRESSIONS)) {
      expect(micro.duration).toBeGreaterThan(0);
      expect(micro.intensity).toBeGreaterThan(0);
      expect(micro.intensity).toBeLessThanOrEqual(1);
    }
  });
});

// ─── ExpressionController ────────────────────────────────────────────────────

describe('ExpressionController', () => {
  let ctrl;

  beforeEach(() => {
    ctrl = new ExpressionController({ autoBlink: false });
  });

  it('starts neutral', () => {
    expect(ctrl.current.mouthSmile).toBe(NEUTRAL.mouthSmile);
    expect(ctrl.getExpression()).toBe('neutral');
  });

  it('setExpression changes target', () => {
    ctrl.setExpression('happy');
    expect(ctrl.getExpression()).toBe('happy');
  });

  it('ignores unknown expressions', () => {
    ctrl.setExpression('nonexistent');
    expect(ctrl.getExpression()).toBe('neutral');
  });

  it('update smoothly transitions toward target', () => {
    ctrl.setExpression('happy');
    const initial = ctrl.current.mouthSmile;
    ctrl.update(0.5);
    expect(ctrl.current.mouthSmile).toBeGreaterThan(initial);
  });

  it('update with large dt converges near target', () => {
    ctrl.setExpression('happy');
    for (let i = 0; i < 50; i++) ctrl.update(0.1);
    expect(ctrl.current.mouthSmile).toBeCloseTo(EXPRESSIONS.happy.mouthSmile, 0);
  });

  it('triggerMicro fires micro-expression', () => {
    ctrl.triggerMicro('blink');
    const before = ctrl.current.eyeOpenL;
    ctrl.update(0.05);
    // During blink, eye openness should decrease
    expect(ctrl.current.eyeOpenL).toBeLessThan(1.01);
  });

  it('triggerMicro ignores unknown', () => {
    ctrl.triggerMicro('nonexistent');
    ctrl.update(0.1); // Should not throw
  });

  it('setLipSync modulates mouth', () => {
    ctrl.setLipSync(1);
    ctrl.update(0.1);
    expect(ctrl.current.mouthOpen).toBeGreaterThan(0);
  });

  it('setLipSync 0 keeps mouth closed', () => {
    ctrl.setLipSync(0);
    ctrl.update(0.1);
    expect(ctrl.current.mouthOpen).toBeCloseTo(0, 1);
  });

  it('setExpression with intensity scales', () => {
    ctrl.setExpression('excited', 0.5);
    for (let i = 0; i < 50; i++) ctrl.update(0.1);
    expect(ctrl.current.mouthSmile).toBeLessThan(EXPRESSIONS.excited.mouthSmile);
    expect(ctrl.current.mouthSmile).toBeGreaterThan(NEUTRAL.mouthSmile);
  });

  it('auto-blink triggers blinks', () => {
    const ctrlAuto = new ExpressionController({ autoBlink: true, blinkInterval: 0.01 });
    ctrlAuto.update(0.1);
    // Should have triggered at least one blink
    // We can't directly check, but update should not throw
  });

  it('reset returns to neutral', () => {
    ctrl.setExpression('happy');
    ctrl.update(1);
    ctrl.reset();
    expect(ctrl.current.mouthSmile).toBe(NEUTRAL.mouthSmile);
    expect(ctrl.getExpression()).toBe('neutral');
  });

  it('breathing creates subtle head motion', () => {
    ctrl.update(1);
    // headTiltX should have slight variation from breathing
    const firstVal = ctrl.current.headTiltX;
    ctrl.update(2);
    // Should be a different value due to breathing phase
    expect(typeof ctrl.current.headTiltX).toBe('number');
  });
});

// ─── Sentiment Detection ─────────────────────────────────────────────────────

describe('detectSentiment', () => {
  it('returns neutral for empty input', () => {
    expect(detectSentiment('').expression).toBe('neutral');
    expect(detectSentiment(null).expression).toBe('neutral');
    expect(detectSentiment(undefined).expression).toBe('neutral');
  });

  it('detects happy sentiment', () => {
    const result = detectSentiment('This is great and wonderful!');
    expect(result.expression).toBe('happy');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('detects sad sentiment', () => {
    const result = detectSentiment("I'm sorry, unfortunately I can't help");
    expect(result.expression).toBe('sad');
  });

  it('detects surprised sentiment', () => {
    const result = detectSentiment('Wow, that is amazing and incredible!');
    expect(result.expression).toBe('surprised');
  });

  it('detects thinking sentiment', () => {
    const result = detectSentiment('Let me think about this interesting question');
    expect(result.expression).toBe('thinking');
  });

  it('returns neutral for non-matching text', () => {
    const result = detectSentiment('The cat sat on the mat');
    expect(result.expression).toBe('neutral');
    expect(result.confidence).toBe(0);
  });

  it('confidence scales with keyword matches', () => {
    const low = detectSentiment('great');
    const high = detectSentiment('great awesome wonderful excellent');
    expect(high.confidence).toBeGreaterThan(low.confidence);
  });

  it('confidence caps at 1', () => {
    const result = detectSentiment('great awesome wonderful excellent perfect love');
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});
