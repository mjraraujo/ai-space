/**
 * BrowserVoiceAI — fully browser-native voice conversation with optional
 * server-side transcription backend.
 *
 * Transcription backend priority (auto-detected):
 *   1. Server Whisper (faster-whisper via /api/transcribe) — 10× faster, full accuracy.
 *   2. WebGPU Whisper (transformers.js) — on-device, no server required.
 *   3. WASM Whisper (transformers.js) — broadest compatibility fallback.
 *
 * The server backend is used when `window.__SERVER_URL__` is set and the
 * /api/transcribe endpoint is reachable. Set `useServerTranscription = false`
 * to disable it and force the in-browser path.
 *
 * Browser Whisper model options (set BrowserVoiceAI#model before calling loadModel):
 *   'Xenova/whisper-tiny'   ~75 MB  — fastest, good for English
 *   'Xenova/whisper-base'   ~145 MB — balanced quality
 *   'Xenova/whisper-small'  ~488 MB — highest quality
 */

const TRANSFORMERS_CDN = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

/** Silence threshold (0–128 RMS on 8-bit time-domain data). */
const SILENCE_THRESHOLD = 6;
/** ms of silence before the utterance is considered finished. */
const SILENCE_MS = 1800;
/** Minimum ms of speech required before a segment is accepted. */
const MIN_SPEECH_MS = 400;

/** Derive the API server URL injected by nginx (or empty string). */
const _SERVER_URL = () =>
  ((typeof window !== 'undefined' && window.__SERVER_URL__) || '').replace(/\/+$/, '');

export class BrowserVoiceAI {
  constructor() {
    /** Whisper model name from Hugging Face hub. */
    this.model = 'Xenova/whisper-tiny';
    /** BCP-47 language hint for transcription (null = auto-detect). */
    this.language = 'english';
    /** Whether the conversation loop is active. */
    this.conversationMode = false;
    /** Whether audio is currently being captured. */
    this.isRecording = false;
    /**
     * When true (default), prefer server-side transcription if the AI Space
     * server is available. Set to false to always use in-browser Whisper.
     */
    this.useServerTranscription = true;

    this._pipeline = null;
    this._loadPromise = null;
    this._stopRequested = false;
    this._stream = null;
    this._mediaRecorder = null;
    this._audioChunks = [];
    this._audioCtx = null;
    this._analyser = null;
    this._synthesis = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
    this._cachedVoice = null;

    /**
     * Called when internal state changes.
     * @type {((state: 'idle'|'loading'|'listening'|'transcribing'|'thinking'|'speaking') => void)|null}
     */
    this.onStateChange = null;

    /**
     * Called with the transcribed user text before it is sent to the AI.
     * @type {((text: string) => void)|null}
     */
    this.onTranscript = null;

    /**
     * Called with model download progress.
     * @type {((info: {status: string, name: string, file: string, progress: number, loaded: number, total: number}) => void)|null}
     */
    this.onProgress = null;

    /**
     * Called on unrecoverable errors.
     * @type {((err: Error) => void)|null}
     */
    this.onError = null;
  }

  /** True when MediaRecorder is available (required for audio capture). */
  get supported() {
    return typeof MediaRecorder !== 'undefined' && typeof AudioContext !== 'undefined';
  }

  // ─── State helper ───────────────────────────────────────────────────────────

  _setState(s) {
    if (this.onStateChange) this.onStateChange(s);
  }

  // ─── Model loading ──────────────────────────────────────────────────────────

  /**
   * Download and initialise the Whisper pipeline.
   * Safe to call multiple times — returns the same promise on concurrent calls.
   */
  async loadModel() {
    if (this._pipeline) return this._pipeline;
    if (this._loadPromise) return this._loadPromise;

    this._loadPromise = (async () => {
      this._setState('loading');

      // Dynamic import from CDN — no npm install required.
      const { pipeline, env } = await import(/* @vite-ignore */ `${TRANSFORMERS_CDN}/dist/transformers.min.js`);

      // Only use CDN models (no local file access needed).
      env.allowLocalModels = false;
      env.useBrowserCache = true;

      const pipe = await pipeline(
        'automatic-speech-recognition',
        this.model,
        {
          progress_callback: (info) => {
            if (this.onProgress) this.onProgress(info);
          },
          dtype: 'q8',   // 8-bit quantisation for speed / memory
          device: 'webgpu',
        }
      ).catch(async () => {
        // WebGPU unavailable or unsupported — fall back to WASM explicitly.
        return pipeline(
          'automatic-speech-recognition',
          this.model,
          {
            progress_callback: (info) => {
              if (this.onProgress) this.onProgress(info);
            },
            dtype: 'q8',
            device: 'wasm',
          }
        );
      });

      this._pipeline = pipe;
      this._setState('idle');
      return pipe;
    })();

    return this._loadPromise;
  }

  // ─── Transcription ──────────────────────────────────────────────────────────

  /**
   * Transcribe an audio Blob using Whisper.
   * @param {Blob} blob
   * @returns {Promise<string>}
   */
  async transcribe(blob) {
    const pipe = await this.loadModel();
    this._setState('transcribing');

    // Convert Blob to a Float32Array of PCM samples via AudioContext.
    const arrayBuffer = await blob.arrayBuffer();
    const decodeCtx = new AudioContext({ sampleRate: 16000 });
    let decoded;
    try {
      decoded = await decodeCtx.decodeAudioData(arrayBuffer);
    } finally {
      decodeCtx.close();
    }

    // Whisper expects 16 kHz mono Float32Array.
    const channelData = decoded.getChannelData(0);

    const opts = { return_timestamps: false };
    if (this.language) opts.language = this.language;

    const result = await pipe(channelData, opts);
    return (result.text || '').trim();
  }

  // ─── Transcription routing ──────────────────────────────────────────────────

  /**
   * Attempt transcription via the AI Space backend (faster-whisper).
   * Returns null on any failure so the caller can fall back to browser Whisper.
   * @param {Blob} blob
   * @returns {Promise<string|null>}
   */
  async _transcribeViaServer(blob) {
    const serverUrl = _SERVER_URL();
    if (!serverUrl) return null;
    try {
      const res = await fetch(`${serverUrl}/api/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': blob.type || 'audio/webm' },
        body: blob,
        signal: AbortSignal.timeout(30_000)
      });
      if (!res.ok) return null;
      const data = await res.json();
      return (data.text || '').trim() || null;
    } catch {
      return null;
    }
  }


  /**
   * Start microphone capture.  Resolves once the stream is open.
   */
  async _startCapture() {
    this._stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });

    // Silence detection via AnalyserNode.
    this._audioCtx = new AudioContext();
    this._analyser = this._audioCtx.createAnalyser();
    this._analyser.fftSize = 256;
    const src = this._audioCtx.createMediaStreamSource(this._stream);
    src.connect(this._analyser);

    // Choose the best supported mime type for MediaRecorder.
    let mimeType = '';
    for (const mt of [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ]) {
      if (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(mt)) {
        mimeType = mt;
        break;
      }
    }

    this._audioChunks = [];
    this._mediaRecorder = new MediaRecorder(this._stream, mimeType ? { mimeType } : {});
    this._mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this._audioChunks.push(e.data);
    };
    this._mediaRecorder.start(100);
    this.isRecording = true;
  }

  /**
   * Stop microphone capture and return the recorded Blob.
   * @returns {Promise<Blob>}
   */
  _stopCapture() {
    return new Promise((resolve) => {
      const finish = () => {
        const mimeType = this._mediaRecorder?.mimeType || 'audio/webm';
        const blob = new Blob(this._audioChunks, { type: mimeType });
        this._audioChunks = [];
        this.isRecording = false;
        this._cleanupAudio();
        resolve(blob);
      };

      if (!this._mediaRecorder || this._mediaRecorder.state === 'inactive') {
        finish();
        return;
      }

      this._mediaRecorder.onstop = finish;
      this._mediaRecorder.stop();
    });
  }

  _cleanupAudio() {
    if (this._analyser) {
      try { this._analyser.disconnect(); } catch {}
      this._analyser = null;
    }
    if (this._audioCtx) {
      try { this._audioCtx.close(); } catch {}
      this._audioCtx = null;
    }
    if (this._stream) {
      this._stream.getTracks().forEach(t => t.stop());
      this._stream = null;
    }
    this._mediaRecorder = null;
  }

  /**
   * Record one utterance: wait for speech then stop on silence.
   * @returns {Promise<Blob|null>}  null if stopped externally before any speech.
   */
  async listenOnce() {
    await this._startCapture();
    this._setState('listening');

    return new Promise((resolve) => {
      const dataArray = new Uint8Array(this._analyser.frequencyBinCount);
      let silenceStart = null;
      let speechStart = null;

      const poll = setInterval(async () => {
        if (this._stopRequested) {
          clearInterval(poll);
          const blob = await this._stopCapture();
          resolve(blob);
          return;
        }

        this._analyser.getByteTimeDomainData(dataArray);
        // RMS of deviation from centre (128).
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const d = dataArray[i] - 128;
          sum += d * d;
        }
        const rms = Math.sqrt(sum / dataArray.length);

        if (rms > SILENCE_THRESHOLD) {
          // Sound detected.
          if (!speechStart) speechStart = Date.now();
          silenceStart = null;
        } else {
          // Silence.
          if (speechStart && !silenceStart) {
            silenceStart = Date.now();
          }
          if (
            speechStart &&
            silenceStart &&
            Date.now() - speechStart >= MIN_SPEECH_MS &&
            Date.now() - silenceStart >= SILENCE_MS
          ) {
            clearInterval(poll);
            const blob = await this._stopCapture();
            resolve(blob);
          }
        }
      }, 80);
    });
  }

  // ─── TTS ────────────────────────────────────────────────────────────────────

  _waitForVoices() {
    return new Promise((resolve) => {
      const v = this._synthesis.getVoices();
      if (v.length > 0) return resolve(v);
      let tries = 0;
      const t = setInterval(() => {
        const vv = this._synthesis.getVoices();
        if (vv.length > 0 || ++tries > 20) { clearInterval(t); resolve(vv); }
      }, 100);
    });
  }

  _chunkText(text, max = 220) {
    const clean = (text || '').replace(/\s+/g, ' ').trim();
    if (!clean) return [];
    const sentences = clean.match(/[^.!?]+[.!?]?/g) || [clean];
    const out = [];
    let cur = '';
    for (const s of sentences) {
      const t = s.trim();
      if (!t) continue;
      if (!cur) { cur = t; continue; }
      if ((cur + ' ' + t).length <= max) { cur += ' ' + t; }
      else { out.push(cur); cur = t; }
    }
    if (cur) out.push(cur);
    return out;
  }

  /**
   * Speak text via SpeechSynthesis.
   * @param {string} text
   * @returns {Promise<void>}
   */
  async speak(text) {
    if (!this._synthesis || !text) return;
    this._setState('speaking');

    this._synthesis.cancel();

    const voices = await this._waitForVoices();
    if (!this._cachedVoice && voices.length > 0) {
      const en = voices.filter(v => /^en[-_]/i.test(v.lang) || v.lang.toLowerCase() === 'en');
      const preferred = [
        'samantha (enhanced)', 'ava (enhanced)', 'allison (enhanced)',
        'samantha', 'ava', 'allison', 'google us english', 'google uk english',
        'enhanced', 'premium', 'natural', 'neural',
        'zoe', 'nicky', 'tom', 'karen', 'daniel',
      ];
      let picked = null;
      for (const p of preferred) {
        picked = en.find(v => v.name.toLowerCase().includes(p));
        if (picked) break;
      }
      this._cachedVoice = picked || en[0] || voices[0] || null;
    }

    const chunks = this._chunkText(text);
    if (!chunks.length) { this._setState('idle'); return; }

    await new Promise((resolve) => {
      let idx = 0;
      const next = () => {
        if (this._stopRequested || idx >= chunks.length) {
          this._setState('idle');
          resolve();
          return;
        }
        const utt = new SpeechSynthesisUtterance(chunks[idx]);
        utt.voice = this._cachedVoice || null;
        utt.lang = this._cachedVoice?.lang || 'en-US';
        utt.rate = 0.94;
        utt.pitch = 1.02;
        utt.volume = 1.0;
        utt.onend = () => { idx++; next(); };
        utt.onerror = (e) => {
          if (e.error !== 'interrupted' && e.error !== 'canceled') {
            console.warn('[browser-voice-ai] TTS error:', e.error);
          }
          this._setState('idle');
          resolve();
        };
        this._synthesis.speak(utt);
      };
      next();
    });
  }

  stopSpeaking() {
    if (this._synthesis) this._synthesis.cancel();
  }

  /**
   * Reset the loaded Whisper pipeline so a new model will be fetched on the
   * next call to loadModel(). Call this after changing the `model` property.
   */
  resetModel() {
    this._pipeline = null;
    this._loadPromise = null;
  }

  /**
   * Check whether the Whisper model files are already cached in the browser's
   * Cache API (populated on a previous loadModel() call).
   *
   * @returns {Promise<boolean>} `true` when at least one model shard for the
   *   currently selected model is present in any open cache.
   */
  async checkModelCached() {
    if (typeof caches === 'undefined') return false;
    try {
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        // Model shards are stored as Hugging Face CDN URLs that include the
        // full model id, e.g. "Xenova/whisper-tiny". Check for both the
        // raw id and its URL-encoded variant ("%2F").
        const found = keys.some(req =>
          req.url.includes(this.model) ||
          req.url.includes(encodeURIComponent(this.model))
        );
        if (found) return true;
      }
    } catch {
      // caches.keys() can throw in non-secure contexts — treat as not cached.
    }
    return false;
  }

  // ─── Conversation loop ──────────────────────────────────────────────────────

  /**
   * Start a continuous voice conversation entirely in the browser.
   *
   * @param {(text: string) => Promise<string>} getAIResponse
   *   Async callback — receives the user's transcribed text and must return
   *   the assistant's response text.
   */
  async startConversation(getAIResponse) {
    if (this.conversationMode) return;
    this.conversationMode = true;
    this._stopRequested = false;

    // Determine transcription backend. Try server first; fall back to Whisper WASM/WebGPU.
    const serverUrl = _SERVER_URL();
    const useServer = this.useServerTranscription && Boolean(serverUrl);

    // Pre-load the browser Whisper model only when no server backend is available.
    if (!useServer) {
      try {
        await this.loadModel();
      } catch (err) {
        this.conversationMode = false;
        if (this.onError) this.onError(err);
        throw err;
      }
    }

    // Conversation loop.
    while (this.conversationMode && !this._stopRequested) {
      try {
        // 1. Listen for user speech.
        const blob = await this.listenOnce();
        if (this._stopRequested) break;

        if (!blob || blob.size < 1000) {
          // Too short — resume listening.
          continue;
        }

        // 2. Transcribe — try server first, fall back to in-browser Whisper.
        let text;
        try {
          if (useServer) {
            text = await this._transcribeViaServer(blob);
          }
          if (!text) {
            // Server unavailable or returned empty — use browser Whisper.
            await this.loadModel();
            text = await this.transcribe(blob);
          }
        } catch (err) {
          console.warn('[browser-voice-ai] Transcription failed:', err);
          continue;
        }

        if (!text) continue;
        if (this.onTranscript) this.onTranscript(text);

        // 3. Get AI response.
        this._setState('thinking');
        let response;
        try {
          response = await getAIResponse(text);
        } catch (err) {
          console.warn('[browser-voice-ai] AI response failed:', err);
          continue;
        }

        if (this._stopRequested) break;

        // 4. Speak response.
        if (response) {
          await this.speak(response);
        }
      } catch (err) {
        if (!this._stopRequested) {
          console.warn('[browser-voice-ai] Loop error:', err);
          if (this.onError) this.onError(err);
        }
        break;
      }
    }

    this.conversationMode = false;
    this._stopRequested = false;
    this._cleanupAudio();
    this._setState('idle');
  }

  /**
   * Stop the conversation loop gracefully.
   */
  stopConversation() {
    this._stopRequested = true;
    this.conversationMode = false;
    this.stopSpeaking();
    if (this._mediaRecorder && this._mediaRecorder.state !== 'inactive') {
      try { this._mediaRecorder.stop(); } catch {}
    }
    this._cleanupAudio();
    this._setState('idle');
  }
}
