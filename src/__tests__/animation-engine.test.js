/**
 * Tests for Animation Engine
 */
import { describe, it, expect, vi } from 'vitest';
import {
  Easing,
  resolveEasing,
  KeyframeTrack,
  AnimationClip,
  AnimationPlayer,
  AnimationMixer,
  Spring,
  AnimationStateMachine,
  Timeline
} from '../animation-engine.js';

// ─── Easing ──────────────────────────────────────────────────────────────────

describe('Easing', () => {
  it('linear returns identity', () => {
    expect(Easing.linear(0)).toBe(0);
    expect(Easing.linear(0.5)).toBe(0.5);
    expect(Easing.linear(1)).toBe(1);
  });

  it('easeInQuad starts slow', () => {
    expect(Easing.easeInQuad(0)).toBe(0);
    expect(Easing.easeInQuad(0.5)).toBe(0.25);
    expect(Easing.easeInQuad(1)).toBe(1);
  });

  it('easeOutQuad ends slow', () => {
    expect(Easing.easeOutQuad(0)).toBe(0);
    expect(Easing.easeOutQuad(1)).toBe(1);
    expect(Easing.easeOutQuad(0.5)).toBe(0.75);
  });

  it('easeInOutQuad is symmetric', () => {
    expect(Easing.easeInOutQuad(0)).toBe(0);
    expect(Easing.easeInOutQuad(1)).toBe(1);
    expect(Easing.easeInOutQuad(0.5)).toBe(0.5);
  });

  it('easeInCubic accelerates', () => {
    expect(Easing.easeInCubic(0)).toBe(0);
    expect(Easing.easeInCubic(1)).toBe(1);
    expect(Easing.easeInCubic(0.5)).toBeCloseTo(0.125);
  });

  it('easeOutCubic decelerates', () => {
    expect(Easing.easeOutCubic(0)).toBe(0);
    expect(Easing.easeOutCubic(1)).toBe(1);
  });

  it('easeInElastic handles edge cases', () => {
    expect(Easing.easeInElastic(0)).toBe(0);
    expect(Easing.easeInElastic(1)).toBe(1);
  });

  it('easeOutElastic handles edge cases', () => {
    expect(Easing.easeOutElastic(0)).toBe(0);
    expect(Easing.easeOutElastic(1)).toBe(1);
  });

  it('easeInOutElastic handles edge cases', () => {
    expect(Easing.easeInOutElastic(0)).toBe(0);
    expect(Easing.easeInOutElastic(1)).toBe(1);
  });

  it('easeOutBounce reaches 1', () => {
    expect(Easing.easeOutBounce(1)).toBeCloseTo(1);
    expect(Easing.easeOutBounce(0)).toBe(0);
  });

  it('spring converges', () => {
    expect(Easing.spring(0)).toBeCloseTo(0, 1);
    const val = Easing.spring(1);
    expect(val).toBeGreaterThan(0.9);
  });

  it('easeInQuart works', () => {
    expect(Easing.easeInQuart(0)).toBe(0);
    expect(Easing.easeInQuart(1)).toBe(1);
  });

  it('easeOutQuart works', () => {
    expect(Easing.easeOutQuart(0)).toBe(0);
    expect(Easing.easeOutQuart(1)).toBe(1);
  });

  it('easeInOutQuart works', () => {
    expect(Easing.easeInOutQuart(0)).toBe(0);
    expect(Easing.easeInOutQuart(1)).toBe(1);
  });

  it('easeInOutCubic works', () => {
    expect(Easing.easeInOutCubic(0)).toBe(0);
    expect(Easing.easeInOutCubic(1)).toBe(1);
  });
});

describe('resolveEasing', () => {
  it('resolves string names', () => {
    expect(resolveEasing('linear')).toBe(Easing.linear);
    expect(resolveEasing('easeInQuad')).toBe(Easing.easeInQuad);
  });

  it('returns function as-is', () => {
    const fn = t => t * t;
    expect(resolveEasing(fn)).toBe(fn);
  });

  it('falls back to linear for unknown', () => {
    expect(resolveEasing('bogus')).toBe(Easing.linear);
    expect(resolveEasing(null)).toBe(Easing.linear);
  });
});

// ─── KeyframeTrack ───────────────────────────────────────────────────────────

describe('KeyframeTrack', () => {
  it('returns 0 for empty track', () => {
    const track = new KeyframeTrack('x');
    expect(track.duration).toBe(0);
    expect(track.sample(0)).toBe(0);
  });

  it('returns constant for single keyframe', () => {
    const track = new KeyframeTrack('x', [{ time: 0, value: 5 }]);
    expect(track.sample(0)).toBe(5);
    expect(track.sample(100)).toBe(5);
  });

  it('interpolates between keyframes', () => {
    const track = new KeyframeTrack('x', [
      { time: 0, value: 0 },
      { time: 1, value: 10 }
    ]);
    expect(track.sample(0.5)).toBe(5);
    expect(track.sample(0)).toBe(0);
    expect(track.sample(1)).toBe(10);
  });

  it('clamps before first keyframe', () => {
    const track = new KeyframeTrack('x', [
      { time: 1, value: 5 },
      { time: 2, value: 10 }
    ]);
    expect(track.sample(0)).toBe(5);
  });

  it('clamps after last keyframe', () => {
    const track = new KeyframeTrack('x', [
      { time: 0, value: 0 },
      { time: 1, value: 10 }
    ]);
    expect(track.sample(5)).toBe(10);
  });

  it('uses easing on segments', () => {
    const track = new KeyframeTrack('x', [
      { time: 0, value: 0 },
      { time: 1, value: 100, easing: 'easeInQuad' }
    ]);
    expect(track.sample(0.5)).toBe(25); // easeInQuad(0.5) = 0.25
  });

  it('addKeyframe inserts sorted', () => {
    const track = new KeyframeTrack('x');
    track.addKeyframe(2, 20);
    track.addKeyframe(0, 0);
    track.addKeyframe(1, 10);
    expect(track.keyframes[0].time).toBe(0);
    expect(track.keyframes[1].time).toBe(1);
    expect(track.keyframes[2].time).toBe(2);
  });

  it('duration is max keyframe time', () => {
    const track = new KeyframeTrack('x', [
      { time: 0, value: 0 },
      { time: 3, value: 30 }
    ]);
    expect(track.duration).toBe(3);
  });

  it('handles zero-span segments gracefully', () => {
    const track = new KeyframeTrack('x', [
      { time: 1, value: 5 },
      { time: 1, value: 10 }
    ]);
    expect(track.sample(1)).toBe(5);
  });
});

// ─── AnimationClip ───────────────────────────────────────────────────────────

describe('AnimationClip', () => {
  it('has a name and defaults', () => {
    const clip = new AnimationClip('test');
    expect(clip.name).toBe('test');
    expect(clip.loop).toBe(false);
    expect(clip.speed).toBe(1);
    expect(clip.duration).toBe(0);
  });

  it('calculates duration from tracks', () => {
    const clip = new AnimationClip('test');
    clip.addTrack(new KeyframeTrack('x', [{ time: 0, value: 0 }, { time: 2, value: 1 }]));
    clip.addTrack(new KeyframeTrack('y', [{ time: 0, value: 0 }, { time: 3, value: 1 }]));
    expect(clip.duration).toBe(3);
  });

  it('samples all tracks', () => {
    const clip = new AnimationClip('test');
    clip.addTrack(new KeyframeTrack('x', [{ time: 0, value: 0 }, { time: 1, value: 10 }]));
    clip.addTrack(new KeyframeTrack('y', [{ time: 0, value: 100 }, { time: 1, value: 200 }]));
    const vals = clip.sample(0.5);
    expect(vals.x).toBe(5);
    expect(vals.y).toBe(150);
  });

  it('getOrCreateTrack creates if missing', () => {
    const clip = new AnimationClip('test');
    const track = clip.getOrCreateTrack('z');
    expect(track).toBeInstanceOf(KeyframeTrack);
    expect(clip.tracks.has('z')).toBe(true);
    expect(clip.getOrCreateTrack('z')).toBe(track); // Same instance
  });
});

// ─── AnimationPlayer ─────────────────────────────────────────────────────────

describe('AnimationPlayer', () => {
  function makeClip(duration = 1) {
    const clip = new AnimationClip('test');
    clip.addTrack(new KeyframeTrack('x', [{ time: 0, value: 0 }, { time: duration, value: 10 }]));
    return clip;
  }

  it('starts stopped', () => {
    const player = new AnimationPlayer(makeClip());
    expect(player.playing).toBe(false);
    expect(player.time).toBe(0);
    expect(player.progress).toBe(0);
  });

  it('play/pause/stop', () => {
    const player = new AnimationPlayer(makeClip());
    player.play();
    expect(player.playing).toBe(true);
    player.pause();
    expect(player.playing).toBe(false);
    player.play();
    player.stop();
    expect(player.playing).toBe(false);
    expect(player.time).toBe(0);
  });

  it('update advances time and samples', () => {
    const player = new AnimationPlayer(makeClip());
    player.play();
    const vals = player.update(0.5);
    expect(vals).toBeTruthy();
    expect(vals.x).toBe(5);
    expect(player.progress).toBe(0.5);
  });

  it('returns null if not playing', () => {
    const player = new AnimationPlayer(makeClip());
    expect(player.update(0.5)).toBeNull();
  });

  it('finishes non-looping clip', () => {
    const onComplete = vi.fn();
    const player = new AnimationPlayer(makeClip(1), { onComplete });
    player.play();
    player.update(1.5);
    expect(player.finished).toBe(true);
    expect(player.playing).toBe(false);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('loops when clip.loop is true', () => {
    const clip = makeClip(1);
    clip.loop = true;
    const onLoop = vi.fn();
    const player = new AnimationPlayer(clip, { onLoop });
    player.play();
    player.update(1.5);
    expect(player.finished).toBe(false);
    expect(player.playing).toBe(true);
    expect(onLoop).toHaveBeenCalledTimes(1);
    expect(player.time).toBeCloseTo(0.5);
  });

  it('respects clip speed', () => {
    const clip = makeClip(1);
    clip.speed = 2;
    const player = new AnimationPlayer(clip);
    player.play();
    player.update(0.25);
    expect(player.time).toBeCloseTo(0.5);
  });

  it('handles zero-duration clip', () => {
    const clip = new AnimationClip('empty');
    const player = new AnimationPlayer(clip);
    player.play();
    const vals = player.update(0.5);
    expect(vals).toEqual({});
    expect(player.progress).toBe(1);
  });
});

// ─── AnimationMixer ──────────────────────────────────────────────────────────

describe('AnimationMixer', () => {
  function makeClip(name, duration = 1) {
    const clip = new AnimationClip(name);
    clip.addTrack(new KeyframeTrack('x', [{ time: 0, value: 0 }, { time: duration, value: 10 }]));
    clip.loop = true;
    return clip;
  }

  it('adds clips and retrieves players', () => {
    const mixer = new AnimationMixer();
    const player = mixer.addClip('walk', makeClip('walk'));
    expect(mixer.getPlayer('walk')).toBe(player);
  });

  it('crossFade starts target and fades out current', () => {
    const mixer = new AnimationMixer();
    mixer.addClip('idle', makeClip('idle'));
    mixer.addClip('walk', makeClip('walk'));
    mixer.getPlayer('idle').play();
    mixer.crossFade('walk', 0.3);
    expect(mixer.getPlayer('walk').playing).toBe(true);
  });

  it('update blends values', () => {
    const mixer = new AnimationMixer();
    mixer.addClip('a', makeClip('a'));
    mixer.getPlayer('a').play();
    const blended = mixer.update(0.5);
    expect(blended).toHaveProperty('x');
  });

  it('crossFade to unknown name is ignored', () => {
    const mixer = new AnimationMixer();
    mixer.crossFade('nonexistent', 0.3); // Should not throw
  });

  it('update with no playing returns empty', () => {
    const mixer = new AnimationMixer();
    mixer.addClip('a', makeClip('a'));
    const blended = mixer.update(0.1);
    expect(Object.keys(blended).length).toBe(0);
  });
});

// ─── Spring ──────────────────────────────────────────────────────────────────

describe('Spring', () => {
  it('starts at rest', () => {
    const spring = new Spring();
    expect(spring.value).toBe(0);
    expect(spring.target).toBe(0);
    expect(spring.velocity).toBe(0);
    expect(spring.isSettled()).toBe(true);
  });

  it('moves toward target', () => {
    const spring = new Spring(180, 12, 1);
    spring.target = 10;
    for (let i = 0; i < 100; i++) spring.update(0.016);
    expect(spring.value).toBeCloseTo(10, 0);
  });

  it('snap sets value immediately', () => {
    const spring = new Spring();
    spring.target = 50;
    spring.snap();
    expect(spring.value).toBe(50);
    expect(spring.velocity).toBe(0);
    expect(spring.isSettled()).toBe(true);
  });

  it('is not settled when target differs', () => {
    const spring = new Spring();
    spring.target = 100;
    expect(spring.isSettled()).toBe(false);
  });

  it('returns current value from update', () => {
    const spring = new Spring();
    spring.target = 5;
    const val = spring.update(0.016);
    expect(typeof val).toBe('number');
    expect(val).toBeGreaterThan(0);
  });
});

// ─── AnimationStateMachine ───────────────────────────────────────────────────

describe('AnimationStateMachine', () => {
  it('starts in initial state', () => {
    const sm = new AnimationStateMachine({ initialState: 'idle' });
    expect(sm.currentState).toBe('idle');
  });

  it('defaults to idle', () => {
    const sm = new AnimationStateMachine();
    expect(sm.currentState).toBe('idle');
  });

  it('defines states and transitions', () => {
    const sm = new AnimationStateMachine();
    sm.addState('idle', { animation: 'idle_anim' });
    sm.addState('walk', { animation: 'walk_anim' });
    sm.addTransition('idle', 'walk', { duration: 0.5 });
    expect(sm.states.has('idle')).toBe(true);
    expect(sm.states.has('walk')).toBe(true);
  });

  it('transitionTo changes state', () => {
    const onTransition = vi.fn();
    const sm = new AnimationStateMachine();
    sm.addState('idle');
    sm.addState('walk');
    sm.addTransition('idle', 'walk');
    sm.onTransition = onTransition;
    const result = sm.transitionTo('walk');
    expect(result).toEqual({ from: 'idle', to: 'walk', duration: 0.3 });
    expect(sm.currentState).toBe('walk');
    expect(onTransition).toHaveBeenCalledWith({ from: 'idle', to: 'walk', duration: 0.3 });
  });

  it('returns null for unknown state', () => {
    const sm = new AnimationStateMachine();
    expect(sm.transitionTo('nonexistent')).toBeNull();
  });

  it('respects non-interruptible states', () => {
    const sm = new AnimationStateMachine();
    sm.addState('idle');
    sm.addState('attack', { interruptible: false, minDuration: 1 });
    sm.addTransition('idle', 'attack');
    sm.addTransition('attack', 'idle');
    sm.transitionTo('attack');
    const result = sm.transitionTo('idle'); // Should fail — minDuration not met
    expect(result).toBeNull();
    expect(sm.currentState).toBe('attack');
  });

  it('automatic transitions via conditions', () => {
    let flag = false;
    const sm = new AnimationStateMachine();
    sm.addState('idle');
    sm.addState('alert');
    sm.addTransition('idle', 'alert', { condition: () => flag });
    sm.update(0.1); // No transition
    expect(sm.currentState).toBe('idle');
    flag = true;
    sm.update(0.1);
    expect(sm.currentState).toBe('alert');
  });

  it('currentAnimation returns state animation', () => {
    const sm = new AnimationStateMachine();
    sm.addState('idle', { animation: 'idle_loop' });
    expect(sm.currentAnimation).toBe('idle_loop');
  });

  it('stateTime tracks time in current state', () => {
    const sm = new AnimationStateMachine();
    sm.addState('idle');
    sm.update(0.5);
    expect(sm.stateTime).toBeCloseTo(0.5);
    sm.addState('walk');
    sm.transitionTo('walk');
    expect(sm.stateTime).toBe(0);
  });
});

// ─── Timeline ────────────────────────────────────────────────────────────────

describe('Timeline', () => {
  it('schedules events', () => {
    const tl = new Timeline();
    const fn = vi.fn();
    tl.at(0.5, fn);
    expect(tl.duration).toBe(0.5);
  });

  it('fires events at correct time', () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    const tl = new Timeline();
    tl.at(0.2, fn1);
    tl.at(0.5, fn2);
    tl.play();
    tl.update(0.3);
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).not.toHaveBeenCalled();
    tl.update(0.3);
    expect(fn2).toHaveBeenCalledTimes(1);
  });

  it('fires each event only once per play', () => {
    const fn = vi.fn();
    const tl = new Timeline();
    tl.at(0.1, fn);
    tl.play();
    tl.update(0.5);
    tl.update(0.5);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('after chains events', () => {
    const tl = new Timeline();
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    tl.at(1, fn1);
    tl.after(0.5, fn2);
    expect(tl.events[1].time).toBe(1.5);
  });

  it('loops when enabled', () => {
    const fn = vi.fn();
    const tl = new Timeline();
    tl.loop = true;
    tl.at(0.1, fn);
    tl.play();
    tl.update(0.2);
    expect(fn).toHaveBeenCalledTimes(1);
    tl.update(0.2); // loops, fires again
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('calls onComplete when finished', () => {
    const onComplete = vi.fn();
    const tl = new Timeline();
    tl.at(0.1, () => {});
    tl.onComplete = onComplete;
    tl.play();
    tl.update(0.5);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(tl.playing).toBe(false);
  });

  it('stop resets state', () => {
    const fn = vi.fn();
    const tl = new Timeline();
    tl.at(0.1, fn);
    tl.play();
    tl.update(0.5);
    expect(fn).toHaveBeenCalledTimes(1);
    tl.stop();
    expect(tl.time).toBe(0);
    expect(tl.playing).toBe(false);
  });

  it('does nothing when not playing', () => {
    const fn = vi.fn();
    const tl = new Timeline();
    tl.at(0.1, fn);
    tl.update(1);
    expect(fn).not.toHaveBeenCalled();
  });
});
