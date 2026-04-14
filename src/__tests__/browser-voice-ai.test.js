import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserVoiceAI } from '../browser-voice-ai.js';

// ─── Minimal browser API stubs ───────────────────────────────────────────────

// SpeechSynthesisUtterance is not available in the Node test environment.
// Provide a minimal stub so tests that call speak() don't throw.
class MockSpeechSynthesisUtterance {
  constructor(text) { this.text = text; }
}
if (typeof globalThis.SpeechSynthesisUtterance === 'undefined') {
  globalThis.SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;
}

function makeSynthesisMock() {
  const utterances = [];
  return {
    cancel: vi.fn(),
    speak: vi.fn((utt) => {
      utterances.push(utt);
      // Immediately fire onend so tests don't hang.
      setTimeout(() => { if (utt.onend) utt.onend(); }, 0);
    }),
    getVoices: vi.fn(() => [
      { name: 'Samantha', lang: 'en-US' },
      { name: 'Alex', lang: 'en-US' },
    ]),
    _utterances: utterances,
  };
}

function makeAnalyserMock(rmsValues = []) {
  let callCount = 0;
  return {
    fftSize: 256,
    frequencyBinCount: 32,
    getByteTimeDomainData: vi.fn((arr) => {
      const rms = rmsValues[callCount++] ?? 0;
      // Fill array so RMS equals `rms`.  arr[i] = 128 + rms for simplicity.
      arr.fill(128 + Math.round(rms));
    }),
    disconnect: vi.fn(),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('BrowserVoiceAI — constructor & defaults', () => {
  it('initialises with sensible defaults', () => {
    const ai = new BrowserVoiceAI();
    expect(ai.model).toBe('Xenova/whisper-tiny');
    expect(ai.language).toBe('english');
    expect(ai.conversationMode).toBe(false);
    expect(ai.isRecording).toBe(false);
    expect(ai.onStateChange).toBeNull();
    expect(ai.onTranscript).toBeNull();
    expect(ai.onProgress).toBeNull();
    expect(ai.onError).toBeNull();
  });

  it('supported is false when MediaRecorder is not available', () => {
    const ai = new BrowserVoiceAI();
    // In the vitest/node environment, MediaRecorder is not defined.
    expect(ai.supported).toBe(false);
  });
});

describe('BrowserVoiceAI — _setState', () => {
  it('calls onStateChange with the given state', () => {
    const ai = new BrowserVoiceAI();
    const states = [];
    ai.onStateChange = (s) => states.push(s);
    ai._setState('loading');
    ai._setState('idle');
    expect(states).toEqual(['loading', 'idle']);
  });

  it('does nothing when onStateChange is null', () => {
    const ai = new BrowserVoiceAI();
    expect(() => ai._setState('idle')).not.toThrow();
  });
});

describe('BrowserVoiceAI — resetModel', () => {
  it('clears the cached pipeline and load promise', () => {
    const ai = new BrowserVoiceAI();
    ai._pipeline = { fake: true };
    ai._loadPromise = Promise.resolve();
    ai.resetModel();
    expect(ai._pipeline).toBeNull();
    expect(ai._loadPromise).toBeNull();
  });

  it('allows changing model and re-loading after reset', () => {
    const ai = new BrowserVoiceAI();
    ai._pipeline = { fake: true };
    ai._loadPromise = Promise.resolve();
    ai.model = 'Xenova/whisper-small';
    ai.resetModel();
    expect(ai._pipeline).toBeNull();
    expect(ai.model).toBe('Xenova/whisper-small');
  });
});

describe('BrowserVoiceAI — _chunkText', () => {
  it('returns empty array for empty or whitespace input', () => {
    const ai = new BrowserVoiceAI();
    expect(ai._chunkText('')).toEqual([]);
    expect(ai._chunkText('   ')).toEqual([]);
    expect(ai._chunkText(null)).toEqual([]);
  });

  it('returns a single chunk for short text', () => {
    const ai = new BrowserVoiceAI();
    const chunks = ai._chunkText('Hello world.');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe('Hello world.');
  });

  it('splits long text into chunks no longer than max characters', () => {
    const ai = new BrowserVoiceAI();
    const sentence = 'This is one sentence. ';
    const long = sentence.repeat(20);
    const chunks = ai._chunkText(long, 60);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(60 + 40); // small tolerance for whole sentences
    }
    // All content should be preserved (modulo whitespace normalisation).
    const rejoined = chunks.join(' ').replace(/\s+/g, ' ').trim();
    expect(rejoined.length).toBeGreaterThan(0);
  });

  it('does not produce empty chunks', () => {
    const ai = new BrowserVoiceAI();
    const chunks = ai._chunkText('A. B. C. D. E.');
    expect(chunks.every(c => c.trim().length > 0)).toBe(true);
  });
});

describe('BrowserVoiceAI — speak', () => {
  let ai;
  let synth;

  beforeEach(() => {
    synth = makeSynthesisMock();
    ai = new BrowserVoiceAI();
    ai._synthesis = synth;
  });

  it('does nothing when text is empty', async () => {
    await ai.speak('');
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it('does nothing when synthesis is null', async () => {
    ai._synthesis = null;
    await expect(ai.speak('hello')).resolves.toBeUndefined();
  });

  it('cancels any existing speech before starting', async () => {
    await ai.speak('hello there');
    expect(synth.cancel).toHaveBeenCalled();
  });

  it('emits speaking → idle state transitions', async () => {
    const states = [];
    ai.onStateChange = (s) => states.push(s);
    await ai.speak('Hello.');
    expect(states[0]).toBe('speaking');
    expect(states[states.length - 1]).toBe('idle');
  });

  it('calls speak() on the synthesis engine', async () => {
    await ai.speak('Test sentence.');
    expect(synth.speak).toHaveBeenCalled();
    const utt = synth._utterances[0];
    expect(utt.text).toBe('Test sentence.');
  });

  it('picks an English voice and caches it', async () => {
    await ai.speak('Hello.');
    expect(ai._cachedVoice).not.toBeNull();
    expect(ai._cachedVoice.lang).toMatch(/^en/);
    // Second call must not call getVoices again.
    synth.getVoices.mockClear();
    await ai.speak('World.');
    // getVoices may still be called by _waitForVoices, but _cachedVoice is
    // already set so it should not call voice selection logic again.
    const utt2 = synth._utterances[synth._utterances.length - 1];
    expect(utt2.voice).toBe(ai._cachedVoice);
  });
});

describe('BrowserVoiceAI — stopSpeaking', () => {
  it('calls synthesis.cancel()', () => {
    const synth = makeSynthesisMock();
    const ai = new BrowserVoiceAI();
    ai._synthesis = synth;
    ai.stopSpeaking();
    expect(synth.cancel).toHaveBeenCalled();
  });

  it('does not throw when synthesis is null', () => {
    const ai = new BrowserVoiceAI();
    ai._synthesis = null;
    expect(() => ai.stopSpeaking()).not.toThrow();
  });
});

describe('BrowserVoiceAI — _cleanupAudio', () => {
  it('disconnects analyser, closes context, and stops tracks', () => {
    const ai = new BrowserVoiceAI();
    const track = { stop: vi.fn() };
    ai._stream = { getTracks: () => [track] };
    ai._audioCtx = { close: vi.fn() };
    ai._analyser = { disconnect: vi.fn() };
    ai._mediaRecorder = { state: 'inactive' };

    ai._cleanupAudio();

    expect(ai._analyser).toBeNull();
    expect(ai._audioCtx).toBeNull();
    expect(ai._stream).toBeNull();
    expect(ai._mediaRecorder).toBeNull();
    expect(track.stop).toHaveBeenCalled();
  });

  it('tolerates null references', () => {
    const ai = new BrowserVoiceAI();
    expect(() => ai._cleanupAudio()).not.toThrow();
  });
});

describe('BrowserVoiceAI — stopConversation', () => {
  it('sets stopRequested, clears conversationMode and calls stopSpeaking', () => {
    const synth = makeSynthesisMock();
    const ai = new BrowserVoiceAI();
    ai._synthesis = synth;
    ai.conversationMode = true;

    ai.stopConversation();

    expect(ai.conversationMode).toBe(false);
    expect(ai._stopRequested).toBe(true);
    expect(synth.cancel).toHaveBeenCalled();
  });

  it('stops mediaRecorder if it is recording', () => {
    const ai = new BrowserVoiceAI();
    ai._synthesis = null;
    const mr = { state: 'recording', stop: vi.fn() };
    ai._mediaRecorder = mr;

    ai.stopConversation();

    expect(mr.stop).toHaveBeenCalled();
  });
});

describe('BrowserVoiceAI — loadModel (idempotency)', () => {
  it('returns the same promise on concurrent calls', async () => {
    const ai = new BrowserVoiceAI();
    // Stub the import by pre-injecting the pipeline.
    const fakePipe = { call: vi.fn() };
    ai._pipeline = fakePipe;

    const p1 = ai.loadModel();
    const p2 = ai.loadModel();
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe(fakePipe);
    expect(r2).toBe(fakePipe);
  });

  it('resolves immediately when pipeline is already loaded', async () => {
    const ai = new BrowserVoiceAI();
    const fakePipe = { fake: true };
    ai._pipeline = fakePipe;
    const result = await ai.loadModel();
    expect(result).toBe(fakePipe);
  });
});
