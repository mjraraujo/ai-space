/**
 * router.js — Client-side router with history API, middleware pipeline,
 * route matching, code splitting, guards, and transitions.
 */

// ─── Path utilities ───────────────────────────────────────────────────────────
export function parsePath(path) {
  const [pathPart, queryPart = ''] = path.split('?');
  const [pathname, hashPart = ''] = pathPart.split('#');
  return { pathname: pathname || '/', search: queryPart ? '?' + queryPart : '', hash: hashPart ? '#' + hashPart : '' };
}

export function parseQuery(search) {
  const params = new URLSearchParams(search.replace(/^\?/, ''));
  const obj = {};
  for (const [k, v] of params) {
    if (obj[k] !== undefined) {
      if (!Array.isArray(obj[k])) obj[k] = [obj[k]];
      obj[k].push(v);
    } else obj[k] = v;
  }
  return obj;
}

export function stringifyQuery(obj) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) v.forEach(val => params.append(k, val));
    else if (v !== null && v !== undefined) params.set(k, String(v));
  }
  const s = params.toString();
  return s ? '?' + s : '';
}

export function joinPaths(...parts) {
  return '/' + parts.map(p => p.replace(/^\/|\/$/g, '')).filter(Boolean).join('/');
}

export function normalizePath(path) {
  const parts = path.split('/').filter(Boolean);
  const stack = [];
  for (const p of parts) {
    if (p === '..') stack.pop();
    else if (p !== '.') stack.push(p);
  }
  return '/' + stack.join('/');
}

// ─── Route Matcher ────────────────────────────────────────────────────────────
export class RouteMatcher {
  constructor(pattern, options = {}) {
    this.pattern = pattern;
    this.options = { sensitive: false, strict: false, end: true, ...options };
    const { regexp, keys } = this._compile(pattern);
    this.regexp = regexp;
    this.keys = keys;
  }

  _compile(pattern) {
    const keys = [];
    let src = pattern
      .replace(/\//g, '\\/')
      .replace(/:(\w+)(\?)?/g, (_, name, optional) => {
        keys.push({ name, optional: !!optional });
        return optional ? '([^/]*)?' : '([^/]+)';
      })
      .replace(/\*\*?/g, m => { keys.push({ name: '*', optional: false }); return m === '**' ? '(.*)' : '([^/]*)'; });
    if (this.options.end) src += '$';
    const flags = this.options.sensitive ? '' : 'i';
    return { regexp: new RegExp('^' + src, flags), keys };
  }

  match(path) {
    const { pathname } = parsePath(path);
    const m = this.regexp.exec(pathname);
    if (!m) return null;
    const params = {};
    this.keys.forEach((k, i) => {
      if (m[i + 1] !== undefined) params[k.name] = decodeURIComponent(m[i + 1]);
    });
    return { path: pathname, params, matched: m[0] };
  }

  test(path) { return !!this.match(path); }
}

// ─── Location ─────────────────────────────────────────────────────────────────
export class Location {
  constructor(href = '/') {
    const parsed = parsePath(href);
    this.pathname = parsed.pathname;
    this.search = parsed.search;
    this.hash = parsed.hash;
    this.query = parseQuery(this.search);
    this.state = null;
    this.key = Math.random().toString(36).slice(2);
  }

  get href() { return this.pathname + this.search + this.hash; }
  toString() { return this.href; }

  clone() {
    const l = new Location(this.href);
    l.state = this.state;
    return l;
  }

  equals(other) { return this.pathname === other.pathname && this.search === other.search && this.hash === other.hash; }
}

// ─── History ──────────────────────────────────────────────────────────────────
export class MemoryHistory {
  constructor(initialPath = '/') {
    this._entries = [new Location(initialPath)];
    this._index = 0;
    this._listeners = [];
  }

  get location() { return this._entries[this._index]; }
  get length() { return this._entries.length; }
  get index() { return this._index; }

  push(path, state = null) {
    const loc = new Location(path);
    loc.state = state;
    this._entries.splice(this._index + 1);
    this._entries.push(loc);
    this._index++;
    this._notify('PUSH', loc);
  }

  replace(path, state = null) {
    const loc = new Location(path);
    loc.state = state;
    this._entries[this._index] = loc;
    this._notify('REPLACE', loc);
  }

  go(delta) {
    const newIndex = Math.max(0, Math.min(this._entries.length - 1, this._index + delta));
    if (newIndex === this._index) return;
    this._index = newIndex;
    this._notify('POP', this.location);
  }

  back() { this.go(-1); }
  forward() { this.go(1); }

  listen(fn) {
    this._listeners.push(fn);
    return () => { this._listeners = this._listeners.filter(l => l !== fn); };
  }

  _notify(action, location) {
    for (const fn of this._listeners) fn({ action, location });
  }

  canGoBack() { return this._index > 0; }
  canGoForward() { return this._index < this._entries.length - 1; }
  entries() { return [...this._entries]; }
}

export class BrowserHistory extends MemoryHistory {
  constructor() {
    super(typeof window !== 'undefined' ? window.location.pathname + window.location.search + window.location.hash : '/');
    if (typeof window !== 'undefined') {
      window.addEventListener('popstate', e => {
        const loc = new Location(window.location.href.replace(window.location.origin, ''));
        loc.state = e.state;
        this._entries[this._index] = loc;
        this._notify('POP', loc);
      });
    }
  }

  push(path, state = null) {
    if (typeof window !== 'undefined') {
      window.history.pushState(state, '', path);
    }
    super.push(path, state);
  }

  replace(path, state = null) {
    if (typeof window !== 'undefined') {
      window.history.replaceState(state, '', path);
    }
    super.replace(path, state);
  }
}

export class HashHistory extends MemoryHistory {
  constructor() {
    super(typeof window !== 'undefined' ? '/' + (window.location.hash.slice(2) || '') : '/');
    if (typeof window !== 'undefined') {
      window.addEventListener('hashchange', () => {
        const path = '/' + (window.location.hash.slice(2) || '');
        const loc = new Location(path);
        this._entries[this._index] = loc;
        this._notify('POP', loc);
      });
    }
  }

  push(path, state = null) {
    if (typeof window !== 'undefined') window.location.hash = '#/' + path.replace(/^\//, '');
    super.push(path, state);
  }

  replace(path, state = null) {
    if (typeof window !== 'undefined') window.location.hash = '#/' + path.replace(/^\//, '');
    super.replace(path, state);
  }
}

// ─── Route ────────────────────────────────────────────────────────────────────
export class Route {
  constructor(config) {
    this.path = config.path;
    this.name = config.name ?? null;
    this.component = config.component ?? null;
    this.children = (config.children ?? []).map(c => new Route(c));
    this.guards = config.guards ?? [];
    this.meta = config.meta ?? {};
    this.redirect = config.redirect ?? null;
    this.alias = config.alias ?? null;
    this.props = config.props ?? false;
    this.beforeEnter = config.beforeEnter ?? null;
    this.beforeLeave = config.beforeLeave ?? null;
    this._matcher = new RouteMatcher(this.path, { end: !this.children.length });
  }

  match(path) {
    const result = this._matcher.match(path);
    if (!result) return null;
    // Try children
    for (const child of this.children) {
      const childMatch = child.match(path.slice(result.matched.length) || '/');
      if (childMatch) return { ...childMatch, parentRoute: this, params: { ...result.params, ...childMatch.params } };
    }
    return { route: this, params: result.params, path: result.path };
  }

  get fullPath() { return this.path; }
}

// ─── Navigation context ───────────────────────────────────────────────────────
export class NavigationContext {
  constructor(from, to, params = {}, query = {}) {
    this.from = from;
    this.to = to;
    this.params = params;
    this.query = query;
    this._aborted = false;
    this._redirectTo = null;
  }

  abort() { this._aborted = true; }
  redirect(path) { this._redirectTo = path; this._aborted = true; }
  isAborted() { return this._aborted; }
  redirectPath() { return this._redirectTo; }
}

// ─── Middleware ───────────────────────────────────────────────────────────────
export class MiddlewarePipeline {
  constructor() { this._middlewares = []; }

  use(fn) { this._middlewares.push(fn); return this; }

  async run(ctx) {
    let i = 0;
    const next = async () => {
      if (ctx.isAborted()) return;
      if (i >= this._middlewares.length) return;
      const mw = this._middlewares[i++];
      await mw(ctx, next);
    };
    await next();
    return ctx;
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────
export class Router {
  constructor(options = {}) {
    this.history = options.history ?? new MemoryHistory();
    this._routes = [];
    this._namedRoutes = new Map();
    this._current = null;
    this._listeners = [];
    this._beforeEachHooks = [];
    this._afterEachHooks = [];
    this._beforeResolveHooks = [];
    this._errorHandlers = [];
    this._pipeline = new MiddlewarePipeline();
    this._scrollBehavior = options.scrollBehavior ?? null;
    this._base = options.base ?? '';
    this._navigating = false;

    // Add routes from options
    if (options.routes) this.addRoutes(options.routes);

    // Listen to history changes
    this.history.listen(({ action, location }) => {
      if (!this._navigating) this._resolveLocation(location);
    });

    // Resolve initial location
    this._resolveLocation(this.history.location);
  }

  addRoute(config) {
    const route = config instanceof Route ? config : new Route(config);
    this._routes.push(route);
    if (route.name) this._namedRoutes.set(route.name, route);
    // Register children names
    const registerNames = (r, prefix = '') => {
      const fullPath = joinPaths(prefix, r.path);
      for (const child of r.children) {
        if (child.name) this._namedRoutes.set(child.name, child);
        registerNames(child, fullPath);
      }
    };
    registerNames(route);
    return this;
  }

  addRoutes(configs) {
    for (const c of configs) this.addRoute(c);
    return this;
  }

  removeRoute(nameOrPath) {
    this._routes = this._routes.filter(r => r.name !== nameOrPath && r.path !== nameOrPath);
    this._namedRoutes.delete(nameOrPath);
    return this;
  }

  beforeEach(fn) { this._beforeEachHooks.push(fn); return this; }
  afterEach(fn) { this._afterEachHooks.push(fn); return this; }
  beforeResolve(fn) { this._beforeResolveHooks.push(fn); return this; }
  onError(fn) { this._errorHandlers.push(fn); return this; }

  async push(path, state = null) {
    this._navigating = true;
    try {
      const resolved = this._resolve(path);
      const success = await this._navigate(resolved, 'PUSH');
      if (success) this.history.push(path, state);
      return success;
    } finally {
      this._navigating = false;
    }
  }

  async replace(path, state = null) {
    this._navigating = true;
    try {
      const resolved = this._resolve(path);
      const success = await this._navigate(resolved, 'REPLACE');
      if (success) this.history.replace(path, state);
      return success;
    } finally {
      this._navigating = false;
    }
  }

  back() { this.history.back(); }
  forward() { this.history.forward(); }
  go(delta) { this.history.go(delta); }

  resolve(path) { return this._resolve(path); }

  _resolve(path) {
    const { pathname, search } = parsePath(path);
    const query = parseQuery(search);
    for (const route of this._routes) {
      const match = route.match(pathname);
      if (match) return { route: match.route, params: match.params, query, path: pathname, fullPath: path };
    }
    return { route: null, params: {}, query, path: pathname, fullPath: path };
  }

  async _navigate(resolved, action) {
    const from = this._current;
    const to = resolved;
    const ctx = new NavigationContext(from, to, to.params, to.query);

    try {
      // Run beforeEach hooks
      for (const hook of this._beforeEachHooks) {
        await hook(ctx);
        if (ctx.isAborted()) {
          if (ctx.redirectPath()) { await this.push(ctx.redirectPath()); }
          return false;
        }
      }

      // Run route's beforeEnter
      if (to.route?.beforeEnter) {
        await to.route.beforeEnter(ctx);
        if (ctx.isAborted()) return false;
      }

      // Run guards
      for (const guard of to.route?.guards ?? []) {
        const result = await guard(ctx);
        if (result === false || ctx.isAborted()) return false;
        if (typeof result === 'string') { await this.push(result); return false; }
      }

      // Run beforeResolve hooks
      for (const hook of this._beforeResolveHooks) {
        await hook(ctx);
        if (ctx.isAborted()) return false;
      }

      // Handle redirect
      if (to.route?.redirect) {
        const rPath = typeof to.route.redirect === 'function' ? to.route.redirect(to) : to.route.redirect;
        await this.push(rPath);
        return false;
      }

      // Commit navigation
      this._current = to;
      this._notify(from, to, action);

      // Run afterEach hooks
      for (const hook of this._afterEachHooks) await hook(ctx, from);

      return true;
    } catch (e) {
      for (const handler of this._errorHandlers) handler(e, from, to);
      return false;
    }
  }

  async _resolveLocation(location) {
    const resolved = this._resolve(location.href);
    await this._navigate(resolved, 'POP');
  }

  listen(fn) {
    this._listeners.push(fn);
    return () => { this._listeners = this._listeners.filter(l => l !== fn); };
  }

  _notify(from, to, action) {
    for (const fn of this._listeners) fn({ from, to, action });
  }

  // Named route resolution
  resolveNamed(name, params = {}, query = {}) {
    const route = this._namedRoutes.get(name);
    if (!route) throw new Error(`Route '${name}' not found`);
    let path = route.path;
    for (const [k, v] of Object.entries(params)) path = path.replace(`:${k}`, encodeURIComponent(v));
    return path + stringifyQuery(query);
  }

  pushNamed(name, params = {}, query = {}) {
    return this.push(this.resolveNamed(name, params, query));
  }

  replaceNamed(name, params = {}, query = {}) {
    return this.replace(this.resolveNamed(name, params, query));
  }

  // Current route info
  get current() { return this._current; }
  get currentPath() { return this._current?.path ?? '/'; }
  get currentRoute() { return this._current?.route ?? null; }
  get currentParams() { return this._current?.params ?? {}; }
  get currentQuery() { return this._current?.query ?? {}; }

  // Check if path is active
  isActive(path, exact = false) {
    const cur = this.currentPath;
    return exact ? cur === path : cur.startsWith(path);
  }

  isNamedActive(name, params = {}) {
    try {
      const path = this.resolveNamed(name, params);
      return this.isActive(path);
    } catch { return false; }
  }

  // Route listing
  routes() { return [...this._routes]; }
  namedRoutes() { return new Map(this._namedRoutes); }

  // Middleware
  use(...mws) { for (const mw of mws) this._pipeline.use(mw); return this; }

  // Link helper
  link(path) {
    return {
      href: path,
      active: this.isActive(path),
      activeExact: this.isActive(path, true),
      navigate: () => this.push(path),
    };
  }

  // Scroll restoration
  setScrollBehavior(fn) { this._scrollBehavior = fn; return this; }

  // Install as plugin
  install(app) {
    if (app && typeof app.provide === 'function') {
      app.provide('$router', this);
    }
    return this;
  }

  destroy() {
    this._listeners.length = 0;
    this._beforeEachHooks.length = 0;
    this._afterEachHooks.length = 0;
    this._beforeResolveHooks.length = 0;
  }
}

// ─── Lazy loader ──────────────────────────────────────────────────────────────
export function lazy(importer) {
  let cache = null;
  return async () => {
    if (!cache) cache = await importer();
    return cache;
  };
}

// ─── Built-in guards ─────────────────────────────────────────────────────────
export function authGuard(isAuthenticated, redirectTo = '/login') {
  return async (ctx) => {
    const authed = typeof isAuthenticated === 'function' ? await isAuthenticated(ctx) : isAuthenticated;
    if (!authed) { ctx.redirect(redirectTo); }
  };
}

export function roleGuard(getRole, allowedRoles, redirectTo = '/forbidden') {
  return async (ctx) => {
    const role = typeof getRole === 'function' ? await getRole(ctx) : getRole;
    if (!allowedRoles.includes(role)) ctx.redirect(redirectTo);
  };
}

export function confirmGuard(message = 'Are you sure you want to leave?') {
  return async (ctx) => {
    if (typeof window !== 'undefined' && !window.confirm(message)) ctx.abort();
  };
}

export function metaGuard(metaKey, redirectTo = '/') {
  return async (ctx) => {
    if (!ctx.to.route?.meta?.[metaKey]) ctx.redirect(redirectTo);
  };
}

// ─── View Transitions ─────────────────────────────────────────────────────────
export class ViewTransition {
  constructor(type = 'fade', duration = 300) {
    this.type = type;
    this.duration = duration;
    this._easing = 'ease-in-out';
  }

  setEasing(easing) { this._easing = easing; return this; }

  async enter(element) {
    if (!element) return;
    element.style.transition = `all ${this.duration}ms ${this._easing}`;
    if (this.type === 'fade') {
      element.style.opacity = '0';
      await tick();
      element.style.opacity = '1';
    } else if (this.type === 'slide-left') {
      element.style.transform = 'translateX(100%)';
      await tick();
      element.style.transform = 'translateX(0)';
    } else if (this.type === 'slide-right') {
      element.style.transform = 'translateX(-100%)';
      await tick();
      element.style.transform = 'translateX(0)';
    } else if (this.type === 'scale') {
      element.style.transform = 'scale(0.8)';
      element.style.opacity = '0';
      await tick();
      element.style.transform = 'scale(1)';
      element.style.opacity = '1';
    }
    await sleep(this.duration);
  }

  async leave(element) {
    if (!element) return;
    element.style.transition = `all ${this.duration}ms ${this._easing}`;
    if (this.type === 'fade') { element.style.opacity = '0'; }
    else if (this.type === 'slide-left') { element.style.transform = 'translateX(-100%)'; }
    else if (this.type === 'slide-right') { element.style.transform = 'translateX(100%)'; }
    else if (this.type === 'scale') { element.style.transform = 'scale(0.8)'; element.style.opacity = '0'; }
    await sleep(this.duration);
  }
}

function tick() { return new Promise(r => setTimeout(r, 0)); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Scroll position manager ──────────────────────────────────────────────────
export class ScrollPositionManager {
  constructor() { this._positions = new Map(); }

  save(key) {
    if (typeof window !== 'undefined') {
      this._positions.set(key, { x: window.scrollX, y: window.scrollY });
    }
  }

  restore(key) {
    const pos = this._positions.get(key);
    if (pos && typeof window !== 'undefined') window.scrollTo(pos.x, pos.y);
  }

  reset() { if (typeof window !== 'undefined') window.scrollTo(0, 0); }
  clear() { this._positions.clear(); }
}

// ─── Route cache ──────────────────────────────────────────────────────────────
export class RouteCache {
  constructor(maxSize = 20) { this._cache = new Map(); this._maxSize = maxSize; }

  set(key, component) {
    if (this._cache.size >= this._maxSize) {
      const firstKey = this._cache.keys().next().value;
      this._cache.delete(firstKey);
    }
    this._cache.set(key, { component, ts: Date.now() });
  }

  get(key) { return this._cache.get(key)?.component; }
  has(key) { return this._cache.has(key); }
  delete(key) { this._cache.delete(key); }
  clear() { this._cache.clear(); }
  size() { return this._cache.size; }

  prune(maxAge = 300000) {
    const now = Date.now();
    for (const [k, v] of this._cache) if (now - v.ts > maxAge) this._cache.delete(k);
  }
}

// ─── Breadcrumb builder ───────────────────────────────────────────────────────
export class BreadcrumbBuilder {
  constructor(router) { this.router = router; }

  build(path = this.router.currentPath) {
    const parts = path.split('/').filter(Boolean);
    const crumbs = [{ label: 'Home', path: '/' }];
    let current = '';
    for (const part of parts) {
      current += '/' + part;
      const resolved = this.router.resolve(current);
      crumbs.push({
        label: resolved.route?.meta?.title ?? part,
        path: current,
        route: resolved.route,
        params: resolved.params,
      });
    }
    return crumbs;
  }
}

// ─── URL pattern matching ─────────────────────────────────────────────────────
export function matchRoutes(routes, path) {
  const matches = [];
  const visit = (routeList, prefix = '') => {
    for (const route of routeList) {
      const fullPath = joinPaths(prefix, route.path);
      const matcher = new RouteMatcher(fullPath, { end: !route.children?.length });
      const result = matcher.match(path);
      if (result) {
        matches.push({ route, params: result.params, fullPath });
        if (route.children?.length) visit(route.children, fullPath);
        break;
      }
    }
  };
  visit(routes);
  return matches;
}

// ─── Factory ──────────────────────────────────────────────────────────────────
export function createRouter(options) { return new Router(options); }
export function createMemoryHistory(initial) { return new MemoryHistory(initial); }
export function createBrowserHistory() { return new BrowserHistory(); }
export function createHashHistory() { return new HashHistory(); }

// ─── Default export ───────────────────────────────────────────────────────────
export default {
  Router, Route, RouteMatcher, Location, MemoryHistory, BrowserHistory, HashHistory,
  NavigationContext, MiddlewarePipeline, ViewTransition, ScrollPositionManager,
  RouteCache, BreadcrumbBuilder, PrefabRegistry: undefined,
  authGuard, roleGuard, confirmGuard, metaGuard, lazy,
  createRouter, createMemoryHistory, createBrowserHistory, createHashHistory,
  parsePath, parseQuery, stringifyQuery, joinPaths, normalizePath, matchRoutes,
};
