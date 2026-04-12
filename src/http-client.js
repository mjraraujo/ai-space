/**
 * http-client.js — Full-featured HTTP client with interceptors, retry, caching,
 * streaming, websockets, SSE, rate limiting, and request deduplication.
 */

// ─── Utilities ────────────────────────────────────────────────────────────────
function isAbsoluteUrl(url) { return /^https?:\/\//.test(url); }
function joinUrl(base, path) {
  if (!base) return path;
  if (isAbsoluteUrl(path)) return path;
  return base.replace(/\/$/, '') + '/' + path.replace(/^\//, '');
}
function isPlainObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function mergeHeaders(a = {}, b = {}) {
  const out = {};
  const normalize = h => {
    if (h instanceof Headers) { for (const [k, v] of h) out[k.toLowerCase()] = v; }
    else { for (const [k, v] of Object.entries(h)) out[k.toLowerCase()] = v; }
  };
  normalize(a); normalize(b);
  return out;
}
function pick(obj, keys) { const out = {}; for (const k of keys) if (k in obj) out[k] = obj[k]; return out; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── HttpError ────────────────────────────────────────────────────────────────
export class HttpError extends Error {
  constructor(message, response, request) {
    super(message);
    this.name = 'HttpError';
    this.response = response;
    this.request = request;
    this.status = response?.status;
    this.statusText = response?.statusText;
  }
  get isClientError() { return this.status >= 400 && this.status < 500; }
  get isServerError() { return this.status >= 500; }
  get isUnauthorized() { return this.status === 401; }
  get isForbidden() { return this.status === 403; }
  get isNotFound() { return this.status === 404; }
  get isTimeout() { return this.status === 408 || this.name === 'TimeoutError'; }
  get isNetworkError() { return !this.response; }
}

export class TimeoutError extends HttpError {
  constructor(request) { super('Request timed out', null, request); this.name = 'TimeoutError'; }
}

export class AbortError extends HttpError {
  constructor(request) { super('Request was aborted', null, request); this.name = 'AbortError'; }
}

// ─── Request ──────────────────────────────────────────────────────────────────
export class Request {
  constructor(config) {
    this.url = config.url;
    this.method = (config.method ?? 'GET').toUpperCase();
    this.headers = mergeHeaders(config.headers);
    this.body = config.body ?? null;
    this.params = config.params ?? {};
    this.timeout = config.timeout ?? 30000;
    this.retries = config.retries ?? 0;
    this.retryDelay = config.retryDelay ?? 1000;
    this.retryOn = config.retryOn ?? [500, 502, 503, 504];
    this.cache = config.cache ?? 'no-cache';
    this.mode = config.mode ?? 'cors';
    this.credentials = config.credentials ?? 'same-origin';
    this.responseType = config.responseType ?? 'json';
    this.onUploadProgress = config.onUploadProgress ?? null;
    this.onDownloadProgress = config.onDownloadProgress ?? null;
    this.signal = config.signal ?? null;
    this.metadata = config.metadata ?? {};
    this._controller = new AbortController();
  }

  get fullUrl() {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(this.params)) {
      if (Array.isArray(v)) v.forEach(val => params.append(k, val));
      else if (v !== null && v !== undefined) params.set(k, String(v));
    }
    const qs = params.toString();
    return qs ? this.url + (this.url.includes('?') ? '&' : '?') + qs : this.url;
  }

  abort() { this._controller.abort(); }

  toFetchOptions() {
    const opts = {
      method: this.method,
      headers: this.headers,
      cache: this.cache,
      mode: this.mode,
      credentials: this.credentials,
      signal: this._controller.signal,
    };
    if (this.body !== null) {
      if (isPlainObject(this.body) || Array.isArray(this.body)) {
        opts.body = JSON.stringify(this.body);
        if (!this.headers['content-type']) opts.headers = { ...opts.headers, 'content-type': 'application/json' };
      } else opts.body = this.body;
    }
    return opts;
  }
}

// ─── Response ─────────────────────────────────────────────────────────────────
export class Response {
  constructor(raw, request, data) {
    this._raw = raw;
    this.request = request;
    this.status = raw?.status ?? 0;
    this.statusText = raw?.statusText ?? '';
    this.headers = {};
    if (raw?.headers) { for (const [k, v] of raw.headers) this.headers[k.toLowerCase()] = v; }
    this.data = data;
    this.ok = raw?.ok ?? false;
    this.redirected = raw?.redirected ?? false;
    this.url = raw?.url ?? request.fullUrl;
    this.timing = null;
  }

  header(name) { return this.headers[name.toLowerCase()]; }
  get contentType() { return this.header('content-type'); }
  get isJSON() { return this.contentType?.includes('application/json'); }
  get isText() { return this.contentType?.includes('text/'); }
  clone() { return new Response(this._raw, this.request, this.data); }
}

// ─── Cache ────────────────────────────────────────────────────────────────────
export class ResponseCache {
  constructor(options = {}) {
    this._store = new Map();
    this._maxSize = options.maxSize ?? 100;
    this._ttl = options.ttl ?? 60000;
    this._cleanupInterval = setInterval(() => this._cleanup(), 30000);
  }

  _key(request) { return request.method + ':' + request.fullUrl + ':' + JSON.stringify(request.headers); }

  get(request) {
    const key = this._key(request);
    const entry = this._store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { this._store.delete(key); return null; }
    return entry.response;
  }

  set(request, response, ttl) {
    if (this._store.size >= this._maxSize) {
      const oldest = [...this._store.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt)[0];
      if (oldest) this._store.delete(oldest[0]);
    }
    this._store.set(this._key(request), {
      response,
      createdAt: Date.now(),
      expiresAt: Date.now() + (ttl ?? this._ttl),
    });
  }

  delete(request) { this._store.delete(this._key(request)); }
  clear() { this._store.clear(); }
  size() { return this._store.size; }

  _cleanup() {
    const now = Date.now();
    for (const [k, v] of this._store) if (now > v.expiresAt) this._store.delete(k);
  }

  destroy() { clearInterval(this._cleanupInterval); this._store.clear(); }
}

// ─── Rate Limiter ─────────────────────────────────────────────────────────────
export class RateLimiter {
  constructor(limit = 10, windowMs = 1000) {
    this._limit = limit;
    this._windowMs = windowMs;
    this._queue = [];
    this._count = 0;
    this._resetAt = Date.now() + windowMs;
  }

  async acquire() {
    const now = Date.now();
    if (now >= this._resetAt) { this._count = 0; this._resetAt = now + this._windowMs; }
    if (this._count < this._limit) { this._count++; return; }
    const wait = this._resetAt - Date.now();
    await sleep(wait);
    this._count = 0; this._resetAt = Date.now() + this._windowMs;
    this._count++;
  }
}

// ─── Request deduplication ────────────────────────────────────────────────────
export class RequestDeduplicator {
  constructor() { this._pending = new Map(); }

  key(request) { return request.method + ':' + request.fullUrl; }

  has(request) { return this._pending.has(this.key(request)) && request.method === 'GET'; }

  get(request) { return this._pending.get(this.key(request)); }

  set(request, promise) {
    const key = this.key(request);
    const p = promise.finally(() => this._pending.delete(key));
    this._pending.set(key, p);
    return p;
  }
}

// ─── Interceptor Manager ──────────────────────────────────────────────────────
export class InterceptorManager {
  constructor() { this._handlers = []; }

  use(fulfilled, rejected) {
    this._handlers.push({ fulfilled, rejected });
    return this._handlers.length - 1;
  }

  eject(id) { if (this._handlers[id]) this._handlers[id] = null; }

  forEach(fn) { this._handlers.forEach(h => h && fn(h)); }

  [Symbol.iterator]() { return this._handlers.filter(Boolean)[Symbol.iterator](); }
}

// ─── HTTP Client ──────────────────────────────────────────────────────────────
export class HttpClient {
  constructor(defaults = {}) {
    this._defaults = {
      baseUrl: '',
      timeout: 30000,
      headers: { 'accept': 'application/json' },
      retries: 0,
      retryDelay: 1000,
      retryOn: [500, 502, 503, 504],
      responseType: 'json',
      ...defaults,
    };
    this._requestInterceptors = new InterceptorManager();
    this._responseInterceptors = new InterceptorManager();
    this._cache = defaults.cache instanceof ResponseCache ? defaults.cache : null;
    this._rateLimiter = defaults.rateLimiter instanceof RateLimiter ? defaults.rateLimiter : null;
    this._dedup = new RequestDeduplicator();
    this._pendingRequests = new Set();
    this._stats = { total: 0, success: 0, error: 0, cached: 0, retried: 0 };
  }

  create(config = {}) {
    return new HttpClient({ ...this._defaults, ...config });
  }

  useRequest(fulfilled, rejected) { return this._requestInterceptors.use(fulfilled, rejected); }
  useResponse(fulfilled, rejected) { return this._responseInterceptors.use(fulfilled, rejected); }
  ejectRequest(id) { this._requestInterceptors.eject(id); }
  ejectResponse(id) { this._responseInterceptors.eject(id); }

  async request(config) {
    this._stats.total++;
    let req = new Request({
      ...this._defaults,
      ...config,
      url: joinUrl(this._defaults.baseUrl, config.url),
      headers: mergeHeaders(this._defaults.headers, config.headers),
    });

    // Apply request interceptors
    for (const h of this._requestInterceptors) {
      try { req = (await h.fulfilled?.(req)) ?? req; }
      catch (e) { if (h.rejected) req = await h.rejected(e); else throw e; }
    }

    // Check cache
    if (this._cache && req.method === 'GET') {
      const cached = this._cache.get(req);
      if (cached) { this._stats.cached++; return cached; }
    }

    // Deduplication
    if (this._dedup.has(req)) return this._dedup.get(req);

    const execute = async () => {
      if (this._rateLimiter) await this._rateLimiter.acquire();
      this._pendingRequests.add(req);
      const startTime = Date.now();
      let attempt = 0;
      const maxAttempts = 1 + (req.retries ?? 0);

      while (attempt < maxAttempts) {
        attempt++;
        try {
          const raw = await this._fetchWithTimeout(req);
          const data = await this._parseResponse(raw, req);
          let response = new Response(raw, req, data);
          response.timing = { total: Date.now() - startTime, attempt };

          // Apply response interceptors
          for (const h of this._responseInterceptors) {
            try { response = (await h.fulfilled?.(response)) ?? response; }
            catch (e) { if (h.rejected) response = await h.rejected(e); else throw e; }
          }

          if (!raw.ok) {
            throw new HttpError(`HTTP ${raw.status} ${raw.statusText}`, raw, req);
          }

          // Cache successful GET responses
          if (this._cache && req.method === 'GET') this._cache.set(req, response);

          this._stats.success++;
          this._pendingRequests.delete(req);
          return response;
        } catch (e) {
          if (attempt < maxAttempts && this._shouldRetry(e, req)) {
            this._stats.retried++;
            await sleep(req.retryDelay * Math.pow(2, attempt - 1));
            continue;
          }
          this._stats.error++;
          this._pendingRequests.delete(req);
          throw e;
        }
      }
    };

    const promise = execute();
    if (req.method === 'GET') this._dedup.set(req, promise);
    return promise;
  }

  async _fetchWithTimeout(req) {
    const controller = req._controller;
    let timeoutId = null;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => { controller.abort(); reject(new TimeoutError(req)); }, req.timeout);
    });
    try {
      const result = await Promise.race([fetch(req.fullUrl, req.toFetchOptions()), timeoutPromise]);
      return result;
    } finally { clearTimeout(timeoutId); }
  }

  async _parseResponse(raw, req) {
    const ct = raw.headers.get('content-type') ?? '';
    try {
      if (req.responseType === 'json' || ct.includes('application/json')) return raw.json();
      if (req.responseType === 'text' || ct.includes('text/')) return raw.text();
      if (req.responseType === 'blob') return raw.blob();
      if (req.responseType === 'arrayBuffer') return raw.arrayBuffer();
      if (req.responseType === 'formData') return raw.formData();
      return raw.text();
    } catch { return null; }
  }

  _shouldRetry(err, req) {
    if (err instanceof AbortError) return false;
    if (err instanceof HttpError && req.retryOn?.includes(err.status)) return true;
    if (!err.response) return true; // network error
    return false;
  }

  // Convenience methods
  get(url, config = {}) { return this.request({ ...config, url, method: 'GET' }); }
  post(url, body, config = {}) { return this.request({ ...config, url, method: 'POST', body }); }
  put(url, body, config = {}) { return this.request({ ...config, url, method: 'PUT', body }); }
  patch(url, body, config = {}) { return this.request({ ...config, url, method: 'PATCH', body }); }
  delete(url, config = {}) { return this.request({ ...config, url, method: 'DELETE' }); }
  head(url, config = {}) { return this.request({ ...config, url, method: 'HEAD' }); }
  options(url, config = {}) { return this.request({ ...config, url, method: 'OPTIONS' }); }

  // Parallel requests
  async all(requests) { return Promise.all(requests.map(r => this.request(r))); }
  async allSettled(requests) { return Promise.allSettled(requests.map(r => this.request(r))); }

  // Upload
  async upload(url, file, options = {}) {
    const formData = new FormData();
    formData.append(options.fieldName ?? 'file', file, file.name ?? 'upload');
    if (options.data) for (const [k, v] of Object.entries(options.data)) formData.append(k, v);
    return this.request({ url, method: 'POST', body: formData, ...options });
  }

  // Download
  async download(url, options = {}) {
    const response = await this.request({ url, method: 'GET', responseType: 'blob', ...options });
    if (typeof document !== 'undefined') {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(response.data);
      a.download = options.filename ?? 'download';
      a.click();
      URL.revokeObjectURL(a.href);
    }
    return response;
  }

  // Stats
  stats() { return { ...this._stats, pending: this._pendingRequests.size }; }
  pendingCount() { return this._pendingRequests.size; }
  cancelAll() { for (const req of this._pendingRequests) req.abort(); }
}

// ─── SSE Client ───────────────────────────────────────────────────────────────
export class SSEClient {
  constructor(url, options = {}) {
    this.url = url;
    this._options = options;
    this._handlers = new Map();
    this._errorHandlers = [];
    this._openHandlers = [];
    this._closeHandlers = [];
    this._es = null;
    this._reconnectDelay = options.reconnectDelay ?? 3000;
    this._maxReconnects = options.maxReconnects ?? 10;
    this._reconnects = 0;
    this._closed = false;
  }

  connect() {
    if (typeof EventSource === 'undefined') throw new Error('EventSource not available');
    this._es = new EventSource(this.url, { withCredentials: this._options.withCredentials });
    this._es.onopen = () => { this._reconnects = 0; for (const h of this._openHandlers) h(); };
    this._es.onerror = (e) => {
      for (const h of this._errorHandlers) h(e);
      if (!this._closed && this._reconnects < this._maxReconnects) {
        this._reconnects++;
        setTimeout(() => this.connect(), this._reconnectDelay);
      }
    };
    this._es.onmessage = (e) => {
      const handlers = this._handlers.get('message') ?? [];
      for (const h of handlers) h(e.data, e);
    };
    for (const [event, handlers] of this._handlers) {
      if (event === 'message') continue;
      this._es.addEventListener(event, (e) => { for (const h of handlers) h(e.data, e); });
    }
    return this;
  }

  on(event, handler) {
    if (!this._handlers.has(event)) this._handlers.set(event, []);
    this._handlers.get(event).push(handler);
    return this;
  }

  onError(fn) { this._errorHandlers.push(fn); return this; }
  onOpen(fn) { this._openHandlers.push(fn); return this; }
  onClose(fn) { this._closeHandlers.push(fn); return this; }

  close() {
    this._closed = true;
    this._es?.close();
    for (const h of this._closeHandlers) h();
  }
}

// ─── WebSocket Client ─────────────────────────────────────────────────────────
export class WebSocketClient {
  constructor(url, options = {}) {
    this.url = url;
    this._options = options;
    this._ws = null;
    this._handlers = new Map();
    this._messageHandlers = [];
    this._errorHandlers = [];
    this._openHandlers = [];
    this._closeHandlers = [];
    this._queue = [];
    this._reconnectDelay = options.reconnectDelay ?? 3000;
    this._maxReconnects = options.maxReconnects ?? Infinity;
    this._reconnects = 0;
    this._closed = false;
    this._pingInterval = null;
  }

  connect() {
    if (typeof WebSocket === 'undefined') return this;
    this._ws = new WebSocket(this.url, this._options.protocols);
    this._ws.onopen = (e) => {
      this._reconnects = 0;
      for (const msg of this._queue) this._ws.send(msg);
      this._queue.length = 0;
      for (const h of this._openHandlers) h(e);
      if (this._options.pingInterval) {
        this._pingInterval = setInterval(() => this.send({ type: 'ping' }), this._options.pingInterval);
      }
    };
    this._ws.onmessage = (e) => {
      let data = e.data;
      try { data = JSON.parse(e.data); } catch {}
      for (const h of this._messageHandlers) h(data, e);
      if (data?.type) {
        const handlers = this._handlers.get(data.type) ?? [];
        for (const h of handlers) h(data, e);
      }
    };
    this._ws.onerror = (e) => { for (const h of this._errorHandlers) h(e); };
    this._ws.onclose = (e) => {
      clearInterval(this._pingInterval);
      for (const h of this._closeHandlers) h(e);
      if (!this._closed && this._reconnects < this._maxReconnects) {
        this._reconnects++;
        setTimeout(() => this.connect(), this._reconnectDelay);
      }
    };
    return this;
  }

  send(data) {
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    if (this._ws?.readyState === WebSocket.OPEN) this._ws.send(str);
    else this._queue.push(str);
    return this;
  }

  on(type, fn) {
    if (!this._handlers.has(type)) this._handlers.set(type, []);
    this._handlers.get(type).push(fn);
    return this;
  }

  onMessage(fn) { this._messageHandlers.push(fn); return this; }
  onError(fn) { this._errorHandlers.push(fn); return this; }
  onOpen(fn) { this._openHandlers.push(fn); return this; }
  onClose(fn) { this._closeHandlers.push(fn); return this; }

  close(code, reason) {
    this._closed = true;
    clearInterval(this._pingInterval);
    this._ws?.close(code, reason);
  }

  get readyState() { return this._ws?.readyState ?? WebSocket.CLOSED; }
  get isOpen() { return this.readyState === WebSocket.OPEN; }
  get isConnecting() { return this.readyState === WebSocket.CONNECTING; }
}

// ─── GraphQL Client ───────────────────────────────────────────────────────────
export class GraphQLClient {
  constructor(url, options = {}) {
    this._http = new HttpClient({ baseUrl: url, ...options });
    this._subscriptions = new Map();
  }

  async query(query, variables = {}, options = {}) {
    const response = await this._http.post('', { query, variables }, options);
    if (response.data?.errors) throw new Error(response.data.errors.map(e => e.message).join(', '));
    return response.data?.data;
  }

  async mutate(mutation, variables = {}, options = {}) {
    return this.query(mutation, variables, options);
  }

  async introspect() {
    return this.query(`{__schema{types{name kind fields{name type{name}}}}}}`);
  }

  useRequest(fn) { this._http.useRequest(fn); return this; }
  useResponse(fn) { this._http.useResponse(fn); return this; }
}

// ─── Mock adapter ─────────────────────────────────────────────────────────────
export class MockAdapter {
  constructor(client) {
    this._client = client;
    this._handlers = [];
    this._delay = 0;
  }

  setDelay(ms) { this._delay = ms; return this; }

  onGet(url, response, status = 200) {
    this._handlers.push({ method: 'GET', url, response, status });
    return this;
  }

  onPost(url, response, status = 201) {
    this._handlers.push({ method: 'POST', url, response, status });
    return this;
  }

  onPut(url, response, status = 200) {
    this._handlers.push({ method: 'PUT', url, response, status });
    return this;
  }

  onPatch(url, response, status = 200) {
    this._handlers.push({ method: 'PATCH', url, response, status });
    return this;
  }

  onDelete(url, response, status = 204) {
    this._handlers.push({ method: 'DELETE', url, response, status });
    return this;
  }

  _find(method, url) {
    return this._handlers.find(h => h.method === method && (h.url === url || new RegExp(h.url).test(url)));
  }

  install() {
    const origRequest = this._client.request.bind(this._client);
    const adapter = this;
    this._client.request = async (config) => {
      if (adapter._delay) await sleep(adapter._delay);
      const handler = adapter._find(config.method?.toUpperCase() ?? 'GET', config.url);
      if (!handler) throw new HttpError(`No mock for ${config.method} ${config.url}`, { status: 404 }, config);
      const data = typeof handler.response === 'function' ? handler.response(config) : handler.response;
      const fakeRaw = { status: handler.status, statusText: 'OK', ok: handler.status < 400, headers: new Map([['content-type', 'application/json']]) };
      return new Response(fakeRaw, new Request(config), data);
    };
    this._restore = () => { this._client.request = origRequest; };
    return this;
  }

  restore() { this._restore?.(); return this; }
}

// ─── Factories ────────────────────────────────────────────────────────────────
export function createHttpClient(config) { return new HttpClient(config); }
export function createSSE(url, opts) { return new SSEClient(url, opts); }
export function createWebSocket(url, opts) { return new WebSocketClient(url, opts); }
export function createGraphQL(url, opts) { return new GraphQLClient(url, opts); }
export function createMock(client) { return new MockAdapter(client); }

export const http = new HttpClient();

export default {
  HttpClient, Request, Response, HttpError, TimeoutError, AbortError,
  ResponseCache, RateLimiter, RequestDeduplicator, InterceptorManager,
  SSEClient, WebSocketClient, GraphQLClient, MockAdapter,
  createHttpClient, createSSE, createWebSocket, createGraphQL, createMock,
  http,
};
