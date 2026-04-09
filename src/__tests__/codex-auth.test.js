/**
 * Tests for codex-auth.js — OpenAI Codex device-auth flow.
 *
 * Strategy:
 *  - `localStorage` is mocked globally (required for client-id override
 *    functions and for `getClientId()` which reads from it).
 *  - `fetch` is mocked per-test via `vi.stubGlobal` so each test controls the
 *    HTTP interactions without a real network call.
 *  - Timer-based polling is replaced by vi.useFakeTimers() where needed.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getAuthIssuer,
  getClientIdOverride,
  setClientIdOverride,
  clearClientIdOverride,
  getTokenUrl,
  requestDeviceCode,
  pollForAuth,
  exchangeToken,
  deviceAuthFlow
} from '../codex-auth.js';

// ─── localStorage mock ────────────────────────────────────────────────────────

const _lsData = new Map();
global.localStorage = {
  getItem:    (k) => _lsData.get(k) ?? null,
  setItem:    (k, v) => _lsData.set(k, String(v)),
  removeItem: (k) => _lsData.delete(k),
  clear:      () => _lsData.clear()
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal Response-like object. */
function makeResponse(body, { status = 200, ok = true } = {}) {
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok,
    status,
    clone() { return makeResponse(body, { status, ok }); },
    json()  { return Promise.resolve(JSON.parse(bodyStr)); },
    text()  { return Promise.resolve(bodyStr); }
  };
}

// ─── Static helpers ───────────────────────────────────────────────────────────

describe('getAuthIssuer', () => {
  it('returns the OpenAI auth host', () => {
    expect(getAuthIssuer()).toBe('https://auth.openai.com');
  });
});

describe('getTokenUrl', () => {
  it('ends with /oauth/token', () => {
    expect(getTokenUrl()).toMatch(/\/oauth\/token$/);
  });

  it('is a valid absolute URL', () => {
    expect(() => new URL(getTokenUrl())).not.toThrow();
  });
});

// ─── Client-ID override ───────────────────────────────────────────────────────

describe('setClientIdOverride / getClientIdOverride / clearClientIdOverride', () => {
  beforeEach(() => {
    _lsData.clear();
  });

  it('getClientIdOverride returns empty string when nothing set', () => {
    expect(getClientIdOverride()).toBe('');
  });

  it('setClientIdOverride persists value to localStorage', () => {
    setClientIdOverride('app_custom123');
    expect(getClientIdOverride()).toBe('app_custom123');
  });

  it('setClientIdOverride trims whitespace', () => {
    setClientIdOverride('  app_trimmed  ');
    expect(getClientIdOverride()).toBe('app_trimmed');
  });

  it('setClientIdOverride with empty string removes the entry', () => {
    setClientIdOverride('app_old');
    setClientIdOverride('');
    expect(getClientIdOverride()).toBe('');
    expect(_lsData.has('ai-space-auth-client-id')).toBe(false);
  });

  it('clearClientIdOverride removes the stored value', () => {
    setClientIdOverride('app_toClear');
    clearClientIdOverride();
    expect(getClientIdOverride()).toBe('');
    expect(_lsData.has('ai-space-auth-client-id')).toBe(false);
  });

  it('clearClientIdOverride is safe when nothing was set', () => {
    expect(() => clearClientIdOverride()).not.toThrow();
  });
});

// ─── requestDeviceCode — codex flow ──────────────────────────────────────────

describe('requestDeviceCode — codex primary endpoint', () => {
  beforeEach(() => {
    _lsData.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns codex flow data on 200 from primary endpoint', async () => {
    const payload = {
      user_code: 'ABCD-1234',
      device_auth_id: 'dev-auth-xyz',
      interval: 5,
      verification_url: 'https://auth.openai.com/codex/device',
      client_id: 'app_test'
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(makeResponse(payload)));

    const result = await requestDeviceCode();
    expect(result.flow).toBe('codex');
    expect(result.user_code).toBe('ABCD-1234');
    expect(result.device_auth_id).toBe('dev-auth-xyz');
    expect(result.interval).toBe(5);
    expect(result.verification_url).toBe('https://auth.openai.com/codex/device');
    expect(result.client_id).toBe('app_test');
  });

  it('uses payload client_id from server when available', async () => {
    const payload = {
      user_code: 'XY-99',
      device_auth_id: 'd1',
      interval: 3,
      client_id: 'app_from_server'
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(makeResponse(payload)));

    const result = await requestDeviceCode();
    expect(result.client_id).toBe('app_from_server');
  });

  it('falls back to default verification_url when not in payload', async () => {
    const payload = { user_code: 'YY-00', device_auth_id: 'd2', interval: 5 };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(makeResponse(payload)));

    const result = await requestDeviceCode();
    expect(result.verification_url).toContain('/codex/device');
  });

  it('uses oauth_client_id fallback from server payload', async () => {
    const payload = {
      user_code: 'ZZ-01',
      device_auth_id: 'd3',
      interval: 5,
      oauth_client_id: 'app_oauth'
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(makeResponse(payload)));

    const result = await requestDeviceCode();
    expect(result.client_id).toBe('app_oauth');
  });
});

// ─── requestDeviceCode — OAuth fallback ──────────────────────────────────────

describe('requestDeviceCode — OAuth device-code fallback', () => {
  beforeEach(() => {
    _lsData.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back to oauth-device flow when primary endpoint returns non-2xx', async () => {
    const fallbackPayload = {
      user_code: 'WXYZ-5678',
      device_code: 'device-code-abc',
      interval: 3,
      verification_uri: 'https://auth.openai.com/activate'
    };
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(makeResponse('fail', { status: 503, ok: false }))
      .mockResolvedValueOnce(makeResponse(fallbackPayload));
    vi.stubGlobal('fetch', mockFetch);

    const result = await requestDeviceCode();
    expect(result.flow).toBe('oauth-device');
    expect(result.user_code).toBe('WXYZ-5678');
    expect(result.device_code).toBe('device-code-abc');
  });

  it('prefers verification_uri_complete over verification_uri in fallback', async () => {
    const fallbackPayload = {
      user_code: 'XX-55',
      device_code: 'dc-xx',
      interval: 5,
      verification_uri: 'https://auth.openai.com/activate',
      verification_uri_complete: 'https://auth.openai.com/activate?code=XX-55'
    };
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(makeResponse('err', { status: 400, ok: false }))
      .mockResolvedValueOnce(makeResponse(fallbackPayload));
    vi.stubGlobal('fetch', mockFetch);

    const result = await requestDeviceCode();
    expect(result.verification_url).toBe('https://auth.openai.com/activate?code=XX-55');
  });

  it('throws when primary endpoint throws and fallback also fails', async () => {
    const mockFetch = vi.fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(makeResponse('bad', { status: 400, ok: false }));
    vi.stubGlobal('fetch', mockFetch);

    await expect(requestDeviceCode()).rejects.toThrow(/Device login unavailable/);
  });
});

// ─── pollForAuth ──────────────────────────────────────────────────────────────

describe('pollForAuth', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('resolves with the token payload on HTTP 200', async () => {
    vi.useFakeTimers();
    const tokenPayload = { authorization_code: 'code-xyz', code_verifier: 'verifier-abc' };

    const mockFetch = vi.fn().mockResolvedValue(makeResponse(tokenPayload, { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    const promise = pollForAuth('dev-auth-id', 'USER-CODE', 100, 5000);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual(tokenPayload);
  });

  it('retries on 403 (authorization pending) until it succeeds', async () => {
    vi.useFakeTimers();
    const pending = makeResponse('', { status: 403, ok: false });
    const success = makeResponse({ authorization_code: 'done' }, { status: 200 });

    let call = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      call++;
      return Promise.resolve(call < 3 ? pending : success);
    });
    vi.stubGlobal('fetch', mockFetch);

    const promise = pollForAuth('id', 'code', 50, 5000);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toHaveProperty('authorization_code', 'done');
    expect(call).toBeGreaterThanOrEqual(3);
  });

  it('throws when max wait time is exceeded', async () => {
    vi.useFakeTimers();
    const pending = makeResponse('', { status: 403, ok: false });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(pending));

    const resultPromise = pollForAuth('id', 'code', 100, 200);
    // Attach the rejection handler BEFORE running timers to avoid unhandled-rejection warnings
    const check = expect(resultPromise).rejects.toThrow(/timed out/i);
    await vi.runAllTimersAsync();
    await check;
  });

  it('throws on unexpected HTTP error status', async () => {
    vi.useFakeTimers();
    const serverError = { ok: false, status: 500, text: () => Promise.resolve('internal error'), clone: () => serverError };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(serverError));

    const resultPromise = pollForAuth('id', 'code', 50, 5000);
    const check = expect(resultPromise).rejects.toThrow(/Auth poll error/);
    await vi.runAllTimersAsync();
    await check;
  });
});

// ─── exchangeToken ────────────────────────────────────────────────────────────

describe('exchangeToken', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    _lsData.clear();
  });

  it('returns access_token and refresh_token on success', async () => {
    const tokens = { access_token: 'tok_abc', refresh_token: 'ref_xyz' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(tokens)));

    const result = await exchangeToken('auth-code', 'verifier', null);
    expect(result.access_token).toBe('tok_abc');
    expect(result.refresh_token).toBe('ref_xyz');
  });

  it('includes the provided clientIdOverride in the request', async () => {
    const tokens = { access_token: 'tok', refresh_token: 'ref' };
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(tokens));
    vi.stubGlobal('fetch', mockFetch);

    await exchangeToken('code', 'verifier', 'app_custom');
    const bodyStr = mockFetch.mock.calls[0][1].body.toString();
    expect(bodyStr).toContain('app_custom');
  });

  it('throws on HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse('Unauthorized', { status: 401, ok: false })));

    await expect(exchangeToken('bad-code', 'v', null)).rejects.toThrow(/Token exchange failed/);
  });
});

// ─── deviceAuthFlow — codex path ─────────────────────────────────────────────

describe('deviceAuthFlow — codex path (direct token at poll)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('returns tokens when poll returns access_token directly', async () => {
    vi.useFakeTimers();

    const deviceCodeResp = {
      user_code: 'ABCD-1111',
      device_auth_id: 'dauth-001',
      interval: 1,
      verification_url: 'https://auth.openai.com/codex/device',
      client_id: 'app_test'
    };
    // First call: requestDeviceCode primary endpoint
    // Second call: pollForAuth → returns access_token directly
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(makeResponse(deviceCodeResp))
      .mockResolvedValue(makeResponse({ access_token: 'tok_direct', refresh_token: 'ref_direct' }, { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    const onCode   = vi.fn();
    const onStatus = vi.fn();

    const promise = deviceAuthFlow(onCode, onStatus);
    await vi.runAllTimersAsync();
    const tokens = await promise;

    expect(tokens.access_token).toBe('tok_direct');
    expect(tokens.refresh_token).toBe('ref_direct');
    expect(onCode).toHaveBeenCalledWith(expect.objectContaining({ userCode: 'ABCD-1111' }));
    expect(onStatus).toHaveBeenCalledWith('Requesting login code...');
    expect(onStatus).toHaveBeenCalledWith('Waiting for sign-in...');
  });
});

// ─── deviceAuthFlow — OAuth device path ──────────────────────────────────────

describe('deviceAuthFlow — oauth-device path', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('returns tokens from oauth-device polling flow', async () => {
    vi.useFakeTimers();

    // Primary endpoint fails → triggers oauth-device fallback
    const fallbackCodeResp = {
      user_code: 'WXYZ-9999',
      device_code: 'dc-oauth-001',
      interval: 1,
      verification_uri: 'https://auth.openai.com/activate'
    };
    const oauthTokenResp = { access_token: 'oauth_tok', refresh_token: 'oauth_ref' };

    const mockFetch = vi.fn()
      .mockResolvedValueOnce(makeResponse('fail', { status: 503, ok: false }))   // primary fails
      .mockResolvedValueOnce(makeResponse(fallbackCodeResp))                      // oauth fallback
      .mockResolvedValue(makeResponse(oauthTokenResp));                           // token poll

    vi.stubGlobal('fetch', mockFetch);

    const onCode   = vi.fn();
    const onStatus = vi.fn();

    const promise = deviceAuthFlow(onCode, onStatus);
    await vi.runAllTimersAsync();
    const tokens = await promise;

    expect(tokens.access_token).toBe('oauth_tok');
    expect(tokens.refresh_token).toBe('oauth_ref');
    expect(onCode).toHaveBeenCalledWith(expect.objectContaining({ userCode: 'WXYZ-9999' }));
  });
});
