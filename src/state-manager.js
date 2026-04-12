/**
 * state-manager.js — Reactive state management with stores, actions, computed,
 * middleware, devtools, persistence, and time-travel debugging.
 */

// ─── Utilities ────────────────────────────────────────────────────────────────
function deepClone(val) {
  if (val === null || typeof val !== 'object') return val;
  if (val instanceof Date) return new Date(val);
  if (val instanceof RegExp) return new RegExp(val);
  if (Array.isArray(val)) return val.map(deepClone);
  if (val instanceof Map) return new Map([...val].map(([k,v])=>[deepClone(k),deepClone(v)]));
  if (val instanceof Set) return new Set([...val].map(deepClone));
  const out = Object.create(Object.getPrototypeOf(val));
  for (const k of Object.keys(val)) out[k] = deepClone(val[k]);
  return out;
}

function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.freeze(obj);
  for (const v of Object.values(obj)) deepFreeze(v);
  return obj;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a !== 'object') return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(k => deepEqual(a[k], b[k]));
}

function shallowMerge(target, source) {
  return { ...target, ...source };
}

function getPath(obj, path) {
  return path.split('.').reduce((cur, k) => cur?.[k], obj);
}

function setPath(obj, path, val) {
  const parts = path.split('.');
  const out = deepClone(obj);
  let cur = out;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] === undefined) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = val;
  return out;
}

// ─── Signal / Reactive primitives ─────────────────────────────────────────────
let _currentEffect = null;

export class Signal {
  constructor(value) {
    this._value = value;
    this._subscribers = new Set();
  }

  get value() {
    if (_currentEffect) this._subscribers.add(_currentEffect);
    return this._value;
  }

  set value(newVal) {
    if (deepEqual(this._value, newVal)) return;
    this._value = newVal;
    this._notify();
  }

  update(fn) { this.value = fn(this._value); }

  _notify() {
    for (const sub of [...this._subscribers]) sub();
  }

  subscribe(fn) {
    this._subscribers.add(fn);
    fn(this._value);
    return () => this._subscribers.delete(fn);
  }

  peek() { return this._value; }
  toString() { return String(this._value); }
}

export function signal(value) { return new Signal(value); }

export class Computed {
  constructor(fn) {
    this._fn = fn;
    this._value = undefined;
    this._dirty = true;
    this._subscribers = new Set();
    this._effect = () => { this._dirty = true; this._notify(); };
  }

  get value() {
    if (this._dirty) {
      const prev = _currentEffect;
      _currentEffect = this._effect;
      try { this._value = this._fn(); }
      finally { _currentEffect = prev; }
      this._dirty = false;
    }
    if (_currentEffect) this._subscribers.add(_currentEffect);
    return this._value;
  }

  _notify() { for (const sub of [...this._subscribers]) sub(); }
  subscribe(fn) { this._subscribers.add(fn); fn(this.value); return () => this._subscribers.delete(fn); }
  peek() { return this._value; }
}

export function computed(fn) { return new Computed(fn); }

export function effect(fn) {
  const run = () => {
    const prev = _currentEffect;
    _currentEffect = run;
    try { fn(); }
    finally { _currentEffect = prev; }
  };
  run();
  return () => {};
}

export function watch(target, fn, opts = {}) {
  const { immediate = false, deep = false } = opts;
  let old = deep ? deepClone(target.value) : target.value;
  const check = () => {
    const cur = target.value;
    const changed = deep ? !deepEqual(cur, old) : cur !== old;
    if (changed) { fn(cur, old); old = deep ? deepClone(cur) : cur; }
  };
  if (immediate) fn(target.value, undefined);
  return target.subscribe(check);
}

// ─── Middleware ───────────────────────────────────────────────────────────────
export class MiddlewareChain {
  constructor() { this._middlewares = []; }
  add(fn) { this._middlewares.push(fn); return this; }
  async run(ctx, next) {
    let i = 0;
    const dispatch = async () => {
      if (i >= this._middlewares.length) return next ? await next() : undefined;
      const mw = this._middlewares[i++];
      return mw(ctx, dispatch);
    };
    return dispatch();
  }
}

// ─── Action ──────────────────────────────────────────────────────────────────
export class ActionContext {
  constructor(store, type, payload) {
    this.store = store;
    this.type = type;
    this.payload = payload;
    this.state = store.state;
    this.getters = store.getters;
    this.dispatch = store.dispatch.bind(store);
    this.commit = store.commit.bind(store);
  }
}

// ─── Store ────────────────────────────────────────────────────────────────────
export class Store {
  constructor(options = {}) {
    this._state = signal(deepClone(options.state ?? {}));
    this._mutations = options.mutations ?? {};
    this._actions = options.actions ?? {};
    this._getterDefs = options.getters ?? {};
    this._modules = new Map();
    this._middleware = new MiddlewareChain();
    this._plugins = [];
    this._subscribers = [];
    this._actionSubscribers = [];
    this._history = [];
    this._maxHistory = options.maxHistory ?? 100;
    this._strict = options.strict ?? false;
    this._mutating = false;
    this._computed = new Map();
    this._watchers = [];

    // Build computed getters
    for (const [name, fn] of Object.entries(this._getterDefs)) {
      this._computed.set(name, computed(() => fn(this.state, this.getters)));
    }

    // Install modules
    if (options.modules) {
      for (const [name, mod] of Object.entries(options.modules)) {
        this.installModule(name, mod);
      }
    }

    // Install plugins
    for (const plugin of options.plugins ?? []) {
      plugin(this);
      this._plugins.push(plugin);
    }
  }

  get state() { return this._state.value; }

  get getters() {
    const g = {};
    for (const [name, c] of this._computed) g[name] = c.value;
    return g;
  }

  commit(type, payload) {
    const mutation = this._mutations[type];
    if (!mutation) throw new Error(`Unknown mutation: '${type}'`);
    const before = deepClone(this.state);
    this._mutating = true;
    try {
      const next = deepClone(this.state);
      mutation(next, payload);
      this._state.value = next;
    } finally { this._mutating = false; }
    const after = this.state;
    this._recordHistory({ type: 'mutation', name: type, payload, before, after });
    for (const sub of this._subscribers) sub({ type, payload }, before, after);
  }

  async dispatch(type, payload) {
    const action = this._actions[type];
    if (!action) throw new Error(`Unknown action: '${type}'`);
    const ctx = new ActionContext(this, type, payload);
    for (const sub of this._actionSubscribers) if (sub.before) await sub.before({ type, payload }, this.state);
    let result;
    try {
      result = await this._middleware.run(ctx, () => action(ctx, payload));
    } catch (e) {
      for (const sub of this._actionSubscribers) if (sub.error) await sub.error({ type, payload }, this.state, e);
      throw e;
    }
    for (const sub of this._actionSubscribers) if (sub.after) await sub.after({ type, payload }, this.state);
    return result;
  }

  subscribe(fn) {
    this._subscribers.push(fn);
    return () => { this._subscribers = this._subscribers.filter(s => s !== fn); };
  }

  subscribeAction(fn) {
    const sub = typeof fn === 'function' ? { before: fn } : fn;
    this._actionSubscribers.push(sub);
    return () => { this._actionSubscribers = this._actionSubscribers.filter(s => s !== sub); };
  }

  watch(getter, fn, opts) {
    const target = computed(() => getter(this.state, this.getters));
    return watch(target, fn, opts);
  }

  watchState(path, fn, opts = {}) {
    let old = getPath(this.state, path);
    return this._state.subscribe(() => {
      const cur = getPath(this.state, path);
      if (!deepEqual(cur, old)) { fn(cur, old); old = cur; }
    });
  }

  getState(path) { return getPath(this.state, path); }

  setState(path, val) {
    const next = setPath(this.state, path, val);
    this._state.value = next;
  }

  patchState(patch) {
    this._state.value = shallowMerge(this.state, patch);
  }

  reset() { this._state.value = deepClone(this._initialState ?? {}); }

  installModule(name, module) {
    const prefix = name + '/';
    const namespaced = module.namespaced ?? true;

    // Merge state
    if (module.state) {
      const next = deepClone(this.state);
      next[name] = deepClone(module.state);
      this._state.value = next;
    }

    // Register mutations
    for (const [key, fn] of Object.entries(module.mutations ?? {})) {
      const fullKey = namespaced ? prefix + key : key;
      this._mutations[fullKey] = (state, payload) => fn(state[name], payload, state);
    }

    // Register actions
    for (const [key, fn] of Object.entries(module.actions ?? {})) {
      const fullKey = namespaced ? prefix + key : key;
      this._actions[fullKey] = async (ctx, payload) => {
        const modCtx = { ...ctx, state: ctx.state[name] };
        return fn(modCtx, payload);
      };
    }

    // Register getters
    for (const [key, fn] of Object.entries(module.getters ?? {})) {
      const fullKey = namespaced ? prefix + key : key;
      this._computed.set(fullKey, computed(() => fn(this.state[name], this.getters, this.state)));
    }

    // Submodules
    for (const [subName, subMod] of Object.entries(module.modules ?? {})) {
      this.installModule(name + '/' + subName, subMod);
    }

    this._modules.set(name, module);
  }

  uninstallModule(name) {
    const module = this._modules.get(name);
    if (!module) return;
    // Remove mutations/actions/getters
    for (const key of Object.keys(module.mutations ?? {})) delete this._mutations[name + '/' + key];
    for (const key of Object.keys(module.actions ?? {})) delete this._actions[name + '/' + key];
    for (const key of Object.keys(module.getters ?? {})) this._computed.delete(name + '/' + key);
    // Remove state
    const next = deepClone(this.state);
    delete next[name];
    this._state.value = next;
    this._modules.delete(name);
  }

  _recordHistory(entry) {
    this._history.push({ ...entry, ts: Date.now() });
    if (this._history.length > this._maxHistory) this._history.shift();
  }

  // Time travel
  timeTravel(index) {
    const entry = this._history[index];
    if (!entry) throw new Error(`No history at index ${index}`);
    this._state.value = deepClone(entry.before);
  }

  undo() {
    if (this._history.length === 0) return false;
    const entry = this._history.pop();
    this._state.value = deepClone(entry.before);
    return true;
  }

  getHistory() { return [...this._history]; }
  clearHistory() { this._history.length = 0; }

  // Middleware
  use(fn) { this._middleware.add(fn); return this; }

  // Serialization
  serialize() { return JSON.stringify(this.state); }
  hydrate(json) { this._state.value = JSON.parse(json); }

  // Snapshot
  snapshot() { return deepClone(this.state); }
  restore(snap) { this._state.value = deepClone(snap); }

  toJSON() { return this.state; }
}

// ─── Atom (lightweight signal-based store) ────────────────────────────────────
export class Atom {
  constructor(initialValue, options = {}) {
    this._signal = signal(initialValue);
    this._key = options.key;
    this._validators = options.validators ?? [];
    this._transforms = options.transforms ?? [];
    this._effects = [];
    if (options.persist && options.key && typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(options.key);
      if (saved) {
        try { this._signal.value = JSON.parse(saved); }
        catch {}
      }
      this._signal.subscribe(v => localStorage.setItem(options.key, JSON.stringify(v)));
    }
  }

  get value() { return this._signal.value; }
  set value(v) {
    for (const validate of this._validators) {
      const result = validate(v);
      if (result !== true) throw new Error(typeof result === 'string' ? result : 'Validation failed');
    }
    let transformed = v;
    for (const t of this._transforms) transformed = t(transformed);
    this._signal.value = transformed;
  }

  update(fn) { this.value = fn(this.value); }
  subscribe(fn) { return this._signal.subscribe(fn); }
  peek() { return this._signal.peek(); }
  reset(initial) { this._signal.value = initial; }

  derive(fn) { return computed(() => fn(this.value)); }
  map(fn) { return new Atom(fn(this.value)); }
}

export function atom(value, opts) { return new Atom(value, opts); }

// ─── Selector ─────────────────────────────────────────────────────────────────
export class Selector {
  constructor(deps, fn) {
    this._deps = Array.isArray(deps) ? deps : [deps];
    this._fn = fn;
    this._memo = computed(() => fn(...this._deps.map(d => typeof d.value !== 'undefined' ? d.value : d)));
  }
  get value() { return this._memo.value; }
  subscribe(fn) { return this._memo.subscribe(fn); }
}

export function selector(deps, fn) { return new Selector(deps, fn); }

// ─── Async state ──────────────────────────────────────────────────────────────
export class AsyncState {
  constructor(fn, opts = {}) {
    this._fn = fn;
    this._status = signal('idle');    // idle | loading | success | error
    this._data = signal(opts.initialData ?? null);
    this._error = signal(null);
    this._attempts = 0;
    this._maxRetries = opts.maxRetries ?? 0;
    this._retryDelay = opts.retryDelay ?? 1000;
    this._onSuccess = opts.onSuccess;
    this._onError = opts.onError;
  }

  get status() { return this._status.value; }
  get data() { return this._data.value; }
  get error() { return this._error.value; }
  get isIdle() { return this._status.value === 'idle'; }
  get isLoading() { return this._status.value === 'loading'; }
  get isSuccess() { return this._status.value === 'success'; }
  get isError() { return this._status.value === 'error'; }

  async execute(...args) {
    this._status.value = 'loading';
    this._error.value = null;
    this._attempts = 0;
    while (true) {
      try {
        const result = await this._fn(...args);
        this._data.value = result;
        this._status.value = 'success';
        if (this._onSuccess) this._onSuccess(result);
        return result;
      } catch (e) {
        this._attempts++;
        if (this._attempts <= this._maxRetries) {
          await new Promise(r => setTimeout(r, this._retryDelay));
          continue;
        }
        this._error.value = e;
        this._status.value = 'error';
        if (this._onError) this._onError(e);
        throw e;
      }
    }
  }

  reset() {
    this._status.value = 'idle';
    this._data.value = null;
    this._error.value = null;
    this._attempts = 0;
  }

  subscribe(fn) {
    return this._status.subscribe(() => fn({ status: this.status, data: this.data, error: this.error }));
  }
}

export function asyncState(fn, opts) { return new AsyncState(fn, opts); }

// ─── EventEmitter store ───────────────────────────────────────────────────────
export class EventStore {
  constructor() { this._handlers = new Map(); }

  on(event, fn) {
    if (!this._handlers.has(event)) this._handlers.set(event, new Set());
    this._handlers.get(event).add(fn);
    return () => this._handlers.get(event)?.delete(fn);
  }

  once(event, fn) {
    const wrapper = (...args) => { fn(...args); this.off(event, wrapper); };
    return this.on(event, wrapper);
  }

  off(event, fn) { this._handlers.get(event)?.delete(fn); }

  emit(event, ...args) {
    const handlers = this._handlers.get(event);
    if (handlers) for (const h of [...handlers]) h(...args);
  }

  clear() { this._handlers.clear(); }
}

// ─── Context ─────────────────────────────────────────────────────────────────
export class Context {
  constructor(defaultValue) {
    this._value = signal(defaultValue);
    this._stack = [defaultValue];
  }

  provide(value) {
    this._stack.push(value);
    this._value.value = value;
    return () => {
      this._stack.pop();
      this._value.value = this._stack[this._stack.length - 1];
    };
  }

  get value() { return this._value.value; }
  subscribe(fn) { return this._value.subscribe(fn); }
}

export function createContext(defaultValue) { return new Context(defaultValue); }

// ─── Reactive forms ───────────────────────────────────────────────────────────
export class FormField {
  constructor(initialValue, validators = []) {
    this._value = signal(initialValue);
    this._validators = validators;
    this._touched = signal(false);
    this._dirty = signal(false);
    this._errors = signal([]);
    this._initialValue = initialValue;
  }

  get value() { return this._value.value; }
  set value(v) {
    this._value.value = v;
    this._dirty.value = v !== this._initialValue;
    this._validate();
  }

  get touched() { return this._touched.value; }
  get dirty() { return this._dirty.value; }
  get errors() { return this._errors.value; }
  get valid() { return this._errors.value.length === 0; }
  get invalid() { return !this.valid; }

  touch() { this._touched.value = true; this._validate(); }

  _validate() {
    const errs = [];
    for (const v of this._validators) {
      const res = v(this._value.value);
      if (res !== true && res !== null && res !== undefined) errs.push(res);
    }
    this._errors.value = errs;
  }

  reset() {
    this._value.value = this._initialValue;
    this._touched.value = false;
    this._dirty.value = false;
    this._errors.value = [];
  }

  subscribe(fn) { return this._value.subscribe(fn); }
}

export class FormGroup {
  constructor(fields = {}) {
    this._fields = {};
    for (const [k, v] of Object.entries(fields)) {
      this._fields[k] = v instanceof FormField ? v : new FormField(v);
    }
  }

  get(name) { return this._fields[name]; }
  set(name, field) { this._fields[name] = field instanceof FormField ? field : new FormField(field); }

  get value() {
    const out = {};
    for (const [k, f] of Object.entries(this._fields)) out[k] = f.value;
    return out;
  }

  get errors() {
    const out = {};
    for (const [k, f] of Object.entries(this._fields)) if (f.errors.length) out[k] = f.errors;
    return out;
  }

  get valid() { return Object.values(this._fields).every(f => f.valid); }
  get invalid() { return !this.valid; }
  get dirty() { return Object.values(this._fields).some(f => f.dirty); }
  get touched() { return Object.values(this._fields).some(f => f.touched); }

  reset() { for (const f of Object.values(this._fields)) f.reset(); }
  touchAll() { for (const f of Object.values(this._fields)) f.touch(); }
}

// ─── Validators ───────────────────────────────────────────────────────────────
export const validators = {
  required: msg => v => (v !== null && v !== undefined && v !== '') || (msg || 'Required'),
  minLength: (n, msg) => v => (typeof v === 'string' && v.length >= n) || (msg || `Min length ${n}`),
  maxLength: (n, msg) => v => (typeof v === 'string' && v.length <= n) || (msg || `Max length ${n}`),
  min: (n, msg) => v => (Number(v) >= n) || (msg || `Min value ${n}`),
  max: (n, msg) => v => (Number(v) <= n) || (msg || `Max value ${n}`),
  pattern: (re, msg) => v => re.test(String(v)) || (msg || 'Invalid format'),
  email: (msg) => v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v)) || (msg || 'Invalid email'),
  url: (msg) => v => { try { new URL(v); return true; } catch { return msg || 'Invalid URL'; } },
  numeric: (msg) => v => !isNaN(Number(v)) || (msg || 'Must be numeric'),
  integer: (msg) => v => Number.isInteger(Number(v)) || (msg || 'Must be integer'),
  positive: (msg) => v => Number(v) > 0 || (msg || 'Must be positive'),
  custom: fn => fn,
};

// ─── Persistence middleware ───────────────────────────────────────────────────
export function createPersistMiddleware(key, options = {}) {
  return (store) => {
    const { storage = (typeof localStorage !== 'undefined' ? localStorage : null), paths, merge = true } = options;
    if (!storage) return;
    const saved = storage.getItem(key);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (merge) store.patchState(data);
        else store._state.value = data;
      } catch {}
    }
    store.subscribe(() => {
      const state = paths ? Object.fromEntries(paths.map(p => [p, getPath(store.state, p)])) : store.state;
      storage.setItem(key, JSON.stringify(state));
    });
  };
}

// ─── Logger middleware ────────────────────────────────────────────────────────
export function createLoggerMiddleware(options = {}) {
  const { collapsed = true, diff = true } = options;
  return (store) => {
    store.subscribe(({ type, payload }, before, after) => {
      const group = collapsed ? 'groupCollapsed' : 'group';
      console[group]?.('%c mutation: %s', 'color: #2196F3; font-weight: bold', type);
      if (diff) {
        console.log('%c prev state', 'color: #9E9E9E', before);
        console.log('%c mutation payload', 'color: #4CAF50', payload);
        console.log('%c next state', 'color: #4CAF50', after);
      }
      console.groupEnd?.();
    });
  };
}

// ─── Factories ────────────────────────────────────────────────────────────────
export function createStore(options) { return new Store(options); }
export function createFormField(value, validators) { return new FormField(value, validators); }
export function createFormGroup(fields) { return new FormGroup(fields); }

export default {
  Store, Signal, Computed, Atom, Selector, AsyncState, EventStore, Context,
  FormField, FormGroup, MiddlewareChain,
  signal, computed, effect, watch, atom, selector, asyncState, createContext,
  createStore, createFormField, createFormGroup,
  createPersistMiddleware, createLoggerMiddleware,
  validators, deepClone, deepEqual, deepFreeze, getPath, setPath,
};
