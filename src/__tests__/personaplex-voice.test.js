import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PersonaPlexVoice, PERSONAPLEX_VOICES } from '../personaplex-voice.js';

// ─── WebSocket stub ───────────────────────────────────────────────────────────

/**
 * Return a WebSocket *class* (constructable with `new`) whose instances fire
 * lifecycle callbacks according to `behaviour`:
 *   'open'    – fires onopen on the next tick (default)
 *   'error'   – fires onerror on the next tick
 *   'timeout' – does nothing (connection hangs until timeout)
 *
 * After calling `globalThis.WebSocket = makeWsClass(...)`, access the last
 * constructed instance via `globalThis.WebSocket._instance`.
 */
function makeWsClass(behaviour = 'open') {
  class MockWebSocket {
    constructor() {
      this.binaryType = null;
      this.readyState = MockWebSocket.OPEN;
      this.send = vi.fn();
      this.close = vi.fn();
      this.onopen = null;
      this.onerror = null;
      this.onclose = null;
      this.onmessage = null;
      MockWebSocket._instance = this;

      if (behaviour === 'open') {
        setTimeout(() => { if (this.onopen) this.onopen({}); }, 0);
      } else if (behaviour === 'error') {
        setTimeout(() => { if (this.onerror) this.onerror({}); }, 0);
      }
      // 'timeout' – nothing fires
    }
  }
  MockWebSocket.OPEN = 1;
  MockWebSocket._instance = null;
  return MockWebSocket;
}

// ─── AudioContext / stream stubs ──────────────────────────────────────────────

function makeAudioCtxMock() {
  return {
    state: 'running',
    currentTime: 0,
    sampleRate: 24000,
    createBuffer: vi.fn((ch, len, sr) => ({
      length: len,
      copyToChannel: vi.fn(),
      duration: len / sr,
    })),
    createBufferSource: vi.fn(() => ({
      buffer: null,
      connect: vi.fn(),
      start: vi.fn(),
    })),
    createMediaStreamSource: vi.fn(() => ({ connect: vi.fn() })),
    createScriptProcessor: vi.fn(() => ({
      onaudioprocess: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
    createGain: vi.fn(() => ({
      gain: { value: 0 },
      connect: vi.fn(),
    })),
    destination: {},
    resume: vi.fn(() => Promise.resolve()),
    close: vi.fn(),
  };
}

function makeStreamMock() {
  const track = { stop: vi.fn() };
  return {
    getTracks: vi.fn(() => [track]),
    _track: track,
  };
}

// ─── PERSONAPLEX_VOICES ───────────────────────────────────────────────────────

describe('PERSONAPLEX_VOICES', () => {
  it('exports exactly 18 voice presets', () => {
    expect(PERSONAPLEX_VOICES).toHaveLength(18);
  });

  it('every preset has a non-empty id and label string', () => {
    for (const v of PERSONAPLEX_VOICES) {
      expect(typeof v.id).toBe('string');
      expect(v.id.length).toBeGreaterThan(0);
      expect(typeof v.label).toBe('string');
      expect(v.label.length).toBeGreaterThan(0);
    }
  });

  it('includes 4 natural-female, 4 natural-male, 5 variety-female, 5 variety-male', () => {
    const natF = PERSONAPLEX_VOICES.filter(v => v.id.startsWith('NATF'));
    const natM = PERSONAPLEX_VOICES.filter(v => v.id.startsWith('NATM'));
    const varF = PERSONAPLEX_VOICES.filter(v => v.id.startsWith('VARF'));
    const varM = PERSONAPLEX_VOICES.filter(v => v.id.startsWith('VARM'));
    expect(natF).toHaveLength(4);
    expect(natM).toHaveLength(4);
    expect(varF).toHaveLength(5);
    expect(varM).toHaveLength(5);
  });

  it('all ids are unique', () => {
    const ids = PERSONAPLEX_VOICES.map(v => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ─── Constructor ──────────────────────────────────────────────────────────────

describe('PersonaPlexVoice — constructor & defaults', () => {
  it('initialises with sensible defaults', () => {
    const voice = new PersonaPlexVoice();
    expect(voice.serverUrl).toBe('https://localhost:8998');
    expect(voice.voicePrompt).toBe('NATF0');
    expect(voice.personaText).toBe('You enjoy having a good conversation.');
    expect(voice.isConnected).toBe(false);
    expect(voice.isRecording).toBe(false);
    expect(voice._state).toBe('idle');
    expect(voice.onStateChange).toBeNull();
    expect(voice.onTranscript).toBeNull();
    expect(voice.onAssistantText).toBeNull();
    expect(voice.onError).toBeNull();
  });
});

// ─── supported getter ─────────────────────────────────────────────────────────

describe('PersonaPlexVoice — supported', () => {
  it('returns false in Node / vitest environment (no WebSocket / AudioContext)', () => {
    const voice = new PersonaPlexVoice();
    // In a plain Node environment, WebSocket is not defined.
    expect(voice.supported).toBe(false);
  });

  it('returns true when all required globals are present', () => {
    const voice = new PersonaPlexVoice();
    const origWS = globalThis.WebSocket;
    const origAC = globalThis.AudioContext;
    const origNav = globalThis.navigator;

    globalThis.WebSocket = class {};
    globalThis.AudioContext = class {};
    Object.defineProperty(globalThis, 'navigator', {
      value: { mediaDevices: {} },
      configurable: true,
      writable: true,
    });

    expect(voice.supported).toBe(true);

    // Restore
    if (origWS === undefined) delete globalThis.WebSocket;
    else globalThis.WebSocket = origWS;
    if (origAC === undefined) delete globalThis.AudioContext;
    else globalThis.AudioContext = origAC;
    Object.defineProperty(globalThis, 'navigator', {
      value: origNav,
      configurable: true,
      writable: true,
    });
  });
});

// ─── _setState ────────────────────────────────────────────────────────────────

describe('PersonaPlexVoice — _setState', () => {
  it('updates _state and calls onStateChange', () => {
    const voice = new PersonaPlexVoice();
    const states = [];
    voice.onStateChange = (s) => states.push(s);
    voice._setState('connecting');
    voice._setState('listening');
    expect(states).toEqual(['connecting', 'listening']);
    expect(voice._state).toBe('listening');
  });

  it('does not throw when onStateChange is null', () => {
    const voice = new PersonaPlexVoice();
    expect(() => voice._setState('speaking')).not.toThrow();
  });
});

// ─── _wsUrl ───────────────────────────────────────────────────────────────────

describe('PersonaPlexVoice — _wsUrl', () => {
  it('converts https:// to wss://', () => {
    const voice = new PersonaPlexVoice();
    voice.serverUrl = 'https://localhost:8998';
    expect(voice._wsUrl()).toBe('wss://localhost:8998/api/chat');
  });

  it('converts http:// to ws://', () => {
    const voice = new PersonaPlexVoice();
    voice.serverUrl = 'http://localhost:8998';
    expect(voice._wsUrl()).toBe('ws://localhost:8998/api/chat');
  });

  it('strips trailing slashes before appending /api/chat', () => {
    const voice = new PersonaPlexVoice();
    voice.serverUrl = 'https://myserver.local:9000/';
    expect(voice._wsUrl()).toBe('wss://myserver.local:9000/api/chat');
  });

  it('handles multiple trailing slashes', () => {
    const voice = new PersonaPlexVoice();
    voice.serverUrl = 'http://host///';
    expect(voice._wsUrl()).toBe('ws://host/api/chat');
  });
});

// ─── connect ─────────────────────────────────────────────────────────────────

describe('PersonaPlexVoice — connect', () => {
  beforeEach(() => {
    globalThis.WebSocket = makeWsClass('open');
  });

  afterEach(() => {
    delete globalThis.WebSocket;
  });

  it('resolves and sets isConnected on a successful open', async () => {
    const voice = new PersonaPlexVoice();
    await voice.connect();
    expect(voice.isConnected).toBe(true);
    expect(voice._ws).toBe(globalThis.WebSocket._instance);
  });

  it('sends a config message on open', async () => {
    const voice = new PersonaPlexVoice();
    voice.voicePrompt = 'VARM0';
    voice.personaText = 'Be concise.';
    await voice.connect();
    const ws = globalThis.WebSocket._instance;
    expect(ws.send).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(ws.send.mock.calls[0][0]);
    expect(payload.type).toBe('config');
    expect(payload.voice_prompt).toBe('VARM0');
    expect(payload.text_prompt).toBe('Be concise.');
  });

  it('transitions state connecting → (stays connected)', async () => {
    const voice = new PersonaPlexVoice();
    const states = [];
    voice.onStateChange = (s) => states.push(s);
    await voice.connect();
    expect(states[0]).toBe('connecting');
  });

  it('returns immediately when already connected', async () => {
    const voice = new PersonaPlexVoice();
    await voice.connect();
    // Mark a sentinel so we can detect if a new instance was created.
    const firstInstance = globalThis.WebSocket._instance;
    await voice.connect(); // second call – must short-circuit
    expect(globalThis.WebSocket._instance).toBe(firstInstance);
  });

  it('rejects and calls onError on WebSocket error', async () => {
    globalThis.WebSocket = makeWsClass('error');

    const voice = new PersonaPlexVoice();
    const errors = [];
    voice.onError = (e) => errors.push(e);

    await expect(voice.connect()).rejects.toThrow();
    expect(errors).toHaveLength(1);
    expect(voice.isConnected).toBe(false);
    expect(voice._state).toBe('idle');
  });

  it('rejects when WebSocket constructor throws', async () => {
    globalThis.WebSocket = class { constructor() { throw new Error('blocked'); } };

    const voice = new PersonaPlexVoice();
    await expect(voice.connect()).rejects.toThrow('blocked');
    expect(voice._state).toBe('idle');
  });

  it('rejects on timeout (8 s) and transitions back to idle', async () => {
    vi.useFakeTimers();
    globalThis.WebSocket = makeWsClass('timeout');

    const voice = new PersonaPlexVoice();
    const p = voice.connect();
    vi.advanceTimersByTime(8001);
    await expect(p).rejects.toThrow('timed out');
    expect(voice._state).toBe('idle');
    vi.useRealTimers();
  });
});

// ─── _handleMessage ───────────────────────────────────────────────────────────

describe('PersonaPlexVoice — _handleMessage', () => {
  it('schedules audio playback and sets state to speaking for binary frames', () => {
    const voice = new PersonaPlexVoice();
    const ctx = makeAudioCtxMock();
    voice._audioCtx = ctx;

    const states = [];
    voice.onStateChange = (s) => states.push(s);

    const buf = new Float32Array([0.1, -0.1]).buffer;
    voice._handleMessage({ data: buf });

    expect(ctx.createBuffer).toHaveBeenCalled();
    expect(states).toContain('speaking');
  });

  it('skips empty binary frames without error', () => {
    const voice = new PersonaPlexVoice();
    voice._audioCtx = makeAudioCtxMock();
    // Length-0 ArrayBuffer → Float32Array with 0 elements
    const empty = new Float32Array(0).buffer;
    expect(() => voice._handleMessage({ data: empty })).not.toThrow();
  });

  it('calls onTranscript and sets listening for user_transcript', () => {
    const voice = new PersonaPlexVoice();
    const transcripts = [];
    voice.onTranscript = (t) => transcripts.push(t);
    const states = [];
    voice.onStateChange = (s) => states.push(s);

    voice._handleMessage({ data: JSON.stringify({ type: 'user_transcript', text: 'hello' }) });

    expect(transcripts).toEqual(['hello']);
    expect(states).toContain('listening');
  });

  it('calls onAssistantText for assistant_transcript', () => {
    const voice = new PersonaPlexVoice();
    const responses = [];
    voice.onAssistantText = (t) => responses.push(t);

    voice._handleMessage({ data: JSON.stringify({ type: 'assistant_transcript', text: 'world' }) });

    expect(responses).toEqual(['world']);
  });

  it('calls onAssistantText for assistant_text', () => {
    const voice = new PersonaPlexVoice();
    const responses = [];
    voice.onAssistantText = (t) => responses.push(t);

    voice._handleMessage({ data: JSON.stringify({ type: 'assistant_text', text: 'hi there' }) });

    expect(responses).toEqual(['hi there']);
  });

  it('sets listening state for config_ack', () => {
    const voice = new PersonaPlexVoice();
    const states = [];
    voice.onStateChange = (s) => states.push(s);

    voice._handleMessage({ data: JSON.stringify({ type: 'config_ack' }) });

    expect(states).toContain('listening');
  });

  it('sets listening state for ready', () => {
    const voice = new PersonaPlexVoice();
    const states = [];
    voice.onStateChange = (s) => states.push(s);

    voice._handleMessage({ data: JSON.stringify({ type: 'ready' }) });

    expect(states).toContain('listening');
  });

  it('ignores malformed JSON without throwing', () => {
    const voice = new PersonaPlexVoice();
    expect(() => voice._handleMessage({ data: '{not json' })).not.toThrow();
  });

  it('ignores unknown message types without throwing', () => {
    const voice = new PersonaPlexVoice();
    expect(() => voice._handleMessage({ data: JSON.stringify({ type: 'unknown' }) })).not.toThrow();
  });
});

// ─── _playAudioBuffer ─────────────────────────────────────────────────────────

describe('PersonaPlexVoice — _playAudioBuffer', () => {
  it('does nothing when audioCtx is null', () => {
    const voice = new PersonaPlexVoice();
    voice._audioCtx = null;
    const buf = new Float32Array([0.5]).buffer;
    expect(() => voice._playAudioBuffer(buf)).not.toThrow();
  });

  it('does nothing for an empty buffer', () => {
    const voice = new PersonaPlexVoice();
    const ctx = makeAudioCtxMock();
    voice._audioCtx = ctx;
    voice._playAudioBuffer(new Float32Array(0).buffer);
    expect(ctx.createBuffer).not.toHaveBeenCalled();
  });

  it('resumes a suspended context before playing', () => {
    const voice = new PersonaPlexVoice();
    const ctx = makeAudioCtxMock();
    ctx.state = 'suspended';
    voice._audioCtx = ctx;

    voice._playAudioBuffer(new Float32Array([0.1, 0.2]).buffer);

    expect(ctx.resume).toHaveBeenCalled();
  });

  it('advances _nextPlayTime beyond the current time', () => {
    const voice = new PersonaPlexVoice();
    const ctx = makeAudioCtxMock();
    ctx.currentTime = 1.0;
    voice._audioCtx = ctx;
    voice._nextPlayTime = 0;

    voice._playAudioBuffer(new Float32Array(24).buffer); // 1 ms @ 24 kHz

    expect(voice._nextPlayTime).toBeGreaterThanOrEqual(1.0);
  });
});

// ─── stopConversation ─────────────────────────────────────────────────────────

describe('PersonaPlexVoice — stopConversation', () => {
  it('sets isRecording to false and transitions state to idle', () => {
    const voice = new PersonaPlexVoice();
    voice.isRecording = true;
    voice._state = 'listening';
    const states = [];
    voice.onStateChange = (s) => states.push(s);

    voice.stopConversation();

    expect(voice.isRecording).toBe(false);
    expect(states).toContain('idle');
  });

  it('closes any open WebSocket', () => {
    const voice = new PersonaPlexVoice();
    const ws = { close: vi.fn() };
    voice._ws = ws;
    voice.isConnected = true;

    voice.stopConversation();

    expect(ws.close).toHaveBeenCalled();
    expect(voice._ws).toBeNull();
    expect(voice.isConnected).toBe(false);
  });

  it('stops all stream tracks', () => {
    const voice = new PersonaPlexVoice();
    const stream = makeStreamMock();
    voice._stream = stream;

    voice.stopConversation();

    expect(stream._track.stop).toHaveBeenCalled();
    expect(voice._stream).toBeNull();
  });

  it('does not throw when nothing is open', () => {
    const voice = new PersonaPlexVoice();
    expect(() => voice.stopConversation()).not.toThrow();
  });
});

// ─── _closeWs ────────────────────────────────────────────────────────────────

describe('PersonaPlexVoice — _closeWs', () => {
  it('closes the socket, nulls _ws, and clears isConnected', () => {
    const voice = new PersonaPlexVoice();
    const ws = { close: vi.fn() };
    voice._ws = ws;
    voice.isConnected = true;

    voice._closeWs();

    expect(ws.close).toHaveBeenCalled();
    expect(voice._ws).toBeNull();
    expect(voice.isConnected).toBe(false);
  });

  it('does nothing when _ws is already null', () => {
    const voice = new PersonaPlexVoice();
    expect(() => voice._closeWs()).not.toThrow();
  });

  it('swallows errors thrown by ws.close()', () => {
    const voice = new PersonaPlexVoice();
    voice._ws = { close: vi.fn(() => { throw new Error('already closed'); }) };
    expect(() => voice._closeWs()).not.toThrow();
    expect(voice._ws).toBeNull();
  });
});

// ─── _cleanupAudio ────────────────────────────────────────────────────────────

describe('PersonaPlexVoice — _cleanupAudio', () => {
  it('disconnects the processor, stops stream tracks, and closes audioCtx', () => {
    const voice = new PersonaPlexVoice();
    const processor = { disconnect: vi.fn() };
    const stream = makeStreamMock();
    const ctx = { close: vi.fn() };

    voice._processor = processor;
    voice._stream = stream;
    voice._audioCtx = ctx;

    voice._cleanupAudio();

    expect(processor.disconnect).toHaveBeenCalled();
    expect(voice._processor).toBeNull();
    expect(stream._track.stop).toHaveBeenCalled();
    expect(voice._stream).toBeNull();
    expect(ctx.close).toHaveBeenCalled();
    expect(voice._audioCtx).toBeNull();
  });

  it('swallows errors thrown by processor.disconnect()', () => {
    const voice = new PersonaPlexVoice();
    voice._processor = { disconnect: vi.fn(() => { throw new Error('oops'); }) };
    expect(() => voice._cleanupAudio()).not.toThrow();
  });

  it('tolerates all-null references', () => {
    const voice = new PersonaPlexVoice();
    expect(() => voice._cleanupAudio()).not.toThrow();
  });
});
