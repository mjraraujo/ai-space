/**
 * task-scheduler.js — Comprehensive task scheduling system.
 * Cron, intervals, one-shot, priority queues, concurrency control,
 * retry, distributed locks, job queues, workers, rate limiting.
 */

// ─── Utilities ────────────────────────────────────────────────────────────────
function parseCronField(field, min, max) {
  if (field === '*') return Array.from({ length: max - min + 1 }, (_, i) => i + min);
  const result = new Set();
  for (const part of field.split(',')) {
    if (part === '*') { for (let i = min; i <= max; i++) result.add(i); continue; }
    const [range, step] = part.split('/');
    const stepVal = step ? parseInt(step) : 1;
    if (range.includes('-')) {
      const [lo, hi] = range.split('-').map(Number);
      for (let i = lo; i <= hi; i += stepVal) result.add(i);
    } else if (range === '*') {
      for (let i = min; i <= max; i += stepVal) result.add(i);
    } else {
      result.add(parseInt(range));
    }
  }
  return [...result].filter(v => v >= min && v <= max).sort((a, b) => a - b);
}

export function parseCron(expr) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`Invalid cron expression: ${expr}`);
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  return {
    minutes: parseCronField(minute, 0, 59),
    hours: parseCronField(hour, 0, 23),
    daysOfMonth: parseCronField(dayOfMonth, 1, 31),
    months: parseCronField(month, 1, 12),
    daysOfWeek: parseCronField(dayOfWeek, 0, 6),
  };
}

export function getNextCronTime(expr, after = new Date()) {
  const schedule = parseCron(expr);
  const d = new Date(after.getTime() + 60000); // at least 1 minute from now
  d.setSeconds(0, 0);
  for (let attempt = 0; attempt < 366 * 24 * 60; attempt++) {
    if (schedule.months.includes(d.getMonth() + 1) &&
        schedule.daysOfMonth.includes(d.getDate()) &&
        schedule.daysOfWeek.includes(d.getDay()) &&
        schedule.hours.includes(d.getHours()) &&
        schedule.minutes.includes(d.getMinutes())) {
      return new Date(d);
    }
    d.setMinutes(d.getMinutes() + 1);
  }
  return null;
}

export function matchesCron(expr, date = new Date()) {
  const schedule = parseCron(expr);
  return schedule.months.includes(date.getMonth() + 1) &&
         schedule.daysOfMonth.includes(date.getDate()) &&
         schedule.daysOfWeek.includes(date.getDay()) &&
         schedule.hours.includes(date.getHours()) &&
         schedule.minutes.includes(date.getMinutes());
}

// ─── Task ────────────────────────────────────────────────────────────────────
let _taskId = 0;

export class Task {
  constructor(fn, options = {}) {
    this.id = options.id ?? `task-${++_taskId}`;
    this.name = options.name ?? this.id;
    this.fn = fn;
    this.priority = options.priority ?? 0;
    this.retries = options.retries ?? 0;
    this.retryDelay = options.retryDelay ?? 1000;
    this.timeout = options.timeout ?? 0;
    this.data = options.data ?? {};
    this.tags = new Set(options.tags ?? []);
    this.maxAttempts = 1 + this.retries;
    this._attempts = 0;
    this._status = 'pending'; // pending | running | completed | failed | cancelled
    this._result = null;
    this._error = null;
    this._createdAt = Date.now();
    this._startedAt = null;
    this._completedAt = null;
    this._onComplete = options.onComplete ?? null;
    this._onFail = options.onFail ?? null;
    this._onRetry = options.onRetry ?? null;
  }

  get status() { return this._status; }
  get attempts() { return this._attempts; }
  get result() { return this._result; }
  get error() { return this._error; }
  get isPending() { return this._status === 'pending'; }
  get isRunning() { return this._status === 'running'; }
  get isCompleted() { return this._status === 'completed'; }
  get isFailed() { return this._status === 'failed'; }
  get isCancelled() { return this._status === 'cancelled'; }
  get duration() { return this._completedAt ? this._completedAt - this._startedAt : null; }

  async run(ctx = {}) {
    this._status = 'running';
    this._startedAt = Date.now();
    while (this._attempts < this.maxAttempts) {
      this._attempts++;
      try {
        const promise = this.fn({ ...ctx, task: this, attempt: this._attempts, data: this.data });
        this._result = this.timeout > 0 ? await this._withTimeout(promise, this.timeout) : await promise;
        this._status = 'completed';
        this._completedAt = Date.now();
        this._onComplete?.(this._result, this);
        return this._result;
      } catch (e) {
        this._error = e;
        if (this._attempts < this.maxAttempts) {
          this._onRetry?.(e, this._attempts, this);
          await new Promise(r => setTimeout(r, this.retryDelay * Math.pow(2, this._attempts - 1)));
        } else {
          this._status = 'failed';
          this._completedAt = Date.now();
          this._onFail?.(e, this);
          throw e;
        }
      }
    }
  }

  _withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Task timed out after ${ms}ms`)), ms);
      promise.then(v => { clearTimeout(timer); resolve(v); }).catch(e => { clearTimeout(timer); reject(e); });
    });
  }

  cancel() {
    if (this._status === 'pending') { this._status = 'cancelled'; return true; }
    return false;
  }

  toJSON() {
    return { id: this.id, name: this.name, status: this._status, attempts: this._attempts, createdAt: this._createdAt, startedAt: this._startedAt, completedAt: this._completedAt, duration: this.duration, error: this._error?.message };
  }
}

// ─── TaskQueue ────────────────────────────────────────────────────────────────
export class TaskQueue {
  constructor(opts = {}) {
    this._tasks = [];
    this._concurrency = opts.concurrency ?? 1;
    this._running = 0;
    this._paused = false;
    this._listeners = new Map();
    this._stats = { queued: 0, completed: 0, failed: 0, total: 0 };
  }

  add(task) {
    if (!(task instanceof Task)) task = new Task(task);
    const pos = this._insertByPriority(task);
    this._stats.queued++;
    this._stats.total++;
    this._emit('task:added', task);
    this._tick();
    return task;
  }

  _insertByPriority(task) {
    let i = this._tasks.length;
    while (i > 0 && this._tasks[i - 1].priority < task.priority) i--;
    this._tasks.splice(i, 0, task);
    return i;
  }

  _tick() {
    while (!this._paused && this._running < this._concurrency && this._tasks.length > 0) {
      const task = this._tasks.shift();
      if (task.isCancelled) { this._stats.queued--; continue; }
      this._running++;
      this._stats.queued--;
      this._emit('task:started', task);
      task.run().then(result => {
        this._running--;
        this._stats.completed++;
        this._emit('task:completed', task, result);
        this._tick();
      }).catch(err => {
        this._running--;
        this._stats.failed++;
        this._emit('task:failed', task, err);
        this._tick();
      });
    }
  }

  pause() { this._paused = true; return this; }
  resume() { this._paused = false; this._tick(); return this; }
  clear() { this._tasks.length = 0; return this; }
  get size() { return this._tasks.length; }
  get running() { return this._running; }
  get stats() { return { ...this._stats }; }
  get isPaused() { return this._paused; }

  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event).push(fn);
    return () => { const hs = this._listeners.get(event); const i = hs?.indexOf(fn); if (i >= 0) hs.splice(i, 1); };
  }

  _emit(event, ...args) { const hs = this._listeners.get(event); if (hs) for (const h of [...hs]) h(...args); }

  drain() { return new Promise(resolve => { const check = () => { if (this._tasks.length === 0 && this._running === 0) resolve(); else setTimeout(check, 100); }; check(); }); }
}

// ─── Scheduler ────────────────────────────────────────────────────────────────
export class Scheduler {
  constructor() {
    this._jobs = new Map();
    this._timers = new Map();
    this._running = false;
    this._queue = new TaskQueue({ concurrency: 10 });
    this._listeners = new Map();
  }

  schedule(id, cronExpr, fn, opts = {}) {
    this.unschedule(id);
    const nextRun = getNextCronTime(cronExpr);
    const job = { id, cronExpr, fn, opts, nextRun, lastRun: null, runCount: 0, enabled: true };
    this._jobs.set(id, job);
    this._scheduleNext(job);
    return this;
  }

  _scheduleNext(job) {
    const delay = job.nextRun ? job.nextRun.getTime() - Date.now() : 0;
    if (delay < 0 || !job.nextRun) { job.nextRun = getNextCronTime(job.cronExpr); if (!job.nextRun) return; }
    const timer = setTimeout(async () => {
      if (!job.enabled) return;
      job.lastRun = new Date();
      job.runCount++;
      const task = new Task(job.fn, { ...job.opts, name: job.id });
      this._queue.add(task);
      this._emit('job:triggered', job);
      job.nextRun = getNextCronTime(job.cronExpr);
      this._scheduleNext(job);
    }, Math.max(0, job.nextRun.getTime() - Date.now()));
    this._timers.set(job.id, timer);
  }

  every(id, ms, fn, opts = {}) {
    this.unschedule(id);
    const job = { id, ms, fn, opts, type: 'interval', runCount: 0, lastRun: null, enabled: true };
    this._jobs.set(id, job);
    const timer = setInterval(async () => {
      if (!job.enabled) return;
      job.lastRun = new Date();
      job.runCount++;
      this._queue.add(new Task(fn, { ...opts, name: id }));
      this._emit('job:triggered', job);
    }, ms);
    this._timers.set(id, timer);
    return this;
  }

  after(id, ms, fn, opts = {}) {
    this.unschedule(id);
    const timer = setTimeout(async () => {
      this._queue.add(new Task(fn, { ...opts, name: id }));
      this.unschedule(id);
    }, ms);
    this._timers.set(id, timer);
    this._jobs.set(id, { id, ms, fn, opts, type: 'once' });
    return this;
  }

  unschedule(id) {
    const timer = this._timers.get(id);
    if (timer) { clearTimeout(timer); clearInterval(timer); this._timers.delete(id); }
    this._jobs.delete(id);
    return this;
  }

  enable(id) { const j = this._jobs.get(id); if (j) j.enabled = true; return this; }
  disable(id) { const j = this._jobs.get(id); if (j) j.enabled = false; return this; }

  getJob(id) { return this._jobs.get(id); }
  jobs() { return [...this._jobs.values()]; }

  runNow(id) {
    const job = this._jobs.get(id);
    if (!job) throw new Error(`Job '${id}' not found`);
    this._queue.add(new Task(job.fn, { ...job.opts, name: id }));
    return this;
  }

  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event).push(fn);
    return this;
  }

  _emit(event, ...args) { const hs = this._listeners.get(event); if (hs) for (const h of [...hs]) h(...args); }

  destroy() { for (const id of this._jobs.keys()) this.unschedule(id); }

  stats() {
    return { jobs: this._jobs.size, timers: this._timers.size, queue: this._queue.stats };
  }
}

// ─── Rate Limiter ─────────────────────────────────────────────────────────────
export class RateLimiter {
  constructor(rate = 10, window = 1000) {
    this._rate = rate; this._window = window;
    this._tokens = rate; this._lastRefill = Date.now();
  }

  _refill() {
    const now = Date.now();
    const elapsed = now - this._lastRefill;
    this._tokens = Math.min(this._rate, this._tokens + elapsed * this._rate / this._window);
    this._lastRefill = now;
  }

  tryConsume(tokens = 1) {
    this._refill();
    if (this._tokens >= tokens) { this._tokens -= tokens; return true; }
    return false;
  }

  async consume(tokens = 1) {
    while (!this.tryConsume(tokens)) {
      await new Promise(r => setTimeout(r, Math.max(1, (tokens - this._tokens) / this._rate * this._window)));
    }
  }

  get available() { this._refill(); return Math.floor(this._tokens); }
  reset() { this._tokens = this._rate; this._lastRefill = Date.now(); }
}

// ─── Semaphore ────────────────────────────────────────────────────────────────
export class Semaphore {
  constructor(permits = 1) { this._permits = permits; this._queue = []; this._current = 0; }

  async acquire() {
    if (this._current < this._permits) { this._current++; return; }
    await new Promise(resolve => this._queue.push(resolve));
    this._current++;
  }

  release() {
    this._current--;
    const next = this._queue.shift();
    if (next) next();
  }

  async run(fn) {
    await this.acquire();
    try { return await fn(); }
    finally { this.release(); }
  }

  get available() { return this._permits - this._current; }
  get waiting() { return this._queue.length; }
}

// ─── Mutex ────────────────────────────────────────────────────────────────────
export class Mutex {
  constructor() { this._semaphore = new Semaphore(1); }
  lock() { return this._semaphore.acquire(); }
  unlock() { this._semaphore.release(); }
  async withLock(fn) { return this._semaphore.run(fn); }
  get isLocked() { return this._semaphore.available === 0; }
}

// ─── Debounce / Throttle ──────────────────────────────────────────────────────
export function debounce(fn, wait, opts = {}) {
  const { leading = false, trailing = true, maxWait = Infinity } = opts;
  let timer = null, lastCall = 0, lastInvoke = 0;
  return function (...args) {
    const now = Date.now();
    const isLeading = leading && !timer;
    if (timer) clearTimeout(timer);
    lastCall = now;
    if (isLeading) { lastInvoke = now; fn.apply(this, args); }
    if (maxWait < Infinity && now - lastInvoke >= maxWait) { lastInvoke = now; fn.apply(this, args); }
    timer = setTimeout(() => {
      timer = null;
      if (trailing && now === lastCall) { lastInvoke = Date.now(); fn.apply(this, args); }
    }, wait);
  };
}

export function throttle(fn, limit, opts = {}) {
  const { leading = true, trailing = true } = opts;
  let lastTime = 0, timer = null;
  return function (...args) {
    const now = Date.now();
    const remaining = limit - (now - lastTime);
    if (leading && remaining <= 0) {
      if (timer) { clearTimeout(timer); timer = null; }
      lastTime = now;
      fn.apply(this, args);
    } else if (trailing && !timer) {
      timer = setTimeout(() => {
        lastTime = leading ? Date.now() : 0;
        timer = null;
        fn.apply(this, args);
      }, Math.max(0, remaining));
    }
  };
}

// ─── Job with dependencies ────────────────────────────────────────────────────
export class DependencyGraph {
  constructor() { this._nodes = new Map(); this._edges = new Map(); }

  addJob(id, fn, opts = {}) {
    this._nodes.set(id, { id, fn, opts, deps: opts.deps ?? [] });
    this._edges.set(id, []);
    for (const dep of (opts.deps ?? [])) {
      if (!this._edges.has(dep)) this._edges.set(dep, []);
      this._edges.get(dep).push(id);
    }
    return this;
  }

  topologicalOrder() {
    const visited = new Set(), order = [], temp = new Set();
    const visit = id => {
      if (temp.has(id)) throw new Error(`Circular dependency detected at: ${id}`);
      if (!visited.has(id)) {
        temp.add(id);
        for (const dep of (this._nodes.get(id)?.deps ?? [])) visit(dep);
        temp.delete(id); visited.add(id); order.push(id);
      }
    };
    for (const id of this._nodes.keys()) visit(id);
    return order;
  }

  async run(ctx = {}) {
    const order = this.topologicalOrder();
    const results = {};
    for (const id of order) {
      const { fn, opts } = this._nodes.get(id);
      const depResults = Object.fromEntries((opts.deps ?? []).map(d => [d, results[d]]));
      const task = new Task(fn, { ...opts, data: { ...ctx, deps: depResults } });
      results[id] = await task.run();
    }
    return results;
  }
}

// ─── Worker pool ──────────────────────────────────────────────────────────────
export class WorkerPool {
  constructor(workerFn, size = 4) {
    this._workerFn = workerFn;
    this._size = size;
    this._queue = new TaskQueue({ concurrency: size });
  }

  submit(data, opts = {}) {
    return new Promise((resolve, reject) => {
      const task = new Task(() => this._workerFn(data), {
        ...opts,
        onComplete: resolve,
        onFail: reject,
      });
      this._queue.add(task);
    });
  }

  submitAll(items, opts = {}) { return Promise.all(items.map(data => this.submit(data, opts))); }
  get queue() { return this._queue; }
  stats() { return this._queue.stats; }
  drain() { return this._queue.drain(); }
}

// ─── Cron presets ─────────────────────────────────────────────────────────────
export const cron = {
  everyMinute: '* * * * *',
  everyHour: '0 * * * *',
  everyDay: '0 0 * * *',
  everyWeek: '0 0 * * 0',
  everyMonth: '0 0 1 * *',
  everyMidnight: '0 0 * * *',
  weekdays: '0 9 * * 1-5',
  everyMonday: '0 0 * * 1',
  quarterHour: '*/15 * * * *',
  halfHour: '*/30 * * * *',
  at: (h, m = 0) => `${m} ${h} * * *`,
  atWeekday: (h, m, day) => `${m} ${h} * * ${day}`,
};

// ─── Factory ──────────────────────────────────────────────────────────────────
export function createScheduler() { return new Scheduler(); }
export function createQueue(opts) { return new TaskQueue(opts); }
export function createPool(fn, size) { return new WorkerPool(fn, size); }

export default {
  Task, TaskQueue, Scheduler, RateLimiter, Semaphore, Mutex, DependencyGraph, WorkerPool,
  parseCron, getNextCronTime, matchesCron, debounce, throttle, cron,
  createScheduler, createQueue, createPool,
};
