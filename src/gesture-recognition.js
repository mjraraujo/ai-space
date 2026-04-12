/* ============================================================================
 *  gesture-recognition.js — Hand/touch gesture recognition system
 *  Touch tracking, gesture classification, pattern matching, sequences
 * ========================================================================== */

// ─── Gesture Types ──────────────────────────────────────────────────────────
export const GestureType = {
  TAP: 'tap',
  DOUBLE_TAP: 'doubleTap',
  LONG_PRESS: 'longPress',
  PAN: 'pan',
  SWIPE: 'swipe',
  PINCH: 'pinch',
  ROTATE: 'rotate',
  DRAG: 'drag',
  FLICK: 'flick',
  CIRCLE: 'circle',
  DRAW: 'draw',
  MULTI_TAP: 'multiTap'
};

export const GestureState = {
  POSSIBLE: 'possible',
  BEGAN: 'began',
  CHANGED: 'changed',
  ENDED: 'ended',
  CANCELLED: 'cancelled',
  FAILED: 'failed'
};

export const SwipeDirection = {
  LEFT: 'left',
  RIGHT: 'right',
  UP: 'up',
  DOWN: 'down'
};

// ─── Touch Point ────────────────────────────────────────────────────────────
export class TouchPoint {
  constructor(id, x, y, timestamp) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.timestamp = timestamp;
    this.startX = x;
    this.startY = y;
    this.startTime = timestamp;
    this.prevX = x;
    this.prevY = y;
    this.prevTime = timestamp;
    this.velocityX = 0;
    this.velocityY = 0;
    this.pressure = 1;
    this.radius = 1;
    this.history = [{ x, y, t: timestamp }];
    this._maxHistory = 100;
  }

  update(x, y, timestamp) {
    this.prevX = this.x;
    this.prevY = this.y;
    this.prevTime = this.timestamp;
    this.x = x;
    this.y = y;
    this.timestamp = timestamp;

    const dt = (timestamp - this.prevTime) / 1000;
    if (dt > 0) {
      this.velocityX = (x - this.prevX) / dt;
      this.velocityY = (y - this.prevY) / dt;
    }

    this.history.push({ x, y, t: timestamp });
    if (this.history.length > this._maxHistory) {
      this.history.shift();
    }
  }

  get deltaX() { return this.x - this.startX; }
  get deltaY() { return this.y - this.startY; }
  get distance() { return Math.sqrt(this.deltaX ** 2 + this.deltaY ** 2); }
  get duration() { return this.timestamp - this.startTime; }
  get speed() { return Math.sqrt(this.velocityX ** 2 + this.velocityY ** 2); }

  get angle() { return Math.atan2(this.deltaY, this.deltaX); }

  get direction() {
    const angle = this.angle;
    if (angle > -Math.PI / 4 && angle <= Math.PI / 4) return SwipeDirection.RIGHT;
    if (angle > Math.PI / 4 && angle <= 3 * Math.PI / 4) return SwipeDirection.DOWN;
    if (angle > -3 * Math.PI / 4 && angle <= -Math.PI / 4) return SwipeDirection.UP;
    return SwipeDirection.LEFT;
  }

  getAverageSpeed() {
    if (this.history.length < 2) return 0;
    let totalDist = 0;
    for (let i = 1; i < this.history.length; i++) {
      const dx = this.history[i].x - this.history[i-1].x;
      const dy = this.history[i].y - this.history[i-1].y;
      totalDist += Math.sqrt(dx * dx + dy * dy);
    }
    const totalTime = (this.history[this.history.length - 1].t - this.history[0].t) / 1000;
    return totalTime > 0 ? totalDist / totalTime : 0;
  }

  getRecentSpeed(windowMs = 100) {
    const now = this.timestamp;
    const recent = this.history.filter(h => now - h.t <= windowMs);
    if (recent.length < 2) return 0;
    let dist = 0;
    for (let i = 1; i < recent.length; i++) {
      const dx = recent[i].x - recent[i-1].x;
      const dy = recent[i].y - recent[i-1].y;
      dist += Math.sqrt(dx * dx + dy * dy);
    }
    const time = (recent[recent.length - 1].t - recent[0].t) / 1000;
    return time > 0 ? dist / time : 0;
  }
}

// ─── Gesture Event ──────────────────────────────────────────────────────────
export class GestureEvent {
  constructor(type, data = {}) {
    this.type = type;
    this.state = data.state || GestureState.ENDED;
    this.x = data.x ?? 0;
    this.y = data.y ?? 0;
    this.deltaX = data.deltaX ?? 0;
    this.deltaY = data.deltaY ?? 0;
    this.distance = data.distance ?? 0;
    this.direction = data.direction ?? null;
    this.velocity = data.velocity ?? 0;
    this.velocityX = data.velocityX ?? 0;
    this.velocityY = data.velocityY ?? 0;
    this.scale = data.scale ?? 1;
    this.rotation = data.rotation ?? 0;
    this.touches = data.touches ?? 1;
    this.timestamp = data.timestamp ?? Date.now();
    this.duration = data.duration ?? 0;
    this.target = data.target ?? null;
    this.path = data.path ?? [];
    this.isFinal = data.isFinal ?? false;
    this.preventDefault = () => {};
    this.stopPropagation = () => {};
  }
}

// ─── Base Gesture Recognizer ────────────────────────────────────────────────
export class GestureRecognizer {
  constructor(opts = {}) {
    this.enabled = opts.enabled ?? true;
    this.state = GestureState.POSSIBLE;
    this._listeners = {};
    this.priority = opts.priority ?? 0;
    this.requireFail = opts.requireFail ?? [];
    this.simultaneousWith = opts.simultaneousWith ?? [];
  }

  on(event, cb) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(cb);
    return this;
  }

  off(event, cb) {
    if (this._listeners[event]) {
      const idx = this._listeners[event].indexOf(cb);
      if (idx >= 0) this._listeners[event].splice(idx, 1);
    }
    return this;
  }

  emit(event, data) {
    if (this._listeners[event]) {
      for (const cb of this._listeners[event]) cb(data);
    }
  }

  reset() { this.state = GestureState.POSSIBLE; }
  touchStart(_touches) {}
  touchMove(_touches) {}
  touchEnd(_touches) {}
  touchCancel(_touches) { this.state = GestureState.CANCELLED; }
}

// ─── Tap Recognizer ─────────────────────────────────────────────────────────
export class TapRecognizer extends GestureRecognizer {
  constructor(opts = {}) {
    super(opts);
    this.taps = opts.taps ?? 1;
    this.maxDuration = opts.maxDuration ?? 300;
    this.maxMovement = opts.maxMovement ?? 10;
    this.maxInterval = opts.maxInterval ?? 300;
    this._tapCount = 0;
    this._lastTapTime = 0;
    this._startPoint = null;
    this._timer = null;
  }

  touchStart(touches) {
    if (!this.enabled || touches.length !== 1) return;
    this._startPoint = { x: touches[0].x, y: touches[0].y, t: touches[0].timestamp };
  }

  touchEnd(touches) {
    if (!this.enabled || !this._startPoint) return;
    const touch = touches[0];
    if (!touch) return;

    const duration = touch.duration;
    const dist = touch.distance;

    if (duration > this.maxDuration || dist > this.maxMovement) {
      this._tapCount = 0;
      this.state = GestureState.FAILED;
      return;
    }

    const now = touch.timestamp;
    if (this._tapCount > 0 && now - this._lastTapTime > this.maxInterval) {
      this._tapCount = 0;
    }

    this._tapCount++;
    this._lastTapTime = now;

    if (this._tapCount >= this.taps) {
      this.state = GestureState.ENDED;
      this.emit('tap', new GestureEvent(
        this.taps === 1 ? GestureType.TAP : GestureType.DOUBLE_TAP,
        {
          x: touch.x,
          y: touch.y,
          touches: 1,
          timestamp: now,
          state: GestureState.ENDED,
          isFinal: true
        }
      ));
      this._tapCount = 0;
    }
  }

  reset() {
    super.reset();
    this._tapCount = 0;
    this._startPoint = null;
  }
}

// ─── Long Press Recognizer ──────────────────────────────────────────────────
export class LongPressRecognizer extends GestureRecognizer {
  constructor(opts = {}) {
    super(opts);
    this.minDuration = opts.minDuration ?? 500;
    this.maxMovement = opts.maxMovement ?? 10;
    this._timer = null;
    this._startPoint = null;
    this._active = false;
  }

  touchStart(touches) {
    if (!this.enabled || touches.length !== 1) return;
    const touch = touches[0];
    this._startPoint = { x: touch.x, y: touch.y };
    this._active = false;

    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      if (this.state === GestureState.POSSIBLE) {
        this._active = true;
        this.state = GestureState.BEGAN;
        this.emit('longPress', new GestureEvent(GestureType.LONG_PRESS, {
          x: touch.x,
          y: touch.y,
          state: GestureState.BEGAN,
          duration: this.minDuration,
          timestamp: Date.now()
        }));
      }
    }, this.minDuration);
  }

  touchMove(touches) {
    if (!this._startPoint || touches.length !== 1) return;
    const touch = touches[0];
    const dx = touch.x - this._startPoint.x;
    const dy = touch.y - this._startPoint.y;
    if (Math.sqrt(dx * dx + dy * dy) > this.maxMovement) {
      this._cancel();
    }
  }

  touchEnd(_touches) {
    if (this._active) {
      this.state = GestureState.ENDED;
      this.emit('longPressEnd', new GestureEvent(GestureType.LONG_PRESS, {
        state: GestureState.ENDED,
        isFinal: true
      }));
    }
    this._cancel();
  }

  _cancel() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    this._active = false;
    this._startPoint = null;
  }

  reset() {
    super.reset();
    this._cancel();
  }
}

// ─── Pan Recognizer ─────────────────────────────────────────────────────────
export class PanRecognizer extends GestureRecognizer {
  constructor(opts = {}) {
    super(opts);
    this.minDistance = opts.minDistance ?? 10;
    this.maxTouches = opts.maxTouches ?? 1;
    this.direction = opts.direction ?? 'all'; // 'all', 'horizontal', 'vertical'
    this._tracking = false;
  }

  touchStart(touches) {
    if (!this.enabled || touches.length > this.maxTouches) return;
    this._tracking = true;
  }

  touchMove(touches) {
    if (!this.enabled || !this._tracking || touches.length === 0) return;
    const touch = touches[0];

    if (this.state === GestureState.POSSIBLE) {
      const dist = touch.distance;
      if (dist >= this.minDistance) {
        if (this.direction === 'horizontal' && Math.abs(touch.deltaY) > Math.abs(touch.deltaX)) return;
        if (this.direction === 'vertical' && Math.abs(touch.deltaX) > Math.abs(touch.deltaY)) return;

        this.state = GestureState.BEGAN;
        this.emit('panStart', new GestureEvent(GestureType.PAN, {
          x: touch.x, y: touch.y,
          deltaX: touch.deltaX, deltaY: touch.deltaY,
          velocityX: touch.velocityX, velocityY: touch.velocityY,
          state: GestureState.BEGAN,
          direction: touch.direction,
          timestamp: touch.timestamp
        }));
      }
    } else if (this.state === GestureState.BEGAN || this.state === GestureState.CHANGED) {
      this.state = GestureState.CHANGED;
      this.emit('panMove', new GestureEvent(GestureType.PAN, {
        x: touch.x, y: touch.y,
        deltaX: touch.deltaX, deltaY: touch.deltaY,
        velocityX: touch.velocityX, velocityY: touch.velocityY,
        velocity: touch.speed,
        state: GestureState.CHANGED,
        direction: touch.direction,
        timestamp: touch.timestamp
      }));
    }
  }

  touchEnd(touches) {
    if (this.state === GestureState.BEGAN || this.state === GestureState.CHANGED) {
      const touch = touches[0];
      this.state = GestureState.ENDED;
      this.emit('panEnd', new GestureEvent(GestureType.PAN, {
        x: touch?.x ?? 0, y: touch?.y ?? 0,
        deltaX: touch?.deltaX ?? 0, deltaY: touch?.deltaY ?? 0,
        velocityX: touch?.velocityX ?? 0, velocityY: touch?.velocityY ?? 0,
        velocity: touch?.speed ?? 0,
        state: GestureState.ENDED,
        direction: touch?.direction ?? null,
        isFinal: true,
        timestamp: Date.now()
      }));
    }
    this._tracking = false;
  }

  reset() {
    super.reset();
    this._tracking = false;
  }
}

// ─── Swipe Recognizer ───────────────────────────────────────────────────────
export class SwipeRecognizer extends GestureRecognizer {
  constructor(opts = {}) {
    super(opts);
    this.minVelocity = opts.minVelocity ?? 300;
    this.minDistance = opts.minDistance ?? 50;
    this.maxDuration = opts.maxDuration ?? 500;
    this.direction = opts.direction ?? 'all';
  }

  touchEnd(touches) {
    if (!this.enabled || touches.length === 0) return;
    const touch = touches[0];
    if (!touch) return;

    const speed = touch.speed;
    const dist = touch.distance;
    const duration = touch.duration;

    if (speed < this.minVelocity || dist < this.minDistance || duration > this.maxDuration) {
      this.state = GestureState.FAILED;
      return;
    }

    const dir = touch.direction;
    if (this.direction !== 'all') {
      const isHorizontal = dir === SwipeDirection.LEFT || dir === SwipeDirection.RIGHT;
      const isVertical = dir === SwipeDirection.UP || dir === SwipeDirection.DOWN;
      if (this.direction === 'horizontal' && !isHorizontal) return;
      if (this.direction === 'vertical' && !isVertical) return;
    }

    this.state = GestureState.ENDED;
    this.emit('swipe', new GestureEvent(GestureType.SWIPE, {
      x: touch.x, y: touch.y,
      deltaX: touch.deltaX, deltaY: touch.deltaY,
      velocity: speed,
      direction: dir,
      distance: dist,
      duration,
      state: GestureState.ENDED,
      isFinal: true,
      timestamp: touch.timestamp
    }));
  }
}

// ─── Pinch Recognizer ───────────────────────────────────────────────────────
export class PinchRecognizer extends GestureRecognizer {
  constructor(opts = {}) {
    super(opts);
    this.minScale = opts.minScale ?? 0.05;
    this._initialDistance = 0;
    this._currentScale = 1;
  }

  _getDistance(touches) {
    if (touches.length < 2) return 0;
    const dx = touches[1].x - touches[0].x;
    const dy = touches[1].y - touches[0].y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  _getCenter(touches) {
    if (touches.length < 2) return { x: touches[0]?.x ?? 0, y: touches[0]?.y ?? 0 };
    return {
      x: (touches[0].x + touches[1].x) / 2,
      y: (touches[0].y + touches[1].y) / 2
    };
  }

  touchStart(touches) {
    if (!this.enabled || touches.length < 2) return;
    this._initialDistance = this._getDistance(touches);
    this._currentScale = 1;
    this.state = GestureState.BEGAN;

    const center = this._getCenter(touches);
    this.emit('pinchStart', new GestureEvent(GestureType.PINCH, {
      x: center.x, y: center.y,
      scale: 1,
      state: GestureState.BEGAN,
      touches: touches.length,
      timestamp: Date.now()
    }));
  }

  touchMove(touches) {
    if (!this.enabled || touches.length < 2 || this._initialDistance === 0) return;
    const currentDist = this._getDistance(touches);
    this._currentScale = currentDist / this._initialDistance;

    if (Math.abs(this._currentScale - 1) < this.minScale && this.state === GestureState.BEGAN) return;

    this.state = GestureState.CHANGED;
    const center = this._getCenter(touches);
    this.emit('pinchMove', new GestureEvent(GestureType.PINCH, {
      x: center.x, y: center.y,
      scale: this._currentScale,
      state: GestureState.CHANGED,
      touches: touches.length,
      timestamp: Date.now()
    }));
  }

  touchEnd(touches) {
    if (this.state === GestureState.BEGAN || this.state === GestureState.CHANGED) {
      this.state = GestureState.ENDED;
      const center = this._getCenter(touches);
      this.emit('pinchEnd', new GestureEvent(GestureType.PINCH, {
        x: center.x, y: center.y,
        scale: this._currentScale,
        state: GestureState.ENDED,
        isFinal: true,
        timestamp: Date.now()
      }));
    }
    this._initialDistance = 0;
    this._currentScale = 1;
  }

  reset() {
    super.reset();
    this._initialDistance = 0;
    this._currentScale = 1;
  }
}

// ─── Rotate Recognizer ──────────────────────────────────────────────────────
export class RotateRecognizer extends GestureRecognizer {
  constructor(opts = {}) {
    super(opts);
    this.minRotation = opts.minRotation ?? 0.05; // radians
    this._initialAngle = 0;
    this._currentRotation = 0;
  }

  _getAngle(touches) {
    if (touches.length < 2) return 0;
    return Math.atan2(touches[1].y - touches[0].y, touches[1].x - touches[0].x);
  }

  touchStart(touches) {
    if (!this.enabled || touches.length < 2) return;
    this._initialAngle = this._getAngle(touches);
    this._currentRotation = 0;
    this.state = GestureState.BEGAN;
  }

  touchMove(touches) {
    if (!this.enabled || touches.length < 2) return;
    const currentAngle = this._getAngle(touches);
    this._currentRotation = currentAngle - this._initialAngle;

    // Normalize to [-PI, PI]
    while (this._currentRotation > Math.PI) this._currentRotation -= 2 * Math.PI;
    while (this._currentRotation < -Math.PI) this._currentRotation += 2 * Math.PI;

    if (Math.abs(this._currentRotation) < this.minRotation && this.state === GestureState.BEGAN) return;

    this.state = GestureState.CHANGED;
    this.emit('rotate', new GestureEvent(GestureType.ROTATE, {
      rotation: this._currentRotation,
      x: (touches[0].x + touches[1].x) / 2,
      y: (touches[0].y + touches[1].y) / 2,
      state: GestureState.CHANGED,
      touches: 2,
      timestamp: Date.now()
    }));
  }

  touchEnd(_touches) {
    if (this.state === GestureState.CHANGED) {
      this.state = GestureState.ENDED;
      this.emit('rotateEnd', new GestureEvent(GestureType.ROTATE, {
        rotation: this._currentRotation,
        state: GestureState.ENDED,
        isFinal: true,
        timestamp: Date.now()
      }));
    }
    this._initialAngle = 0;
    this._currentRotation = 0;
  }

  reset() {
    super.reset();
    this._initialAngle = 0;
    this._currentRotation = 0;
  }
}

// ─── Circle Recognizer ──────────────────────────────────────────────────────
export class CircleRecognizer extends GestureRecognizer {
  constructor(opts = {}) {
    super(opts);
    this.minRadius = opts.minRadius ?? 30;
    this.maxRadius = opts.maxRadius ?? 200;
    this.tolerance = opts.tolerance ?? 0.3;
    this._points = [];
  }

  touchStart(touches) {
    if (!this.enabled || touches.length !== 1) return;
    this._points = [{ x: touches[0].x, y: touches[0].y }];
  }

  touchMove(touches) {
    if (!this.enabled || touches.length !== 1) return;
    this._points.push({ x: touches[0].x, y: touches[0].y });
  }

  touchEnd(_touches) {
    if (!this.enabled || this._points.length < 10) {
      this.state = GestureState.FAILED;
      return;
    }

    const result = this._analyzeCircle();
    if (result) {
      this.state = GestureState.ENDED;
      this.emit('circle', new GestureEvent(GestureType.CIRCLE, {
        x: result.centerX,
        y: result.centerY,
        distance: result.radius,
        rotation: result.direction === 'clockwise' ? 1 : -1,
        state: GestureState.ENDED,
        isFinal: true,
        path: this._points,
        timestamp: Date.now()
      }));
    } else {
      this.state = GestureState.FAILED;
    }
    this._points = [];
  }

  _analyzeCircle() {
    const points = this._points;
    const n = points.length;

    // Compute centroid
    let cx = 0, cy = 0;
    for (const p of points) { cx += p.x; cy += p.y; }
    cx /= n; cy /= n;

    // Compute average radius
    let avgR = 0;
    for (const p of points) {
      avgR += Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2);
    }
    avgR /= n;

    if (avgR < this.minRadius || avgR > this.maxRadius) return null;

    // Check circularity (variance of radii)
    let variance = 0;
    for (const p of points) {
      const r = Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2);
      variance += (r - avgR) ** 2;
    }
    variance /= n;
    const stdDev = Math.sqrt(variance);

    if (stdDev / avgR > this.tolerance) return null;

    // Check if path returns near start
    const startEnd = Math.sqrt((points[0].x - points[n-1].x) ** 2 + (points[0].y - points[n-1].y) ** 2);
    if (startEnd > avgR * 0.8) return null;

    // Determine direction
    let crossSum = 0;
    for (let i = 0; i < n - 1; i++) {
      crossSum += (points[i+1].x - points[i].x) * (points[i+1].y + points[i].y);
    }
    const direction = crossSum > 0 ? 'clockwise' : 'counterclockwise';

    return { centerX: cx, centerY: cy, radius: avgR, direction };
  }

  reset() {
    super.reset();
    this._points = [];
  }
}

// ─── Path Recognizer ($1 Recognizer) ────────────────────────────────────────
export class PathRecognizer extends GestureRecognizer {
  constructor(opts = {}) {
    super(opts);
    this.numPoints = opts.numPoints ?? 64;
    this.templates = new Map();
    this._points = [];
  }

  addTemplate(name, points) {
    const processed = this._processPath(points);
    if (!this.templates.has(name)) this.templates.set(name, []);
    this.templates.get(name).push(processed);
  }

  removeTemplate(name) {
    this.templates.delete(name);
  }

  touchStart(touches) {
    if (!this.enabled || touches.length !== 1) return;
    this._points = [{ x: touches[0].x, y: touches[0].y }];
  }

  touchMove(touches) {
    if (!this.enabled || touches.length !== 1) return;
    this._points.push({ x: touches[0].x, y: touches[0].y });
  }

  touchEnd(_touches) {
    if (!this.enabled || this._points.length < 5) {
      this.state = GestureState.FAILED;
      return;
    }

    const result = this.recognize(this._points);
    if (result && result.score > 0.7) {
      this.state = GestureState.ENDED;
      this.emit('path', new GestureEvent(GestureType.DRAW, {
        state: GestureState.ENDED,
        isFinal: true,
        path: this._points,
        timestamp: Date.now(),
        target: { name: result.name, score: result.score }
      }));
    } else {
      this.state = GestureState.FAILED;
    }
    this._points = [];
  }

  recognize(points) {
    const processed = this._processPath(points);
    let bestScore = 0;
    let bestName = null;

    for (const [name, templates] of this.templates) {
      for (const template of templates) {
        const score = this._match(processed, template);
        if (score > bestScore) {
          bestScore = score;
          bestName = name;
        }
      }
    }

    return bestName ? { name: bestName, score: bestScore } : null;
  }

  _processPath(points) {
    let path = this._resample(points, this.numPoints);
    path = this._rotateToZero(path);
    path = this._scaleToSquare(path, 250);
    path = this._translateToOrigin(path);
    return path;
  }

  _resample(points, n) {
    const totalLen = this._pathLength(points);
    const interval = totalLen / (n - 1);
    const resampled = [{ ...points[0] }];
    let D = 0;

    for (let i = 1; i < points.length; i++) {
      const d = this._dist(points[i-1], points[i]);
      if (D + d >= interval) {
        const t = (interval - D) / d;
        const newPoint = {
          x: points[i-1].x + t * (points[i].x - points[i-1].x),
          y: points[i-1].y + t * (points[i].y - points[i-1].y)
        };
        resampled.push(newPoint);
        points.splice(i, 0, newPoint);
        D = 0;
      } else {
        D += d;
      }
    }

    while (resampled.length < n) {
      resampled.push({ ...points[points.length - 1] });
    }

    return resampled.slice(0, n);
  }

  _rotateToZero(points) {
    const centroid = this._centroid(points);
    const angle = Math.atan2(centroid.y - points[0].y, centroid.x - points[0].x);
    return this._rotateBy(points, -angle);
  }

  _scaleToSquare(points, size) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const w = maxX - minX || 1;
    const h = maxY - minY || 1;
    return points.map(p => ({
      x: p.x * (size / w),
      y: p.y * (size / h)
    }));
  }

  _translateToOrigin(points) {
    const centroid = this._centroid(points);
    return points.map(p => ({
      x: p.x - centroid.x,
      y: p.y - centroid.y
    }));
  }

  _rotateBy(points, angle) {
    const c = this._centroid(points);
    const cos = Math.cos(angle), sin = Math.sin(angle);
    return points.map(p => ({
      x: (p.x - c.x) * cos - (p.y - c.y) * sin + c.x,
      y: (p.x - c.x) * sin + (p.y - c.y) * cos + c.y
    }));
  }

  _centroid(points) {
    let x = 0, y = 0;
    for (const p of points) { x += p.x; y += p.y; }
    return { x: x / points.length, y: y / points.length };
  }

  _pathLength(points) {
    let len = 0;
    for (let i = 1; i < points.length; i++) {
      len += this._dist(points[i-1], points[i]);
    }
    return len;
  }

  _dist(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
  }

  _match(a, b) {
    const n = Math.min(a.length, b.length);
    let d = 0;
    for (let i = 0; i < n; i++) {
      d += this._dist(a[i], b[i]);
    }
    const avgDist = d / n;
    const size = 250;
    const halfDiag = 0.5 * Math.sqrt(size * size + size * size);
    return 1 - avgDist / halfDiag;
  }

  reset() {
    super.reset();
    this._points = [];
  }
}

// ─── Gesture Detector (Manager) ─────────────────────────────────────────────
export class GestureDetector {
  constructor(opts = {}) {
    this.recognizers = [];
    this._activeTouches = new Map();
    this._listeners = {};
    this.enabled = opts.enabled ?? true;
  }

  add(recognizer) {
    this.recognizers.push(recognizer);
    this.recognizers.sort((a, b) => b.priority - a.priority);
    return recognizer;
  }

  remove(recognizer) {
    const idx = this.recognizers.indexOf(recognizer);
    if (idx >= 0) this.recognizers.splice(idx, 1);
  }

  on(event, cb) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(cb);
    return this;
  }

  off(event, cb) {
    if (this._listeners[event]) {
      const idx = this._listeners[event].indexOf(cb);
      if (idx >= 0) this._listeners[event].splice(idx, 1);
    }
    return this;
  }

  _emit(event, data) {
    if (this._listeners[event]) {
      for (const cb of this._listeners[event]) cb(data);
    }
  }

  handleTouchStart(rawTouches) {
    if (!this.enabled) return;
    const now = Date.now();
    for (const raw of rawTouches) {
      const touch = new TouchPoint(raw.id ?? 0, raw.x, raw.y, raw.timestamp ?? now);
      if (raw.pressure !== undefined) touch.pressure = raw.pressure;
      if (raw.radius !== undefined) touch.radius = raw.radius;
      this._activeTouches.set(touch.id, touch);
    }

    const touches = Array.from(this._activeTouches.values());
    for (const r of this.recognizers) {
      if (r.enabled) r.touchStart(touches);
    }
  }

  handleTouchMove(rawTouches) {
    if (!this.enabled) return;
    const now = Date.now();
    for (const raw of rawTouches) {
      const touch = this._activeTouches.get(raw.id ?? 0);
      if (touch) {
        touch.update(raw.x, raw.y, raw.timestamp ?? now);
        if (raw.pressure !== undefined) touch.pressure = raw.pressure;
      }
    }

    const touches = Array.from(this._activeTouches.values());
    for (const r of this.recognizers) {
      if (r.enabled) r.touchMove(touches);
    }
  }

  handleTouchEnd(rawTouches) {
    if (!this.enabled) return;
    const now = Date.now();
    for (const raw of rawTouches) {
      const touch = this._activeTouches.get(raw.id ?? 0);
      if (touch) touch.update(raw.x, raw.y, raw.timestamp ?? now);
    }

    const touches = Array.from(this._activeTouches.values());
    for (const r of this.recognizers) {
      if (r.enabled) r.touchEnd(touches);
    }

    for (const raw of rawTouches) {
      this._activeTouches.delete(raw.id ?? 0);
    }

    // Reset recognizers when all touches ended
    if (this._activeTouches.size === 0) {
      for (const r of this.recognizers) r.reset();
    }
  }

  handleTouchCancel(rawTouches) {
    for (const raw of rawTouches) {
      this._activeTouches.delete(raw.id ?? 0);
    }
    const touches = Array.from(this._activeTouches.values());
    for (const r of this.recognizers) {
      if (r.enabled) r.touchCancel(touches);
    }
  }

  getActiveTouchCount() { return this._activeTouches.size; }

  reset() {
    this._activeTouches.clear();
    for (const r of this.recognizers) r.reset();
  }

  destroy() {
    this.recognizers = [];
    this._activeTouches.clear();
    this._listeners = {};
  }
}

// ─── Gesture Sequence Detector ──────────────────────────────────────────────
export class GestureSequence {
  constructor(sequence, opts = {}) {
    this.sequence = sequence; // Array of gesture types
    this.timeout = opts.timeout ?? 2000;
    this.onComplete = opts.onComplete ?? null;
    this._progress = 0;
    this._lastTime = 0;
  }

  feed(gestureType) {
    const now = Date.now();
    if (this._progress > 0 && now - this._lastTime > this.timeout) {
      this._progress = 0;
    }

    if (this.sequence[this._progress] === gestureType) {
      this._progress++;
      this._lastTime = now;

      if (this._progress >= this.sequence.length) {
        this._progress = 0;
        if (this.onComplete) this.onComplete();
        return true;
      }
    } else if (this.sequence[0] === gestureType) {
      this._progress = 1;
      this._lastTime = now;
    } else {
      this._progress = 0;
    }

    return false;
  }

  getProgress() { return this._progress / this.sequence.length; }
  reset() { this._progress = 0; }
}

// ─── Velocity Tracker ───────────────────────────────────────────────────────
export class VelocityTracker {
  constructor(windowSize = 5) {
    this.windowSize = windowSize;
    this._samples = [];
  }

  addSample(x, y, timestamp) {
    this._samples.push({ x, y, t: timestamp });
    if (this._samples.length > this.windowSize) {
      this._samples.shift();
    }
  }

  getVelocity() {
    if (this._samples.length < 2) return { x: 0, y: 0 };
    const first = this._samples[0];
    const last = this._samples[this._samples.length - 1];
    const dt = (last.t - first.t) / 1000;
    if (dt <= 0) return { x: 0, y: 0 };
    return {
      x: (last.x - first.x) / dt,
      y: (last.y - first.y) / dt
    };
  }

  getSpeed() {
    const v = this.getVelocity();
    return Math.sqrt(v.x * v.x + v.y * v.y);
  }

  reset() { this._samples = []; }
}

// ─── Inertia Scroll ─────────────────────────────────────────────────────────
export class InertiaScroll {
  constructor(opts = {}) {
    this.friction = opts.friction ?? 0.95;
    this.minVelocity = opts.minVelocity ?? 0.5;
    this.bounceStiffness = opts.bounceStiffness ?? 0.15;
    this.bounceDamping = opts.bounceDamping ?? 0.8;
    this.bounds = opts.bounds ?? null; // { minX, minY, maxX, maxY }
    this._velocityX = 0;
    this._velocityY = 0;
    this._x = 0;
    this._y = 0;
    this._isAnimating = false;
    this._onUpdate = opts.onUpdate ?? null;
  }

  start(velocityX, velocityY, startX = 0, startY = 0) {
    this._velocityX = velocityX;
    this._velocityY = velocityY;
    this._x = startX;
    this._y = startY;
    this._isAnimating = true;
  }

  update(dt) {
    if (!this._isAnimating) return null;

    this._velocityX *= this.friction;
    this._velocityY *= this.friction;

    this._x += this._velocityX * dt;
    this._y += this._velocityY * dt;

    // Bounce at bounds
    if (this.bounds) {
      if (this._x < this.bounds.minX) {
        this._velocityX += (this.bounds.minX - this._x) * this.bounceStiffness;
        this._velocityX *= this.bounceDamping;
      }
      if (this._x > this.bounds.maxX) {
        this._velocityX += (this.bounds.maxX - this._x) * this.bounceStiffness;
        this._velocityX *= this.bounceDamping;
      }
      if (this._y < this.bounds.minY) {
        this._velocityY += (this.bounds.minY - this._y) * this.bounceStiffness;
        this._velocityY *= this.bounceDamping;
      }
      if (this._y > this.bounds.maxY) {
        this._velocityY += (this.bounds.maxY - this._y) * this.bounceStiffness;
        this._velocityY *= this.bounceDamping;
      }
    }

    const speed = Math.sqrt(this._velocityX ** 2 + this._velocityY ** 2);
    if (speed < this.minVelocity) {
      this._isAnimating = false;
      this._velocityX = 0;
      this._velocityY = 0;
    }

    const result = { x: this._x, y: this._y, velocityX: this._velocityX, velocityY: this._velocityY };
    if (this._onUpdate) this._onUpdate(result);
    return result;
  }

  stop() {
    this._isAnimating = false;
    this._velocityX = 0;
    this._velocityY = 0;
  }

  isAnimating() { return this._isAnimating; }
  getPosition() { return { x: this._x, y: this._y }; }
}

// ─── Factory Functions ──────────────────────────────────────────────────────
export function createBasicGestureDetector() {
  const detector = new GestureDetector();
  detector.add(new TapRecognizer());
  detector.add(new TapRecognizer({ taps: 2 }));
  detector.add(new LongPressRecognizer());
  detector.add(new PanRecognizer());
  detector.add(new SwipeRecognizer());
  return detector;
}

export function createMultiTouchGestureDetector() {
  const detector = createBasicGestureDetector();
  detector.add(new PinchRecognizer());
  detector.add(new RotateRecognizer());
  return detector;
}

export function createDrawingGestureDetector(templates = {}) {
  const detector = new GestureDetector();
  const pathRec = new PathRecognizer();
  for (const [name, points] of Object.entries(templates)) {
    pathRec.addTemplate(name, points);
  }
  detector.add(pathRec);
  detector.add(new CircleRecognizer());
  return detector;
}
