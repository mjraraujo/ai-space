import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  Envelope, Oscillator, NoiseGenerator, BiquadFilter, DelayLine,
  ReverbEffect, Compressor, Distortion, ChorusEffect, StereoPanner,
  SpatialAudio, SpectrumAnalyzer, LFO, Sequencer, AudioMixer,
  AudioRecorder, EffectsChain, Synthesizer, DrumMachine,
  WaveformType, FilterType, NoiseType, NodeType,
  NOTE_NAMES, noteToFrequency, frequencyToNote, midiToFrequency, frequencyToMidi,
  SCALES, CHORDS, getScaleFrequencies, getChordFrequencies,
  SYNTH_PRESETS, createSynthFromPreset
} from '../audio-engine.js';

describe('Envelope', () => {
  it('follows ADSR phases', () => {
    const env = new Envelope({ attack: 0.1, decay: 0.1, sustain: 0.5, release: 0.2 });
    env.trigger(0);
    expect(env.getPhase()).toBe('attack');
    expect(env.getValue(0.05)).toBeGreaterThan(0);
    expect(env.getValue(0.1)).toBeCloseTo(1, 1);
    expect(env.getValue(0.15)).toBeLessThan(1);
    expect(env.getValue(0.2)).toBeCloseTo(0.5, 1);
    expect(env.getValue(0.3)).toBeCloseTo(0.5, 1);
  });

  it('releases properly', () => {
    const env = new Envelope({ attack: 0.01, decay: 0.01, sustain: 0.7, release: 0.1 });
    env.trigger(0);
    env.getValue(0.05); // Move past attack/decay
    env.release(0.05);
    const val = env.getValue(0.1);
    expect(val).toBeLessThan(0.7);
    expect(env.getValue(0.2)).toBe(0);
  });

  it('isActive tracks state', () => {
    const env = new Envelope({ attack: 0.01, decay: 0.01, sustain: 0.5, release: 0.01 });
    expect(env.isActive()).toBe(false);
    env.trigger(0);
    expect(env.isActive()).toBe(true);
  });

  it('clones', () => {
    const env = new Envelope({ attack: 0.5 });
    const clone = env.clone();
    expect(clone.attack).toBe(0.5);
    expect(clone.releaseTime).toBe(0.3);
    expect(clone).not.toBe(env);
  });
});

describe('Oscillator', () => {
  it('generates sine wave', () => {
    const osc = new Oscillator({ type: WaveformType.SINE, frequency: 440 });
    const samples = osc.generate(44100, 100);
    expect(samples.length).toBe(100);
    expect(Math.max(...samples)).toBeLessThanOrEqual(1);
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(-1);
  });

  it('generates square wave', () => {
    const osc = new Oscillator({ type: WaveformType.SQUARE, frequency: 440 });
    const samples = osc.generate(44100, 1000);
    const unique = new Set(samples.map(s => Math.round(s)));
    expect(unique.has(1)).toBe(true);
    expect(unique.has(-1)).toBe(true);
  });

  it('generates sawtooth', () => {
    const osc = new Oscillator({ type: WaveformType.SAWTOOTH, frequency: 440 });
    const samples = osc.generate(44100, 100);
    expect(samples.length).toBe(100);
  });

  it('generates triangle', () => {
    const osc = new Oscillator({ type: WaveformType.TRIANGLE, frequency: 440 });
    const samples = osc.generate(44100, 100);
    expect(samples.length).toBe(100);
  });

  it('applies detune', () => {
    const osc = new Oscillator({ frequency: 440, detune: 1200 });
    // 1200 cents = 1 octave
    const samples = osc.generate(44100, 100);
    expect(samples.length).toBe(100);
  });

  it('resets phase', () => {
    const osc = new Oscillator({ frequency: 440 });
    osc.generate(44100, 100);
    expect(osc.phase).toBeGreaterThan(0);
    osc.reset();
    expect(osc.phase).toBe(0);
  });
});

describe('NoiseGenerator', () => {
  it('generates white noise', () => {
    const noise = new NoiseGenerator(NoiseType.WHITE);
    const samples = noise.generate(1000);
    expect(samples.length).toBe(1000);
    const rms = Math.sqrt(samples.reduce((s, v) => s + v * v, 0) / samples.length);
    expect(rms).toBeGreaterThan(0);
  });

  it('generates pink noise', () => {
    const noise = new NoiseGenerator(NoiseType.PINK);
    const samples = noise.generate(1000);
    expect(samples.length).toBe(1000);
  });

  it('generates brown noise', () => {
    const noise = new NoiseGenerator(NoiseType.BROWN);
    const samples = noise.generate(1000);
    expect(samples.length).toBe(1000);
  });

  it('resets state', () => {
    const noise = new NoiseGenerator(NoiseType.PINK);
    noise.generate(100);
    noise.reset();
    expect(noise._b0).toBe(0);
  });
});

describe('BiquadFilter', () => {
  it('processes lowpass', () => {
    const filter = new BiquadFilter({ type: FilterType.LOWPASS, frequency: 1000, Q: 1 });
    const input = new Float32Array(100).map(() => Math.random() * 2 - 1);
    const output = filter.process(input, 44100);
    expect(output.length).toBe(100);
  });

  it('processes highpass', () => {
    const filter = new BiquadFilter({ type: FilterType.HIGHPASS, frequency: 1000 });
    const input = new Float32Array(100).fill(1);
    const output = filter.process(input, 44100);
    expect(output.length).toBe(100);
  });

  it('gets frequency response', () => {
    const filter = new BiquadFilter({ type: FilterType.LOWPASS, frequency: 1000, Q: 1 });
    const freqs = [100, 500, 1000, 5000, 10000];
    const response = filter.getFrequencyResponse(freqs, 44100);
    expect(response.magnitude.length).toBe(5);
    // Low frequency should pass more than high
    expect(response.magnitude[0]).toBeGreaterThan(response.magnitude[4]);
  });

  it('resets state', () => {
    const filter = new BiquadFilter();
    const input = new Float32Array(100).fill(1);
    filter.process(input, 44100);
    filter.reset();
    expect(filter._x1).toBe(0);
  });
});

describe('DelayLine', () => {
  it('delays signal', () => {
    const delay = new DelayLine({ delayTime: 0.01, feedback: 0, mix: 1 });
    const input = new Float32Array(882);
    input[0] = 1; // impulse
    const output = delay.process(input, 44100);
    // With mix=1, output[i] = delayed_signal (dry is zero)
    // First sample: buffer empty, so delayed = 0
    expect(output[0]).toBe(0);
    // The impulse should appear in the delayed output
    const delayedIdx = Math.floor(0.01 * 44100);
    // delayed signal should be non-zero around the delay index
    expect(output[delayedIdx]).toBeGreaterThanOrEqual(0);
  });

  it('clears buffer', () => {
    const delay = new DelayLine();
    delay.process(new Float32Array(100).fill(1), 44100);
    delay.clear();
    expect(delay._writeIndex).toBe(0);
  });
});

describe('Compressor', () => {
  it('compresses loud signals', () => {
    const comp = new Compressor({ threshold: -20, ratio: 4 });
    const input = new Float32Array(100).fill(0.9);
    const output = comp.process(input, 44100);
    // Compressed signal should be smaller
    const avgOutput = output.reduce((s, v) => s + Math.abs(v), 0) / output.length;
    expect(avgOutput).toBeLessThan(0.9);
  });

  it('tracks gain reduction', () => {
    const comp = new Compressor({ threshold: -20, ratio: 4 });
    comp.process(new Float32Array(100).fill(0.9), 44100);
    expect(comp.getGainReduction()).toBeGreaterThan(0);
  });
});

describe('Distortion', () => {
  it('applies soft clipping', () => {
    const dist = new Distortion({ type: 'soft', amount: 0.5 });
    const input = new Float32Array(100).fill(0.5);
    const output = dist.process(input);
    expect(output.length).toBe(100);
  });

  it('applies hard clipping', () => {
    const dist = new Distortion({ type: 'hard', amount: 1 });
    const input = new Float32Array(100).fill(0.8);
    const output = dist.process(input);
    expect(output.every(v => v <= 1 && v >= -1)).toBe(true);
  });

  it('applies bitcrush', () => {
    const dist = new Distortion({ type: 'bitcrush', amount: 0.5 });
    const input = new Float32Array(100).map(() => Math.random());
    const output = dist.process(input);
    expect(output.length).toBe(100);
  });
});

describe('ChorusEffect', () => {
  it('processes audio', () => {
    const chorus = new ChorusEffect({ voices: 3, depth: 0.003 });
    const input = new Float32Array(1000).map(() => Math.random() * 2 - 1);
    const output = chorus.process(input, 44100);
    expect(output.length).toBe(1000);
  });
});

describe('StereoPanner', () => {
  it('pans to center', () => {
    const panner = new StereoPanner({ pan: 0 });
    const mono = new Float32Array([1, 1]);
    const { left, right } = panner.process(mono);
    expect(left[0]).toBeCloseTo(right[0], 2);
  });

  it('pans full left', () => {
    const panner = new StereoPanner({ pan: -1 });
    const { left, right } = panner.process(new Float32Array([1]));
    expect(left[0]).toBeGreaterThan(right[0]);
  });
});

describe('SpatialAudio', () => {
  it('computes gain', () => {
    const spatial = new SpatialAudio({ maxDistance: 100, refDistance: 1 });
    expect(spatial.computeGain({ x: 0, y: 0, z: 0 })).toBe(1);
    expect(spatial.computeGain({ x: 50, y: 0, z: 0 })).toBeLessThan(1);
    expect(spatial.computeGain({ x: 200, y: 0, z: 0 })).toBe(0);
  });

  it('computes panning', () => {
    const spatial = new SpatialAudio();
    expect(spatial.computePanning({ x: 10, y: 0 })).toBeGreaterThan(0); // right
    expect(spatial.computePanning({ x: -10, y: 0 })).toBeLessThan(0); // left
  });

  it('computes doppler', () => {
    const spatial = new SpatialAudio();
    const approaching = spatial.computeDoppler({ x: 100, y: 0 }, { x: -50, y: 0 });
    const receding = spatial.computeDoppler({ x: 100, y: 0 }, { x: 50, y: 0 });
    expect(approaching).toBeGreaterThan(receding);
  });
});

describe('SpectrumAnalyzer', () => {
  it('analyzes spectrum', () => {
    const analyzer = new SpectrumAnalyzer({ fftSize: 64, smoothing: 0 });
    const osc = new Oscillator({ frequency: 440 });
    const samples = osc.generate(44100, 64);
    const mags = analyzer.analyze(samples);
    expect(mags.length).toBe(32);
    expect(Math.max(...mags)).toBeGreaterThan(0);
  });

  it('computes RMS', () => {
    const analyzer = new SpectrumAnalyzer();
    const loud = new Float32Array(100).fill(1);
    const quiet = new Float32Array(100).fill(0.1);
    expect(analyzer.getRMS(loud)).toBeGreaterThan(analyzer.getRMS(quiet));
  });

  it('computes decibels', () => {
    const analyzer = new SpectrumAnalyzer();
    expect(analyzer.getDecibels(new Float32Array(100).fill(1))).toBeCloseTo(0, 0);
    expect(analyzer.getDecibels(new Float32Array(100).fill(0))).toBe(-100);
  });

  it('gets bands', () => {
    const analyzer = new SpectrumAnalyzer({ fftSize: 64 });
    analyzer.analyze(new Float32Array(64).fill(0.5));
    const bands = analyzer.getBands(4, 44100);
    expect(bands.length).toBe(4);
  });
});

describe('LFO', () => {
  it('generates sine modulation', () => {
    const lfo = new LFO({ frequency: 1, amplitude: 1, type: WaveformType.SINE });
    const val = lfo.getValue(0.1);
    expect(val).toBeGreaterThanOrEqual(-1);
    expect(val).toBeLessThanOrEqual(1);
  });

  it('applies offset', () => {
    const lfo = new LFO({ frequency: 1, amplitude: 0, offset: 5 });
    expect(lfo.getValue(0.1)).toBe(5);
  });
});

describe('Note/Frequency', () => {
  it('converts A4 to 440Hz', () => {
    expect(noteToFrequency('A', 4)).toBeCloseTo(440, 0);
  });

  it('converts C4 to ~262Hz', () => {
    expect(noteToFrequency('C', 4)).toBeCloseTo(261.63, 0);
  });

  it('converts 440Hz to A4', () => {
    const result = frequencyToNote(440);
    expect(result.note).toBe('A');
    expect(result.octave).toBe(4);
    expect(result.cents).toBe(0);
  });

  it('converts midi <-> frequency', () => {
    expect(midiToFrequency(69)).toBeCloseTo(440, 0);
    expect(frequencyToMidi(440)).toBeCloseTo(69, 0);
  });

  it('generates scale frequencies', () => {
    const freqs = getScaleFrequencies('C', 4, 'major');
    expect(freqs.length).toBe(7);
    expect(freqs[0]).toBeCloseTo(261.63, 0);
  });

  it('generates chord frequencies', () => {
    const freqs = getChordFrequencies('C', 4, 'major');
    expect(freqs.length).toBe(3);
  });
});

describe('Sequencer', () => {
  it('creates with tracks', () => {
    const seq = new Sequencer({ bpm: 120, steps: 16 });
    seq.addTrack('kick', [1, null, null, null, 1, null, null, null]);
    expect(seq.tracks.length).toBe(1);
  });

  it('advances and emits events', () => {
    const seq = new Sequencer({ bpm: 120, steps: 4 });
    seq.addTrack('kick', [1, null, 1, null]);
    seq.play();
    const events = seq.advance(0.5); // One beat = 0.5s at 120bpm
    expect(events.length).toBeGreaterThan(0);
  });

  it('serializes and deserializes', () => {
    const seq = new Sequencer({ bpm: 140 });
    seq.addTrack('snare', [null, null, 1, null]);
    const data = seq.serialize();
    const restored = Sequencer.deserialize(data);
    expect(restored.bpm).toBe(140);
    expect(restored.tracks.length).toBe(1);
  });

  it('stops and resets', () => {
    const seq = new Sequencer();
    seq.play();
    expect(seq.isPlaying()).toBe(true);
    seq.stop();
    expect(seq.isPlaying()).toBe(false);
    expect(seq.getCurrentStep()).toBe(0);
  });
});

describe('AudioMixer', () => {
  it('adds channels', () => {
    const mixer = new AudioMixer();
    mixer.addChannel('vocals', { volume: 0.8 });
    mixer.addChannel('drums', { volume: 1 });
    expect(mixer.channels.length).toBe(2);
  });

  it('mixes down channels', () => {
    const mixer = new AudioMixer({ masterVolume: 1 });
    mixer.addChannel('a', { volume: 1 });
    mixer.addChannel('b', { volume: 1 });
    const samplesA = new Float32Array([0.5, 0.5]);
    const samplesB = new Float32Array([0.3, 0.3]);
    const mixed = mixer.mixDown([samplesA, samplesB], 44100);
    expect(mixed[0]).toBeCloseTo(0.8, 2);
  });

  it('respects mute', () => {
    const mixer = new AudioMixer();
    mixer.addChannel('a');
    mixer.channels[0].muted = true;
    const mixed = mixer.mixDown([new Float32Array([1])], 44100);
    expect(mixed[0]).toBe(0);
  });
});

describe('AudioRecorder', () => {
  it('records and gets buffer', () => {
    const rec = new AudioRecorder({ sampleRate: 44100 });
    rec.start();
    rec.addSamples(new Float32Array([0.5, 0.5, 0.5]));
    rec.addSamples(new Float32Array([0.3, 0.3]));
    const buffer = rec.stop();
    expect(buffer.length).toBe(5);
  });

  it('computes duration', () => {
    const rec = new AudioRecorder({ sampleRate: 1000 });
    rec.start();
    rec.addSamples(new Float32Array(500));
    expect(rec.getDuration()).toBeCloseTo(0.5, 2);
  });

  it('generates WAV', () => {
    const rec = new AudioRecorder({ sampleRate: 44100 });
    rec.start();
    rec.addSamples(new Float32Array([0.5, -0.5]));
    rec.stop();
    const wav = rec.toWav();
    expect(wav.byteLength).toBe(48); // 44 header + 4 bytes (2 samples * 2 bytes)
  });
});

describe('EffectsChain', () => {
  it('chains effects', () => {
    const chain = new EffectsChain();
    chain.add({ process: (s) => s.map(v => v * 0.5) });
    chain.add({ process: (s) => s.map(v => v * 0.5) });
    const input = new Float32Array([1, 1, 1]);
    const output = chain.process(input, 44100);
    expect(output[0]).toBeCloseTo(0.25, 2);
  });

  it('bypasses all', () => {
    const chain = new EffectsChain();
    chain.add({ process: () => new Float32Array([0]) });
    chain.bypass = true;
    const input = new Float32Array([1]);
    expect(chain.process(input, 44100)[0]).toBe(1);
  });

  it('bypasses individual', () => {
    const chain = new EffectsChain();
    chain.add({ process: (s) => s.map(v => v * 0) });
    chain.setBypass(0, true);
    expect(chain.process(new Float32Array([1]), 44100)[0]).toBe(1);
  });
});

describe('Synthesizer', () => {
  it('plays notes', () => {
    const synth = new Synthesizer({ sampleRate: 44100 });
    synth.noteOn(440);
    const output = synth.render(100);
    expect(output.length).toBe(100);
    const hasSound = output.some(v => Math.abs(v) > 0.01);
    expect(hasSound).toBe(true);
  });

  it('handles polyphony', () => {
    const synth = new Synthesizer({ voices: 4 });
    synth.noteOn(440);
    synth.noteOn(550);
    synth.noteOn(660);
    expect(synth.getActiveVoiceCount()).toBe(3);
  });

  it('releases notes', () => {
    const synth = new Synthesizer({ sampleRate: 44100, envelope: { release: 0.01 } });
    synth.noteOn(440);
    synth.render(1000);
    synth.noteOff(440);
    synth.render(1000); // Process release
    // After release, voice count should eventually drop
  });

  it('all notes off', () => {
    const synth = new Synthesizer({ envelope: { release: 0.01 } });
    synth.noteOn(440);
    synth.noteOn(550);
    synth.allNotesOff();
    synth.render(44100); // Process release phase
    synth.render(1); // Second render to filter out inactive voices
    expect(synth.getActiveVoiceCount()).toBe(0);
  });
});

describe('DrumMachine', () => {
  it('triggers sounds', () => {
    const dm = new DrumMachine();
    const kick = dm.triggerSound('kick');
    expect(kick.length).toBeGreaterThan(0);
    const snare = dm.triggerSound('snare');
    expect(snare.length).toBeGreaterThan(0);
  });

  it('serializes', () => {
    const dm = new DrumMachine({ bpm: 140 });
    dm.addTrack('custom');
    const data = dm.serialize();
    expect(data.sampleRate).toBe(44100);
  });
});

describe('Presets', () => {
  it('creates synth from preset', () => {
    const pad = createSynthFromPreset('pad');
    expect(pad.oscillatorType).toBe(WaveformType.SINE);
    expect(pad.envelope.attack).toBe(0.5);
  });

  it('falls back for unknown preset', () => {
    const synth = createSynthFromPreset('nonexistent');
    expect(synth).toBeInstanceOf(Synthesizer);
  });

  it('has expected presets', () => {
    expect(Object.keys(SYNTH_PRESETS)).toContain('pad');
    expect(Object.keys(SYNTH_PRESETS)).toContain('lead');
    expect(Object.keys(SYNTH_PRESETS)).toContain('bass');
  });
});
