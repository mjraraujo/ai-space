/**
 * plugin-system.js — Extensible plugin/extension system.
 * Plugin registration, hooks, dependency resolution, lifecycle events,
 * sandboxing, hot-reload, capabilities, namespacing, configuration.
 */

// ─── Errors ───────────────────────────────────────────────────────────────────
export class PluginError extends Error {
  constructor(message, pluginId) { super(message); this.name = 'PluginError'; this.pluginId = pluginId; }
}

// ─── Plugin descriptor ────────────────────────────────────────────────────────
export class PluginDescriptor {
  constructor(options = {}) {
    this.id = options.id ?? `plugin-${Math.random().toString(36).slice(2)}`;
    this.name = options.name ?? this.id;
    this.version = options.version ?? '1.0.0';
    this.description = options.description ?? '';
    this.author = options.author ?? '';
    this.license = options.license ?? 'MIT';
    this.dependencies = options.dependencies ?? {};
    this.peerDependencies = options.peerDependencies ?? {};
    this.optionalDependencies = options.optionalDependencies ?? {};
    this.capabilities = new Set(options.capabilities ?? []);
    this.tags = new Set(options.tags ?? []);
    this.enabled = options.enabled !== false;
    this.priority = options.priority ?? 0;
    this.config = options.config ?? {};
    this.schema = options.schema ?? null;
    this._install = options.install ?? null;
    this._uninstall = options.uninstall ?? null;
    this._hooks = options.hooks ?? {};
  }

  satisfies(requirement) {
    const [major, minor, patch] = this.version.split('.').map(Number);
    const [rMajor, rMinor, rPatch] = requirement.split('.').map(Number);
    if (major !== rMajor) return false;
    if (minor < rMinor) return false;
    if (minor === rMinor && patch < rPatch) return false;
    return true;
  }

  hasCapability(cap) { return this.capabilities.has(cap); }
  hasTag(tag) { return this.tags.has(tag); }

  toJSON() {
    return {
      id: this.id, name: this.name, version: this.version,
      description: this.description, author: this.author,
      dependencies: this.dependencies, capabilities: [...this.capabilities],
      tags: [...this.tags], enabled: this.enabled, priority: this.priority,
    };
  }
}

// ─── Hook system ──────────────────────────────────────────────────────────────
export class HookSystem {
  constructor() { this._hooks = new Map(); }

  register(name, fn, opts = {}) {
    if (!this._hooks.has(name)) this._hooks.set(name, []);
    const handler = { fn, priority: opts.priority ?? 0, once: opts.once ?? false, pluginId: opts.pluginId ?? null };
    const hooks = this._hooks.get(name);
    hooks.push(handler);
    hooks.sort((a, b) => b.priority - a.priority);
    return () => this.unregister(name, fn);
  }

  unregister(name, fn) {
    const hooks = this._hooks.get(name);
    if (!hooks) return;
    const i = hooks.findIndex(h => h.fn === fn);
    if (i >= 0) hooks.splice(i, 1);
  }

  unregisterAll(pluginId) {
    for (const hooks of this._hooks.values()) {
      const toRemove = hooks.filter(h => h.pluginId === pluginId);
      for (const h of toRemove) {
        const i = hooks.indexOf(h);
        if (i >= 0) hooks.splice(i, 1);
      }
    }
  }

  async call(name, ...args) {
    const hooks = this._hooks.get(name) ?? [];
    const once = hooks.filter(h => h.once);
    for (const h of once) this.unregister(name, h.fn);
    for (const hook of hooks) await hook.fn(...args);
  }

  async filter(name, value, ...args) {
    const hooks = this._hooks.get(name) ?? [];
    let current = value;
    for (const hook of hooks) current = await hook.fn(current, ...args) ?? current;
    return current;
  }

  async reduce(name, initial, ...args) {
    const hooks = this._hooks.get(name) ?? [];
    let acc = initial;
    for (const hook of hooks) acc = await hook.fn(acc, ...args);
    return acc;
  }

  has(name) { return (this._hooks.get(name)?.length ?? 0) > 0; }
  count(name) { return this._hooks.get(name)?.length ?? 0; }
  names() { return [...this._hooks.keys()]; }
  clear(name) { if (name) this._hooks.delete(name); else this._hooks.clear(); }
}

// ─── Event bus ────────────────────────────────────────────────────────────────
export class EventBus {
  constructor() { this._handlers = new Map(); }

  on(event, fn, opts = {}) {
    if (!this._handlers.has(event)) this._handlers.set(event, []);
    const h = { fn, once: opts.once ?? false, pluginId: opts.pluginId ?? null };
    this._handlers.get(event).push(h);
    return () => this.off(event, fn);
  }

  once(event, fn, opts = {}) { return this.on(event, fn, { ...opts, once: true }); }
  off(event, fn) { const hs = this._handlers.get(event); if (!hs) return; const i = hs.findIndex(h => h.fn === fn); if (i >= 0) hs.splice(i, 1); }
  offPlugin(pluginId) { for (const hs of this._handlers.values()) { for (let i = hs.length - 1; i >= 0; i--) if (hs[i].pluginId === pluginId) hs.splice(i, 1); } }
  clear(event) { if (event) this._handlers.delete(event); else this._handlers.clear(); }

  async emit(event, ...args) {
    const hs = this._handlers.get(event) ?? [];
    const once = hs.filter(h => h.once);
    for (const h of once) this.off(event, h.fn);
    for (const h of hs) await h.fn(...args);
    // Wildcard
    const wc = this._handlers.get('*') ?? [];
    for (const h of wc) await h.fn(event, ...args);
  }

  emitSync(event, ...args) {
    const hs = this._handlers.get(event) ?? [];
    for (const h of hs) h.fn(...args);
  }
}

// ─── Capability registry ──────────────────────────────────────────────────────
export class CapabilityRegistry {
  constructor() { this._caps = new Map(); }

  register(name, impl, pluginId) {
    if (!this._caps.has(name)) this._caps.set(name, []);
    this._caps.get(name).push({ impl, pluginId });
    return this;
  }

  unregister(name, pluginId) {
    const impls = this._caps.get(name);
    if (!impls) return;
    const filtered = impls.filter(i => i.pluginId !== pluginId);
    if (filtered.length) this._caps.set(name, filtered);
    else this._caps.delete(name);
  }

  get(name) { const impls = this._caps.get(name); return impls?.length ? impls[impls.length - 1].impl : null; }
  getAll(name) { return (this._caps.get(name) ?? []).map(i => i.impl); }
  has(name) { return (this._caps.get(name)?.length ?? 0) > 0; }
  list() { return [...this._caps.keys()]; }
}

// ─── Plugin sandbox ───────────────────────────────────────────────────────────
export class PluginSandbox {
  constructor(pluginId, permissions = []) {
    this._pluginId = pluginId;
    this._permissions = new Set(permissions);
    this._api = {};
  }

  allow(...permissions) { for (const p of permissions) this._permissions.add(p); return this; }
  deny(...permissions) { for (const p of permissions) this._permissions.delete(p); return this; }
  can(permission) { return this._permissions.has(permission) || this._permissions.has('*'); }

  expose(name, fn) {
    this._api[name] = (...args) => {
      if (!this.can(name)) throw new PluginError(`Permission denied: ${name}`, this._pluginId);
      return fn(...args);
    };
    return this;
  }

  getAPI() { return { ...this._api }; }
}

// ─── Configuration ────────────────────────────────────────────────────────────
export class PluginConfig {
  constructor(defaults = {}) {
    this._defaults = defaults;
    this._values = { ...defaults };
    this._schema = null;
    this._listeners = [];
  }

  set(key, value) {
    const old = this._values[key];
    this._values[key] = value;
    if (old !== value) for (const fn of this._listeners) fn(key, value, old);
    return this;
  }

  get(key, fallback = undefined) { return this._values[key] ?? fallback ?? this._defaults[key]; }
  merge(config) { for (const [k, v] of Object.entries(config)) this.set(k, v); return this; }
  reset(key) { if (key) { this._values[key] = this._defaults[key]; } else { this._values = { ...this._defaults }; } return this; }
  onChange(fn) { this._listeners.push(fn); return () => { this._listeners = this._listeners.filter(f => f !== fn); }; }
  toJSON() { return { ...this._values }; }
  fromJSON(json) { this.merge(json); return this; }
}

// ─── Plugin registry ──────────────────────────────────────────────────────────
export class PluginRegistry {
  constructor() {
    this._plugins = new Map();   // id -> { descriptor, instance, state }
    this._hooks = new HookSystem();
    this._events = new EventBus();
    this._capabilities = new CapabilityRegistry();
    this._configs = new Map();
    this._installOrder = [];
  }

  register(descriptor) {
    if (!(descriptor instanceof PluginDescriptor)) descriptor = new PluginDescriptor(descriptor);
    if (this._plugins.has(descriptor.id)) throw new PluginError(`Plugin already registered: ${descriptor.id}`, descriptor.id);
    this._plugins.set(descriptor.id, { descriptor, instance: null, state: 'registered' });
    return this;
  }

  unregister(id) {
    const plugin = this._plugins.get(id);
    if (!plugin) return false;
    if (plugin.state === 'installed') this.uninstall(id);
    this._plugins.delete(id);
    return true;
  }

  async install(id, context = {}) {
    const plugin = this._plugins.get(id);
    if (!plugin) throw new PluginError(`Plugin not found: ${id}`, id);
    if (plugin.state === 'installed') return this;

    // Check dependencies
    for (const [dep, version] of Object.entries(plugin.descriptor.dependencies)) {
      const depPlugin = this._plugins.get(dep);
      if (!depPlugin || depPlugin.state !== 'installed') {
        throw new PluginError(`Missing dependency: ${dep}@${version}`, id);
      }
    }

    const config = this._configs.get(id) ?? new PluginConfig(plugin.descriptor.config ?? {});
    this._configs.set(id, config);

    const sandbox = new PluginSandbox(id, plugin.descriptor.capabilities ? [...plugin.descriptor.capabilities] : ['*']);
    const ctx = { hooks: this._hooks, events: this._events, capabilities: this._capabilities, config, sandbox, registry: this, ...context };

    await this._hooks.call('plugin:beforeInstall', { id, descriptor: plugin.descriptor });

    if (plugin.descriptor._install) await plugin.descriptor._install(ctx);

    // Register plugin's own hooks
    for (const [hookName, fn] of Object.entries(plugin.descriptor._hooks ?? {})) {
      this._hooks.register(hookName, fn, { pluginId: id });
    }

    plugin.state = 'installed';
    plugin.instance = ctx;
    this._installOrder.push(id);

    await this._events.emit('plugin:installed', { id, descriptor: plugin.descriptor });
    return this;
  }

  async uninstall(id) {
    const plugin = this._plugins.get(id);
    if (!plugin || plugin.state !== 'installed') return this;
    await this._hooks.call('plugin:beforeUninstall', { id });
    if (plugin.descriptor._uninstall) await plugin.descriptor._uninstall(plugin.instance);
    this._hooks.unregisterAll(id);
    this._events.offPlugin(id);
    this._capabilities.unregister('*', id);
    plugin.state = 'registered';
    plugin.instance = null;
    const i = this._installOrder.indexOf(id);
    if (i >= 0) this._installOrder.splice(i, 1);
    await this._events.emit('plugin:uninstalled', { id });
    return this;
  }

  async installAll(context = {}) {
    const order = this._resolveOrder();
    for (const id of order) {
      const p = this._plugins.get(id);
      if (p.state !== 'installed' && p.descriptor.enabled) await this.install(id, context);
    }
    return this;
  }

  _resolveOrder() {
    const visited = new Set(), order = [], temp = new Set();
    const visit = id => {
      if (temp.has(id)) throw new PluginError(`Circular dependency: ${id}`, id);
      if (!visited.has(id)) {
        temp.add(id);
        const p = this._plugins.get(id);
        for (const dep of Object.keys(p?.descriptor.dependencies ?? {})) if (this._plugins.has(dep)) visit(dep);
        temp.delete(id); visited.add(id); order.push(id);
      }
    };
    for (const id of this._plugins.keys()) visit(id);
    return order;
  }

  async reload(id, context = {}) {
    await this.uninstall(id);
    await this.install(id, context);
    return this;
  }

  enable(id) { const p = this._plugins.get(id); if (p) p.descriptor.enabled = true; return this; }
  disable(id) { const p = this._plugins.get(id); if (p) p.descriptor.enabled = false; return this; }

  get(id) { return this._plugins.get(id); }
  has(id) { return this._plugins.has(id); }
  list() { return [...this._plugins.values()].map(p => p.descriptor.toJSON()); }
  installed() { return [...this._plugins.values()].filter(p => p.state === 'installed').map(p => p.descriptor); }
  registered() { return [...this._plugins.values()].map(p => p.descriptor); }
  byCapability(cap) { return this.installed().filter(d => d.hasCapability(cap)); }
  byTag(tag) { return this.installed().filter(d => d.hasTag(tag)); }

  configure(id, config) {
    if (!this._configs.has(id)) this._configs.set(id, new PluginConfig());
    this._configs.get(id).merge(config);
    return this;
  }

  getConfig(id) { return this._configs.get(id); }

  get hooks() { return this._hooks; }
  get events() { return this._events; }
  get capabilities() { return this._capabilities; }

  stats() {
    const plugins = [...this._plugins.values()];
    return {
      total: plugins.length,
      installed: plugins.filter(p => p.state === 'installed').length,
      registered: plugins.filter(p => p.state === 'registered').length,
      disabled: plugins.filter(p => !p.descriptor.enabled).length,
    };
  }
}

// ─── Plugin factory helpers ───────────────────────────────────────────────────
export function definePlugin(options) {
  return new PluginDescriptor(options);
}

export function createPluginSystem() {
  return new PluginRegistry();
}

export function withPlugin(registry, id, fn) {
  const plugin = registry.get(id);
  if (!plugin) throw new PluginError(`Plugin not found: ${id}`, id);
  return fn(plugin.instance);
}

export default {
  PluginDescriptor, HookSystem, EventBus, CapabilityRegistry, PluginSandbox, PluginConfig, PluginRegistry,
  PluginError, definePlugin, createPluginSystem, withPlugin,
};
