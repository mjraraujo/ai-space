/* ============================================================================
 *  audio-engine.js — Advanced audio synthesis, spatial audio, effects chain
 *  Oscillators, filters, envelopes, reverb, delay, compression, spatial audio
 * ========================================================================== */

// ─── Audio Node Types ───────────────────────────────────────────────────────
export const NodeType = {
  OSCILLATOR: 'oscillator',
  NOISE: 'noise',
  FILTER: 'filter',
  GAIN: 'gain',
  DELAY: 'delay',
  REVERB: 'reverb',
  COMPRESSOR: 'compressor',
  DISTORTION: 'distortion',
  CHORUS: 'chorus',
  PANNER: 'panner',
  ANALYZER: 'analyzer',
  ENVELOPE: 'envelope',
  LFO: 'lfo',
  SEQUENCER: 'sequencer',
  SAMPLER: 'sampler',
  MIXER: 'mixer',
  RECORDER: 'recorder'
};

export const WaveformType = {
  SINE: 'sine',
  SQUARE: 'square',
  SAWTOOTH: 'sawtooth',
  TRIANGLE: 'triangle',
  CUSTOM: 'custom'
};

export const FilterType = {
  LOWPASS: 'lowpass',
  HIGHPASS: 'highpass',
  BANDPASS: 'bandpass',
  NOTCH: 'notch',
  ALLPASS: 'allpass',
  PEAKING: 'peaking',
  LOWSHELF: 'lowshelf',
  HIGHSHELF: 'highshelf'
};

export const NoiseType = {
  WHITE: 'white',
  PINK: 'pink',
  BROWN: 'brown',
  BLUE: 'blue'
};

// ─── ADSR Envelope ──────────────────────────────────────────────────────────
export class Envelope {
  constructor(opts = {}) {
    this.attack = opts.attack ?? 0.01;
    this.decay = opts.decay ?? 0.1;
    this.sustain = opts.sustain ?? 0.7;
    this.releaseTime = opts.release ?? 0.3;
    this.attackCurve = opts.attackCurve ?? 'linear';
    this.releaseCurve = opts.releaseCurve ?? 'exponential';
    this._phase = 'idle';
    this._value = 0;
    this._startTime = 0;
    this._releaseTime = 0;
    this._releaseValue = 0;
  }

  trigger(time) {
    this._phase = 'attack';
    this._startTime = time;
    this._value = 0;
  }

  release(time) {
    if (this._phase === 'idle') return;
    this._phase = 'release';
    this._releaseTime = time;
    this._releaseValue = this._value;
  }

  getValue(time) {
    switch (this._phase) {
      case 'idle': return 0;
      case 'attack': {
        const elapsed = time - this._startTime;
        if (elapsed >= this.attack) {
          this._phase = 'decay';
          this._value = 1;
          return 1;
        }
        const t = elapsed / this.attack;
        this._value = this.attackCurve === 'exponential' ? t * t : t;
        return this._value;
      }
      case 'decay': {
        const elapsed = time - this._startTime - this.attack;
        if (elapsed >= this.decay) {
          this._phase = 'sustain';
          this._value = this.sustain;
          return this.sustain;
        }
        const t = elapsed / this.decay;
        this._value = 1 - (1 - this.sustain) * t;
        return this._value;
      }
      case 'sustain':
        this._value = this.sustain;
        return this.sustain;
      case 'release': {
        const elapsed = time - this._releaseTime;
        if (elapsed >= this.releaseTime) {
          this._phase = 'idle';
          this._value = 0;
          return 0;
        }
        const t = elapsed / this.releaseTime;
        if (this.releaseCurve === 'exponential') {
          this._value = this._releaseValue * (1 - t) * (1 - t);
        } else {
          this._value = this._releaseValue * (1 - t);
        }
        return this._value;
      }
      default: return 0;
    }
  }

  isActive() { return this._phase !== 'idle'; }
  getPhase() { return this._phase; }

  clone() {
    return new Envelope({
      attack: this.attack,
      decay: this.decay,
      sustain: this.sustain,
      release: this.releaseTime,
      attackCurve: this.attackCurve,
      releaseCurve: this.releaseCurve
    });
  }
}

// ─── Oscillator ─────────────────────────────────────────────────────────────
export class Oscillator {
  constructor(opts = {}) {
    this.type = opts.type || WaveformType.SINE;
    this.frequency = opts.frequency || 440;
    this.amplitude = opts.amplitude ?? 1;
    this.phase = opts.phase || 0;
    this.detune = opts.detune || 0;
    this.pulseWidth = opts.pulseWidth ?? 0.5;
    this._time = 0;
  }

  generate(sampleRate, numSamples) {
    const samples = new Float32Array(numSamples);
    const freq = this.frequency * Math.pow(2, this.detune / 1200);
    const phaseInc = freq / sampleRate;

    for (let i = 0; i < numSamples; i++) {
      const t = this.phase;
      let value = 0;

      switch (this.type) {
        case WaveformType.SINE:
          value = Math.sin(2 * Math.PI * t);
          break;
        case WaveformType.SQUARE:
          value = (t % 1) < this.pulseWidth ? 1 : -1;
          break;
        case WaveformType.SAWTOOTH:
          value = 2 * (t % 1) - 1;
          break;
        case WaveformType.TRIANGLE:
          value = 4 * Math.abs((t % 1) - 0.5) - 1;
          break;
      }

      samples[i] = value * this.amplitude;
      this.phase += phaseInc;
      if (this.phase > 1e6) this.phase -= 1e6; // Prevent overflow
    }

    this._time += numSamples / sampleRate;
    return samples;
  }

  setFrequency(freq) { this.frequency = Math.max(0.01, freq); }
  setAmplitude(amp) { this.amplitude = Math.max(0, Math.min(1, amp)); }
  setDetune(cents) { this.detune = cents; }

  reset() {
    this.phase = 0;
    this._time = 0;
  }
}

// ─── Noise Generator ────────────────────────────────────────────────────────
export class NoiseGenerator {
  constructor(type = NoiseType.WHITE) {
    this.type = type;
    this.amplitude = 1;
    this._b0 = 0; this._b1 = 0; this._b2 = 0;
    this._b3 = 0; this._b4 = 0; this._b5 = 0; this._b6 = 0;
    this._lastBrown = 0;
  }

  generate(numSamples) {
    const samples = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      samples[i] = this._generateSample() * this.amplitude;
    }
    return samples;
  }

  _generateSample() {
    const white = Math.random() * 2 - 1;

    switch (this.type) {
      case NoiseType.WHITE: return white;
      case NoiseType.PINK: {
        this._b0 = 0.99886 * this._b0 + white * 0.0555179;
        this._b1 = 0.99332 * this._b1 + white * 0.0750759;
        this._b2 = 0.96900 * this._b2 + white * 0.1538520;
        this._b3 = 0.86650 * this._b3 + white * 0.3104856;
        this._b4 = 0.55000 * this._b4 + white * 0.5329522;
        this._b5 = -0.7616 * this._b5 - white * 0.0168980;
        const pink = (this._b0 + this._b1 + this._b2 + this._b3 + this._b4 + this._b5 + this._b6 + white * 0.5362) * 0.11;
        this._b6 = white * 0.115926;
        return pink;
      }
      case NoiseType.BROWN: {
        this._lastBrown = (this._lastBrown + (0.02 * white)) / 1.02;
        return this._lastBrown * 3.5;
      }
      case NoiseType.BLUE:
        return white + (Math.random() * 2 - 1 - white) * 0.5;
      default: return white;
    }
  }

  reset() {
    this._b0 = this._b1 = this._b2 = this._b3 = 0;
    this._b4 = this._b5 = this._b6 = 0;
    this._lastBrown = 0;
  }
}

// ─── Biquad Filter ──────────────────────────────────────────────────────────
export class BiquadFilter {
  constructor(opts = {}) {
    this.type = opts.type || FilterType.LOWPASS;
    this.frequency = opts.frequency || 1000;
    this.Q = opts.Q ?? 1;
    this.gain = opts.gain ?? 0;
    this._x1 = 0; this._x2 = 0;
    this._y1 = 0; this._y2 = 0;
    this._coeffs = null;
    this._lastSampleRate = 0;
  }

  _computeCoefficients(sampleRate) {
    if (this._lastSampleRate === sampleRate && this._coeffs) return;
    this._lastSampleRate = sampleRate;

    const w0 = 2 * Math.PI * this.frequency / sampleRate;
    const cosW0 = Math.cos(w0);
    const sinW0 = Math.sin(w0);
    const alpha = sinW0 / (2 * this.Q);
    const A = Math.pow(10, this.gain / 40);

    let b0, b1, b2, a0, a1, a2;

    switch (this.type) {
      case FilterType.LOWPASS:
        b0 = (1 - cosW0) / 2; b1 = 1 - cosW0; b2 = (1 - cosW0) / 2;
        a0 = 1 + alpha; a1 = -2 * cosW0; a2 = 1 - alpha;
        break;
      case FilterType.HIGHPASS:
        b0 = (1 + cosW0) / 2; b1 = -(1 + cosW0); b2 = (1 + cosW0) / 2;
        a0 = 1 + alpha; a1 = -2 * cosW0; a2 = 1 - alpha;
        break;
      case FilterType.BANDPASS:
        b0 = alpha; b1 = 0; b2 = -alpha;
        a0 = 1 + alpha; a1 = -2 * cosW0; a2 = 1 - alpha;
        break;
      case FilterType.NOTCH:
        b0 = 1; b1 = -2 * cosW0; b2 = 1;
        a0 = 1 + alpha; a1 = -2 * cosW0; a2 = 1 - alpha;
        break;
      case FilterType.ALLPASS:
        b0 = 1 - alpha; b1 = -2 * cosW0; b2 = 1 + alpha;
        a0 = 1 + alpha; a1 = -2 * cosW0; a2 = 1 - alpha;
        break;
      case FilterType.PEAKING:
        b0 = 1 + alpha * A; b1 = -2 * cosW0; b2 = 1 - alpha * A;
        a0 = 1 + alpha / A; a1 = -2 * cosW0; a2 = 1 - alpha / A;
        break;
      case FilterType.LOWSHELF: {
        const sqrtA2alpha = 2 * Math.sqrt(A) * alpha;
        b0 = A * ((A + 1) - (A - 1) * cosW0 + sqrtA2alpha);
        b1 = 2 * A * ((A - 1) - (A + 1) * cosW0);
        b2 = A * ((A + 1) - (A - 1) * cosW0 - sqrtA2alpha);
        a0 = (A + 1) + (A - 1) * cosW0 + sqrtA2alpha;
        a1 = -2 * ((A - 1) + (A + 1) * cosW0);
        a2 = (A + 1) + (A - 1) * cosW0 - sqrtA2alpha;
        break;
      }
      case FilterType.HIGHSHELF: {
        const sqrtA2alpha = 2 * Math.sqrt(A) * alpha;
        b0 = A * ((A + 1) + (A - 1) * cosW0 + sqrtA2alpha);
        b1 = -2 * A * ((A - 1) + (A + 1) * cosW0);
        b2 = A * ((A + 1) + (A - 1) * cosW0 - sqrtA2alpha);
        a0 = (A + 1) - (A - 1) * cosW0 + sqrtA2alpha;
        a1 = 2 * ((A - 1) - (A + 1) * cosW0);
        a2 = (A + 1) - (A - 1) * cosW0 - sqrtA2alpha;
        break;
      }
      default:
        b0 = 1; b1 = 0; b2 = 0; a0 = 1; a1 = 0; a2 = 0;
    }

    this._coeffs = { b0: b0/a0, b1: b1/a0, b2: b2/a0, a1: a1/a0, a2: a2/a0 };
  }

  process(samples, sampleRate) {
    this._computeCoefficients(sampleRate);
    const { b0, b1, b2, a1, a2 } = this._coeffs;
    const output = new Float32Array(samples.length);

    for (let i = 0; i < samples.length; i++) {
      const x = samples[i];
      const y = b0 * x + b1 * this._x1 + b2 * this._x2 - a1 * this._y1 - a2 * this._y2;
      this._x2 = this._x1; this._x1 = x;
      this._y2 = this._y1; this._y1 = y;
      output[i] = y;
    }
    return output;
  }

  getFrequencyResponse(frequencies, sampleRate) {
    this._computeCoefficients(sampleRate);
    const { b0, b1, b2, a1, a2 } = this._coeffs;
    const magnitude = new Float32Array(frequencies.length);
    const phase = new Float32Array(frequencies.length);

    for (let i = 0; i < frequencies.length; i++) {
      const w = 2 * Math.PI * frequencies[i] / sampleRate;
      const cosW = Math.cos(w), sinW = Math.sin(w);
      const cos2W = Math.cos(2 * w), sin2W = Math.sin(2 * w);

      const numRe = b0 + b1 * cosW + b2 * cos2W;
      const numIm = -(b1 * sinW + b2 * sin2W);
      const denRe = 1 + a1 * cosW + a2 * cos2W;
      const denIm = -(a1 * sinW + a2 * sin2W);

      const numMag = Math.sqrt(numRe * numRe + numIm * numIm);
      const denMag = Math.sqrt(denRe * denRe + denIm * denIm);

      magnitude[i] = denMag > 0 ? numMag / denMag : 0;
      phase[i] = Math.atan2(numIm, numRe) - Math.atan2(denIm, denRe);
    }
    return { magnitude, phase };
  }

  reset() {
    this._x1 = this._x2 = this._y1 = this._y2 = 0;
  }
}

// ─── Delay Line ─────────────────────────────────────────────────────────────
export class DelayLine {
  constructor(opts = {}) {
    this.delayTime = opts.delayTime ?? 0.3;
    this.feedback = opts.feedback ?? 0.4;
    this.mix = opts.mix ?? 0.5;
    this.maxDelay = opts.maxDelay ?? 2;
    this._buffer = null;
    this._writeIndex = 0;
    this._lastSampleRate = 0;
  }

  _ensureBuffer(sampleRate) {
    if (this._lastSampleRate !== sampleRate) {
      const bufferSize = Math.ceil(this.maxDelay * sampleRate);
      this._buffer = new Float32Array(bufferSize);
      this._writeIndex = 0;
      this._lastSampleRate = sampleRate;
    }
  }

  process(samples, sampleRate) {
    this._ensureBuffer(sampleRate);
    const output = new Float32Array(samples.length);
    const delaySamples = Math.floor(this.delayTime * sampleRate);
    const bufLen = this._buffer.length;

    for (let i = 0; i < samples.length; i++) {
      const readIndex = (this._writeIndex - delaySamples + bufLen) % bufLen;
      const delayed = this._buffer[readIndex];

      this._buffer[this._writeIndex] = samples[i] + delayed * this.feedback;
      output[i] = samples[i] * (1 - this.mix) + delayed * this.mix;

      this._writeIndex = (this._writeIndex + 1) % bufLen;
    }
    return output;
  }

  clear() {
    if (this._buffer) this._buffer.fill(0);
    this._writeIndex = 0;
  }
}

// ─── Convolution Reverb ─────────────────────────────────────────────────────
export class ReverbEffect {
  constructor(opts = {}) {
    this.decayTime = opts.decayTime ?? 2;
    this.mix = opts.mix ?? 0.3;
    this.preDelay = opts.preDelay ?? 0.02;
    this.diffusion = opts.diffusion ?? 0.7;
    this.damping = opts.damping ?? 0.5;
    this._delays = [];
    this._initialized = false;
  }

  _initialize(sampleRate) {
    if (this._initialized) return;
    this._initialized = true;

    // Create multiple delay lines for comb-filter reverb
    const delayTimes = [0.0297, 0.0371, 0.0411, 0.0437, 0.0131, 0.0089, 0.0051, 0.0023];
    this._delays = delayTimes.map(t => ({
      delay: new DelayLine({
        delayTime: t * this.decayTime,
        feedback: Math.pow(0.001, t / this.decayTime) * this.diffusion,
        mix: 1
      }),
      time: t
    }));
  }

  process(samples, sampleRate) {
    this._initialize(sampleRate);
    const output = new Float32Array(samples.length);
    const dry = samples;

    // Sum comb filter outputs
    for (const { delay } of this._delays) {
      const wet = delay.process(samples, sampleRate);
      for (let i = 0; i < output.length; i++) {
        output[i] += wet[i] / this._delays.length;
      }
    }

    // Apply damping (simple lowpass)
    let prev = 0;
    for (let i = 0; i < output.length; i++) {
      output[i] = output[i] * (1 - this.damping) + prev * this.damping;
      prev = output[i];
    }

    // Mix dry/wet
    for (let i = 0; i < output.length; i++) {
      output[i] = dry[i] * (1 - this.mix) + output[i] * this.mix;
    }

    return output;
  }

  reset() {
    for (const { delay } of this._delays) delay.clear();
  }
}

// ─── Compressor ─────────────────────────────────────────────────────────────
export class Compressor {
  constructor(opts = {}) {
    this.threshold = opts.threshold ?? -24;
    this.ratio = opts.ratio ?? 4;
    this.attack = opts.attack ?? 0.003;
    this.release = opts.release ?? 0.25;
    this.knee = opts.knee ?? 6;
    this.makeupGain = opts.makeupGain ?? 0;
    this._envelope = 0;
    this._gainReduction = 0;
  }

  process(samples, sampleRate) {
    const output = new Float32Array(samples.length);
    const attackCoeff = Math.exp(-1 / (this.attack * sampleRate));
    const releaseCoeff = Math.exp(-1 / (this.release * sampleRate));

    for (let i = 0; i < samples.length; i++) {
      const inputLevel = Math.abs(samples[i]);
      const inputDb = inputLevel > 1e-10 ? 20 * Math.log10(inputLevel) : -100;

      // Compute gain reduction
      let gainDb = 0;
      if (inputDb > this.threshold + this.knee / 2) {
        gainDb = this.threshold + (inputDb - this.threshold) / this.ratio - inputDb;
      } else if (inputDb > this.threshold - this.knee / 2) {
        const x = inputDb - this.threshold + this.knee / 2;
        gainDb = (1 / this.ratio - 1) * x * x / (2 * this.knee);
      }

      // Envelope follower
      const targetEnv = -gainDb;
      if (targetEnv > this._envelope) {
        this._envelope = attackCoeff * this._envelope + (1 - attackCoeff) * targetEnv;
      } else {
        this._envelope = releaseCoeff * this._envelope + (1 - releaseCoeff) * targetEnv;
      }

      const gainLinear = Math.pow(10, (-this._envelope + this.makeupGain) / 20);
      output[i] = samples[i] * gainLinear;
      this._gainReduction = this._envelope;
    }
    return output;
  }

  getGainReduction() { return this._gainReduction; }

  reset() {
    this._envelope = 0;
    this._gainReduction = 0;
  }
}

// ─── Distortion ─────────────────────────────────────────────────────────────
export class Distortion {
  constructor(opts = {}) {
    this.amount = opts.amount ?? 0.5;
    this.type = opts.type ?? 'soft';
    this.mix = opts.mix ?? 1;
    this.preGain = opts.preGain ?? 1;
    this.postGain = opts.postGain ?? 1;
  }

  process(samples) {
    const output = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      const input = samples[i] * this.preGain;
      let distorted;

      switch (this.type) {
        case 'soft':
          distorted = Math.tanh(input * (1 + this.amount * 10));
          break;
        case 'hard':
          distorted = Math.max(-1, Math.min(1, input * (1 + this.amount * 5)));
          break;
        case 'fuzz': {
          const sign = input >= 0 ? 1 : -1;
          distorted = sign * (1 - Math.exp(-Math.abs(input) * (1 + this.amount * 10)));
          break;
        }
        case 'bitcrush': {
          const bits = Math.max(1, Math.floor(16 * (1 - this.amount)));
          const levels = Math.pow(2, bits);
          distorted = Math.round(input * levels) / levels;
          break;
        }
        default:
          distorted = input;
      }

      output[i] = (samples[i] * (1 - this.mix) + distorted * this.mix) * this.postGain;
    }
    return output;
  }
}

// ─── Chorus Effect ──────────────────────────────────────────────────────────
export class ChorusEffect {
  constructor(opts = {}) {
    this.rate = opts.rate ?? 1.5;
    this.depth = opts.depth ?? 0.003;
    this.mix = opts.mix ?? 0.5;
    this.voices = opts.voices ?? 3;
    this._delays = [];
    this._phases = [];
    this._lastSampleRate = 0;
  }

  _initialize(sampleRate) {
    if (this._lastSampleRate === sampleRate) return;
    this._lastSampleRate = sampleRate;
    const maxDelay = this.depth * 2 + 0.01;
    this._delays = [];
    this._phases = [];
    for (let i = 0; i < this.voices; i++) {
      const bufSize = Math.ceil(maxDelay * sampleRate);
      this._delays.push({ buffer: new Float32Array(bufSize), writeIdx: 0 });
      this._phases.push(i * (2 * Math.PI / this.voices));
    }
  }

  process(samples, sampleRate) {
    this._initialize(sampleRate);
    const output = new Float32Array(samples.length);
    const phaseInc = this.rate / sampleRate;

    for (let i = 0; i < samples.length; i++) {
      let wet = 0;
      for (let v = 0; v < this.voices; v++) {
        const dl = this._delays[v];
        dl.buffer[dl.writeIdx] = samples[i];

        const modDelay = this.depth * (1 + Math.sin(2 * Math.PI * this._phases[v])) * 0.5 + 0.001;
        const delaySamples = modDelay * sampleRate;
        const readIdx = (dl.writeIdx - Math.floor(delaySamples) + dl.buffer.length) % dl.buffer.length;

        wet += dl.buffer[readIdx] / this.voices;
        dl.writeIdx = (dl.writeIdx + 1) % dl.buffer.length;
        this._phases[v] += phaseInc;
      }
      output[i] = samples[i] * (1 - this.mix) + wet * this.mix;
    }
    return output;
  }

  reset() {
    for (const dl of this._delays) {
      dl.buffer.fill(0);
      dl.writeIdx = 0;
    }
    this._phases = this._phases.map((_, i) => i * (2 * Math.PI / this.voices));
  }
}

// ─── Stereo Panner ──────────────────────────────────────────────────────────
export class StereoPanner {
  constructor(opts = {}) {
    this.pan = opts.pan ?? 0; // -1 = left, 0 = center, 1 = right
  }

  process(monoSamples) {
    const left = new Float32Array(monoSamples.length);
    const right = new Float32Array(monoSamples.length);
    const angle = (this.pan + 1) * Math.PI / 4;
    const gainL = Math.cos(angle);
    const gainR = Math.sin(angle);

    for (let i = 0; i < monoSamples.length; i++) {
      left[i] = monoSamples[i] * gainL;
      right[i] = monoSamples[i] * gainR;
    }
    return { left, right };
  }
}

// ─── Spatial Audio ──────────────────────────────────────────────────────────
export class SpatialAudio {
  constructor(opts = {}) {
    this.listenerPosition = opts.listenerPosition || { x: 0, y: 0, z: 0 };
    this.listenerOrientation = opts.listenerOrientation || { x: 0, y: 0, z: -1 };
    this.maxDistance = opts.maxDistance ?? 100;
    this.rolloffFactor = opts.rolloffFactor ?? 1;
    this.refDistance = opts.refDistance ?? 1;
    this.model = opts.model ?? 'inverse';
    this.speedOfSound = opts.speedOfSound ?? 343;
  }

  computeGain(sourcePosition) {
    const dx = sourcePosition.x - this.listenerPosition.x;
    const dy = sourcePosition.y - this.listenerPosition.y;
    const dz = (sourcePosition.z || 0) - (this.listenerPosition.z || 0);
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (distance <= this.refDistance) return 1;
    if (distance >= this.maxDistance) return 0;

    switch (this.model) {
      case 'inverse':
        return this.refDistance / (this.refDistance + this.rolloffFactor * (distance - this.refDistance));
      case 'linear': {
        const d = Math.max(this.refDistance, Math.min(distance, this.maxDistance));
        return 1 - this.rolloffFactor * (d - this.refDistance) / (this.maxDistance - this.refDistance);
      }
      case 'exponential':
        return Math.pow(distance / this.refDistance, -this.rolloffFactor);
      default: return 1;
    }
  }

  computePanning(sourcePosition) {
    const dx = sourcePosition.x - this.listenerPosition.x;
    const dz = (sourcePosition.z || 0) - (this.listenerPosition.z || 0);
    const angle = Math.atan2(dx, -dz);
    return Math.max(-1, Math.min(1, angle / (Math.PI / 2)));
  }

  computeDelay(sourcePosition, sampleRate) {
    const dx = sourcePosition.x - this.listenerPosition.x;
    const dy = sourcePosition.y - this.listenerPosition.y;
    const dz = (sourcePosition.z || 0) - (this.listenerPosition.z || 0);
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return Math.floor((distance / this.speedOfSound) * sampleRate);
  }

  computeDoppler(sourcePosition, sourceVelocity) {
    const dx = sourcePosition.x - this.listenerPosition.x;
    const dy = sourcePosition.y - this.listenerPosition.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < 1e-10) return 1;

    const dirX = dx / distance;
    const dirY = dy / distance;
    const sourceSpeed = sourceVelocity.x * dirX + sourceVelocity.y * dirY;
    const factor = this.speedOfSound / (this.speedOfSound + sourceSpeed);
    return Math.max(0.5, Math.min(2, factor));
  }

  process(monoSamples, sourcePosition, sampleRate) {
    const gain = this.computeGain(sourcePosition);
    const pan = this.computePanning(sourcePosition);
    const panner = new StereoPanner({ pan });
    const gainedSamples = new Float32Array(monoSamples.length);

    for (let i = 0; i < monoSamples.length; i++) {
      gainedSamples[i] = monoSamples[i] * gain;
    }

    return panner.process(gainedSamples);
  }
}

// ─── Spectrum Analyzer ──────────────────────────────────────────────────────
export class SpectrumAnalyzer {
  constructor(opts = {}) {
    this.fftSize = opts.fftSize || 1024;
    this.smoothing = opts.smoothing ?? 0.8;
    this._magnitudes = new Float32Array(this.fftSize / 2);
    this._prevMagnitudes = new Float32Array(this.fftSize / 2);
  }

  analyze(samples) {
    // Simple DFT (not FFT for simplicity — in production use Web Audio API)
    const N = Math.min(samples.length, this.fftSize);
    const halfN = N / 2;
    const magnitudes = new Float32Array(halfN);

    for (let k = 0; k < halfN; k++) {
      let re = 0, im = 0;
      for (let n = 0; n < N; n++) {
        const angle = (2 * Math.PI * k * n) / N;
        re += samples[n] * Math.cos(angle);
        im -= samples[n] * Math.sin(angle);
      }
      magnitudes[k] = Math.sqrt(re * re + im * im) / N;
    }

    // Smoothing
    for (let i = 0; i < halfN; i++) {
      this._magnitudes[i] = this.smoothing * this._prevMagnitudes[i] +
                             (1 - this.smoothing) * magnitudes[i];
      this._prevMagnitudes[i] = this._magnitudes[i];
    }

    return this._magnitudes.slice();
  }

  getPeakFrequency(sampleRate) {
    let maxMag = 0, maxIdx = 0;
    for (let i = 1; i < this._magnitudes.length; i++) {
      if (this._magnitudes[i] > maxMag) {
        maxMag = this._magnitudes[i];
        maxIdx = i;
      }
    }
    return (maxIdx * sampleRate) / this.fftSize;
  }

  getRMS(samples) {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
    return Math.sqrt(sum / samples.length);
  }

  getDecibels(samples) {
    const rms = this.getRMS(samples);
    return rms > 0 ? 20 * Math.log10(rms) : -100;
  }

  getSpectralCentroid(sampleRate) {
    let weightedSum = 0, magSum = 0;
    for (let i = 0; i < this._magnitudes.length; i++) {
      const freq = (i * sampleRate) / this.fftSize;
      weightedSum += freq * this._magnitudes[i];
      magSum += this._magnitudes[i];
    }
    return magSum > 0 ? weightedSum / magSum : 0;
  }

  getSpectralFlatness() {
    let logSum = 0, linSum = 0;
    const n = this._magnitudes.length;
    for (let i = 0; i < n; i++) {
      const mag = Math.max(1e-10, this._magnitudes[i]);
      logSum += Math.log(mag);
      linSum += mag;
    }
    const geoMean = Math.exp(logSum / n);
    const arithMean = linSum / n;
    return arithMean > 0 ? geoMean / arithMean : 0;
  }

  getBands(bandCount, sampleRate) {
    const bands = new Float32Array(bandCount);
    const binCount = this._magnitudes.length;
    const binsPerBand = Math.floor(binCount / bandCount);

    for (let b = 0; b < bandCount; b++) {
      let sum = 0;
      const startBin = b * binsPerBand;
      const endBin = Math.min(startBin + binsPerBand, binCount);
      for (let i = startBin; i < endBin; i++) {
        sum += this._magnitudes[i];
      }
      bands[b] = sum / (endBin - startBin);
    }
    return bands;
  }

  reset() {
    this._magnitudes.fill(0);
    this._prevMagnitudes.fill(0);
  }
}

// ─── LFO (Low Frequency Oscillator) ────────────────────────────────────────
export class LFO {
  constructor(opts = {}) {
    this.frequency = opts.frequency || 1;
    this.amplitude = opts.amplitude ?? 1;
    this.offset = opts.offset ?? 0;
    this.type = opts.type || WaveformType.SINE;
    this._phase = 0;
  }

  getValue(dt) {
    let value = 0;
    switch (this.type) {
      case WaveformType.SINE:
        value = Math.sin(2 * Math.PI * this._phase);
        break;
      case WaveformType.SQUARE:
        value = this._phase % 1 < 0.5 ? 1 : -1;
        break;
      case WaveformType.SAWTOOTH:
        value = 2 * (this._phase % 1) - 1;
        break;
      case WaveformType.TRIANGLE:
        value = 4 * Math.abs((this._phase % 1) - 0.5) - 1;
        break;
    }
    this._phase += this.frequency * dt;
    return value * this.amplitude + this.offset;
  }

  reset() { this._phase = 0; }
}

// ─── Note / Frequency Utilities ─────────────────────────────────────────────
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function noteToFrequency(note, octave) {
  const noteIndex = NOTE_NAMES.indexOf(note.toUpperCase());
  if (noteIndex < 0) return 440;
  const midiNote = (octave + 1) * 12 + noteIndex;
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}

export function frequencyToNote(freq) {
  const midiNote = 12 * Math.log2(freq / 440) + 69;
  const rounded = Math.round(midiNote);
  const octave = Math.floor(rounded / 12) - 1;
  const noteIndex = rounded % 12;
  const cents = Math.round((midiNote - rounded) * 100);
  return { note: NOTE_NAMES[noteIndex], octave, cents, midi: rounded };
}

export function midiToFrequency(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }
export function frequencyToMidi(freq) { return 12 * Math.log2(freq / 440) + 69; }

// ─── Scale / Chord Generators ───────────────────────────────────────────────
export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  pentatonic: [0, 2, 4, 7, 9],
  blues: [0, 3, 5, 6, 7, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  melodicMinor: [0, 2, 3, 5, 7, 9, 11],
  wholeTone: [0, 2, 4, 6, 8, 10]
};

export const CHORDS = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  diminished: [0, 3, 6],
  augmented: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  major7: [0, 4, 7, 11],
  minor7: [0, 3, 7, 10],
  dominant7: [0, 4, 7, 10],
  dim7: [0, 3, 6, 9],
  add9: [0, 4, 7, 14],
  power: [0, 7]
};

export function getScaleFrequencies(rootNote, octave, scaleName) {
  const scale = SCALES[scaleName] || SCALES.major;
  const rootMidi = (octave + 1) * 12 + NOTE_NAMES.indexOf(rootNote.toUpperCase());
  return scale.map(interval => midiToFrequency(rootMidi + interval));
}

export function getChordFrequencies(rootNote, octave, chordName) {
  const chord = CHORDS[chordName] || CHORDS.major;
  const rootMidi = (octave + 1) * 12 + NOTE_NAMES.indexOf(rootNote.toUpperCase());
  return chord.map(interval => midiToFrequency(rootMidi + interval));
}

// ─── Sequencer ──────────────────────────────────────────────────────────────
export class Sequencer {
  constructor(opts = {}) {
    this.bpm = opts.bpm ?? 120;
    this.steps = opts.steps ?? 16;
    this.tracks = [];
    this._currentStep = 0;
    this._time = 0;
    this._isPlaying = false;
    this._listeners = { step: [], beat: [], bar: [] };
    this._swing = opts.swing ?? 0;
  }

  addTrack(name, pattern) {
    const track = {
      name,
      pattern: pattern || new Array(this.steps).fill(null),
      muted: false,
      solo: false,
      volume: 1
    };
    this.tracks.push(track);
    return track;
  }

  removeTrack(index) {
    if (index >= 0 && index < this.tracks.length) {
      this.tracks.splice(index, 1);
    }
  }

  setStep(trackIndex, step, value) {
    if (this.tracks[trackIndex]) {
      this.tracks[trackIndex].pattern[step % this.steps] = value;
    }
  }

  getStep(trackIndex, step) {
    return this.tracks[trackIndex]?.pattern[step % this.steps] ?? null;
  }

  getCurrentStep() { return this._currentStep; }

  advance(dt) {
    if (!this._isPlaying) return [];
    this._time += dt;

    const stepDuration = 60 / (this.bpm * 4); // 16th notes
    const events = [];

    while (this._time >= stepDuration) {
      this._time -= stepDuration;

      // Apply swing to even steps
      if (this._swing > 0 && this._currentStep % 2 === 1) {
        this._time -= stepDuration * this._swing * 0.5;
      }

      for (let t = 0; t < this.tracks.length; t++) {
        const track = this.tracks[t];
        if (track.muted) continue;
        const value = track.pattern[this._currentStep];
        if (value !== null && value !== undefined) {
          events.push({ track: t, step: this._currentStep, value, volume: track.volume, name: track.name });
        }
      }

      this._emit('step', this._currentStep);
      if (this._currentStep % 4 === 0) this._emit('beat', this._currentStep / 4);
      if (this._currentStep === 0) this._emit('bar', 0);

      this._currentStep = (this._currentStep + 1) % this.steps;
    }

    return events;
  }

  play() { this._isPlaying = true; }
  stop() { this._isPlaying = false; this._currentStep = 0; this._time = 0; }
  pause() { this._isPlaying = false; }
  isPlaying() { return this._isPlaying; }

  on(event, cb) { if (this._listeners[event]) this._listeners[event].push(cb); }
  off(event, cb) {
    if (this._listeners[event]) {
      const idx = this._listeners[event].indexOf(cb);
      if (idx >= 0) this._listeners[event].splice(idx, 1);
    }
  }
  _emit(event, data) { for (const cb of this._listeners[event]) cb(data); }

  serialize() {
    return {
      bpm: this.bpm,
      steps: this.steps,
      swing: this._swing,
      tracks: this.tracks.map(t => ({
        name: t.name,
        pattern: [...t.pattern],
        muted: t.muted,
        volume: t.volume
      }))
    };
  }

  static deserialize(data) {
    const seq = new Sequencer({ bpm: data.bpm, steps: data.steps, swing: data.swing });
    for (const t of data.tracks) {
      const track = seq.addTrack(t.name, t.pattern);
      track.muted = t.muted;
      track.volume = t.volume;
    }
    return seq;
  }
}

// ─── Mixer ──────────────────────────────────────────────────────────────────
export class AudioMixer {
  constructor(opts = {}) {
    this.channels = [];
    this.masterVolume = opts.masterVolume ?? 1;
    this.masterPan = opts.masterPan ?? 0;
  }

  addChannel(name, opts = {}) {
    const channel = {
      name,
      volume: opts.volume ?? 1,
      pan: opts.pan ?? 0,
      muted: false,
      solo: false,
      effects: [],
      sends: []
    };
    this.channels.push(channel);
    return this.channels.length - 1;
  }

  removeChannel(index) {
    if (index >= 0 && index < this.channels.length) {
      this.channels.splice(index, 1);
    }
  }

  addEffect(channelIndex, effect) {
    if (this.channels[channelIndex]) {
      this.channels[channelIndex].effects.push(effect);
    }
  }

  processChannel(channelIndex, samples, sampleRate) {
    const channel = this.channels[channelIndex];
    if (!channel || channel.muted) return new Float32Array(samples.length);

    let processed = samples;
    for (const effect of channel.effects) {
      processed = effect.process(processed, sampleRate);
    }

    // Apply volume
    const output = new Float32Array(processed.length);
    for (let i = 0; i < processed.length; i++) {
      output[i] = processed[i] * channel.volume;
    }
    return output;
  }

  mixDown(channelSamples, sampleRate) {
    if (channelSamples.length === 0) return new Float32Array(0);
    const maxLen = Math.max(...channelSamples.map(s => s.length));
    const output = new Float32Array(maxLen);

    const hasSolo = this.channels.some(c => c.solo);

    for (let ch = 0; ch < channelSamples.length; ch++) {
      const channel = this.channels[ch];
      if (!channel) continue;
      if (channel.muted) continue;
      if (hasSolo && !channel.solo) continue;

      const samples = channelSamples[ch];
      for (let i = 0; i < samples.length; i++) {
        output[i] += samples[i] * channel.volume;
      }
    }

    // Apply master volume
    for (let i = 0; i < output.length; i++) {
      output[i] *= this.masterVolume;
    }

    return output;
  }
}

// ─── Audio Recorder ─────────────────────────────────────────────────────────
export class AudioRecorder {
  constructor(opts = {}) {
    this.sampleRate = opts.sampleRate ?? 44100;
    this.channels = opts.channels ?? 1;
    this._buffers = [];
    this._isRecording = false;
    this._startTime = 0;
    this._maxDuration = opts.maxDuration ?? 300; // 5 min default
  }

  start() {
    this._buffers = [];
    this._isRecording = true;
    this._startTime = Date.now();
  }

  stop() {
    this._isRecording = false;
    return this.getBuffer();
  }

  addSamples(samples) {
    if (!this._isRecording) return;
    const elapsed = (Date.now() - this._startTime) / 1000;
    if (elapsed > this._maxDuration) {
      this._isRecording = false;
      return;
    }
    this._buffers.push(new Float32Array(samples));
  }

  getBuffer() {
    const totalLength = this._buffers.reduce((sum, b) => sum + b.length, 0);
    const result = new Float32Array(totalLength);
    let offset = 0;
    for (const buf of this._buffers) {
      result.set(buf, offset);
      offset += buf.length;
    }
    return result;
  }

  getDuration() {
    const totalSamples = this._buffers.reduce((sum, b) => sum + b.length, 0);
    return totalSamples / this.sampleRate;
  }

  isRecording() { return this._isRecording; }

  clear() {
    this._buffers = [];
    this._isRecording = false;
  }

  // Generate WAV file data
  toWav() {
    const samples = this.getBuffer();
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    // RIFF header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, this.channels, true);
    view.setUint32(24, this.sampleRate, true);
    view.setUint32(28, this.sampleRate * this.channels * 2, true);
    view.setUint16(32, this.channels * 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);

    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    return buffer;
  }
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// ─── Effects Chain ──────────────────────────────────────────────────────────
export class EffectsChain {
  constructor() {
    this.effects = [];
    this.bypass = false;
  }

  add(effect) {
    this.effects.push({ effect, bypass: false });
    return this.effects.length - 1;
  }

  remove(index) {
    if (index >= 0 && index < this.effects.length) {
      this.effects.splice(index, 1);
    }
  }

  setBypass(index, bypass) {
    if (this.effects[index]) {
      this.effects[index].bypass = bypass;
    }
  }

  process(samples, sampleRate) {
    if (this.bypass) return samples;
    let output = samples;
    for (const { effect, bypass } of this.effects) {
      if (!bypass) {
        output = effect.process(output, sampleRate);
      }
    }
    return output;
  }

  clear() { this.effects = []; }
}

// ─── Synthesizer ────────────────────────────────────────────────────────────
export class Synthesizer {
  constructor(opts = {}) {
    this.sampleRate = opts.sampleRate ?? 44100;
    this.voices = opts.voices ?? 8;
    this.oscillatorType = opts.oscillatorType || WaveformType.SINE;
    this._activeVoices = [];
    this.envelope = new Envelope(opts.envelope || {});
    this.filter = opts.filter ? new BiquadFilter(opts.filter) : null;
    this.effects = new EffectsChain();
    this.masterGain = opts.masterGain ?? 0.5;
    this._time = 0;
  }

  noteOn(frequency, velocity = 1) {
    // Steal oldest voice if at max polyphony
    if (this._activeVoices.length >= this.voices) {
      this._activeVoices.shift();
    }

    const voice = {
      oscillator: new Oscillator({ type: this.oscillatorType, frequency }),
      envelope: this.envelope.clone(),
      frequency,
      velocity,
      startTime: this._time
    };
    voice.envelope.trigger(this._time);
    this._activeVoices.push(voice);
    return voice;
  }

  noteOff(frequency) {
    for (const voice of this._activeVoices) {
      if (Math.abs(voice.frequency - frequency) < 0.01 && voice.envelope.getPhase() !== 'release') {
        voice.envelope.release(this._time);
      }
    }
  }

  allNotesOff() {
    for (const voice of this._activeVoices) {
      voice.envelope.release(this._time);
    }
  }

  render(numSamples) {
    const output = new Float32Array(numSamples);
    const dt = 1 / this.sampleRate;

    // Remove finished voices
    this._activeVoices = this._activeVoices.filter(v => v.envelope.isActive());

    for (const voice of this._activeVoices) {
      const oscSamples = voice.oscillator.generate(this.sampleRate, numSamples);
      for (let i = 0; i < numSamples; i++) {
        const envValue = voice.envelope.getValue(this._time + i * dt);
        output[i] += oscSamples[i] * envValue * voice.velocity * this.masterGain;
      }
    }

    this._time += numSamples * dt;

    // Apply filter
    let processed = output;
    if (this.filter) {
      processed = this.filter.process(processed, this.sampleRate);
    }

    // Apply effects chain
    processed = this.effects.process(processed, this.sampleRate);

    return processed;
  }

  getActiveVoiceCount() { return this._activeVoices.length; }
  getTime() { return this._time; }

  reset() {
    this._activeVoices = [];
    this._time = 0;
    if (this.filter) this.filter.reset();
  }
}

// ─── Drum Machine ───────────────────────────────────────────────────────────
export class DrumMachine {
  constructor(opts = {}) {
    this.sampleRate = opts.sampleRate ?? 44100;
    this.sequencer = new Sequencer({ bpm: opts.bpm ?? 120, steps: opts.steps ?? 16 });
    this._sounds = new Map();
    this._setupDefaultSounds();
  }

  _setupDefaultSounds() {
    // Synthesize drum sounds
    this._sounds.set('kick', this._synthKick.bind(this));
    this._sounds.set('snare', this._synthSnare.bind(this));
    this._sounds.set('hihat', this._synthHihat.bind(this));
    this._sounds.set('clap', this._synthClap.bind(this));
  }

  _synthKick(duration = 0.3) {
    const samples = Math.floor(duration * this.sampleRate);
    const output = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      const t = i / this.sampleRate;
      const env = Math.exp(-t * 10);
      const freq = 60 + 200 * Math.exp(-t * 30);
      output[i] = Math.sin(2 * Math.PI * freq * t) * env * 0.8;
    }
    return output;
  }

  _synthSnare(duration = 0.2) {
    const samples = Math.floor(duration * this.sampleRate);
    const output = new Float32Array(samples);
    const noise = new NoiseGenerator(NoiseType.WHITE);
    const noiseSamples = noise.generate(samples);
    for (let i = 0; i < samples; i++) {
      const t = i / this.sampleRate;
      const env = Math.exp(-t * 15);
      const tone = Math.sin(2 * Math.PI * 200 * t) * Math.exp(-t * 20);
      output[i] = (noiseSamples[i] * 0.5 + tone * 0.5) * env * 0.6;
    }
    return output;
  }

  _synthHihat(duration = 0.08) {
    const samples = Math.floor(duration * this.sampleRate);
    const output = new Float32Array(samples);
    const noise = new NoiseGenerator(NoiseType.WHITE);
    const noiseSamples = noise.generate(samples);
    const filter = new BiquadFilter({ type: FilterType.HIGHPASS, frequency: 8000, Q: 1 });
    const filtered = filter.process(noiseSamples, this.sampleRate);
    for (let i = 0; i < samples; i++) {
      const t = i / this.sampleRate;
      const env = Math.exp(-t * 40);
      output[i] = filtered[i] * env * 0.3;
    }
    return output;
  }

  _synthClap(duration = 0.15) {
    const samples = Math.floor(duration * this.sampleRate);
    const output = new Float32Array(samples);
    const noise = new NoiseGenerator(NoiseType.WHITE);
    const noiseSamples = noise.generate(samples);
    const filter = new BiquadFilter({ type: FilterType.BANDPASS, frequency: 2000, Q: 2 });
    const filtered = filter.process(noiseSamples, this.sampleRate);
    for (let i = 0; i < samples; i++) {
      const t = i / this.sampleRate;
      const env = Math.exp(-t * 20) * (1 + Math.sin(t * 200) * 0.3);
      output[i] = filtered[i] * env * 0.5;
    }
    return output;
  }

  addTrack(name) {
    return this.sequencer.addTrack(name);
  }

  triggerSound(name) {
    const synth = this._sounds.get(name);
    if (synth) return synth();
    return new Float32Array(0);
  }

  setPattern(trackIndex, pattern) {
    const track = this.sequencer.tracks[trackIndex];
    if (track) track.pattern = pattern;
  }

  serialize() {
    return {
      sampleRate: this.sampleRate,
      sequencer: this.sequencer.serialize()
    };
  }
}

// ─── Preset Manager ─────────────────────────────────────────────────────────
export const SYNTH_PRESETS = {
  pad: {
    oscillatorType: WaveformType.SINE,
    envelope: { attack: 0.5, decay: 0.3, sustain: 0.8, release: 1 },
    filter: { type: FilterType.LOWPASS, frequency: 2000, Q: 0.7 }
  },
  lead: {
    oscillatorType: WaveformType.SAWTOOTH,
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.2 },
    filter: { type: FilterType.LOWPASS, frequency: 5000, Q: 2 }
  },
  bass: {
    oscillatorType: WaveformType.SQUARE,
    envelope: { attack: 0.01, decay: 0.3, sustain: 0.4, release: 0.1 },
    filter: { type: FilterType.LOWPASS, frequency: 800, Q: 3 }
  },
  pluck: {
    oscillatorType: WaveformType.TRIANGLE,
    envelope: { attack: 0.001, decay: 0.5, sustain: 0, release: 0.1 },
    filter: { type: FilterType.LOWPASS, frequency: 3000, Q: 1 }
  },
  organ: {
    oscillatorType: WaveformType.SINE,
    envelope: { attack: 0.01, decay: 0.01, sustain: 1, release: 0.01 },
    filter: null
  },
  strings: {
    oscillatorType: WaveformType.SAWTOOTH,
    envelope: { attack: 0.8, decay: 0.2, sustain: 0.9, release: 0.5 },
    filter: { type: FilterType.LOWPASS, frequency: 4000, Q: 0.5 }
  }
};

export function createSynthFromPreset(presetName, opts = {}) {
  const preset = SYNTH_PRESETS[presetName];
  if (!preset) return new Synthesizer(opts);
  return new Synthesizer({ ...preset, ...opts });
}
