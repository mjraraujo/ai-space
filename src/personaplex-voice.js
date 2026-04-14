/**
 * PersonaPlexVoice — Full-duplex speech-to-speech backend using NVIDIA PersonaPlex.
 *
 * PersonaPlex runs as a local Python server. Start it with:
 *   SSL_DIR=$(mktemp -d); python -m moshi.server --ssl "$SSL_DIR"
 * then open https://localhost:8998 in your browser to accept the self-signed cert,
 * then enable PersonaPlex in AI Space Settings → Voice.
 *
 * Protocol
 * --------
 *  • WebSocket endpoint : wss://localhost:8998/api/chat  (ws:// for http servers)
 *  • On open            : client sends JSON config message
 *  • Audio upstream     : client sends binary Float32Array frames (PCM, 24 kHz, mono)
 *  • Audio downstream   : server sends binary Float32Array frames (PCM, 24 kHz, mono)
 *  • Text downstream    : server sends JSON messages (user_transcript / assistant_transcript)
 *
 * Voice presets
 * -------------
 *  Natural female : NATF0 – NATF3
 *  Natural male   : NATM0 – NATM3
 *  Variety female : VARF0 – VARF4
 *  Variety male   : VARM0 – VARM4
 *
 * See: https://github.com/NVIDIA/personaplex
 */

/** All voice presets bundled with PersonaPlex. */
export const PERSONAPLEX_VOICES = [
  { id: 'NATF0', label: 'Natural Female 0 (NATF0)' },
  { id: 'NATF1', label: 'Natural Female 1 (NATF1)' },
  { id: 'NATF2', label: 'Natural Female 2 (NATF2)' },
  { id: 'NATF3', label: 'Natural Female 3 (NATF3)' },
  { id: 'NATM0', label: 'Natural Male 0 (NATM0)' },
  { id: 'NATM1', label: 'Natural Male 1 (NATM1)' },
  { id: 'NATM2', label: 'Natural Male 2 (NATM2)' },
  { id: 'NATM3', label: 'Natural Male 3 (NATM3)' },
  { id: 'VARF0', label: 'Variety Female 0 (VARF0)' },
  { id: 'VARF1', label: 'Variety Female 1 (VARF1)' },
  { id: 'VARF2', label: 'Variety Female 2 (VARF2)' },
  { id: 'VARF3', label: 'Variety Female 3 (VARF3)' },
  { id: 'VARF4', label: 'Variety Female 4 (VARF4)' },
  { id: 'VARM0', label: 'Variety Male 0 (VARM0)' },
  { id: 'VARM1', label: 'Variety Male 1 (VARM1)' },
  { id: 'VARM2', label: 'Variety Male 2 (VARM2)' },
  { id: 'VARM3', label: 'Variety Male 3 (VARM3)' },
  { id: 'VARM4', label: 'Variety Male 4 (VARM4)' },
];

const SAMPLE_RATE = 24000;
// ScriptProcessorNode buffer — closest power-of-2 to 80 ms at 24 kHz (1920 samples)
const SCRIPT_BUFFER_SIZE = 2048;

export class PersonaPlexVoice {
  constructor() {
    /** Base URL of the PersonaPlex server (http or https). */
    this.serverUrl = 'https://localhost:8998';
    /** Voice preset ID sent to the model, e.g. 'NATF0'. */
    this.voicePrompt = 'NATF0';
    /** Text persona prompt that controls the model's behaviour and identity. */
    this.personaText = 'You enjoy having a good conversation.';

    this._ws = null;
    this._audioCtx = null;
    this._stream = null;
    this._processor = null;
    this._nextPlayTime = 0;
    this._state = 'idle';

    this.isConnected = false;
    this.isRecording = false;

    /**
     * Called whenever the internal state changes.
     * @type {((state: 'idle'|'connecting'|'listening'|'speaking') => void) | null}
     */
    this.onStateChange = null;

    /**
     * Called with user transcript text received from the server.
     * @type {((text: string) => void) | null}
     */
    this.onTranscript = null;

    /**
     * Called with assistant response text received from the server.
     * @type {((text: string) => void) | null}
     */
    this.onAssistantText = null;

    /**
     * Called with an Error when a connection problem occurs.
     * @type {((err: Error) => void) | null}
     */
    this.onError = null;
  }

  /** True when the browser supports all required APIs. */
  get supported() {
    return (
      typeof WebSocket !== 'undefined' &&
      (typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined') &&
      typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices !== 'undefined'
    );
  }

  _setState(s) {
    this._state = s;
    if (this.onStateChange) this.onStateChange(s);
  }

  /** Derive the wss:// WebSocket URL from the configured serverUrl. */
  _wsUrl() {
    return this.serverUrl
      .replace(/^https:\/\//i, 'wss://')
      .replace(/^http:\/\//i, 'ws://')
      .replace(/\/+$/, '') + '/api/chat';
  }

  /**
   * Open a WebSocket connection to PersonaPlex and send the initial config.
   * Resolves once the connection is open; rejects on error or timeout.
   * @returns {Promise<void>}
   */
  connect() {
    if (this.isConnected) return Promise.resolve();
    this._setState('connecting');

    return new Promise((resolve, reject) => {
      const wsUrl = this._wsUrl();
      let ws;
      try {
        ws = new WebSocket(wsUrl);
      } catch (err) {
        this._setState('idle');
        return reject(new Error(`Cannot open WebSocket to ${wsUrl}: ${err.message}`));
      }

      ws.binaryType = 'arraybuffer';

      const timeout = setTimeout(() => {
        ws.close();
        this._setState('idle');
        reject(new Error(
          'Connection timed out. Make sure the PersonaPlex server is running:\n' +
          'SSL_DIR=$(mktemp -d); python -m moshi.server --ssl "$SSL_DIR"'
        ));
      }, 8000);

      ws.onopen = () => {
        clearTimeout(timeout);
        this._ws = ws;
        this.isConnected = true;
        // Send model configuration
        ws.send(JSON.stringify({
          type: 'config',
          voice_prompt: this.voicePrompt,
          text_prompt: this.personaText,
        }));
        resolve();
      };

      ws.onmessage = (event) => this._handleMessage(event);

      ws.onerror = () => {
        clearTimeout(timeout);
        this.isConnected = false;
        this._setState('idle');
        const err = new Error(
          `WebSocket error at ${wsUrl}. ` +
          'Is the PersonaPlex server running? You may need to open ' +
          this.serverUrl + ' in a browser tab first to accept the self-signed certificate.'
        );
        if (this.onError) this.onError(err);
        reject(err);
      };

      ws.onclose = () => {
        clearTimeout(timeout);
        this.isConnected = false;
        if (this._state !== 'idle') {
          this._cleanupAudio();
          this._setState('idle');
        }
      };
    });
  }

  /** Handle an incoming WebSocket message. */
  _handleMessage(event) {
    if (event.data instanceof ArrayBuffer) {
      // Binary frame: PCM float32 audio produced by the model (assistant speaking)
      this._playAudioBuffer(event.data);
      this._setState('speaking');
    } else if (typeof event.data === 'string') {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'user_transcript' && msg.text) {
          if (this.onTranscript) this.onTranscript(msg.text);
          this._setState('listening');
        } else if ((msg.type === 'assistant_transcript' || msg.type === 'assistant_text') && msg.text) {
          if (this.onAssistantText) this.onAssistantText(msg.text);
        } else if (msg.type === 'config_ack' || msg.type === 'ready') {
          this._setState('listening');
        }
      } catch {
        // Ignore non-JSON text frames
      }
    }
  }

  /**
   * Schedule an incoming PCM Float32 audio buffer (from the server) for playback.
   * Frames are queued to play back-to-back without gaps.
   * @param {ArrayBuffer} buffer
   */
  _playAudioBuffer(buffer) {
    if (!this._audioCtx) return;
    if (this._audioCtx.state === 'suspended') {
      this._audioCtx.resume().catch(() => {});
    }

    const float32 = new Float32Array(buffer);
    if (float32.length === 0) return;

    const audioBuf = this._audioCtx.createBuffer(1, float32.length, SAMPLE_RATE);
    audioBuf.copyToChannel(float32, 0);

    const source = this._audioCtx.createBufferSource();
    source.buffer = audioBuf;
    source.connect(this._audioCtx.destination);

    const now = this._audioCtx.currentTime;
    const startAt = Math.max(now, this._nextPlayTime);
    source.start(startAt);
    this._nextPlayTime = startAt + audioBuf.duration;
  }

  /**
   * Start a full-duplex PersonaPlex voice session.
   * Connects to the server, opens the microphone, and begins streaming audio
   * in both directions.
   * @returns {Promise<void>}
   */
  async startConversation() {
    if (this.isRecording) return;

    // AudioContext must be created at the model's native sample rate
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this._audioCtx = new AudioCtx({ sampleRate: SAMPLE_RATE });
    this._nextPlayTime = this._audioCtx.currentTime;

    // Connect to PersonaPlex server
    await this.connect();

    // Request microphone access
    try {
      this._stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
    } catch (err) {
      this._closeWs();
      this._cleanupAudio();
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        throw new Error('Microphone access denied. Allow microphone access in your browser settings.');
      }
      throw new Error('Microphone error: ' + err.message);
    }

    // Capture PCM from microphone and stream to PersonaPlex via WebSocket.
    // ScriptProcessorNode is deprecated in favour of AudioWorkletNode, but it
    // is universally supported in all current browsers and sufficient here.
    // A future migration to AudioWorkletNode would require a separate worklet
    // module file and is left as a follow-up improvement.
    const micSource = this._audioCtx.createMediaStreamSource(this._stream);
    this._processor = this._audioCtx.createScriptProcessor(SCRIPT_BUFFER_SIZE, 1, 1);

    this._processor.onaudioprocess = (ev) => {
      if (!this.isRecording || this._ws?.readyState !== WebSocket.OPEN) return;
      const channelData = ev.inputBuffer.getChannelData(0);
      this._ws.send(new Float32Array(channelData).buffer);
    };

    micSource.connect(this._processor);

    // A zero-gain destination node keeps the AudioContext alive without
    // sending the captured mic audio to the speakers.
    const silentGain = this._audioCtx.createGain();
    silentGain.gain.value = 0;
    this._processor.connect(silentGain);
    silentGain.connect(this._audioCtx.destination);

    this.isRecording = true;
    this._setState('listening');
  }

  /**
   * Stop the voice session and release all resources.
   */
  stopConversation() {
    this.isRecording = false;
    this._cleanupAudio();
    this._closeWs();
    this._setState('idle');
  }

  /**
   * Ping the server (connect, wait briefly, disconnect) to verify reachability.
   * @returns {Promise<void>}
   */
  async testConnection() {
    await this.connect();
    await new Promise(r => setTimeout(r, 600));
    this._closeWs();
    this._setState('idle');
  }

  _closeWs() {
    if (this._ws) {
      try { this._ws.close(); } catch {}
      this._ws = null;
    }
    this.isConnected = false;
  }

  _cleanupAudio() {
    if (this._processor) {
      try { this._processor.disconnect(); } catch {}
      this._processor = null;
    }
    if (this._stream) {
      this._stream.getTracks().forEach(t => t.stop());
      this._stream = null;
    }
    if (this._audioCtx) {
      try { this._audioCtx.close(); } catch {}
      this._audioCtx = null;
    }
  }
}
