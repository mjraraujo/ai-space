/**
 * Voice - Real-time voice conversation
 * 
 * Input: MediaRecorder -> audio blob -> transcription
 *   - Primary: MediaRecorder API (works on iOS Safari 14.5+)
 *   - Enhancement: SpeechRecognition for real-time feedback (Chrome)
 * 
 * Output: SpeechSynthesis (works on iOS Safari)
 * 
 * States: idle, listening, processing, speaking
 */

export class Voice {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording = false;
    this.stream = null;
    this.synthesis = window.speechSynthesis || null;
    this.ttsEnabled = true;
    this.onStateChange = null; // callback(state: 'idle'|'listening'|'processing'|'speaking')
    this.onInterimResult = null; // callback(text) - interim transcription text
    this.onSilenceDetected = null; // callback(text) - conversation mode: user stopped talking
    this.conversationMode = false; // continuous listen -> respond -> listen loop
    this.silenceTimeout = 2000; // ms of silence before auto-sending (2s for natural pauses)
    this.preferredLang = 'en-US'; // force English
    this.preferredVoiceIndex = -1; // -1 = auto-pick best
    this._recognition = null;
    this._recognitionResolve = null;
    this._interimText = '';
    this._finalText = '';
    this._state = 'idle';
    this._voicesLoaded = false;

    // Feature detection
    const SRConstructor = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.hasSpeechRecognition = !!SRConstructor;
    this.hasMediaRecorder = typeof MediaRecorder !== 'undefined';

    // Preload voices for TTS
    if (this.synthesis) {
      const loadVoices = () => {
        this._voicesLoaded = true;
      };
      this.synthesis.addEventListener('voiceschanged', loadVoices);
      // Some browsers fire voiceschanged, some have voices ready immediately
      if (this.synthesis.getVoices().length > 0) {
        this._voicesLoaded = true;
      }
    }
  }

  get supported() {
    return this.hasSpeechRecognition || this.hasMediaRecorder;
  }

  _setState(s) {
    this._state = s;
    if (this.onStateChange) this.onStateChange(s);
  }

  /**
   * Start recording audio.
   * On Chrome: uses SpeechRecognition for real-time transcription.
   * On iOS Safari / other: uses MediaRecorder to capture audio blob.
   */
  async startRecording() {
    if (this.isRecording) return;

    // If SpeechRecognition is available (Chrome), use it for real-time feedback
    if (this.hasSpeechRecognition) {
      return this._startSpeechRecognition();
    }

    // Fallback to MediaRecorder (iOS Safari 14.5+, Firefox, etc.)
    if (!this.hasMediaRecorder) {
      throw new Error('No voice input available on this browser');
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      this.audioChunks = [];

      // Determine best supported mime type
      let mimeType = 'audio/webm;codecs=opus';
      if (typeof MediaRecorder.isTypeSupported === 'function') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/aac')) {
          mimeType = 'audio/aac';
        } else {
          // Let the browser pick
          mimeType = '';
        }
      }

      const options = mimeType ? { mimeType } : {};
      this.mediaRecorder = new MediaRecorder(this.stream, options);

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.audioChunks.push(e.data);
        }
      };

      this.mediaRecorder.onerror = (e) => {
        console.warn('MediaRecorder error:', e.error);
      };

      this.mediaRecorder.start(250); // collect data every 250ms for responsiveness
      this.isRecording = true;
      this._setState('listening');
    } catch (err) {
      this._cleanup();
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        throw new Error('Microphone access denied. Please allow microphone access in your browser settings.');
      }
      throw new Error('Microphone access failed: ' + err.message);
    }
  }

  /**
   * Stop recording and get result
   * @returns {Promise<{text: string, audio?: Blob}>}
   */
  async stopRecording() {
    if (!this.isRecording) return { text: '' };

    // SpeechRecognition path
    if (this._recognition) {
      return this._stopSpeechRecognition();
    }

    // MediaRecorder path
    return new Promise((resolve) => {
      this.mediaRecorder.onstop = () => {
        this.isRecording = false;
        this._setState('processing');
        
        const mimeType = this.mediaRecorder.mimeType || 'audio/webm';
        const blob = new Blob(this.audioChunks, { type: mimeType });
        this.audioChunks = [];
        this._cleanup();

        // Return audio blob — app.js will handle transcription via cloud Whisper or display
        resolve({ text: '', audio: blob });
      };

      if (this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      } else {
        this.isRecording = false;
        this._setState('idle');
        this._cleanup();
        resolve({ text: '' });
      }
    });
  }

  /**
   * SpeechRecognition path (Chrome, some Android browsers)
   * Provides real-time transcription feedback
   */
  _startSpeechRecognition() {
    return new Promise((resolve, reject) => {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      this._recognition = new SR();
      this._recognition.lang = this.preferredLang || 'en-US';
      this._recognition.interimResults = true;
      this._recognition.continuous = true;
      this._recognition.maxAlternatives = 1;
      this._recognitionResolve = null;
      this._interimText = '';
      this._finalText = '';
      this._silenceTimer = null;
      this._lastSpeechTime = Date.now();

      this._recognition.onresult = (event) => {
        let interim = '';
        let final = '';
        for (let i = 0; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        this._finalText = final;
        this._interimText = interim;
        this._lastSpeechTime = Date.now();

        if (this.onInterimResult) {
          this.onInterimResult(final + interim);
        }

        // In conversation mode: auto-send after silence
        if (this.conversationMode && final) {
          this._resetSilenceTimer();
        }
      };

      this._recognition.onerror = (event) => {
        if (event.error === 'not-allowed') {
          this.isRecording = false;
          this._setState('idle');
          this._recognition = null;
          reject(new Error('Microphone access denied'));
          return;
        }
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          console.warn('Speech recognition error:', event.error);
        }
      };

      this._recognition.onend = () => {
        this._clearSilenceTimer();
        if (this.isRecording && this._recognitionResolve) {
          this.isRecording = false;
          this._setState('idle');
          this._recognitionResolve({ text: this._finalText || this._interimText });
          this._recognitionResolve = null;
          this._recognition = null;
        } else if (this.isRecording && this.conversationMode) {
          // In conversation mode, auto-restart if recognition ends unexpectedly
          try { this._recognition.start(); } catch {}
        }
      };

      try {
        this._recognition.start();
        this.isRecording = true;
        this._setState('listening');
        resolve();
      } catch (err) {
        this._recognition = null;
        reject(new Error('Failed to start speech recognition: ' + err.message));
      }
    });
  }

  /**
   * Silence detection for conversation mode
   * Auto-fires onSilenceDetected when user stops talking
   */
  _resetSilenceTimer() {
    this._clearSilenceTimer();
    this._silenceTimer = setTimeout(() => {
      if (this.conversationMode && this.isRecording && this._finalText) {
        // User stopped talking — fire callback
        if (this.onSilenceDetected) {
          const text = this._finalText;
          this._finalText = '';
          this._interimText = '';
          this.onSilenceDetected(text);
        }
      }
    }, this.silenceTimeout);
  }

  _clearSilenceTimer() {
    if (this._silenceTimer) {
      clearTimeout(this._silenceTimer);
      this._silenceTimer = null;
    }
  }

  /**
   * Stop SpeechRecognition and return accumulated text
   */
  _stopSpeechRecognition() {
    return new Promise((resolve) => {
      if (!this._recognition) {
        this.isRecording = false;
        this._setState('idle');
        resolve({ text: this._finalText || this._interimText });
        return;
      }

      this._recognitionResolve = (result) => {
        this._recognition = null;
        resolve(result);
      };

      try {
        this._recognition.stop();
      } catch {
        this.isRecording = false;
        this._setState('idle');
        this._recognition = null;
        resolve({ text: this._finalText || this._interimText });
      }
    });
  }

  /**
   * Speak text aloud using browser TTS (SpeechSynthesis)
   * Works on iOS Safari.
   * @param {string} text
   * @returns {Promise} Resolves when done speaking
   */
  speak(text) {
    if (!this.synthesis || !this.ttsEnabled || !text) return Promise.resolve();

    return new Promise((resolve) => {
      // Cancel any ongoing speech
      this.synthesis.cancel();
      this._setState('speaking');

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      utterance.lang = 'en-US';

      // STRICTLY pick English voice — never Portuguese or other languages
      const voices = this.synthesis.getVoices();
      if (voices.length > 0) {
        // Filter ONLY English voices
        const enVoices = voices.filter(v =>
          v.lang === 'en-US' || v.lang === 'en-GB' || v.lang === 'en_US' || v.lang === 'en_GB' ||
          v.lang === 'en-AU' || v.lang.startsWith('en-') || v.lang.startsWith('en_')
        );

        if (this.preferredVoiceIndex >= 0 && this.preferredVoiceIndex < voices.length) {
          utterance.voice = voices[this.preferredVoiceIndex];
        } else if (enVoices.length > 0) {
          // Priority order for natural-sounding voices
          const namePatterns = [
            'samantha', 'ava', 'allison', 'susan', 'zoe',   // iOS premium female
            'tom', 'aaron', 'nicky',                          // iOS premium male
            'google us english', 'google uk english male',     // Chrome
            'enhanced', 'premium', 'natural',                  // quality markers
            'karen', 'daniel', 'moira', 'kate', 'oliver',     // iOS standard
            'microsoft', 'alex'                                // desktop
          ];

          let picked = null;
          for (const pattern of namePatterns) {
            picked = enVoices.find(v => v.name.toLowerCase().includes(pattern));
            if (picked) break;
          }

          utterance.voice = picked || enVoices[0];
        }
        // If no English voices found at all, don't set voice — let browser use default with en-US lang
      }

      utterance.onend = () => {
        this._setState('idle');
        resolve();
      };

      utterance.onerror = (e) => {
        // 'interrupted' and 'canceled' are normal when user cancels
        if (e.error !== 'interrupted' && e.error !== 'canceled') {
          console.warn('TTS error:', e.error);
        }
        this._setState('idle');
        resolve();
      };

      // iOS Safari requires speech to happen in response to user interaction
      // but since we're calling this after user-initiated flow, it should work
      this.synthesis.speak(utterance);

      // iOS Safari bug: speechSynthesis can pause/hang. Resume workaround.
      if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
        this._iosResumeInterval = setInterval(() => {
          if (this.synthesis.speaking && !this.synthesis.paused) {
            // keep alive
          } else if (!this.synthesis.speaking) {
            clearInterval(this._iosResumeInterval);
          }
        }, 5000);
      }
    });
  }

  /**
   * Stop speaking
   */
  stopSpeaking() {
    if (this.synthesis) {
      this.synthesis.cancel();
      if (this._iosResumeInterval) {
        clearInterval(this._iosResumeInterval);
        this._iosResumeInterval = null;
      }
      this._setState('idle');
    }
  }

  /**
   * Resume listening (for conversation mode after TTS completes)
   */
  async resumeListening() {
    if (!this.conversationMode || this.isRecording) return;

    // Small delay so TTS audio clears before mic opens
    await new Promise(r => setTimeout(r, 300));

    if (!this.conversationMode) return; // might have been cancelled during delay

    // Reset state for fresh listening
    this._finalText = '';
    this._interimText = '';
    this._clearSilenceTimer();

    try {
      await this.startRecording();
      this._setState('listening');
    } catch (err) {
      console.warn('Failed to resume listening:', err);
      this.conversationMode = false;
      this._setState('idle');
    }
  }

  /**
   * Enter conversation mode
   */
  async startConversation() {
    this.conversationMode = true;
    await this.startRecording();
  }

  /**
   * Exit conversation mode
   */
  stopConversation() {
    this.conversationMode = false;
    this._clearSilenceTimer();
    if (this.isRecording) {
      if (this._recognition) {
        try { this._recognition.abort(); } catch {}
        this._recognition = null;
      }
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        try { this.mediaRecorder.stop(); } catch {}
      }
      this.isRecording = false;
    }
    this.stopSpeaking();
    this._cleanup();
    this._setState('idle');
  }

  /**
   * Cancel everything - recording and speaking
   */
  cancel() {
    if (this.isRecording) {
      if (this._recognition) {
        try { this._recognition.abort(); } catch {}
        this._recognition = null;
        this._recognitionResolve = null;
      }
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        try { this.mediaRecorder.stop(); } catch {}
      }
      this.isRecording = false;
      this.audioChunks = [];
    }
    this.stopSpeaking();
    this._cleanup();
    this._setState('idle');
  }

  /**
   * Release microphone stream
   */
  _cleanup() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
  }
}
