import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TouchPoint, GestureEvent, GestureRecognizer, GestureDetector,
  TapRecognizer, LongPressRecognizer, PanRecognizer, SwipeRecognizer,
  PinchRecognizer, RotateRecognizer, CircleRecognizer, PathRecognizer,
  GestureSequence, VelocityTracker, InertiaScroll,
  GestureType, GestureState, SwipeDirection,
  createBasicGestureDetector, createMultiTouchGestureDetector
} from '../gesture-recognition.js';

describe('TouchPoint', () => {
  it('creates with initial values', () => {
    const tp = new TouchPoint(0, 100, 200, 1000);
    expect(tp.x).toBe(100);
    expect(tp.y).toBe(200);
    expect(tp.startX).toBe(100);
    expect(tp.startY).toBe(200);
    expect(tp.id).toBe(0);
  });

  it('updates position', () => {
    const tp = new TouchPoint(0, 0, 0, 0);
    tp.update(100, 50, 100);
    expect(tp.x).toBe(100);
    expect(tp.y).toBe(50);
    expect(tp.prevX).toBe(0);
    expect(tp.prevY).toBe(0);
  });

  it('computes delta', () => {
    const tp = new TouchPoint(0, 10, 20, 0);
    tp.update(50, 80, 100);
    expect(tp.deltaX).toBe(40);
    expect(tp.deltaY).toBe(60);
  });

  it('computes distance', () => {
    const tp = new TouchPoint(0, 0, 0, 0);
    tp.update(3, 4, 100);
    expect(tp.distance).toBe(5);
  });

  it('computes speed', () => {
    const tp = new TouchPoint(0, 0, 0, 0);
    tp.update(100, 0, 100);
    expect(tp.speed).toBe(1000);
  });

  it('determines direction', () => {
    const tp = new TouchPoint(0, 0, 0, 0);
    tp.update(100, 0, 100);
    expect(tp.direction).toBe(SwipeDirection.RIGHT);

    const tp2 = new TouchPoint(0, 0, 0, 0);
    tp2.update(-100, 0, 100);
    expect(tp2.direction).toBe(SwipeDirection.LEFT);

    const tp3 = new TouchPoint(0, 0, 0, 0);
    tp3.update(0, -100, 100);
    expect(tp3.direction).toBe(SwipeDirection.UP);

    const tp4 = new TouchPoint(0, 0, 0, 0);
    tp4.update(0, 100, 100);
    expect(tp4.direction).toBe(SwipeDirection.DOWN);
  });

  it('tracks history', () => {
    const tp = new TouchPoint(0, 0, 0, 0);
    for (let i = 1; i <= 5; i++) tp.update(i * 10, 0, i * 10);
    expect(tp.history.length).toBe(6); // initial + 5 updates
  });

  it('computes average speed', () => {
    const tp = new TouchPoint(0, 0, 0, 0);
    tp.update(100, 0, 100);
    expect(tp.getAverageSpeed()).toBeGreaterThan(0);
  });
});

describe('GestureEvent', () => {
  it('creates with defaults', () => {
    const evt = new GestureEvent(GestureType.TAP);
    expect(evt.type).toBe(GestureType.TAP);
    expect(evt.x).toBe(0);
    expect(evt.y).toBe(0);
    expect(evt.scale).toBe(1);
  });

  it('creates with custom data', () => {
    const evt = new GestureEvent(GestureType.SWIPE, {
      x: 100, y: 200, direction: SwipeDirection.LEFT, velocity: 500
    });
    expect(evt.direction).toBe(SwipeDirection.LEFT);
    expect(evt.velocity).toBe(500);
  });
});

describe('TapRecognizer', () => {
  it('recognizes single tap', () => {
    const rec = new TapRecognizer();
    const taps = [];
    rec.on('tap', e => taps.push(e));

    const touch = new TouchPoint(0, 100, 100, 1000);
    rec.touchStart([touch]);
    touch.update(101, 101, 1100);
    rec.touchEnd([touch]);

    expect(taps.length).toBe(1);
    expect(taps[0].type).toBe(GestureType.TAP);
  });

  it('rejects long press as tap', () => {
    const rec = new TapRecognizer({ maxDuration: 300 });
    const taps = [];
    rec.on('tap', e => taps.push(e));

    const touch = new TouchPoint(0, 100, 100, 0);
    rec.touchStart([touch]);
    touch.update(100, 100, 500); // 500ms > maxDuration
    Object.defineProperty(touch, 'duration', { value: 500 });
    rec.touchEnd([touch]);

    expect(taps.length).toBe(0);
  });

  it('rejects movement as tap', () => {
    const rec = new TapRecognizer({ maxMovement: 10 });
    const taps = [];
    rec.on('tap', e => taps.push(e));

    const touch = new TouchPoint(0, 0, 0, 0);
    rec.touchStart([touch]);
    touch.update(50, 50, 100);
    rec.touchEnd([touch]);

    expect(taps.length).toBe(0);
  });

  it('recognizes double tap', () => {
    const rec = new TapRecognizer({ taps: 2, maxInterval: 500 });
    const taps = [];
    rec.on('tap', e => taps.push(e));

    const touch1 = new TouchPoint(0, 100, 100, 0);
    rec.touchStart([touch1]);
    touch1.update(100, 100, 50);
    rec.touchEnd([touch1]);

    const touch2 = new TouchPoint(0, 100, 100, 100);
    rec.touchStart([touch2]);
    touch2.update(100, 100, 150);
    rec.touchEnd([touch2]);

    expect(taps.length).toBe(1);
    expect(taps[0].type).toBe(GestureType.DOUBLE_TAP);
  });
});

describe('LongPressRecognizer', () => {
  it('recognizes long press', () => {
    vi.useFakeTimers();
    const rec = new LongPressRecognizer({ minDuration: 500 });
    const presses = [];
    rec.on('longPress', e => presses.push(e));

    const touch = new TouchPoint(0, 100, 100, 0);
    rec.touchStart([touch]);

    vi.advanceTimersByTime(600);
    expect(presses.length).toBe(1);
    expect(presses[0].type).toBe(GestureType.LONG_PRESS);

    vi.useRealTimers();
  });

  it('cancels on movement', () => {
    vi.useFakeTimers();
    const rec = new LongPressRecognizer({ minDuration: 500, maxMovement: 10 });
    const presses = [];
    rec.on('longPress', e => presses.push(e));

    const touch = new TouchPoint(0, 100, 100, 0);
    rec.touchStart([touch]);
    touch.update(200, 200, 200);
    rec.touchMove([touch]);

    vi.advanceTimersByTime(600);
    expect(presses.length).toBe(0);

    vi.useRealTimers();
  });
});

describe('PanRecognizer', () => {
  it('recognizes pan gesture', () => {
    const rec = new PanRecognizer({ minDistance: 10 });
    const events = [];
    rec.on('panStart', e => events.push(e));
    rec.on('panMove', e => events.push(e));
    rec.on('panEnd', e => events.push(e));

    const touch = new TouchPoint(0, 0, 0, 0);
    rec.touchStart([touch]);
    touch.update(15, 0, 50);
    rec.touchMove([touch]);
    touch.update(30, 0, 100);
    rec.touchMove([touch]);
    rec.touchEnd([touch]);

    expect(events.length).toBe(3); // start, move, end
    expect(events[0].type).toBe(GestureType.PAN);
  });

  it('respects direction constraint', () => {
    const rec = new PanRecognizer({ minDistance: 10, direction: 'horizontal' });
    const events = [];
    rec.on('panStart', e => events.push(e));

    const touch = new TouchPoint(0, 0, 0, 0);
    rec.touchStart([touch]);
    touch.update(0, 50, 50); // vertical movement
    rec.touchMove([touch]);

    expect(events.length).toBe(0);
  });
});

describe('SwipeRecognizer', () => {
  it('recognizes swipe', () => {
    const rec = new SwipeRecognizer({ minVelocity: 100, minDistance: 20 });
    const swipes = [];
    rec.on('swipe', e => swipes.push(e));

    const touch = new TouchPoint(0, 0, 0, 0);
    touch.update(100, 0, 50);
    rec.touchEnd([touch]);

    expect(swipes.length).toBe(1);
    expect(swipes[0].direction).toBe(SwipeDirection.RIGHT);
  });

  it('rejects slow swipe', () => {
    const rec = new SwipeRecognizer({ minVelocity: 1000 });
    const swipes = [];
    rec.on('swipe', e => swipes.push(e));

    const touch = new TouchPoint(0, 0, 0, 0);
    touch.update(100, 0, 5000); // very slow
    rec.touchEnd([touch]);

    expect(swipes.length).toBe(0);
  });
});

describe('PinchRecognizer', () => {
  it('recognizes pinch', () => {
    const rec = new PinchRecognizer();
    const events = [];
    rec.on('pinchStart', e => events.push(e));
    rec.on('pinchMove', e => events.push(e));

    const t1 = new TouchPoint(0, 0, 0, 0);
    const t2 = new TouchPoint(1, 100, 0, 0);
    rec.touchStart([t1, t2]);

    t1.update(0, 0, 50);
    t2.update(200, 0, 50);
    rec.touchMove([t1, t2]);

    expect(events.length).toBe(2);
    expect(events[1].scale).toBeCloseTo(2, 1);
  });
});

describe('RotateRecognizer', () => {
  it('recognizes rotation', () => {
    const rec = new RotateRecognizer({ minRotation: 0.01 });
    const events = [];
    rec.on('rotate', e => events.push(e));

    const t1 = new TouchPoint(0, 0, 0, 0);
    const t2 = new TouchPoint(1, 100, 0, 0);
    rec.touchStart([t1, t2]);

    t2.update(0, 100, 100); // rotated 90 degrees
    rec.touchMove([t1, t2]);

    expect(events.length).toBe(1);
    expect(Math.abs(events[0].rotation)).toBeGreaterThan(0);
  });
});

describe('CircleRecognizer', () => {
  it('recognizes circle gesture', () => {
    const rec = new CircleRecognizer({ minRadius: 10, tolerance: 0.5 });
    const events = [];
    rec.on('circle', e => events.push(e));

    const points = [];
    const cx = 100, cy = 100, r = 50;
    for (let i = 0; i <= 30; i++) {
      const angle = (2 * Math.PI * i) / 30;
      points.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
    }

    const touch = new TouchPoint(0, points[0].x, points[0].y, 0);
    rec.touchStart([touch]);
    for (let i = 1; i < points.length; i++) {
      touch.update(points[i].x, points[i].y, i * 10);
      rec.touchMove([touch]);
    }
    rec.touchEnd([]);

    expect(events.length).toBe(1);
    expect(events[0].type).toBe(GestureType.CIRCLE);
  });

  it('rejects non-circle', () => {
    const rec = new CircleRecognizer({ tolerance: 0.2 });
    const events = [];
    rec.on('circle', e => events.push(e));

    const touch = new TouchPoint(0, 0, 0, 0);
    rec.touchStart([touch]);
    // Straight line - not a circle
    for (let i = 1; i <= 20; i++) {
      touch.update(i * 10, 0, i * 10);
      rec.touchMove([touch]);
    }
    rec.touchEnd([]);

    expect(events.length).toBe(0);
  });
});

describe('PathRecognizer', () => {
  it('adds templates', () => {
    const rec = new PathRecognizer();
    const line = [];
    for (let i = 0; i < 20; i++) line.push({ x: i * 10, y: 0 });
    rec.addTemplate('horizontal_line', line);
    expect(rec.templates.size).toBe(1);
  });

  it('removes templates', () => {
    const rec = new PathRecognizer();
    rec.addTemplate('test', [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }]);
    rec.removeTemplate('test');
    expect(rec.templates.size).toBe(0);
  });
});

describe('GestureDetector', () => {
  it('adds and removes recognizers', () => {
    const detector = new GestureDetector();
    const tap = new TapRecognizer();
    detector.add(tap);
    expect(detector.recognizers.length).toBe(1);
    detector.remove(tap);
    expect(detector.recognizers.length).toBe(0);
  });

  it('handles touch events', () => {
    const detector = new GestureDetector();
    const tap = new TapRecognizer();
    const events = [];
    tap.on('tap', e => events.push(e));
    detector.add(tap);

    detector.handleTouchStart([{ id: 0, x: 100, y: 100 }]);
    detector.handleTouchEnd([{ id: 0, x: 101, y: 101 }]);

    expect(events.length).toBe(1);
  });

  it('tracks active touches', () => {
    const detector = new GestureDetector();
    detector.handleTouchStart([{ id: 0, x: 0, y: 0 }]);
    expect(detector.getActiveTouchCount()).toBe(1);
    detector.handleTouchEnd([{ id: 0, x: 0, y: 0 }]);
    expect(detector.getActiveTouchCount()).toBe(0);
  });

  it('resets', () => {
    const detector = new GestureDetector();
    detector.add(new TapRecognizer());
    detector.handleTouchStart([{ id: 0, x: 0, y: 0 }]);
    detector.reset();
    expect(detector.getActiveTouchCount()).toBe(0);
  });
});

describe('GestureSequence', () => {
  it('detects sequence', () => {
    let completed = false;
    const seq = new GestureSequence(
      [GestureType.TAP, GestureType.TAP, GestureType.SWIPE],
      { onComplete: () => { completed = true; } }
    );

    seq.feed(GestureType.TAP);
    expect(seq.getProgress()).toBeCloseTo(1/3, 2);
    seq.feed(GestureType.TAP);
    expect(seq.getProgress()).toBeCloseTo(2/3, 2);
    const result = seq.feed(GestureType.SWIPE);
    expect(result).toBe(true);
    expect(completed).toBe(true);
  });

  it('resets on wrong gesture', () => {
    const seq = new GestureSequence([GestureType.TAP, GestureType.SWIPE]);
    seq.feed(GestureType.TAP);
    seq.feed(GestureType.PINCH); // wrong
    expect(seq.getProgress()).toBe(0);
  });
});

describe('VelocityTracker', () => {
  it('tracks velocity', () => {
    const tracker = new VelocityTracker();
    tracker.addSample(0, 0, 0);
    tracker.addSample(100, 0, 100);
    const vel = tracker.getVelocity();
    expect(vel.x).toBe(1000);
    expect(vel.y).toBe(0);
  });

  it('computes speed', () => {
    const tracker = new VelocityTracker();
    tracker.addSample(0, 0, 0);
    tracker.addSample(30, 40, 100);
    expect(tracker.getSpeed()).toBe(500);
  });
});

describe('InertiaScroll', () => {
  it('decelerates', () => {
    const scroll = new InertiaScroll({ friction: 0.9 });
    scroll.start(1000, 0, 0, 0);
    expect(scroll.isAnimating()).toBe(true);

    scroll.update(0.016);
    const pos = scroll.getPosition();
    expect(pos.x).toBeGreaterThan(0);
  });

  it('stops when slow enough', () => {
    const scroll = new InertiaScroll({ friction: 0.1, minVelocity: 100 });
    scroll.start(50, 0);
    scroll.update(0.1);
    expect(scroll.isAnimating()).toBe(false);
  });

  it('bounces at bounds', () => {
    const scroll = new InertiaScroll({
      bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
      friction: 0.95
    });
    scroll.start(-500, 0, 0, 0);
    for (let i = 0; i < 20; i++) scroll.update(0.016);
    // Should bounce back from boundary
    const pos = scroll.getPosition();
    expect(pos.x).toBeGreaterThan(-100); // Bounced back somewhat
  });
});

describe('Factory Functions', () => {
  it('createBasicGestureDetector', () => {
    const detector = createBasicGestureDetector();
    expect(detector.recognizers.length).toBe(5);
  });

  it('createMultiTouchGestureDetector', () => {
    const detector = createMultiTouchGestureDetector();
    expect(detector.recognizers.length).toBe(7);
  });
});
