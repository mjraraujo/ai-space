/**
 * Voice - Real-time voice conversation
 * 
 * Input: MediaRecorder -> audio blob -> transcription
 *   - Cloud/hybrid mode: send to Whisper API
 *   - Local fallback: use SpeechRecognition if available
 * 
 * Output: SpeechSynthesis (works on iOS Safari)
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

    // Check what's available
    this.hasSpeechRecognition = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
    this.hasMediaRecorder = 'MediaRecorder' in window;
  }

  get supported() {
    return this.hasSpeechRecognition || this.hasMediaRecorder;
  }

  _setState(s) {
    if (this.onStateChange) this.onStateChange(s);
  }

  /**
   * Start recording audio
   */
  async startRecording() {
    if (this.isRecording) return;

    // Try SpeechRecognition first (gives real-time feedback)
    if (this.hasSpeechRecognition) {
      return this._startSpeechRecognition();
    }

    // Fallback to MediaRecorder
    if (!this.hasMediaRecorder) {
      throw new Error('No voice input available');
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioChunks = [];

      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      });

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.audioChunks.push(e.data);
      };

      this.mediaRecorder.start();
      this.isRecording = true;
      this._setState('listening');
    } catch (err) {
      throw new Error('Microphone access denied');
    }
  }

  /**
   * Stop recording and get result
   * @returns {Promise<{text: string, audio?: Blob}>}
   */
  async stopRecording() {
    if (!this.isRecording) return { text: '' };

    if (this._recognition) {
      return this._stopSpeechRecognition();
    }

    return new Promise((resolve) => {
      this.mediaRecorder.onstop = () => {
        this.isRecording = false;
        this._setState('processing');
        this._cleanup();

        const blob = new Blob(this.audioChunks, { type: this.mediaRecorder.mimeType });
        // Return audio blob — app.js will handle transcription
        resolve({ text: '', audio: blob });
      };

      this.mediaRecorder.stop();
    });
  }

  /**
   * SpeechRecognition path (Chrome, some Android browsers)
   */
  _startSpeechRecognition() {
    return new Promise((resolve) => {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      this._recognition = new SR();
      this._recognition.lang = navigator.language || 'en-US';
      this._recognition.interimResults = true;
      this._recognition.continuous = true;
      this._recognitionResolve = null;
      this._interimText = '';
      this._finalText = '';

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

        // Show interim results via state change
        if (this.onInterimResult) {
          this.onInterimResult(final + interim);
        }
      };

      this._recognition.onerror = (event) => {
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          console.warn('Speech recognition error:', event.error);
        }
      };

      this._recognition.onend = () => {
        // Auto-ended (timeout or end of speech)
        if (this.isRecording && this._recognitionResolve) {
          this.isRecording = false;
          this._setState('idle');
          this._recognitionResolve({ text: this._finalText || this._interimText });
          this._recognitionResolve = null;
        }
      };

      this._recognition.start();
      this.isRecording = true;
      this._setState('listening');
      resolve();
    });
  }

  _stopSpeechRecognition() {
    return new Promise((resolve) => {
      this._recognitionResolve = resolve;
      this._recognition.stop();
    });
  }

  /**
   * Speak text aloud using browser TTS
   * @param {string} text
   * @returns {Promise} Resolves when done speaking
   */
  speak(text) {
    if (!this.synthesis || !this.ttsEnabled || !text) return Promise.resolve();

    return new Promise((resolve) => {
      this.synthesis.cancel();
      this._setState('speaking');

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1;

      // Try to pick a good voice
      const voices = this.synthesis.getVoices();
      const preferred = voices.find(v =>
        v.lang.startsWith(navigator.language?.split('-')[0] || 'en') && v.localService
      );
      if (preferred) utterance.voice = preferred;

      utterance.onend = () => {
        this._setState('idle');
        resolve();
      };
      utterance.onerror = () => {
        this._setState('idle');
        resolve();
      };

      this.synthesis.speak(utterance);
    });
  }

  /**
   * Stop speaking
   */
  stopSpeaking() {
    if (this.synthesis) {
      this.synthesis.cancel();
      this._setState('idle');
    }
  }

  /**
   * Cancel everything
   */
  cancel() {
    if (this.isRecording) {
      if (this._recognition) {
        this._recognition.abort();
        this._recognition = null;
      }
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }
      this.isRecording = false;
    }
    this.stopSpeaking();
    this._cleanup();
    this._setState('idle');
  }

  _cleanup() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
  }
}
