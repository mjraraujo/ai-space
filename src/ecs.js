/**
 * ecs.js — Entity Component System framework
 * Features: worlds, archetypes, queries, systems, events, serialization
 */

// ─── Core IDs ─────────────────────────────────────────────────────────────────
let _nextEntityId = 1;
let _nextComponentId = 1;
export function nextEntityId() { return _nextEntityId++; }
export function nextComponentId() { return _nextComponentId++; }

// ─── Component Registry ───────────────────────────────────────────────────────
export class ComponentRegistry {
  constructor() { this._byName = new Map(); this._byId = new Map(); }
  register(name, defaults = {}) {
    if (this._byName.has(name)) return this._byName.get(name);
    const id = nextComponentId();
    const def = { id, name, defaults: { ...defaults } };
    this._byName.set(name, def);
    this._byId.set(id, def);
    return def;
  }
  get(name) { return this._byName.get(name); }
  getById(id) { return this._byId.get(id); }
  has(name) { return this._byName.has(name); }
  all() { return [...this._byName.values()]; }
  createInstance(name, overrides = {}) {
    const def = this._byName.get(name);
    if (!def) throw new Error(`Component '${name}' not registered`);
    return { ...def.defaults, ...overrides, _ctype: name };
  }
}

export const globalRegistry = new ComponentRegistry();

// ─── Archetype ────────────────────────────────────────────────────────────────
export class Archetype {
  constructor(componentTypes) {
    this.componentTypes = new Set(componentTypes);
    this.key = [...this.componentTypes].sort().join(',');
    this.entities = [];
    this.columns = new Map(); // compName -> dense array
    for (const ct of componentTypes) this.columns.set(ct, []);
    this.entityIndex = new Map(); // entityId -> row index
  }

  addEntity(entityId, components) {
    const row = this.entities.length;
    this.entities.push(entityId);
    this.entityIndex.set(entityId, row);
    for (const [ct, arr] of this.columns) {
      arr.push(components[ct] ?? {});
    }
    return row;
  }

  removeEntity(entityId) {
    const row = this.entityIndex.get(entityId);
    if (row === undefined) return;
    const last = this.entities.length - 1;
    if (row !== last) {
      const lastEnt = this.entities[last];
      this.entities[row] = lastEnt;
      this.entityIndex.set(lastEnt, row);
      for (const [, arr] of this.columns) arr[row] = arr[last];
    }
    this.entities.pop();
    for (const [, arr] of this.columns) arr.pop();
    this.entityIndex.delete(entityId);
  }

  getComponent(entityId, compType) {
    const row = this.entityIndex.get(entityId);
    if (row === undefined) return undefined;
    return this.columns.get(compType)?.[row];
  }

  setComponent(entityId, compType, data) {
    const row = this.entityIndex.get(entityId);
    if (row === undefined) return;
    const col = this.columns.get(compType);
    if (col) col[row] = data;
  }

  hasEntity(entityId) { return this.entityIndex.has(entityId); }

  matches(required, excluded = []) {
    for (const r of required) if (!this.componentTypes.has(r)) return false;
    for (const e of excluded) if (this.componentTypes.has(e)) return false;
    return true;
  }

  iterate(callback) {
    for (let i = 0; i < this.entities.length; i++) {
      const comps = {};
      for (const [ct, arr] of this.columns) comps[ct] = arr[i];
      callback(this.entities[i], comps, i);
    }
  }
}

// ─── Query ────────────────────────────────────────────────────────────────────
export class Query {
  constructor(required = [], excluded = []) {
    this.required = required;
    this.excluded = excluded;
    this._matchedArchetypes = [];
    this._dirty = true;
  }

  _refresh(archetypes) {
    this._matchedArchetypes = archetypes.filter(a => a.matches(this.required, this.excluded));
    this._dirty = false;
  }

  invalidate() { this._dirty = true; }

  iterate(world, callback) {
    if (this._dirty) this._refresh(world._archetypes);
    for (const arch of this._matchedArchetypes) {
      arch.iterate((eid, comps) => callback(eid, comps));
    }
  }

  toArray(world) {
    if (this._dirty) this._refresh(world._archetypes);
    const results = [];
    for (const arch of this._matchedArchetypes) {
      arch.iterate((eid, comps) => results.push({ eid, comps }));
    }
    return results;
  }

  count(world) {
    if (this._dirty) this._refresh(world._archetypes);
    return this._matchedArchetypes.reduce((s, a) => s + a.entities.length, 0);
  }

  first(world) {
    if (this._dirty) this._refresh(world._archetypes);
    for (const arch of this._matchedArchetypes) {
      if (arch.entities.length > 0) {
        const eid = arch.entities[0];
        const comps = {};
        for (const [ct, arr] of arch.columns) comps[ct] = arr[0];
        return { eid, comps };
      }
    }
    return null;
  }
}

// ─── Event Bus ────────────────────────────────────────────────────────────────
export class EventBus {
  constructor() { this._handlers = new Map(); this._queue = []; }

  on(event, handler) {
    if (!this._handlers.has(event)) this._handlers.set(event, []);
    this._handlers.get(event).push(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    const hs = this._handlers.get(event);
    if (hs) {
      const i = hs.indexOf(handler);
      if (i >= 0) hs.splice(i, 1);
    }
  }

  once(event, handler) {
    const wrapper = (...args) => { handler(...args); this.off(event, wrapper); };
    return this.on(event, wrapper);
  }

  emit(event, data) {
    const hs = this._handlers.get(event);
    if (hs) for (const h of [...hs]) h(data, event);
  }

  defer(event, data) { this._queue.push({ event, data }); }

  flush() {
    const q = this._queue.splice(0);
    for (const { event, data } of q) this.emit(event, data);
  }

  clear() { this._handlers.clear(); this._queue.length = 0; }
}

// ─── Entity Builder ───────────────────────────────────────────────────────────
export class EntityBuilder {
  constructor(world) { this._world = world; this._comps = {}; this._tags = []; }
  add(compName, data = {}) { this._comps[compName] = data; return this; }
  tag(...tags) { this._tags.push(...tags); return this; }
  build() {
    const eid = this._world.createEntity(this._comps);
    for (const tag of this._tags) this._world.addTag(eid, tag);
    return eid;
  }
}

// ─── World ────────────────────────────────────────────────────────────────────
export class World {
  constructor(registry = globalRegistry) {
    this.registry = registry;
    this._entities = new Map();     // eid -> Set<compName>
    this._archetypes = [];          // Archetype[]
    this._archetypeMap = new Map(); // key -> Archetype
    this._entityArchetype = new Map(); // eid -> Archetype
    this._queries = [];
    this._systems = [];
    this._events = new EventBus();
    this._tags = new Map();         // eid -> Set<string>
    this._names = new Map();        // eid -> string
    this._tick = 0;
    this._alive = new Set();
    this._toDestroy = [];
  }

  // Entity management
  createEntity(components = {}) {
    const eid = nextEntityId();
    this._alive.add(eid);
    this._entities.set(eid, new Set(Object.keys(components)));
    this._tags.set(eid, new Set());
    const arch = this._getOrCreateArchetype(Object.keys(components));
    arch.addEntity(eid, components);
    this._entityArchetype.set(eid, arch);
    this._invalidateQueries();
    this._events.emit('entity:created', { eid, components });
    return eid;
  }

  destroyEntity(eid) {
    this._toDestroy.push(eid);
    return this;
  }

  _actuallyDestroy(eid) {
    if (!this._alive.has(eid)) return;
    const arch = this._entityArchetype.get(eid);
    if (arch) { arch.removeEntity(eid); this._entityArchetype.delete(eid); }
    this._entities.delete(eid);
    this._tags.delete(eid);
    this._names.delete(eid);
    this._alive.delete(eid);
    this._events.emit('entity:destroyed', { eid });
  }

  isAlive(eid) { return this._alive.has(eid); }

  // Component management
  addComponent(eid, compName, data = {}) {
    if (!this._alive.has(eid)) throw new Error(`Entity ${eid} is not alive`);
    const comps = this._entities.get(eid);
    if (comps.has(compName)) { this.setComponent(eid, compName, data); return this; }
    comps.add(compName);
    const oldArch = this._entityArchetype.get(eid);
    const oldComps = {};
    if (oldArch) {
      for (const ct of oldArch.componentTypes) oldComps[ct] = oldArch.getComponent(eid, ct);
      oldArch.removeEntity(eid);
    }
    oldComps[compName] = data;
    const newArch = this._getOrCreateArchetype([...comps]);
    newArch.addEntity(eid, oldComps);
    this._entityArchetype.set(eid, newArch);
    this._invalidateQueries();
    this._events.emit('component:added', { eid, compName, data });
    return this;
  }

  removeComponent(eid, compName) {
    const comps = this._entities.get(eid);
    if (!comps?.has(compName)) return this;
    const oldArch = this._entityArchetype.get(eid);
    const oldComps = {};
    if (oldArch) {
      for (const ct of oldArch.componentTypes) if (ct !== compName) oldComps[ct] = oldArch.getComponent(eid, ct);
      oldArch.removeEntity(eid);
    }
    comps.delete(compName);
    const newArch = this._getOrCreateArchetype([...comps]);
    newArch.addEntity(eid, oldComps);
    this._entityArchetype.set(eid, newArch);
    this._invalidateQueries();
    this._events.emit('component:removed', { eid, compName });
    return this;
  }

  getComponent(eid, compName) {
    const arch = this._entityArchetype.get(eid);
    return arch?.getComponent(eid, compName);
  }

  setComponent(eid, compName, data) {
    const arch = this._entityArchetype.get(eid);
    if (arch) arch.setComponent(eid, compName, data);
    return this;
  }

  hasComponent(eid, compName) {
    return this._entities.get(eid)?.has(compName) ?? false;
  }

  getComponents(eid) {
    const arch = this._entityArchetype.get(eid);
    if (!arch) return {};
    const out = {};
    for (const [ct, arr] of arch.columns) {
      const row = arch.entityIndex.get(eid);
      if (row !== undefined) out[ct] = arr[row];
    }
    return out;
  }

  // Tags
  addTag(eid, tag) { this._tags.get(eid)?.add(tag); return this; }
  removeTag(eid, tag) { this._tags.get(eid)?.delete(tag); return this; }
  hasTag(eid, tag) { return this._tags.get(eid)?.has(tag) ?? false; }
  getTags(eid) { return [...(this._tags.get(eid) ?? [])]; }
  getEntitiesWithTag(tag) { return [...this._alive].filter(e => this.hasTag(e, tag)); }

  // Names
  setName(eid, name) { this._names.set(eid, name); return this; }
  getName(eid) { return this._names.get(eid) ?? `Entity#${eid}`; }
  findByName(name) { for (const [eid, n] of this._names) if (n === name) return eid; return null; }

  // Archetypes
  _getOrCreateArchetype(compTypes) {
    const key = [...compTypes].sort().join(',');
    if (!this._archetypeMap.has(key)) {
      const arch = new Archetype(compTypes);
      this._archetypes.push(arch);
      this._archetypeMap.set(key, arch);
    }
    return this._archetypeMap.get(key);
  }

  // Queries
  createQuery(required = [], excluded = []) {
    const q = new Query(required, excluded);
    this._queries.push(q);
    return q;
  }

  _invalidateQueries() { for (const q of this._queries) q.invalidate(); }

  query(required, excluded) { return this.createQuery(required, excluded); }

  // Systems
  addSystem(system) {
    if (typeof system === 'function') system = { update: system, priority: 0 };
    system.priority = system.priority ?? 0;
    system.enabled = system.enabled ?? true;
    this._systems.push(system);
    this._systems.sort((a, b) => a.priority - b.priority);
    if (system.init) system.init(this);
    return this;
  }

  removeSystem(system) {
    const i = this._systems.indexOf(system);
    if (i >= 0) { this._systems.splice(i, 1); if (system.destroy) system.destroy(this); }
    return this;
  }

  // Update loop
  update(dt = 0) {
    this._tick++;
    this._events.flush();
    for (const sys of this._systems) {
      if (sys.enabled) sys.update(this, dt, this._tick);
    }
    // Process deferred destroys
    for (const eid of this._toDestroy) this._actuallyDestroy(eid);
    this._toDestroy.length = 0;
  }

  // Entity builder
  entity() { return new EntityBuilder(this); }

  // Bulk operations
  forEach(required, cb) {
    const q = new Query(required);
    q.iterate(this, cb);
  }

  map(required, cb) {
    const results = [];
    this.forEach(required, (eid, comps) => results.push(cb(eid, comps)));
    return results;
  }

  filter(required, pred) {
    const results = [];
    this.forEach(required, (eid, comps) => { if (pred(eid, comps)) results.push(eid); });
    return results;
  }

  count(required = []) {
    return new Query(required).count(this);
  }

  // Events
  on(event, handler) { return this._events.on(event, handler); }
  off(event, handler) { this._events.off(event, handler); }
  emit(event, data) { this._events.emit(event, data); }
  defer(event, data) { this._events.defer(event, data); }

  // Serialization
  serialize() {
    const entities = [];
    for (const eid of this._alive) {
      entities.push({
        id: eid,
        components: this.getComponents(eid),
        tags: this.getTags(eid),
        name: this._names.get(eid),
      });
    }
    return JSON.stringify({ tick: this._tick, entities });
  }

  deserialize(json) {
    const data = JSON.parse(json);
    this._tick = data.tick;
    for (const e of data.entities) {
      const eid = this.createEntity(e.components);
      if (e.tags) for (const t of e.tags) this.addTag(eid, t);
      if (e.name) this.setName(eid, e.name);
    }
    return this;
  }

  // Stats
  stats() {
    return {
      entities: this._alive.size,
      archetypes: this._archetypes.length,
      systems: this._systems.length,
      queries: this._queries.length,
      tick: this._tick,
    };
  }

  clear() {
    this._alive.clear(); this._entities.clear(); this._archetypes.length = 0;
    this._archetypeMap.clear(); this._entityArchetype.clear();
    this._tags.clear(); this._names.clear(); this._toDestroy.length = 0;
    this._invalidateQueries();
  }
}

// ─── Built-in components ──────────────────────────────────────────────────────
globalRegistry.register('Transform', { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 });
globalRegistry.register('Velocity', { vx: 0, vy: 0, vz: 0 });
globalRegistry.register('RigidBody', { mass: 1, friction: 0.1, restitution: 0.5, isStatic: false, isSensor: false });
globalRegistry.register('Collider', { shape: 'box', width: 1, height: 1, depth: 1, radius: 0.5, offsetX: 0, offsetY: 0, offsetZ: 0 });
globalRegistry.register('Sprite', { texture: null, width: 32, height: 32, anchorX: 0.5, anchorY: 0.5, tint: 0xffffff, alpha: 1, visible: true });
globalRegistry.register('Renderable', { mesh: null, material: null, visible: true, castShadow: true, receiveShadow: true });
globalRegistry.register('Camera', { fov: 60, near: 0.1, far: 1000, aspect: 1, zoom: 1, isActive: false });
globalRegistry.register('Light', { type: 'point', color: 0xffffff, intensity: 1, range: 10, castShadow: false });
globalRegistry.register('Audio', { src: null, volume: 1, loop: false, playing: false, spatial: false });
globalRegistry.register('Script', { scriptId: null, enabled: true, data: {} });
globalRegistry.register('Health', { current: 100, max: 100, regeneration: 0, invincible: false });
globalRegistry.register('Input', { actions: {}, axes: {} });
globalRegistry.register('Parent', { parentId: null });
globalRegistry.register('Children', { childIds: [] });
globalRegistry.register('Lifetime', { remaining: 0, total: 0 });
globalRegistry.register('Timer', { elapsed: 0, interval: 1, repeating: false, callback: null });
globalRegistry.register('AI', { state: 'idle', target: null, waypoints: [], speed: 1, detectionRange: 5 });
globalRegistry.register('Network', { id: null, owner: null, synced: false, dirty: false });
globalRegistry.register('Tag', { value: '' });

// ─── Built-in systems ─────────────────────────────────────────────────────────
export class MovementSystem {
  constructor() { this.priority = 10; }
  init(world) { this.query = world.createQuery(['Transform', 'Velocity']); }
  update(world, dt) {
    this.query.iterate(world, (eid, { Transform: t, Velocity: v }) => {
      t.x += v.vx * dt;
      t.y += v.vy * dt;
      t.z += v.vz * dt;
      world.setComponent(eid, 'Transform', t);
    });
  }
}

export class LifetimeSystem {
  constructor() { this.priority = 5; }
  init(world) { this.query = world.createQuery(['Lifetime']); }
  update(world, dt) {
    this.query.iterate(world, (eid, { Lifetime: lt }) => {
      lt.remaining -= dt;
      if (lt.remaining <= 0) world.destroyEntity(eid);
      else world.setComponent(eid, 'Lifetime', lt);
    });
  }
}

export class TimerSystem {
  constructor() { this.priority = 5; }
  init(world) { this.query = world.createQuery(['Timer']); }
  update(world, dt) {
    this.query.iterate(world, (eid, { Timer: t }) => {
      t.elapsed += dt;
      if (t.elapsed >= t.interval) {
        if (typeof t.callback === 'function') t.callback(eid, world);
        if (t.repeating) t.elapsed = 0;
        else world.removeComponent(eid, 'Timer');
      } else world.setComponent(eid, 'Timer', t);
    });
  }
}

export class HealthSystem {
  constructor() { this.priority = 15; }
  init(world) { this.query = world.createQuery(['Health']); }
  update(world, dt) {
    this.query.iterate(world, (eid, { Health: h }) => {
      if (h.regeneration > 0 && h.current < h.max) {
        h.current = Math.min(h.max, h.current + h.regeneration * dt);
        world.setComponent(eid, 'Health', h);
      }
      if (h.current <= 0 && !h.invincible) world.emit('entity:died', { eid });
    });
  }
}

export class ParentChildSystem {
  constructor() { this.priority = 1; }
  init(world) { this.query = world.createQuery(['Transform', 'Parent']); }
  update(world, dt) {
    this.query.iterate(world, (eid, { Transform: childT, Parent: p }) => {
      const parentT = world.getComponent(p.parentId, 'Transform');
      if (!parentT) return;
      childT.x += parentT.x;
      childT.y += parentT.y;
      childT.z += parentT.z;
      world.setComponent(eid, 'Transform', childT);
    });
  }
}

export class AABBCollisionSystem {
  constructor() { this.priority = 20; }
  init(world) { this.query = world.createQuery(['Transform', 'Collider']); }
  update(world) {
    const entities = this.query.toArray(world);
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const a = entities[i], b = entities[j];
        const at = a.comps.Transform, ac = a.comps.Collider;
        const bt = b.comps.Transform, bc = b.comps.Collider;
        if (this._overlaps(at, ac, bt, bc)) {
          world.emit('collision', { a: a.eid, b: b.eid });
        }
      }
    }
  }
  _overlaps(at, ac, bt, bc) {
    const ahw = (ac.width ?? ac.radius * 2) / 2;
    const ahh = (ac.height ?? ac.radius * 2) / 2;
    const bhw = (bc.width ?? bc.radius * 2) / 2;
    const bhh = (bc.height ?? bc.radius * 2) / 2;
    return Math.abs(at.x - bt.x) < ahw + bhw && Math.abs(at.y - bt.y) < ahh + bhh;
  }
}

export class SimpleAISystem {
  constructor() { this.priority = 25; }
  init(world) { this.query = world.createQuery(['Transform', 'AI']); }
  update(world, dt) {
    this.query.iterate(world, (eid, { Transform: t, AI: ai }) => {
      if (ai.state === 'idle') return;
      if (ai.state === 'chase' && ai.target !== null) {
        const tt = world.getComponent(ai.target, 'Transform');
        if (!tt) return;
        const dx = tt.x - t.x, dy = tt.y - t.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0.01) {
          t.x += (dx / dist) * ai.speed * dt;
          t.y += (dy / dist) * ai.speed * dt;
          world.setComponent(eid, 'Transform', t);
        }
      }
    });
  }
}

// ─── World Factory ────────────────────────────────────────────────────────────
export function createWorld(opts = {}) {
  const w = new World(opts.registry ?? globalRegistry);
  if (opts.systems !== false) {
    w.addSystem(new MovementSystem());
    w.addSystem(new LifetimeSystem());
    w.addSystem(new TimerSystem());
    w.addSystem(new HealthSystem());
    w.addSystem(new AABBCollisionSystem());
    w.addSystem(new SimpleAISystem());
  }
  return w;
}

// ─── Prefab system ────────────────────────────────────────────────────────────
export class PrefabRegistry {
  constructor() { this._prefabs = new Map(); }
  register(name, definition) { this._prefabs.set(name, definition); return this; }
  has(name) { return this._prefabs.has(name); }
  get(name) { return this._prefabs.get(name); }
  spawn(world, name, overrides = {}) {
    const def = this._prefabs.get(name);
    if (!def) throw new Error(`Prefab '${name}' not found`);
    const components = {};
    for (const [k, v] of Object.entries(def.components ?? {})) {
      components[k] = { ...v, ...(overrides[k] ?? {}) };
    }
    const eid = world.createEntity(components);
    if (def.tags) for (const t of def.tags) world.addTag(eid, t);
    if (def.name) world.setName(eid, def.name + '_' + eid);
    return eid;
  }
  list() { return [...this._prefabs.keys()]; }
}

export const globalPrefabs = new PrefabRegistry();
globalPrefabs.register('Player', {
  name: 'Player',
  tags: ['player', 'controllable'],
  components: {
    Transform: { x: 0, y: 0, z: 0 },
    Velocity: { vx: 0, vy: 0, vz: 0 },
    Health: { current: 100, max: 100 },
    Sprite: { width: 32, height: 48, tint: 0x00ff00 },
    Collider: { shape: 'box', width: 30, height: 46 },
    Input: { actions: {}, axes: {} },
  }
});
globalPrefabs.register('Enemy', {
  name: 'Enemy',
  tags: ['enemy', 'hostile'],
  components: {
    Transform: { x: 0, y: 0, z: 0 },
    Velocity: { vx: 0, vy: 0, vz: 0 },
    Health: { current: 30, max: 30 },
    Sprite: { width: 28, height: 40, tint: 0xff0000 },
    Collider: { shape: 'box', width: 26, height: 38 },
    AI: { state: 'idle', speed: 2, detectionRange: 8 },
  }
});
globalPrefabs.register('Bullet', {
  name: 'Bullet',
  tags: ['projectile'],
  components: {
    Transform: { x: 0, y: 0, z: 0 },
    Velocity: { vx: 0, vy: 0, vz: 0 },
    Sprite: { width: 8, height: 8, tint: 0xffff00 },
    Collider: { shape: 'circle', radius: 4 },
    Lifetime: { remaining: 3, total: 3 },
  }
});
globalPrefabs.register('Particle', {
  name: 'Particle',
  tags: ['fx'],
  components: {
    Transform: { x: 0, y: 0, z: 0 },
    Velocity: { vx: 0, vy: 0, vz: 0 },
    Sprite: { width: 4, height: 4 },
    Lifetime: { remaining: 1, total: 1 },
  }
});
globalPrefabs.register('Camera3D', {
  name: 'Camera3D',
  tags: ['camera'],
  components: {
    Transform: { x: 0, y: 5, z: -10 },
    Camera: { fov: 75, near: 0.1, far: 1000, isActive: true },
  }
});

// ─── Scene Graph ──────────────────────────────────────────────────────────────
export class SceneGraph {
  constructor(world) {
    this.world = world;
    this._root = null;
    this._roots = new Set();
  }

  attach(childId, parentId) {
    this.world.addComponent(childId, 'Parent', { parentId });
    const children = this.world.getComponent(parentId, 'Children') ?? { childIds: [] };
    children.childIds.push(childId);
    this.world.setComponent(parentId, 'Children', children);
    this._roots.delete(childId);
    return this;
  }

  detach(childId) {
    const parentComp = this.world.getComponent(childId, 'Parent');
    if (!parentComp) return this;
    const parentId = parentComp.parentId;
    this.world.removeComponent(childId, 'Parent');
    const children = this.world.getComponent(parentId, 'Children');
    if (children) {
      children.childIds = children.childIds.filter(id => id !== childId);
      this.world.setComponent(parentId, 'Children', children);
    }
    this._roots.add(childId);
    return this;
  }

  addRoot(eid) { this._roots.add(eid); return this; }

  getParent(eid) { return this.world.getComponent(eid, 'Parent')?.parentId ?? null; }
  getChildren(eid) { return this.world.getComponent(eid, 'Children')?.childIds ?? []; }

  traverse(eid, callback, depth = 0) {
    callback(eid, depth);
    for (const child of this.getChildren(eid)) this.traverse(child, callback, depth + 1);
  }

  getAncestors(eid) {
    const ancestors = [];
    let cur = this.getParent(eid);
    while (cur !== null) { ancestors.push(cur); cur = this.getParent(cur); }
    return ancestors;
  }

  getDescendants(eid) {
    const desc = [];
    const visit = id => { for (const c of this.getChildren(id)) { desc.push(c); visit(c); } };
    visit(eid);
    return desc;
  }
}

// ─── Object Pool ──────────────────────────────────────────────────────────────
export class EntityPool {
  constructor(world, prefabName, size = 50) {
    this.world = world;
    this.prefabName = prefabName;
    this._pool = [];
    this._active = new Set();
    for (let i = 0; i < size; i++) this._pool.push(this._create());
  }

  _create() {
    const eid = globalPrefabs.spawn(this.world, this.prefabName);
    this.world.addTag(eid, '_pooled');
    this.world.addTag(eid, '_inactive');
    return eid;
  }

  acquire(overrides = {}) {
    let eid = this._pool.pop();
    if (!eid) eid = this._create();
    this._active.add(eid);
    this.world.removeTag(eid, '_inactive');
    for (const [comp, data] of Object.entries(overrides)) {
      this.world.setComponent(eid, comp, { ...this.world.getComponent(eid, comp), ...data });
    }
    return eid;
  }

  release(eid) {
    if (!this._active.has(eid)) return;
    this._active.delete(eid);
    this.world.addTag(eid, '_inactive');
    this._pool.push(eid);
  }

  get size() { return this._pool.length + this._active.size; }
  get activeCount() { return this._active.size; }
  get freeCount() { return this._pool.length; }
}

export { globalRegistry as registry };
