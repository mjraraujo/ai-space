/**
 * Voice - Speech recognition + synthesis using built-in browser APIs
 * Zero dependencies, zero cloud calls
 */

export class Voice {
  constructor() {
    this.recognition = null;
    this.synthesis = window.speechSynthesis || null;
    this.isListening = false;
    this.ttsEnabled = false;
    this.supported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
  }

  /**
   * Start listening for speech
   * @returns {Promise<string>} Transcribed text
   */
  listen() {
    return new Promise((resolve, reject) => {
      if (!this.supported) {
        reject(new Error('Speech recognition not supported'));
        return;
      }

      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition = new SR();
      this.recognition.lang = navigator.language || 'en-US';
      this.recognition.interimResults = false;
      this.recognition.maxAlternatives = 1;
      this.recognition.continuous = false;

      this.isListening = true;

      this.recognition.onresult = (event) => {
        const text = event.results[0][0].transcript;
        this.isListening = false;
        resolve(text);
      };

      this.recognition.onerror = (event) => {
        this.isListening = false;
        if (event.error === 'no-speech') {
          resolve('');
        } else {
          reject(new Error(event.error));
        }
      };

      this.recognition.onend = () => {
        this.isListening = false;
      };

      this.recognition.start();
    });
  }

  /**
   * Stop listening
   */
  stop() {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
      this.isListening = false;
    }
  }

  /**
   * Speak text aloud
   * @param {string} text
   */
  speak(text) {
    if (!this.synthesis || !this.ttsEnabled) return;

    this.synthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    this.synthesis.speak(utterance);
  }

  /**
   * Stop speaking
   */
  stopSpeaking() {
    if (this.synthesis) this.synthesis.cancel();
  }

  /**
   * Toggle TTS
   */
  toggleTTS() {
    this.ttsEnabled = !this.ttsEnabled;
    if (!this.ttsEnabled) this.stopSpeaking();
    return this.ttsEnabled;
  }
}
