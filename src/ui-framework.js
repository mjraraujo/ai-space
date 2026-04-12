/**
 * ui-framework.js — Minimal reactive UI framework (like a tiny React/Vue).
 * Virtual DOM, diff/patch, component lifecycle, hooks, directives, templates.
 */

// ─── Virtual DOM ──────────────────────────────────────────────────────────────
export class VNode {
  constructor(type, props, children, key) {
    this.type = type;
    this.props = props ?? {};
    this.children = (children ?? []).flat(Infinity).filter(c => c !== null && c !== undefined && c !== false);
    this.key = key ?? props?.key ?? null;
    this.el = null;   // real DOM element
    this._component = null;
  }
  toString() { return `VNode<${this.type}>`; }
}

export function h(type, props = {}, ...children) {
  return new VNode(type, props, children, props?.key);
}

export function fragment(children) {
  return new VNode('__fragment__', {}, children);
}

export function text(value) {
  return new VNode('__text__', { value: String(value) }, []);
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────
function createElement(vnode) {
  if (!vnode || typeof vnode !== 'object') return document.createTextNode(String(vnode ?? ''));
  if (vnode.type === '__text__') return document.createTextNode(vnode.props.value);
  if (vnode.type === '__fragment__') {
    const frag = document.createDocumentFragment();
    for (const child of vnode.children) frag.appendChild(createElement(child));
    return frag;
  }
  if (typeof vnode.type === 'function') {
    const instance = createComponentInstance(vnode);
    const rendered = instance.render();
    const el = createElement(rendered);
    vnode.el = el;
    vnode._component = instance;
    instance._vnode = rendered;
    instance._el = el;
    instance.mounted?.();
    return el;
  }
  const el = document.createElement(vnode.type);
  vnode.el = el;
  applyProps(el, {}, vnode.props);
  for (const child of vnode.children) el.appendChild(createElement(child));
  return el;
}

function applyProps(el, oldProps, newProps) {
  // Remove old
  for (const key of Object.keys(oldProps)) {
    if (!(key in newProps)) {
      if (key.startsWith('on')) el.removeEventListener(key.slice(2).toLowerCase(), oldProps[key]);
      else if (key === 'style') el.removeAttribute('style');
      else if (key === 'class' || key === 'className') el.removeAttribute('class');
      else el.removeAttribute(key);
    }
  }
  // Apply new
  for (const [key, val] of Object.entries(newProps)) {
    if (key === 'key') continue;
    if (key.startsWith('on') && typeof val === 'function') {
      const event = key.slice(2).toLowerCase();
      if (oldProps[key]) el.removeEventListener(event, oldProps[key]);
      el.addEventListener(event, val);
    } else if (key === 'style') {
      if (typeof val === 'string') el.style.cssText = val;
      else for (const [k, v] of Object.entries(val)) el.style[k] = v;
    } else if (key === 'class' || key === 'className') {
      el.className = Array.isArray(val) ? val.filter(Boolean).join(' ') : val;
    } else if (key === 'innerHTML') {
      el.innerHTML = val;
    } else if (key === 'ref') {
      if (typeof val === 'function') val(el);
      else if (val && 'current' in val) val.current = el;
    } else if (typeof val === 'boolean') {
      if (val) el.setAttribute(key, ''); else el.removeAttribute(key);
    } else if (val !== null && val !== undefined) {
      el.setAttribute(key, val);
    }
  }
}

// ─── Diff & Patch ─────────────────────────────────────────────────────────────
function patch(container, oldVnode, newVnode, index = 0) {
  if (!oldVnode && newVnode) {
    container.appendChild(createElement(newVnode));
    return;
  }
  if (oldVnode && !newVnode) {
    const child = container.childNodes[index];
    if (child) { oldVnode._component?.beforeUnmount?.(); container.removeChild(child); }
    return;
  }
  if (!oldVnode || !newVnode) return;

  // Text nodes
  if (oldVnode.type === '__text__' && newVnode.type === '__text__') {
    if (oldVnode.props.value !== newVnode.props.value) {
      const el = container.childNodes[index];
      if (el) el.textContent = newVnode.props.value;
    }
    newVnode.el = container.childNodes[index];
    return;
  }

  // Different types
  if (oldVnode.type !== newVnode.type) {
    const child = container.childNodes[index];
    const newEl = createElement(newVnode);
    if (child) container.replaceChild(newEl, child); else container.appendChild(newEl);
    return;
  }

  // Component
  if (typeof newVnode.type === 'function') {
    const instance = oldVnode._component;
    if (instance) {
      instance.props = newVnode.props;
      instance.beforeUpdate?.();
      const rendered = instance.render();
      patchChildren(instance._el?.parentNode ?? container, [instance._vnode], [rendered]);
      instance._vnode = rendered;
      instance.updated?.();
    }
    newVnode._component = oldVnode._component;
    newVnode.el = oldVnode.el;
    return;
  }

  // Same element type
  const el = container.childNodes[index] ?? oldVnode.el;
  newVnode.el = el;
  if (el && el.nodeType === 1) applyProps(el, oldVnode.props, newVnode.props);

  // Diff children
  patchChildren(el, oldVnode.children, newVnode.children);
}

function patchChildren(el, oldChildren, newChildren) {
  if (!el) return;
  const maxLen = Math.max(oldChildren.length, newChildren.length);
  for (let i = 0; i < maxLen; i++) {
    patch(el, oldChildren[i], newChildren[i], i);
  }
}

// ─── Renderer ─────────────────────────────────────────────────────────────────
export class Renderer {
  constructor(container) {
    this._container = container;
    this._vnode = null;
  }

  render(vnode) {
    if (!this._vnode) {
      this._container.innerHTML = '';
      const el = createElement(vnode);
      this._container.appendChild(el);
    } else {
      patchChildren(this._container, [this._vnode], [vnode]);
    }
    this._vnode = vnode;
  }

  unmount() {
    this._container.innerHTML = '';
    this._vnode = null;
  }
}

// ─── Component ───────────────────────────────────────────────────────────────
export class Component {
  constructor(props = {}) {
    this.props = props;
    this.state = {};
    this._vnode = null;
    this._el = null;
    this._dirty = false;
    this._renderer = null;
  }

  setState(partialState) {
    this.state = { ...this.state, ...(typeof partialState === 'function' ? partialState(this.state) : partialState) };
    this._scheduleUpdate();
  }

  _scheduleUpdate() {
    if (this._dirty) return;
    this._dirty = true;
    Promise.resolve().then(() => {
      if (this._dirty) { this._update(); this._dirty = false; }
    });
  }

  _update() {
    const newVnode = this.render();
    if (this._renderer) this._renderer.render(newVnode);
    else if (this._el?.parentNode) {
      patchChildren(this._el.parentNode, [this._vnode], [newVnode]);
    }
    this._vnode = newVnode;
    this.updated?.();
  }

  forceUpdate() { this._update(); }
  render() { return h('div', {}, 'Component'); }
  mounted() {}
  beforeUpdate() {}
  updated() {}
  beforeUnmount() {}
}

function createComponentInstance(vnode) {
  const { type: ComponentClass, props } = vnode;
  if (typeof ComponentClass === 'function' && ComponentClass.prototype instanceof Component) {
    return new ComponentClass(props);
  }
  // Functional component
  const inst = new Component(props);
  inst.render = () => ComponentClass(props);
  return inst;
}

// ─── Hooks (for functional components) ────────────────────────────────────────
let _currentComponent = null;
let _hookIndex = 0;

export function withHooks(fn) {
  return class extends Component {
    constructor(props) {
      super(props);
      this._hooks = [];
    }
    render() {
      _currentComponent = this;
      _hookIndex = 0;
      const result = fn(this.props);
      _currentComponent = null;
      return result;
    }
  };
}

export function useState(initial) {
  const comp = _currentComponent;
  const i = _hookIndex++;
  if (!comp._hooks[i]) comp._hooks[i] = { state: typeof initial === 'function' ? initial() : initial };
  const hook = comp._hooks[i];
  const setState = (val) => {
    hook.state = typeof val === 'function' ? val(hook.state) : val;
    comp._scheduleUpdate();
  };
  return [hook.state, setState];
}

export function useReducer(reducer, initial, init) {
  const [state, setState] = useState(init ? init(initial) : initial);
  const dispatch = (action) => setState(s => reducer(s, action));
  return [state, dispatch];
}

export function useEffect(fn, deps) {
  const comp = _currentComponent;
  const i = _hookIndex++;
  const hook = comp._hooks[i] ?? {};
  const depsChanged = !hook.deps || !deps || deps.some((d, j) => d !== hook.deps[j]);
  if (depsChanged) {
    hook.cleanup?.();
    hook.cleanup = fn();
    hook.deps = deps ? [...deps] : null;
  }
  comp._hooks[i] = hook;
}

export function useRef(initial) {
  const comp = _currentComponent;
  const i = _hookIndex++;
  if (!comp._hooks[i]) comp._hooks[i] = { current: initial };
  return comp._hooks[i];
}

export function useMemo(fn, deps) {
  const comp = _currentComponent;
  const i = _hookIndex++;
  const hook = comp._hooks[i] ?? {};
  const depsChanged = !hook.deps || !deps || deps.some((d, j) => d !== hook.deps[j]);
  if (depsChanged) { hook.value = fn(); hook.deps = deps ? [...deps] : null; }
  comp._hooks[i] = hook;
  return hook.value;
}

export function useCallback(fn, deps) { return useMemo(() => fn, deps); }

export function useContext(context) { return context.value; }

// ─── Context ─────────────────────────────────────────────────────────────────
export class Context {
  constructor(defaultValue) { this.value = defaultValue; this._subscribers = []; }
  provide(value) {
    this.value = value;
    for (const sub of this._subscribers) sub(value);
    return () => { this.value = this._defaultValue; };
  }
  subscribe(fn) { this._subscribers.push(fn); return () => { this._subscribers = this._subscribers.filter(s => s !== fn); }; }
}
export function createContext(def) { return new Context(def); }

// ─── Template engine ──────────────────────────────────────────────────────────
export class Template {
  constructor(str) {
    this._str = str;
    this._compiled = this._compile(str);
  }

  _compile(str) {
    const parts = [];
    const re = /\{\{(.*?)\}\}|(\{%\s*(.*?)\s*%\})/g;
    let last = 0, m;
    while ((m = re.exec(str)) !== null) {
      if (m.index > last) parts.push({ type: 'text', val: str.slice(last, m.index) });
      if (m[1] !== undefined) parts.push({ type: 'expr', val: m[1].trim() });
      if (m[3] !== undefined) parts.push({ type: 'block', val: m[3].trim() });
      last = m.index + m[0].length;
    }
    if (last < str.length) parts.push({ type: 'text', val: str.slice(last) });
    return parts;
  }

  render(ctx = {}) {
    const scope = { ...ctx };
    const evalExpr = expr => {
      try { return Function(...Object.keys(scope), `return ${expr}`)(...Object.values(scope)); }
      catch { return ''; }
    };

    const parts = [];
    let i = 0;
    while (i < this._compiled.length) {
      const part = this._compiled[i];
      if (part.type === 'text') parts.push(part.val);
      else if (part.type === 'expr') parts.push(String(evalExpr(part.val) ?? ''));
      else if (part.type === 'block') {
        if (part.val.startsWith('if ')) {
          const cond = part.val.slice(3);
          const endIdx = this._compiled.findIndex((p, j) => j > i && p.type === 'block' && p.val === 'endif');
          const block = this._compiled.slice(i + 1, endIdx);
          if (evalExpr(cond)) {
            const sub = new Template('');
            sub._compiled = block;
            parts.push(sub.render(scope));
          }
          i = endIdx;
        } else if (part.val.startsWith('for ')) {
          const m = /for (\w+) in (.+)/.exec(part.val);
          if (m) {
            const [, varName, listExpr] = m;
            const list = evalExpr(listExpr) ?? [];
            const endIdx = this._compiled.findIndex((p, j) => j > i && p.type === 'block' && p.val === 'endfor');
            const block = this._compiled.slice(i + 1, endIdx);
            for (const item of list) {
              const sub = new Template('');
              sub._compiled = block;
              parts.push(sub.render({ ...scope, [varName]: item }));
            }
            i = endIdx;
          }
        }
      }
      i++;
    }
    return parts.join('');
  }
}

export function template(str) { return new Template(str); }

// ─── CSS-in-JS ────────────────────────────────────────────────────────────────
let _cssCounter = 0;
const _injectedStyles = new Map();

export function css(styles) {
  const className = `ui-${_cssCounter++}`;
  const rules = typeof styles === 'string' ? styles : Object.entries(styles).map(([k, v]) => {
    const prop = k.replace(/([A-Z])/g, m => '-' + m.toLowerCase());
    return `${prop}:${v}`;
  }).join(';');
  const rule = `.${className}{${rules}}`;
  if (typeof document !== 'undefined' && !_injectedStyles.has(className)) {
    let styleTag = document.getElementById('ui-framework-styles');
    if (!styleTag) { styleTag = document.createElement('style'); styleTag.id = 'ui-framework-styles'; document.head.appendChild(styleTag); }
    styleTag.textContent += rule;
    _injectedStyles.set(className, rule);
  }
  return className;
}

export function globalCss(styles) {
  if (typeof document === 'undefined') return;
  let styleTag = document.getElementById('ui-framework-global');
  if (!styleTag) { styleTag = document.createElement('style'); styleTag.id = 'ui-framework-global'; document.head.appendChild(styleTag); }
  const rules = typeof styles === 'string' ? styles : Object.entries(styles).map(([sel, decls]) =>
    `${sel}{${Object.entries(decls).map(([k,v])=>`${k.replace(/([A-Z])/g,m=>'-'+m.toLowerCase())}:${v}`).join(';')}}`
  ).join('\n');
  styleTag.textContent += rules;
}

// ─── Event delegation ─────────────────────────────────────────────────────────
export class EventDelegate {
  constructor(root) {
    this._root = root;
    this._handlers = new Map();
    this._listener = this._handle.bind(this);
    root.addEventListener('click', this._listener, true);
    root.addEventListener('change', this._listener, true);
    root.addEventListener('input', this._listener, true);
  }

  on(selector, event, handler) {
    const key = `${event}:${selector}`;
    if (!this._handlers.has(key)) this._handlers.set(key, []);
    this._handlers.get(key).push(handler);
    return this;
  }

  off(selector, event, handler) {
    const key = `${event}:${selector}`;
    const hs = this._handlers.get(key);
    if (hs) { const i = hs.indexOf(handler); if (i >= 0) hs.splice(i, 1); }
    return this;
  }

  _handle(e) {
    for (const [key, handlers] of this._handlers) {
      const [event, selector] = key.split(':');
      if (event !== e.type) continue;
      let target = e.target;
      while (target && target !== this._root) {
        if (target.matches?.(selector)) {
          for (const h of handlers) h(e, target);
          break;
        }
        target = target.parentElement;
      }
    }
  }

  destroy() {
    this._root.removeEventListener('click', this._listener, true);
    this._root.removeEventListener('change', this._listener, true);
    this._root.removeEventListener('input', this._listener, true);
    this._handlers.clear();
  }
}

// ─── Animation ────────────────────────────────────────────────────────────────
export class Transition {
  constructor(el, opts = {}) {
    this._el = el;
    this._duration = opts.duration ?? 300;
    this._easing = opts.easing ?? 'ease';
  }

  async enter(from = {}, to = {}) {
    Object.assign(this._el.style, from);
    await tick();
    this._el.style.transition = `all ${this._duration}ms ${this._easing}`;
    Object.assign(this._el.style, to);
    await sleep(this._duration);
    this._el.style.transition = '';
  }

  async leave(to = {}) {
    this._el.style.transition = `all ${this._duration}ms ${this._easing}`;
    Object.assign(this._el.style, to);
    await sleep(this._duration);
  }
}

function tick() { return new Promise(r => requestAnimationFrame ? requestAnimationFrame(r) : setTimeout(r, 0)); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Virtual List ─────────────────────────────────────────────────────────────
export class VirtualList {
  constructor(container, opts = {}) {
    this._container = container;
    this._itemHeight = opts.itemHeight ?? 40;
    this._renderItem = opts.renderItem ?? (item => h('div', {}, String(item)));
    this._items = [];
    this._scrollTop = 0;
    this._renderer = new Renderer(container);
    container.addEventListener('scroll', () => { this._scrollTop = container.scrollTop; this._render(); });
  }

  setItems(items) { this._items = items; this._render(); }

  _render() {
    const height = this._container.clientHeight || 400;
    const total = this._items.length * this._itemHeight;
    const startIndex = Math.floor(this._scrollTop / this._itemHeight);
    const endIndex = Math.min(startIndex + Math.ceil(height / this._itemHeight) + 1, this._items.length);
    const offsetY = startIndex * this._itemHeight;

    const rows = this._items.slice(startIndex, endIndex).map((item, i) =>
      h('div', { style: { height: this._itemHeight + 'px', boxSizing: 'border-box' } }, this._renderItem(item, startIndex + i))
    );
    this._renderer.render(h('div', { style: { height: total + 'px', position: 'relative' } },
      h('div', { style: { transform: `translateY(${offsetY}px)` } }, ...rows)
    ));
  }
}

// ─── App ──────────────────────────────────────────────────────────────────────
export class App {
  constructor(options = {}) {
    this._options = options;
    this._plugins = [];
    this._components = {};
    this._directives = {};
    this._providers = new Map();
  }

  component(name, def) { this._components[name] = def; return this; }
  directive(name, def) { this._directives[name] = def; return this; }
  provide(key, value) { this._providers.set(key, value); return this; }
  use(plugin) { plugin.install?.(this); this._plugins.push(plugin); return this; }

  mount(selector) {
    const container = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!container) throw new Error(`Cannot find container: ${selector}`);
    const RootComponent = this._options.component ?? this._options.render;
    const renderer = new Renderer(container);
    if (typeof RootComponent === 'function' && RootComponent.prototype instanceof Component) {
      const instance = new RootComponent(this._options.props ?? {});
      renderer.render(instance.render());
    } else if (typeof RootComponent === 'function') {
      renderer.render(RootComponent(this._options.props ?? {}));
    }
    return renderer;
  }
}

export function createApp(options) { return new App(options); }

export default {
  VNode, h, fragment, text, Component, Renderer, Context, Template,
  App, VirtualList, EventDelegate, Transition,
  withHooks, useState, useReducer, useEffect, useRef, useMemo, useCallback, useContext,
  createApp, createContext, css, globalCss, template,
};
