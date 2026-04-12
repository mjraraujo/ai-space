/**
 * event-sourcing.js — Full event sourcing + CQRS framework.
 * Events, aggregates, event store, projections, sagas, snapshots, process manager.
 */

// ─── Base Event ───────────────────────────────────────────────────────────────
let _eventSeq = 0;

export class DomainEvent {
  constructor(aggregateId, type, payload = {}) {
    this.id = `evt-${Date.now()}-${++_eventSeq}`;
    this.aggregateId = aggregateId;
    this.type = type;
    this.payload = payload;
    this.timestamp = new Date().toISOString();
    this.version = 0;
    this.metadata = {};
  }

  withMetadata(meta) { this.metadata = { ...this.metadata, ...meta }; return this; }
  toString() { return `${this.type}[${this.aggregateId}]@v${this.version}`; }
  toJSON() { return { id: this.id, aggregateId: this.aggregateId, type: this.type, payload: this.payload, timestamp: this.timestamp, version: this.version, metadata: this.metadata }; }
}

export function event(type, payload) {
  return (aggregateId) => new DomainEvent(aggregateId, type, payload);
}

// ─── Event Store ──────────────────────────────────────────────────────────────
export class EventStore {
  constructor() {
    this._streams = new Map();   // aggregateId -> DomainEvent[]
    this._globalLog = [];
    this._subscribers = new Map(); // eventType -> Set<handler>
    this._globalSubscribers = new Set();
    this._snapshots = new Map();  // aggregateId -> {version, state}
    this._projections = new Map(); // name -> Projection
  }

  async append(aggregateId, events, expectedVersion = -1) {
    const stream = this._streams.get(aggregateId) ?? [];
    const currentVersion = stream.length - 1;
    if (expectedVersion >= 0 && currentVersion !== expectedVersion) {
      throw new Error(`Concurrency conflict: expected v${expectedVersion}, got v${currentVersion}`);
    }
    const versioned = events.map((e, i) => {
      e.aggregateId = aggregateId;
      e.version = stream.length + i;
      return e;
    });
    this._streams.set(aggregateId, [...stream, ...versioned]);
    this._globalLog.push(...versioned);
    await this._publish(versioned);
    return versioned;
  }

  async load(aggregateId, fromVersion = 0, toVersion = Infinity) {
    const stream = this._streams.get(aggregateId) ?? [];
    return stream.filter(e => e.version >= fromVersion && e.version <= toVersion);
  }

  async loadAll(fromPosition = 0, limit = 1000) {
    return this._globalLog.slice(fromPosition, fromPosition + limit);
  }

  async getVersion(aggregateId) {
    const stream = this._streams.get(aggregateId);
    return stream ? stream.length - 1 : -1;
  }

  subscribe(eventType, handler) {
    if (!this._subscribers.has(eventType)) this._subscribers.set(eventType, new Set());
    this._subscribers.get(eventType).add(handler);
    return () => this._subscribers.get(eventType)?.delete(handler);
  }

  subscribeAll(handler) {
    this._globalSubscribers.add(handler);
    return () => this._globalSubscribers.delete(handler);
  }

  async _publish(events) {
    for (const e of events) {
      const handlers = this._subscribers.get(e.type) ?? new Set();
      for (const h of handlers) await h(e);
      for (const h of this._globalSubscribers) await h(e);
      // Apply to projections
      for (const proj of this._projections.values()) await proj._apply(e);
    }
  }

  saveSnapshot(aggregateId, version, state) {
    this._snapshots.set(aggregateId, { version, state: JSON.parse(JSON.stringify(state)) });
  }

  getSnapshot(aggregateId) { return this._snapshots.get(aggregateId); }

  registerProjection(projection) {
    this._projections.set(projection.name, projection);
    return this;
  }

  getProjection(name) { return this._projections.get(name); }

  stats() {
    return {
      streams: this._streams.size,
      events: this._globalLog.length,
      snapshots: this._snapshots.size,
      projections: this._projections.size,
    };
  }

  clear() { this._streams.clear(); this._globalLog.length = 0; this._snapshots.clear(); }

  async replay(fromPosition = 0) {
    const events = await this.loadAll(fromPosition);
    for (const proj of this._projections.values()) {
      proj.reset();
      for (const e of events) await proj._apply(e);
    }
  }
}

// ─── Aggregate ────────────────────────────────────────────────────────────────
export class Aggregate {
  constructor(id) {
    this.id = id;
    this._version = -1;
    this._pendingEvents = [];
    this._handlers = {};
  }

  static create(id, ...args) {
    const instance = new this(id);
    instance._init(...args);
    return instance;
  }

  _init() {}

  _apply(event, fromHistory = false) {
    const handler = this._handlers[event.type];
    if (handler) handler.call(this, event);
    this._version = event.version;
    return this;
  }

  _raise(eventType, payload = {}) {
    const e = new DomainEvent(this.id, eventType, payload);
    e.version = this._version + 1 + this._pendingEvents.length;
    this._pendingEvents.push(e);
    this._apply(e, false);
    return e;
  }

  on(eventType, handler) { this._handlers[eventType] = handler; return this; }

  get version() { return this._version; }
  get pendingEvents() { return [...this._pendingEvents]; }

  clearEvents() { this._pendingEvents.length = 0; }

  static reconstitute(id, events) {
    const instance = new this(id);
    for (const e of events) instance._apply(e, true);
    return instance;
  }

  takeSnapshot() { return { version: this._version, state: this.toJSON?.() }; }

  toJSON() { return { id: this.id, version: this._version }; }
}

// ─── Repository ───────────────────────────────────────────────────────────────
export class Repository {
  constructor(AggregateClass, eventStore, snapshotFrequency = 50) {
    this.AggregateClass = AggregateClass;
    this.eventStore = eventStore;
    this.snapshotFrequency = snapshotFrequency;
  }

  async save(aggregate) {
    const events = aggregate.pendingEvents;
    if (!events.length) return;
    await this.eventStore.append(aggregate.id, events, aggregate.version - events.length);
    aggregate.clearEvents();
    // Snapshot if needed
    if (this.snapshotFrequency > 0 && aggregate.version % this.snapshotFrequency === 0) {
      this.eventStore.saveSnapshot(aggregate.id, aggregate.version, aggregate.toJSON());
    }
  }

  async load(id) {
    const snapshot = this.eventStore.getSnapshot(id);
    let fromVersion = 0;
    let instance;
    if (snapshot) {
      instance = new this.AggregateClass(id);
      instance._version = snapshot.version;
      instance._restoreSnapshot?.(snapshot.state);
      fromVersion = snapshot.version + 1;
    } else {
      instance = new this.AggregateClass(id);
    }
    const events = await this.eventStore.load(id, fromVersion);
    for (const e of events) instance._apply(e, true);
    return instance;
  }

  async exists(id) { return (await this.eventStore.getVersion(id)) >= 0; }
}

// ─── Command ──────────────────────────────────────────────────────────────────
export class Command {
  constructor(type, payload = {}) {
    this.id = `cmd-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.type = type;
    this.payload = payload;
    this.timestamp = new Date().toISOString();
    this.metadata = {};
  }
  withMetadata(m) { this.metadata = { ...this.metadata, ...m }; return this; }
}

export function command(type, payload) { return new Command(type, payload); }

// ─── Command Bus ──────────────────────────────────────────────────────────────
export class CommandBus {
  constructor() {
    this._handlers = new Map();
    this._middleware = [];
    this._beforeHooks = [];
    this._afterHooks = [];
  }

  register(commandType, handler) {
    this._handlers.set(commandType, handler);
    return this;
  }

  use(middleware) { this._middleware.push(middleware); return this; }
  before(hook) { this._beforeHooks.push(hook); return this; }
  after(hook) { this._afterHooks.push(hook); return this; }

  async dispatch(cmd) {
    for (const hook of this._beforeHooks) await hook(cmd);
    const handler = this._handlers.get(cmd.type);
    if (!handler) throw new Error(`No handler for command: ${cmd.type}`);

    let i = 0;
    const next = async () => {
      if (i < this._middleware.length) { const mw = this._middleware[i++]; return mw(cmd, next); }
      return handler(cmd);
    };
    const result = await next();
    for (const hook of this._afterHooks) await hook(cmd, result);
    return result;
  }
}

// ─── Query Bus ────────────────────────────────────────────────────────────────
export class QueryBus {
  constructor() { this._handlers = new Map(); this._cache = new Map(); this._cacheTime = new Map(); }

  register(queryType, handler) { this._handlers.set(queryType, handler); return this; }

  async execute(queryType, params = {}, opts = {}) {
    const cacheKey = opts.cache ? `${queryType}:${JSON.stringify(params)}` : null;
    if (cacheKey) {
      const cached = this._cache.get(cacheKey);
      const ts = this._cacheTime.get(cacheKey);
      if (cached && (!opts.cacheTtl || Date.now() - ts < opts.cacheTtl)) return cached;
    }
    const handler = this._handlers.get(queryType);
    if (!handler) throw new Error(`No handler for query: ${queryType}`);
    const result = await handler(params);
    if (cacheKey) { this._cache.set(cacheKey, result); this._cacheTime.set(cacheKey, Date.now()); }
    return result;
  }

  invalidate(queryType) {
    for (const key of this._cache.keys()) if (key.startsWith(queryType + ':')) this._cache.delete(key);
  }

  clearCache() { this._cache.clear(); this._cacheTime.clear(); }
}

// ─── Projection ───────────────────────────────────────────────────────────────
export class Projection {
  constructor(name) {
    this.name = name;
    this._state = {};
    this._handlers = {};
    this._position = 0;
  }

  on(eventType, handler) { this._handlers[eventType] = handler; return this; }

  async _apply(event) {
    const handler = this._handlers[event.type];
    if (handler) { await handler(this._state, event); this._position = event.version; }
  }

  get state() { return { ...this._state }; }
  get position() { return this._position; }

  reset() { this._state = {}; this._position = 0; }
}

export class ReadModel {
  constructor(name) {
    this.name = name;
    this._store = new Map();
  }

  set(id, data) { this._store.set(id, { ...data, _id: id }); return this; }
  get(id) { return this._store.get(id); }
  delete(id) { return this._store.delete(id); }
  has(id) { return this._store.has(id); }
  all() { return [...this._store.values()]; }
  filter(pred) { return this.all().filter(pred); }
  find(pred) { return this.all().find(pred); }
  count(pred) { return pred ? this.filter(pred).length : this._store.size; }
  clear() { this._store.clear(); return this; }
  patch(id, partial) {
    const existing = this._store.get(id) ?? {};
    this._store.set(id, { ...existing, ...partial, _id: id });
    return this;
  }
}

// ─── Saga ─────────────────────────────────────────────────────────────────────
export class Saga {
  constructor(name) {
    this.name = name;
    this._handlers = {};
    this._state = {};
    this._commandBus = null;
    this._active = new Map(); // sagaId -> state
  }

  setCommandBus(bus) { this._commandBus = bus; return this; }

  on(eventType, handler) { this._handlers[eventType] = handler; return this; }

  async handle(event) {
    const handler = this._handlers[event.type];
    if (!handler) return;
    const sagaCtx = { state: this._state, dispatch: cmd => this._commandBus?.dispatch(cmd), event };
    await handler.call(sagaCtx, event);
  }

  isComplete() { return false; }
}

// ─── Process Manager ──────────────────────────────────────────────────────────
export class ProcessManager {
  constructor(name) {
    this.name = name;
    this._processes = new Map();
    this._handlers = {};
    this._commandBus = null;
  }

  setCommandBus(bus) { this._commandBus = bus; return this; }

  on(eventType, handler) { this._handlers[eventType] = handler; return this; }

  async handle(event) {
    const handler = this._handlers[event.type];
    if (!handler) return;
    const processId = event.payload.processId ?? event.aggregateId;
    const process = this._processes.get(processId) ?? { id: processId, state: 'started', data: {} };
    const ctx = { process, dispatch: cmd => this._commandBus?.dispatch(cmd), complete: () => { process.state = 'completed'; this._processes.delete(processId); } };
    await handler.call(ctx, event, process);
    if (process.state !== 'completed') this._processes.set(processId, process);
  }

  getProcess(id) { return this._processes.get(id); }
  activeProcesses() { return [...this._processes.values()]; }
}

// ─── Event sourced aggregate examples ─────────────────────────────────────────
export class BankAccount extends Aggregate {
  constructor(id) {
    super(id);
    this.balance = 0;
    this.owner = null;
    this.status = 'closed';
    this.transactions = [];
    this._handlers = {
      'AccountOpened': e => { this.owner = e.payload.owner; this.balance = e.payload.initialBalance ?? 0; this.status = 'open'; },
      'MoneyDeposited': e => { this.balance += e.payload.amount; this.transactions.push({ type: 'deposit', ...e.payload }); },
      'MoneyWithdrawn': e => { this.balance -= e.payload.amount; this.transactions.push({ type: 'withdrawal', ...e.payload }); },
      'AccountClosed': e => { this.status = 'closed'; },
      'OwnerChanged': e => { this.owner = e.payload.newOwner; },
    };
  }

  static open(id, owner, initialBalance = 0) {
    const account = new BankAccount(id);
    account._raise('AccountOpened', { owner, initialBalance });
    return account;
  }

  deposit(amount) {
    if (amount <= 0) throw new Error('Amount must be positive');
    if (this.status !== 'open') throw new Error('Account is closed');
    this._raise('MoneyDeposited', { amount, balance: this.balance + amount });
  }

  withdraw(amount) {
    if (amount <= 0) throw new Error('Amount must be positive');
    if (this.status !== 'open') throw new Error('Account is closed');
    if (this.balance < amount) throw new Error('Insufficient funds');
    this._raise('MoneyWithdrawn', { amount, balance: this.balance - amount });
  }

  close() {
    if (this.status === 'closed') throw new Error('Account already closed');
    this._raise('AccountClosed', {});
  }

  changeOwner(newOwner) {
    if (!newOwner) throw new Error('Owner required');
    this._raise('OwnerChanged', { previousOwner: this.owner, newOwner });
  }

  toJSON() {
    return { id: this.id, owner: this.owner, balance: this.balance, status: this.status, version: this.version, transactionCount: this.transactions.length };
  }
}

// ─── Outbox pattern ───────────────────────────────────────────────────────────
export class Outbox {
  constructor() { this._messages = []; this._processed = new Set(); }

  add(message) {
    const m = { ...message, id: `out-${Date.now()}-${Math.random().toString(36).slice(2)}`, createdAt: Date.now(), status: 'pending' };
    this._messages.push(m);
    return m;
  }

  pending() { return this._messages.filter(m => m.status === 'pending'); }

  markProcessed(id) {
    const m = this._messages.find(m => m.id === id);
    if (m) { m.status = 'processed'; m.processedAt = Date.now(); this._processed.add(id); }
  }

  markFailed(id, error) {
    const m = this._messages.find(m => m.id === id);
    if (m) { m.status = 'failed'; m.error = error; m.failedAt = Date.now(); }
  }

  prune(maxAge = 86400000) {
    const cutoff = Date.now() - maxAge;
    this._messages = this._messages.filter(m => m.status === 'pending' || (m.processedAt ?? m.failedAt ?? 0) > cutoff);
  }

  stats() {
    return { total: this._messages.length, pending: this.pending().length, processed: this._messages.filter(m=>m.status==='processed').length, failed: this._messages.filter(m=>m.status==='failed').length };
  }
}

// ─── CQRS setup helper ────────────────────────────────────────────────────────
export function createCQRS(options = {}) {
  const eventStore = options.eventStore ?? new EventStore();
  const commandBus = new CommandBus();
  const queryBus = new QueryBus();

  return {
    eventStore,
    commandBus,
    queryBus,
    repository: (AggregateClass, snapshotFreq) => new Repository(AggregateClass, eventStore, snapshotFreq),
    projection: (name) => { const p = new Projection(name); eventStore.registerProjection(p); return p; },
    readModel: (name) => new ReadModel(name),
    saga: (name) => { const s = new Saga(name); s.setCommandBus(commandBus); return s; },
    processManager: (name) => { const pm = new ProcessManager(name); pm.setCommandBus(commandBus); return pm; },
  };
}

export default {
  DomainEvent, EventStore, Aggregate, Repository, Command, CommandBus, QueryBus,
  Projection, ReadModel, Saga, ProcessManager, BankAccount, Outbox,
  event, command, createCQRS,
};
