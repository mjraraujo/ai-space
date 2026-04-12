import { describe, it, expect, beforeEach } from 'vitest';
import {
  Color, FrameBuffer, ImageFilter, Transition, Compositor,
  VideoClip, VideoTrack, Timeline, FilterPipeline,
  MotionDetector, ColorPaletteExtractor, BlendMode
} from '../video-pipeline.js';

describe('Color', () => {
  it('creates with defaults', () => {
    const c = new Color();
    expect(c.r).toBe(0);
    expect(c.g).toBe(0);
    expect(c.b).toBe(0);
    expect(c.a).toBe(255);
  });

  it('creates from hex', () => {
    const c = Color.fromHex('#ff8800');
    expect(c.r).toBe(255);
    expect(c.g).toBe(136);
    expect(c.b).toBe(0);
  });

  it('creates from short hex', () => {
    const c = Color.fromHex('#f80');
    expect(c.r).toBe(255);
    expect(c.g).toBe(136);
    expect(c.b).toBe(0);
  });

  it('converts to hex', () => {
    const c = new Color(255, 0, 128);
    expect(c.toHex()).toBe('#ff0080');
  });

  it('converts to/from HSL', () => {
    const c = new Color(255, 0, 0);
    const hsl = c.toHSL();
    expect(hsl.h).toBeCloseTo(0, 0);
    expect(hsl.s).toBeCloseTo(1, 1);
    expect(hsl.l).toBeCloseTo(0.5, 1);

    const back = Color.fromHSL(hsl.h, hsl.s, hsl.l);
    expect(back.r).toBeCloseTo(255, 0);
  });

  it('computes luminance', () => {
    expect(new Color(255, 255, 255).luminance()).toBeCloseTo(1, 1);
    expect(new Color(0, 0, 0).luminance()).toBe(0);
  });

  it('converts to grayscale', () => {
    const gray = new Color(255, 0, 0).grayscale();
    expect(gray.r).toBe(gray.g);
    expect(gray.g).toBe(gray.b);
  });

  it('inverts', () => {
    const inv = new Color(255, 0, 128).invert();
    expect(inv.r).toBe(0);
    expect(inv.g).toBe(255);
    expect(inv.b).toBe(127);
  });

  it('blends', () => {
    const a = new Color(0, 0, 0);
    const b = new Color(255, 255, 255);
    const mid = a.blend(b, 0.5);
    expect(mid.r).toBe(128);
    expect(mid.g).toBe(128);
  });

  it('adjusts brightness', () => {
    const bright = new Color(100, 100, 100).adjustBrightness(2);
    expect(bright.r).toBe(200);
  });

  it('adjusts saturation', () => {
    const desat = new Color(255, 0, 0).adjustSaturation(0);
    const hsl = desat.toHSL();
    expect(hsl.s).toBeLessThan(0.1);
  });

  it('clones and checks equality', () => {
    const c = new Color(1, 2, 3, 4);
    const clone = c.clone();
    expect(c.equals(clone)).toBe(true);
    expect(c).not.toBe(clone);
  });

  it('converts to array', () => {
    expect(new Color(1, 2, 3, 4).toArray()).toEqual([1, 2, 3, 4]);
  });
});

describe('FrameBuffer', () => {
  it('creates with correct size', () => {
    const fb = new FrameBuffer(10, 10);
    expect(fb.width).toBe(10);
    expect(fb.height).toBe(10);
    expect(fb.data.length).toBe(400);
  });

  it('gets and sets pixels', () => {
    const fb = new FrameBuffer(10, 10);
    const red = new Color(255, 0, 0);
    fb.setPixel(5, 5, red);
    const pixel = fb.getPixel(5, 5);
    expect(pixel.r).toBe(255);
    expect(pixel.g).toBe(0);
  });

  it('handles out of bounds', () => {
    const fb = new FrameBuffer(10, 10);
    const p = fb.getPixel(-1, -1);
    expect(p.a).toBe(0);
    fb.setPixel(-1, -1, new Color(255, 0, 0)); // Should not throw
  });

  it('fills', () => {
    const fb = new FrameBuffer(5, 5);
    fb.fill(new Color(100, 100, 100));
    expect(fb.getPixel(0, 0).r).toBe(100);
    expect(fb.getPixel(4, 4).r).toBe(100);
  });

  it('clears', () => {
    const fb = new FrameBuffer(5, 5);
    fb.fill(new Color(255, 255, 255));
    fb.clear();
    expect(fb.getPixel(0, 0).r).toBe(0);
  });

  it('clones', () => {
    const fb = new FrameBuffer(5, 5);
    fb.setPixel(0, 0, new Color(255, 0, 0));
    const clone = fb.clone();
    expect(clone.getPixel(0, 0).r).toBe(255);
    expect(clone).not.toBe(fb);
  });

  it('gets region', () => {
    const fb = new FrameBuffer(10, 10);
    fb.setPixel(5, 5, new Color(255, 0, 0));
    const region = fb.getRegion(4, 4, 3, 3);
    expect(region.width).toBe(3);
    expect(region.getPixel(1, 1).r).toBe(255);
  });

  it('blits with opacity', () => {
    const dest = new FrameBuffer(10, 10);
    dest.fill(new Color(0, 0, 0, 255));
    const src = new FrameBuffer(5, 5);
    src.fill(new Color(255, 255, 255, 255));
    dest.blit(src, 0, 0, 0.5);
    const pixel = dest.getPixel(2, 2);
    expect(pixel.r).toBeGreaterThan(100);
    expect(pixel.r).toBeLessThan(200);
  });

  it('resizes', () => {
    const fb = new FrameBuffer(10, 10);
    fb.fill(new Color(255, 0, 0));
    const resized = fb.resize(5, 5);
    expect(resized.width).toBe(5);
    expect(resized.height).toBe(5);
    expect(resized.getPixel(2, 2).r).toBe(255);
  });

  it('flips horizontally', () => {
    const fb = new FrameBuffer(10, 5);
    fb.setPixel(0, 0, new Color(255, 0, 0));
    const flipped = fb.flipHorizontal();
    expect(flipped.getPixel(9, 0).r).toBe(255);
  });

  it('flips vertically', () => {
    const fb = new FrameBuffer(5, 10);
    fb.setPixel(0, 0, new Color(255, 0, 0));
    const flipped = fb.flipVertical();
    expect(flipped.getPixel(0, 9).r).toBe(255);
  });

  it('rotates 90 degrees', () => {
    const fb = new FrameBuffer(10, 5);
    fb.setPixel(9, 0, new Color(255, 0, 0));
    const rotated = fb.rotate90();
    expect(rotated.width).toBe(5);
    expect(rotated.height).toBe(10);
  });

  it('computes histogram', () => {
    const fb = new FrameBuffer(5, 5);
    fb.fill(new Color(128, 128, 128));
    const hist = fb.getHistogram();
    expect(hist.r[128]).toBe(25);
    expect(hist.luminance[128]).toBe(25);
  });

  it('computes average color', () => {
    const fb = new FrameBuffer(2, 2);
    fb.setPixel(0, 0, new Color(100, 0, 0));
    fb.setPixel(1, 0, new Color(200, 0, 0));
    fb.setPixel(0, 1, new Color(100, 0, 0));
    fb.setPixel(1, 1, new Color(200, 0, 0));
    const avg = fb.getAverageColor();
    expect(avg.r).toBe(150);
  });
});

describe('ImageFilter', () => {
  let frame;

  beforeEach(() => {
    frame = new FrameBuffer(10, 10);
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        frame.setPixel(x, y, new Color(x * 25, y * 25, 128, 255));
      }
    }
  });

  it('applies grayscale', () => {
    const result = ImageFilter.grayscale(frame);
    const p = result.getPixel(5, 5);
    expect(p.r).toBe(p.g);
    expect(p.g).toBe(p.b);
  });

  it('applies sepia', () => {
    const result = ImageFilter.sepia(frame);
    const p = result.getPixel(5, 5);
    expect(p.r).toBeGreaterThan(p.b); // Sepia has warm tone
  });

  it('inverts', () => {
    const white = new FrameBuffer(1, 1);
    white.setPixel(0, 0, new Color(255, 255, 255));
    const result = ImageFilter.invert(white);
    expect(result.getPixel(0, 0).r).toBe(0);
  });

  it('adjusts brightness', () => {
    const result = ImageFilter.brightness(frame, 2);
    const orig = frame.getPixel(2, 2);
    const bright = result.getPixel(2, 2);
    expect(bright.r).toBeGreaterThanOrEqual(orig.r);
  });

  it('applies blur', () => {
    const sharp = new FrameBuffer(10, 10);
    sharp.setPixel(5, 5, new Color(255, 0, 0));
    const blurred = ImageFilter.blur(sharp, 1);
    // Neighbors should have some red
    expect(blurred.getPixel(4, 5).r).toBeGreaterThan(0);
  });

  it('applies sharpen', () => {
    const result = ImageFilter.sharpen(frame);
    expect(result.width).toBe(frame.width);
  });

  it('detects edges', () => {
    const result = ImageFilter.edgeDetect(frame);
    expect(result.width).toBe(frame.width);
  });

  it('applies threshold', () => {
    const result = ImageFilter.threshold(frame, 128);
    const p = result.getPixel(0, 0);
    expect(p.r === 0 || p.r === 255).toBe(true);
  });

  it('posterizes', () => {
    const result = ImageFilter.posterize(frame, 4);
    expect(result.width).toBe(frame.width);
  });

  it('applies vignette', () => {
    const uniform = new FrameBuffer(20, 20);
    uniform.fill(new Color(200, 200, 200));
    const result = ImageFilter.vignette(uniform, 0.5);
    // Center should be brighter than corners
    expect(result.getPixel(10, 10).r).toBeGreaterThan(result.getPixel(0, 0).r);
  });

  it('applies chroma key', () => {
    const green = new FrameBuffer(5, 5);
    green.fill(new Color(0, 255, 0, 255));
    const result = ImageFilter.chromaKey(green, new Color(0, 255, 0), 30);
    expect(result.getPixel(0, 0).a).toBe(0); // Should be transparent
  });

  it('applies color balance', () => {
    const result = ImageFilter.colorBalance(frame, 50, -50, 0);
    const p = result.getPixel(5, 5);
    const origP = frame.getPixel(5, 5);
    expect(p.r).toBeGreaterThan(origP.r);
  });

  it('applies pixelate', () => {
    const result = ImageFilter.pixelate(frame, 4);
    expect(result.width).toBe(frame.width);
  });

  it('applies noise', () => {
    const uniform = new FrameBuffer(10, 10);
    uniform.fill(new Color(128, 128, 128));
    const result = ImageFilter.noise(uniform, 20);
    // Some pixels should differ
    let different = false;
    for (let i = 0; i < 100; i++) {
      const x = i % 10, y = Math.floor(i / 10);
      if (result.getPixel(x, y).r !== 128) { different = true; break; }
    }
    expect(different).toBe(true);
  });

  it('rotates hue', () => {
    const red = new FrameBuffer(1, 1);
    red.setPixel(0, 0, new Color(255, 0, 0));
    const result = ImageFilter.hueRotate(red, 120);
    const p = result.getPixel(0, 0);
    // Red rotated 120° should be greenish
    expect(p.g).toBeGreaterThan(p.r);
  });
});

describe('Transition', () => {
  let frameA, frameB;

  beforeEach(() => {
    frameA = new FrameBuffer(10, 10);
    frameA.fill(new Color(255, 0, 0));
    frameB = new FrameBuffer(10, 10);
    frameB.fill(new Color(0, 0, 255));
  });

  it('cross fades', () => {
    const mid = Transition.crossFade(frameA, frameB, 0.5);
    const p = mid.getPixel(5, 5);
    expect(p.r).toBeCloseTo(128, -1);
    expect(p.b).toBeCloseTo(128, -1);
  });

  it('wipe right', () => {
    const mid = Transition.wipeRight(frameA, frameB, 0.5);
    const left = mid.getPixel(2, 5);
    const right = mid.getPixel(8, 5);
    expect(left.b).toBe(255);
    expect(right.r).toBe(255);
  });

  it('wipe down', () => {
    const mid = Transition.wipeDown(frameA, frameB, 0.5);
    expect(mid.width).toBe(10);
  });

  it('circle reveal', () => {
    const mid = Transition.circleReveal(frameA, frameB, 0.5);
    expect(mid.width).toBe(10);
  });

  it('slide left', () => {
    const mid = Transition.slideLeft(frameA, frameB, 0.5);
    expect(mid.width).toBe(10);
  });
});

describe('Compositor', () => {
  let base, overlay;

  beforeEach(() => {
    base = new FrameBuffer(10, 10);
    base.fill(new Color(200, 100, 50));
    overlay = new FrameBuffer(10, 10);
    overlay.fill(new Color(100, 200, 150));
  });

  it('normal blend', () => {
    const result = Compositor.blend(base, overlay, BlendMode.NORMAL, 1);
    expect(result.getPixel(5, 5).r).toBe(100);
  });

  it('multiply blend', () => {
    const result = Compositor.blend(base, overlay, BlendMode.MULTIPLY);
    const p = result.getPixel(5, 5);
    expect(p.r).toBeLessThan(200);
  });

  it('screen blend', () => {
    const result = Compositor.blend(base, overlay, BlendMode.SCREEN);
    expect(result.getPixel(5, 5).r).toBeGreaterThan(100);
  });

  it('add blend', () => {
    const result = Compositor.blend(base, overlay, BlendMode.ADD);
    expect(result.getPixel(5, 5).r).toBe(255); // Clamped
  });

  it('difference blend', () => {
    const result = Compositor.blend(base, overlay, BlendMode.DIFFERENCE);
    expect(result.getPixel(5, 5).r).toBe(100);
  });

  it('composes layers', () => {
    const result = Compositor.composeLayers([
      { frame: base, visible: true },
      { frame: overlay, visible: true, blendMode: BlendMode.NORMAL, opacity: 0.5 }
    ]);
    expect(result.width).toBe(10);
  });

  it('skips invisible layers', () => {
    const result = Compositor.composeLayers([
      { frame: base, visible: true },
      { frame: overlay, visible: false }
    ]);
    expect(result.getPixel(5, 5).r).toBe(200);
  });
});

describe('VideoClip', () => {
  it('creates with defaults', () => {
    const clip = new VideoClip({ name: 'Test' });
    expect(clip.name).toBe('Test');
    expect(clip.startTime).toBe(0);
    expect(clip.duration).toBe(5);
  });

  it('computes end time', () => {
    const clip = new VideoClip({ startTime: 2, duration: 3 });
    expect(clip.endTime).toBe(5);
  });

  it('checks time containment', () => {
    const clip = new VideoClip({ startTime: 1, duration: 3 });
    expect(clip.containsTime(2)).toBe(true);
    expect(clip.containsTime(0)).toBe(false);
    expect(clip.containsTime(5)).toBe(false);
  });

  it('gets frame', () => {
    const clip = new VideoClip({
      startTime: 0, duration: 5,
      frameGenerator: (t, w, h) => {
        const f = new FrameBuffer(w, h);
        f.fill(new Color(Math.floor(t * 50), 0, 0));
        return f;
      }
    });
    const frame = clip.getFrame(2, 10, 10);
    expect(frame.getPixel(0, 0).r).toBe(100);
  });

  it('clones', () => {
    const clip = new VideoClip({ name: 'Original' });
    const clone = clip.clone();
    expect(clone.name).toBe('Original');
    expect(clone.id).not.toBe(clip.id);
  });
});

describe('VideoTrack', () => {
  it('adds clips', () => {
    const track = new VideoTrack('Video');
    track.addClip(new VideoClip({ startTime: 0, duration: 5 }));
    track.addClip(new VideoClip({ startTime: 5, duration: 3 }));
    expect(track.clips.length).toBe(2);
  });

  it('rejects overlapping clips', () => {
    const track = new VideoTrack();
    track.addClip(new VideoClip({ startTime: 0, duration: 5 }));
    expect(() => track.addClip(new VideoClip({ startTime: 3, duration: 5 }))).toThrow();
  });

  it('gets clip at time', () => {
    const track = new VideoTrack();
    const clip = new VideoClip({ startTime: 2, duration: 3 });
    track.addClip(clip);
    expect(track.getClipAtTime(3)).toBe(clip);
    expect(track.getClipAtTime(0)).toBeNull();
  });

  it('computes duration', () => {
    const track = new VideoTrack();
    track.addClip(new VideoClip({ startTime: 0, duration: 5 }));
    track.addClip(new VideoClip({ startTime: 7, duration: 3 }));
    expect(track.getDuration()).toBe(10);
  });

  it('finds gaps', () => {
    const track = new VideoTrack();
    track.addClip(new VideoClip({ startTime: 0, duration: 3 }));
    track.addClip(new VideoClip({ startTime: 5, duration: 2 }));
    const gaps = track.getGaps();
    expect(gaps.length).toBe(1);
    expect(gaps[0].start).toBe(3);
    expect(gaps[0].end).toBe(5);
  });

  it('removes clips', () => {
    const track = new VideoTrack();
    const clip = new VideoClip({ startTime: 0, duration: 5 });
    track.addClip(clip);
    track.removeClip(clip.id);
    expect(track.clips.length).toBe(0);
  });
});

describe('Timeline', () => {
  let timeline;

  beforeEach(() => {
    timeline = new Timeline({ width: 100, height: 100, fps: 30 });
  });

  it('adds tracks', () => {
    timeline.addTrack('Video 1');
    timeline.addTrack('Video 2');
    expect(timeline.tracks.length).toBe(2);
  });

  it('renders frame', () => {
    const track = timeline.addTrack('Test');
    track.addClip(new VideoClip({
      startTime: 0, duration: 5,
      frameGenerator: (t, w, h) => {
        const f = new FrameBuffer(w, h);
        f.fill(new Color(255, 0, 0));
        return f;
      }
    }));
    const frame = timeline.renderFrame(1);
    expect(frame.getPixel(50, 50).r).toBe(255);
  });

  it('plays and pauses', () => {
    timeline.play();
    expect(timeline.isPlaying).toBe(true);
    timeline.pause();
    expect(timeline.isPlaying).toBe(false);
  });

  it('seeks', () => {
    const track = timeline.addTrack('Test');
    track.addClip(new VideoClip({ startTime: 0, duration: 10 }));
    timeline.seek(2.5);
    expect(timeline.currentTime).toBe(2.5);
  });

  it('advances time', () => {
    const track = timeline.addTrack('Test');
    track.addClip(new VideoClip({ startTime: 0, duration: 10 }));
    timeline.play();
    timeline.advance(0.5);
    expect(timeline.currentTime).toBeCloseTo(0.5, 2);
  });

  it('loops', () => {
    timeline.loop = true;
    const track = timeline.addTrack('Test');
    track.addClip(new VideoClip({ startTime: 0, duration: 2 }));
    timeline.play();
    timeline.advance(3); // Past duration
    expect(timeline.currentTime).toBeLessThan(2);
  });

  it('emits events', () => {
    const events = [];
    timeline.on('play', e => events.push('play'));
    timeline.on('pause', e => events.push('pause'));
    timeline.play();
    timeline.pause();
    expect(events).toEqual(['play', 'pause']);
  });

  it('gets stats', () => {
    timeline.addTrack('Test').addClip(new VideoClip({ startTime: 0, duration: 5 }));
    const stats = timeline.getStats();
    expect(stats.trackCount).toBe(1);
    expect(stats.clipCount).toBe(1);
    expect(stats.fps).toBe(30);
  });
});

describe('FilterPipeline', () => {
  it('chains filters', () => {
    const pipeline = new FilterPipeline();
    pipeline.add('grayscale', ImageFilter.grayscale);
    pipeline.add('invert', ImageFilter.invert);

    const frame = new FrameBuffer(5, 5);
    frame.fill(new Color(255, 0, 0));
    const result = pipeline.process(frame);
    expect(result.width).toBe(5);
  });

  it('disables filters', () => {
    const pipeline = new FilterPipeline();
    pipeline.add('invert', ImageFilter.invert);
    pipeline.setEnabled('invert', false);

    const frame = new FrameBuffer(1, 1);
    frame.setPixel(0, 0, new Color(255, 0, 0));
    const result = pipeline.process(frame);
    expect(result.getPixel(0, 0).r).toBe(255); // Not inverted
  });

  it('gets filter names', () => {
    const pipeline = new FilterPipeline();
    pipeline.add('a', f => f);
    pipeline.add('b', f => f);
    expect(pipeline.getFilterNames().length).toBe(2);
  });
});

describe('MotionDetector', () => {
  it('detects motion', () => {
    const detector = new MotionDetector({ threshold: 10, minArea: 1 });
    const frame1 = new FrameBuffer(10, 10);
    frame1.fill(new Color(100, 100, 100));

    detector.detect(frame1); // First frame, no comparison

    const frame2 = new FrameBuffer(10, 10);
    frame2.fill(new Color(200, 200, 200)); // Big change
    const result = detector.detect(frame2);
    expect(result.hasMotion).toBe(true);
    expect(result.amount).toBeGreaterThan(0);
  });

  it('no motion for identical frames', () => {
    const detector = new MotionDetector();
    const frame = new FrameBuffer(10, 10);
    frame.fill(new Color(100, 100, 100));

    detector.detect(frame);
    const result = detector.detect(frame.clone());
    expect(result.hasMotion).toBe(false);
  });
});

describe('ColorPaletteExtractor', () => {
  it('extracts palette', () => {
    const extractor = new ColorPaletteExtractor({ paletteSize: 3, quality: 1 });
    const frame = new FrameBuffer(10, 10);
    // Fill with 3 distinct colors
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        if (x < 3) frame.setPixel(x, y, new Color(255, 0, 0, 255));
        else if (x < 7) frame.setPixel(x, y, new Color(0, 255, 0, 255));
        else frame.setPixel(x, y, new Color(0, 0, 255, 255));
      }
    }
    const palette = extractor.extract(frame);
    expect(palette.length).toBe(3);
    expect(palette.every(c => c instanceof Color)).toBe(true);
  });
});
