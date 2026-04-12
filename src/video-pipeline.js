/* ============================================================================
 *  video-pipeline.js — Video processing pipeline
 *  Frame processing, filters, compositing, transitions, recording
 * ========================================================================== */

// ─── Color Utilities ────────────────────────────────────────────────────────
export class Color {
  constructor(r = 0, g = 0, b = 0, a = 255) {
    this.r = r; this.g = g; this.b = b; this.a = a;
  }

  static fromHex(hex) {
    const h = hex.replace('#', '');
    if (h.length === 3) {
      return new Color(
        parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16),
        parseInt(h[2] + h[2], 16), 255
      );
    }
    return new Color(
      parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16),
      parseInt(h.substring(4, 6), 16), h.length >= 8 ? parseInt(h.substring(6, 8), 16) : 255
    );
  }

  static fromHSL(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return new Color(
      Math.round((r + m) * 255), Math.round((g + m) * 255),
      Math.round((b + m) * 255), 255
    );
  }

  toHex() {
    const r = this.r.toString(16).padStart(2, '0');
    const g = this.g.toString(16).padStart(2, '0');
    const b = this.b.toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }

  toHSL() {
    const r = this.r / 255, g = this.g / 255, b = this.b / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = 0;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
    return { h, s, l };
  }

  luminance() {
    const r = this.r / 255, g = this.g / 255, b = this.b / 255;
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  grayscale() {
    const l = Math.round(this.luminance() * 255);
    return new Color(l, l, l, this.a);
  }

  invert() {
    return new Color(255 - this.r, 255 - this.g, 255 - this.b, this.a);
  }

  blend(other, t) {
    return new Color(
      Math.round(this.r + (other.r - this.r) * t),
      Math.round(this.g + (other.g - this.g) * t),
      Math.round(this.b + (other.b - this.b) * t),
      Math.round(this.a + (other.a - this.a) * t)
    );
  }

  adjustBrightness(factor) {
    return new Color(
      Math.min(255, Math.max(0, Math.round(this.r * factor))),
      Math.min(255, Math.max(0, Math.round(this.g * factor))),
      Math.min(255, Math.max(0, Math.round(this.b * factor))),
      this.a
    );
  }

  adjustContrast(factor) {
    const f = (259 * (factor + 255)) / (255 * (259 - factor));
    return new Color(
      Math.min(255, Math.max(0, Math.round(f * (this.r - 128) + 128))),
      Math.min(255, Math.max(0, Math.round(f * (this.g - 128) + 128))),
      Math.min(255, Math.max(0, Math.round(f * (this.b - 128) + 128))),
      this.a
    );
  }

  adjustSaturation(factor) {
    const hsl = this.toHSL();
    hsl.s = Math.min(1, Math.max(0, hsl.s * factor));
    return Color.fromHSL(hsl.h, hsl.s, hsl.l);
  }

  clone() { return new Color(this.r, this.g, this.b, this.a); }
  equals(other) { return this.r === other.r && this.g === other.g && this.b === other.b && this.a === other.a; }
  toArray() { return [this.r, this.g, this.b, this.a]; }
}

// ─── Frame Buffer ───────────────────────────────────────────────────────────
export class FrameBuffer {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  getPixel(x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return new Color(0, 0, 0, 0);
    }
    const i = (y * this.width + x) * 4;
    return new Color(this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]);
  }

  setPixel(x, y, color) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    this.data[i] = color.r;
    this.data[i + 1] = color.g;
    this.data[i + 2] = color.b;
    this.data[i + 3] = color.a;
  }

  fill(color) {
    for (let i = 0; i < this.data.length; i += 4) {
      this.data[i] = color.r;
      this.data[i + 1] = color.g;
      this.data[i + 2] = color.b;
      this.data[i + 3] = color.a;
    }
  }

  clear() {
    this.data.fill(0);
  }

  clone() {
    const fb = new FrameBuffer(this.width, this.height);
    fb.data.set(this.data);
    return fb;
  }

  getRegion(x, y, w, h) {
    const region = new FrameBuffer(w, h);
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        region.setPixel(dx, dy, this.getPixel(x + dx, y + dy));
      }
    }
    return region;
  }

  blit(source, destX, destY, opacity = 1) {
    for (let y = 0; y < source.height; y++) {
      for (let x = 0; x < source.width; x++) {
        const srcPixel = source.getPixel(x, y);
        if (srcPixel.a === 0) continue;

        const px = destX + x;
        const py = destY + y;
        if (px < 0 || px >= this.width || py < 0 || py >= this.height) continue;

        if (opacity < 1 || srcPixel.a < 255) {
          const dstPixel = this.getPixel(px, py);
          const alpha = (srcPixel.a / 255) * opacity;
          const blended = new Color(
            Math.round(srcPixel.r * alpha + dstPixel.r * (1 - alpha)),
            Math.round(srcPixel.g * alpha + dstPixel.g * (1 - alpha)),
            Math.round(srcPixel.b * alpha + dstPixel.b * (1 - alpha)),
            Math.min(255, Math.round(srcPixel.a * opacity + dstPixel.a * (1 - alpha)))
          );
          this.setPixel(px, py, blended);
        } else {
          this.setPixel(px, py, srcPixel);
        }
      }
    }
  }

  resize(newWidth, newHeight) {
    const result = new FrameBuffer(newWidth, newHeight);
    const xRatio = this.width / newWidth;
    const yRatio = this.height / newHeight;

    for (let y = 0; y < newHeight; y++) {
      for (let x = 0; x < newWidth; x++) {
        const srcX = Math.floor(x * xRatio);
        const srcY = Math.floor(y * yRatio);
        result.setPixel(x, y, this.getPixel(srcX, srcY));
      }
    }
    return result;
  }

  flipHorizontal() {
    const result = new FrameBuffer(this.width, this.height);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        result.setPixel(this.width - 1 - x, y, this.getPixel(x, y));
      }
    }
    return result;
  }

  flipVertical() {
    const result = new FrameBuffer(this.width, this.height);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        result.setPixel(x, this.height - 1 - y, this.getPixel(x, y));
      }
    }
    return result;
  }

  rotate90() {
    const result = new FrameBuffer(this.height, this.width);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        result.setPixel(this.height - 1 - y, x, this.getPixel(x, y));
      }
    }
    return result;
  }

  getHistogram() {
    const r = new Uint32Array(256);
    const g = new Uint32Array(256);
    const b = new Uint32Array(256);
    const luminance = new Uint32Array(256);

    for (let i = 0; i < this.data.length; i += 4) {
      r[this.data[i]]++;
      g[this.data[i + 1]]++;
      b[this.data[i + 2]]++;
      const lum = Math.round(0.299 * this.data[i] + 0.587 * this.data[i + 1] + 0.114 * this.data[i + 2]);
      luminance[lum]++;
    }

    return { r, g, b, luminance };
  }

  getAverageColor() {
    let rSum = 0, gSum = 0, bSum = 0;
    const pixelCount = this.width * this.height;
    for (let i = 0; i < this.data.length; i += 4) {
      rSum += this.data[i];
      gSum += this.data[i + 1];
      bSum += this.data[i + 2];
    }
    return new Color(
      Math.round(rSum / pixelCount),
      Math.round(gSum / pixelCount),
      Math.round(bSum / pixelCount)
    );
  }
}

// ─── Image Filters ──────────────────────────────────────────────────────────
export class ImageFilter {
  static grayscale(frame) {
    const result = frame.clone();
    for (let i = 0; i < result.data.length; i += 4) {
      const gray = Math.round(0.299 * result.data[i] + 0.587 * result.data[i+1] + 0.114 * result.data[i+2]);
      result.data[i] = result.data[i+1] = result.data[i+2] = gray;
    }
    return result;
  }

  static sepia(frame) {
    const result = frame.clone();
    for (let i = 0; i < result.data.length; i += 4) {
      const r = result.data[i], g = result.data[i+1], b = result.data[i+2];
      result.data[i] = Math.min(255, Math.round(r * 0.393 + g * 0.769 + b * 0.189));
      result.data[i+1] = Math.min(255, Math.round(r * 0.349 + g * 0.686 + b * 0.168));
      result.data[i+2] = Math.min(255, Math.round(r * 0.272 + g * 0.534 + b * 0.131));
    }
    return result;
  }

  static invert(frame) {
    const result = frame.clone();
    for (let i = 0; i < result.data.length; i += 4) {
      result.data[i] = 255 - result.data[i];
      result.data[i+1] = 255 - result.data[i+1];
      result.data[i+2] = 255 - result.data[i+2];
    }
    return result;
  }

  static brightness(frame, factor) {
    const result = frame.clone();
    for (let i = 0; i < result.data.length; i += 4) {
      result.data[i] = Math.min(255, Math.max(0, Math.round(result.data[i] * factor)));
      result.data[i+1] = Math.min(255, Math.max(0, Math.round(result.data[i+1] * factor)));
      result.data[i+2] = Math.min(255, Math.max(0, Math.round(result.data[i+2] * factor)));
    }
    return result;
  }

  static contrast(frame, factor) {
    const result = frame.clone();
    const f = (259 * (factor * 255 + 255)) / (255 * (259 - factor * 255));
    for (let i = 0; i < result.data.length; i += 4) {
      result.data[i] = Math.min(255, Math.max(0, Math.round(f * (result.data[i] - 128) + 128)));
      result.data[i+1] = Math.min(255, Math.max(0, Math.round(f * (result.data[i+1] - 128) + 128)));
      result.data[i+2] = Math.min(255, Math.max(0, Math.round(f * (result.data[i+2] - 128) + 128)));
    }
    return result;
  }

  static blur(frame, radius = 1) {
    const result = new FrameBuffer(frame.width, frame.height);
    const size = radius * 2 + 1;
    const weight = 1 / (size * size);

    for (let y = 0; y < frame.height; y++) {
      for (let x = 0; x < frame.width; x++) {
        let rSum = 0, gSum = 0, bSum = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const px = Math.min(frame.width - 1, Math.max(0, x + dx));
            const py = Math.min(frame.height - 1, Math.max(0, y + dy));
            const color = frame.getPixel(px, py);
            rSum += color.r;
            gSum += color.g;
            bSum += color.b;
          }
        }
        result.setPixel(x, y, new Color(
          Math.round(rSum * weight), Math.round(gSum * weight),
          Math.round(bSum * weight), frame.getPixel(x, y).a
        ));
      }
    }
    return result;
  }

  static sharpen(frame) {
    return ImageFilter.convolve(frame, [
      [0, -1, 0],
      [-1, 5, -1],
      [0, -1, 0]
    ]);
  }

  static edgeDetect(frame) {
    const gray = ImageFilter.grayscale(frame);
    return ImageFilter.convolve(gray, [
      [-1, -1, -1],
      [-1, 8, -1],
      [-1, -1, -1]
    ]);
  }

  static emboss(frame) {
    return ImageFilter.convolve(frame, [
      [-2, -1, 0],
      [-1, 1, 1],
      [0, 1, 2]
    ]);
  }

  static convolve(frame, kernel) {
    const result = new FrameBuffer(frame.width, frame.height);
    const kSize = kernel.length;
    const half = Math.floor(kSize / 2);

    for (let y = 0; y < frame.height; y++) {
      for (let x = 0; x < frame.width; x++) {
        let rSum = 0, gSum = 0, bSum = 0;
        for (let ky = 0; ky < kSize; ky++) {
          for (let kx = 0; kx < kSize; kx++) {
            const px = Math.min(frame.width - 1, Math.max(0, x + kx - half));
            const py = Math.min(frame.height - 1, Math.max(0, y + ky - half));
            const color = frame.getPixel(px, py);
            const weight = kernel[ky][kx];
            rSum += color.r * weight;
            gSum += color.g * weight;
            bSum += color.b * weight;
          }
        }
        result.setPixel(x, y, new Color(
          Math.min(255, Math.max(0, Math.round(rSum))),
          Math.min(255, Math.max(0, Math.round(gSum))),
          Math.min(255, Math.max(0, Math.round(bSum))),
          frame.getPixel(x, y).a
        ));
      }
    }
    return result;
  }

  static threshold(frame, threshold = 128) {
    const result = frame.clone();
    for (let i = 0; i < result.data.length; i += 4) {
      const gray = 0.299 * result.data[i] + 0.587 * result.data[i+1] + 0.114 * result.data[i+2];
      const val = gray >= threshold ? 255 : 0;
      result.data[i] = result.data[i+1] = result.data[i+2] = val;
    }
    return result;
  }

  static posterize(frame, levels = 4) {
    const result = frame.clone();
    const step = 255 / (levels - 1);
    for (let i = 0; i < result.data.length; i += 4) {
      result.data[i] = Math.round(Math.round(result.data[i] / step) * step);
      result.data[i+1] = Math.round(Math.round(result.data[i+1] / step) * step);
      result.data[i+2] = Math.round(Math.round(result.data[i+2] / step) * step);
    }
    return result;
  }

  static vignette(frame, strength = 0.5) {
    const result = frame.clone();
    const cx = frame.width / 2, cy = frame.height / 2;
    const maxDist = Math.sqrt(cx * cx + cy * cy);

    for (let y = 0; y < frame.height; y++) {
      for (let x = 0; x < frame.width; x++) {
        const dx = x - cx, dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy) / maxDist;
        const factor = 1 - dist * dist * strength;

        const i = (y * frame.width + x) * 4;
        result.data[i] = Math.round(result.data[i] * factor);
        result.data[i+1] = Math.round(result.data[i+1] * factor);
        result.data[i+2] = Math.round(result.data[i+2] * factor);
      }
    }
    return result;
  }

  static chromaKey(frame, keyColor, tolerance = 30) {
    const result = frame.clone();
    for (let i = 0; i < result.data.length; i += 4) {
      const dr = Math.abs(result.data[i] - keyColor.r);
      const dg = Math.abs(result.data[i+1] - keyColor.g);
      const db = Math.abs(result.data[i+2] - keyColor.b);
      if (dr < tolerance && dg < tolerance && db < tolerance) {
        result.data[i+3] = 0; // Make transparent
      }
    }
    return result;
  }

  static colorBalance(frame, rShift = 0, gShift = 0, bShift = 0) {
    const result = frame.clone();
    for (let i = 0; i < result.data.length; i += 4) {
      result.data[i] = Math.min(255, Math.max(0, result.data[i] + rShift));
      result.data[i+1] = Math.min(255, Math.max(0, result.data[i+1] + gShift));
      result.data[i+2] = Math.min(255, Math.max(0, result.data[i+2] + bShift));
    }
    return result;
  }

  static pixelate(frame, blockSize = 8) {
    const result = new FrameBuffer(frame.width, frame.height);
    for (let y = 0; y < frame.height; y += blockSize) {
      for (let x = 0; x < frame.width; x += blockSize) {
        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        for (let by = 0; by < blockSize && y + by < frame.height; by++) {
          for (let bx = 0; bx < blockSize && x + bx < frame.width; bx++) {
            const c = frame.getPixel(x + bx, y + by);
            rSum += c.r; gSum += c.g; bSum += c.b; count++;
          }
        }
        const avg = new Color(Math.round(rSum/count), Math.round(gSum/count), Math.round(bSum/count));
        for (let by = 0; by < blockSize && y + by < frame.height; by++) {
          for (let bx = 0; bx < blockSize && x + bx < frame.width; bx++) {
            result.setPixel(x + bx, y + by, avg);
          }
        }
      }
    }
    return result;
  }

  static noise(frame, amount = 20) {
    const result = frame.clone();
    for (let i = 0; i < result.data.length; i += 4) {
      const n = (Math.random() - 0.5) * amount * 2;
      result.data[i] = Math.min(255, Math.max(0, result.data[i] + n));
      result.data[i+1] = Math.min(255, Math.max(0, result.data[i+1] + n));
      result.data[i+2] = Math.min(255, Math.max(0, result.data[i+2] + n));
    }
    return result;
  }

  static hueRotate(frame, degrees) {
    const result = frame.clone();
    for (let i = 0; i < result.data.length; i += 4) {
      const color = new Color(result.data[i], result.data[i+1], result.data[i+2]);
      const hsl = color.toHSL();
      hsl.h = (hsl.h + degrees) % 360;
      if (hsl.h < 0) hsl.h += 360;
      const rotated = Color.fromHSL(hsl.h, hsl.s, hsl.l);
      result.data[i] = rotated.r;
      result.data[i+1] = rotated.g;
      result.data[i+2] = rotated.b;
    }
    return result;
  }
}

// ─── Transitions ────────────────────────────────────────────────────────────
export class Transition {
  static crossFade(frameA, frameB, progress) {
    const result = new FrameBuffer(frameA.width, frameA.height);
    for (let i = 0; i < result.data.length; i += 4) {
      result.data[i] = Math.round(frameA.data[i] * (1 - progress) + frameB.data[i] * progress);
      result.data[i+1] = Math.round(frameA.data[i+1] * (1 - progress) + frameB.data[i+1] * progress);
      result.data[i+2] = Math.round(frameA.data[i+2] * (1 - progress) + frameB.data[i+2] * progress);
      result.data[i+3] = Math.round(frameA.data[i+3] * (1 - progress) + frameB.data[i+3] * progress);
    }
    return result;
  }

  static wipeRight(frameA, frameB, progress) {
    const result = new FrameBuffer(frameA.width, frameA.height);
    const splitX = Math.floor(frameA.width * progress);
    for (let y = 0; y < frameA.height; y++) {
      for (let x = 0; x < frameA.width; x++) {
        result.setPixel(x, y, x < splitX ? frameB.getPixel(x, y) : frameA.getPixel(x, y));
      }
    }
    return result;
  }

  static wipeDown(frameA, frameB, progress) {
    const result = new FrameBuffer(frameA.width, frameA.height);
    const splitY = Math.floor(frameA.height * progress);
    for (let y = 0; y < frameA.height; y++) {
      for (let x = 0; x < frameA.width; x++) {
        result.setPixel(x, y, y < splitY ? frameB.getPixel(x, y) : frameA.getPixel(x, y));
      }
    }
    return result;
  }

  static circleReveal(frameA, frameB, progress) {
    const result = frameA.clone();
    const cx = frameA.width / 2, cy = frameA.height / 2;
    const maxRadius = Math.sqrt(cx * cx + cy * cy);
    const radius = maxRadius * progress;

    for (let y = 0; y < frameA.height; y++) {
      for (let x = 0; x < frameA.width; x++) {
        const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        if (dist < radius) {
          result.setPixel(x, y, frameB.getPixel(x, y));
        }
      }
    }
    return result;
  }

  static pixelateTransition(frameA, frameB, progress) {
    if (progress < 0.5) {
      const blockSize = Math.max(1, Math.floor((progress * 2) * 32));
      return ImageFilter.pixelate(frameA, blockSize);
    } else {
      const blockSize = Math.max(1, Math.floor((1 - (progress - 0.5) * 2) * 32));
      return ImageFilter.pixelate(frameB, blockSize);
    }
  }

  static slideLeft(frameA, frameB, progress) {
    const result = new FrameBuffer(frameA.width, frameA.height);
    const offset = Math.floor(frameA.width * progress);
    for (let y = 0; y < frameA.height; y++) {
      for (let x = 0; x < frameA.width; x++) {
        if (x + offset < frameA.width) {
          result.setPixel(x, y, frameA.getPixel(x + offset, y));
        } else {
          result.setPixel(x, y, frameB.getPixel(x + offset - frameA.width, y));
        }
      }
    }
    return result;
  }

  static zoomIn(frameA, frameB, progress) {
    const scaledWidth = Math.max(1, Math.floor(frameA.width * (1 + progress * 3)));
    const scaledHeight = Math.max(1, Math.floor(frameA.height * (1 + progress * 3)));

    if (progress < 0.5) {
      // Zoom in on A, fade to white
      const result = frameA.clone();
      for (let i = 0; i < result.data.length; i += 4) {
        const fade = progress * 2;
        result.data[i] = Math.round(result.data[i] + (255 - result.data[i]) * fade);
        result.data[i+1] = Math.round(result.data[i+1] + (255 - result.data[i+1]) * fade);
        result.data[i+2] = Math.round(result.data[i+2] + (255 - result.data[i+2]) * fade);
      }
      return result;
    } else {
      // Fade from white to B
      const result = frameB.clone();
      const fade = (1 - progress) * 2;
      for (let i = 0; i < result.data.length; i += 4) {
        result.data[i] = Math.round(result.data[i] + (255 - result.data[i]) * fade);
        result.data[i+1] = Math.round(result.data[i+1] + (255 - result.data[i+1]) * fade);
        result.data[i+2] = Math.round(result.data[i+2] + (255 - result.data[i+2]) * fade);
      }
      return result;
    }
  }
}

// ─── Compositor ─────────────────────────────────────────────────────────────
export const BlendMode = {
  NORMAL: 'normal',
  MULTIPLY: 'multiply',
  SCREEN: 'screen',
  OVERLAY: 'overlay',
  ADD: 'add',
  SUBTRACT: 'subtract',
  DIFFERENCE: 'difference',
  DARKEN: 'darken',
  LIGHTEN: 'lighten'
};

export class Compositor {
  static blend(base, overlay, mode = BlendMode.NORMAL, opacity = 1) {
    const result = base.clone();
    const w = Math.min(base.width, overlay.width);
    const h = Math.min(base.height, overlay.height);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = base.getPixel(x, y);
        const b = overlay.getPixel(x, y);
        let blended;

        switch (mode) {
          case BlendMode.MULTIPLY:
            blended = new Color(
              Math.round(a.r * b.r / 255), Math.round(a.g * b.g / 255),
              Math.round(a.b * b.b / 255), a.a
            );
            break;
          case BlendMode.SCREEN:
            blended = new Color(
              255 - Math.round((255 - a.r) * (255 - b.r) / 255),
              255 - Math.round((255 - a.g) * (255 - b.g) / 255),
              255 - Math.round((255 - a.b) * (255 - b.b) / 255), a.a
            );
            break;
          case BlendMode.OVERLAY:
            blended = new Color(
              a.r < 128 ? Math.round(2 * a.r * b.r / 255) : Math.round(255 - 2 * (255 - a.r) * (255 - b.r) / 255),
              a.g < 128 ? Math.round(2 * a.g * b.g / 255) : Math.round(255 - 2 * (255 - a.g) * (255 - b.g) / 255),
              a.b < 128 ? Math.round(2 * a.b * b.b / 255) : Math.round(255 - 2 * (255 - a.b) * (255 - b.b) / 255), a.a
            );
            break;
          case BlendMode.ADD:
            blended = new Color(
              Math.min(255, a.r + b.r), Math.min(255, a.g + b.g),
              Math.min(255, a.b + b.b), a.a
            );
            break;
          case BlendMode.SUBTRACT:
            blended = new Color(
              Math.max(0, a.r - b.r), Math.max(0, a.g - b.g),
              Math.max(0, a.b - b.b), a.a
            );
            break;
          case BlendMode.DIFFERENCE:
            blended = new Color(
              Math.abs(a.r - b.r), Math.abs(a.g - b.g),
              Math.abs(a.b - b.b), a.a
            );
            break;
          case BlendMode.DARKEN:
            blended = new Color(
              Math.min(a.r, b.r), Math.min(a.g, b.g),
              Math.min(a.b, b.b), a.a
            );
            break;
          case BlendMode.LIGHTEN:
            blended = new Color(
              Math.max(a.r, b.r), Math.max(a.g, b.g),
              Math.max(a.b, b.b), a.a
            );
            break;
          default:
            blended = b;
        }

        // Apply opacity
        result.setPixel(x, y, a.blend(blended, opacity));
      }
    }
    return result;
  }

  static composeLayers(layers) {
    if (layers.length === 0) return new FrameBuffer(1, 1);
    let result = layers[0].frame.clone();
    for (let i = 1; i < layers.length; i++) {
      const layer = layers[i];
      if (!layer.visible) continue;
      result = Compositor.blend(result, layer.frame, layer.blendMode || BlendMode.NORMAL, layer.opacity ?? 1);
    }
    return result;
  }
}

// ─── Video Timeline ─────────────────────────────────────────────────────────
export class VideoClip {
  constructor(opts = {}) {
    this.id = opts.id || `clip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.name = opts.name || 'Untitled';
    this.startTime = opts.startTime ?? 0;
    this.duration = opts.duration ?? 5;
    this.trimStart = opts.trimStart ?? 0;
    this.trimEnd = opts.trimEnd ?? 0;
    this.opacity = opts.opacity ?? 1;
    this.filters = opts.filters || [];
    this.blendMode = opts.blendMode || BlendMode.NORMAL;
    this.position = opts.position || { x: 0, y: 0 };
    this.scale = opts.scale || { x: 1, y: 1 };
    this.rotation = opts.rotation ?? 0;
    this.visible = opts.visible ?? true;
    this._frameGenerator = opts.frameGenerator || null;
  }

  get endTime() { return this.startTime + this.duration; }
  get effectiveDuration() { return this.duration - this.trimStart - this.trimEnd; }

  containsTime(time) {
    return time >= this.startTime && time < this.endTime;
  }

  getLocalTime(globalTime) {
    return globalTime - this.startTime + this.trimStart;
  }

  getFrame(time, width, height) {
    if (!this.containsTime(time)) return null;
    if (!this._frameGenerator) {
      const frame = new FrameBuffer(width, height);
      frame.fill(new Color(128, 128, 128));
      return frame;
    }
    const localTime = this.getLocalTime(time);
    let frame = this._frameGenerator(localTime, width, height);

    // Apply filters
    for (const filter of this.filters) {
      frame = filter(frame);
    }
    return frame;
  }

  clone() {
    return new VideoClip({
      ...this,
      id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      filters: [...this.filters],
      position: { ...this.position },
      scale: { ...this.scale }
    });
  }
}

export class VideoTrack {
  constructor(name = 'Track') {
    this.name = name;
    this.clips = [];
    this.muted = false;
    this.locked = false;
    this.volume = 1;
  }

  addClip(clip) {
    // Check for overlaps
    for (const existing of this.clips) {
      if (clip.startTime < existing.endTime && clip.endTime > existing.startTime) {
        throw new Error('Clip overlaps with existing clip');
      }
    }
    this.clips.push(clip);
    this.clips.sort((a, b) => a.startTime - b.startTime);
    return clip;
  }

  removeClip(clipId) {
    const idx = this.clips.findIndex(c => c.id === clipId);
    if (idx >= 0) this.clips.splice(idx, 1);
  }

  getClipAtTime(time) {
    return this.clips.find(c => c.containsTime(time)) || null;
  }

  getDuration() {
    if (this.clips.length === 0) return 0;
    return Math.max(...this.clips.map(c => c.endTime));
  }

  getGaps() {
    const gaps = [];
    for (let i = 0; i < this.clips.length - 1; i++) {
      const gapStart = this.clips[i].endTime;
      const gapEnd = this.clips[i + 1].startTime;
      if (gapEnd > gapStart) gaps.push({ start: gapStart, end: gapEnd, duration: gapEnd - gapStart });
    }
    return gaps;
  }
}

export class Timeline {
  constructor(opts = {}) {
    this.tracks = [];
    this.fps = opts.fps ?? 30;
    this.width = opts.width ?? 1920;
    this.height = opts.height ?? 1080;
    this.duration = opts.duration ?? 0;
    this.currentTime = 0;
    this.isPlaying = false;
    this.loop = opts.loop ?? false;
    this._listeners = { timeUpdate: [], play: [], pause: [], seek: [], render: [] };
  }

  addTrack(name) {
    const track = new VideoTrack(name);
    this.tracks.push(track);
    return track;
  }

  removeTrack(index) {
    if (index >= 0 && index < this.tracks.length) {
      this.tracks.splice(index, 1);
    }
  }

  getTrack(index) { return this.tracks[index] || null; }

  getDuration() {
    return Math.max(this.duration, ...this.tracks.map(t => t.getDuration()));
  }

  renderFrame(time) {
    const frame = new FrameBuffer(this.width, this.height);
    frame.fill(new Color(0, 0, 0));

    for (const track of this.tracks) {
      if (track.muted) continue;
      const clip = track.getClipAtTime(time);
      if (!clip || !clip.visible) continue;

      const clipFrame = clip.getFrame(time, this.width, this.height);
      if (!clipFrame) continue;

      frame.blit(clipFrame, clip.position.x, clip.position.y, clip.opacity);
    }

    this._emit('render', { time, frame });
    return frame;
  }

  play() {
    this.isPlaying = true;
    this._emit('play', { time: this.currentTime });
  }

  pause() {
    this.isPlaying = false;
    this._emit('pause', { time: this.currentTime });
  }

  seek(time) {
    this.currentTime = Math.max(0, Math.min(time, this.getDuration()));
    this._emit('seek', { time: this.currentTime });
  }

  advance(dt) {
    if (!this.isPlaying) return null;
    this.currentTime += dt;
    const duration = this.getDuration();
    if (this.currentTime >= duration) {
      if (this.loop) {
        this.currentTime = this.currentTime % duration;
      } else {
        this.currentTime = duration;
        this.isPlaying = false;
        this._emit('pause', { time: this.currentTime });
      }
    }
    this._emit('timeUpdate', { time: this.currentTime });
    return this.renderFrame(this.currentTime);
  }

  addTransition(trackIndex, timeStart, duration, transitionFn) {
    const track = this.tracks[trackIndex];
    if (!track) return;

    // Find clips at transition boundary
    const clipBefore = track.clips.find(c => c.endTime >= timeStart && c.endTime <= timeStart + duration);
    const clipAfter = track.clips.find(c => c.startTime >= timeStart && c.startTime <= timeStart + duration);

    if (clipBefore && clipAfter) {
      return { clipBefore, clipAfter, timeStart, duration, transitionFn };
    }
    return null;
  }

  on(event, cb) {
    if (this._listeners[event]) this._listeners[event].push(cb);
  }

  off(event, cb) {
    if (this._listeners[event]) {
      const idx = this._listeners[event].indexOf(cb);
      if (idx >= 0) this._listeners[event].splice(idx, 1);
    }
  }

  _emit(event, data) {
    for (const cb of (this._listeners[event] || [])) cb(data);
  }

  getStats() {
    return {
      trackCount: this.tracks.length,
      clipCount: this.tracks.reduce((sum, t) => sum + t.clips.length, 0),
      duration: this.getDuration(),
      fps: this.fps,
      resolution: `${this.width}x${this.height}`,
      totalFrames: Math.ceil(this.getDuration() * this.fps)
    };
  }
}

// ─── Filter Pipeline ────────────────────────────────────────────────────────
export class FilterPipeline {
  constructor() {
    this.filters = [];
  }

  add(name, filterFn, opts = {}) {
    this.filters.push({
      name,
      fn: filterFn,
      enabled: opts.enabled ?? true,
      params: opts.params || {}
    });
    return this;
  }

  remove(name) {
    this.filters = this.filters.filter(f => f.name !== name);
    return this;
  }

  setEnabled(name, enabled) {
    const filter = this.filters.find(f => f.name === name);
    if (filter) filter.enabled = enabled;
  }

  process(frame) {
    let result = frame;
    for (const filter of this.filters) {
      if (filter.enabled) {
        result = filter.fn(result, filter.params);
      }
    }
    return result;
  }

  getFilterNames() {
    return this.filters.map(f => ({ name: f.name, enabled: f.enabled }));
  }

  clear() {
    this.filters = [];
  }
}

// ─── Motion Detector ────────────────────────────────────────────────────────
export class MotionDetector {
  constructor(opts = {}) {
    this.threshold = opts.threshold ?? 30;
    this.minArea = opts.minArea ?? 100;
    this._prevFrame = null;
  }

  detect(frame) {
    if (!this._prevFrame) {
      this._prevFrame = frame.clone();
      return { hasMotion: false, amount: 0, regions: [] };
    }

    let motionPixels = 0;
    const diffFrame = new FrameBuffer(frame.width, frame.height);

    for (let i = 0; i < frame.data.length; i += 4) {
      const dr = Math.abs(frame.data[i] - this._prevFrame.data[i]);
      const dg = Math.abs(frame.data[i+1] - this._prevFrame.data[i+1]);
      const db = Math.abs(frame.data[i+2] - this._prevFrame.data[i+2]);
      const diff = (dr + dg + db) / 3;

      if (diff > this.threshold) {
        motionPixels++;
        diffFrame.data[i] = diffFrame.data[i+1] = diffFrame.data[i+2] = 255;
        diffFrame.data[i+3] = 255;
      }
    }

    const totalPixels = frame.width * frame.height;
    const motionAmount = motionPixels / totalPixels;

    this._prevFrame = frame.clone();

    return {
      hasMotion: motionAmount > (this.minArea / totalPixels),
      amount: motionAmount,
      motionPixels,
      diffFrame
    };
  }

  reset() {
    this._prevFrame = null;
  }
}

// ─── Color Palette Extractor ────────────────────────────────────────────────
export class ColorPaletteExtractor {
  constructor(opts = {}) {
    this.paletteSize = opts.paletteSize ?? 5;
    this.quality = opts.quality ?? 10;
  }

  extract(frame) {
    const pixels = [];
    for (let i = 0; i < frame.data.length; i += 4 * this.quality) {
      const r = frame.data[i], g = frame.data[i+1], b = frame.data[i+2];
      if (frame.data[i+3] > 128) pixels.push([r, g, b]);
    }

    if (pixels.length === 0) return [];

    // Simple k-means clustering
    let centroids = pixels.slice(0, this.paletteSize);
    if (centroids.length < this.paletteSize) {
      while (centroids.length < this.paletteSize) {
        centroids.push(centroids[centroids.length - 1]);
      }
    }

    for (let iter = 0; iter < 10; iter++) {
      const clusters = Array.from({ length: this.paletteSize }, () => []);

      for (const pixel of pixels) {
        let minDist = Infinity, bestIdx = 0;
        for (let c = 0; c < centroids.length; c++) {
          const dist = Math.sqrt(
            (pixel[0] - centroids[c][0]) ** 2 +
            (pixel[1] - centroids[c][1]) ** 2 +
            (pixel[2] - centroids[c][2]) ** 2
          );
          if (dist < minDist) { minDist = dist; bestIdx = c; }
        }
        clusters[bestIdx].push(pixel);
      }

      // Update centroids
      for (let c = 0; c < this.paletteSize; c++) {
        if (clusters[c].length === 0) continue;
        const avg = [0, 0, 0];
        for (const p of clusters[c]) {
          avg[0] += p[0]; avg[1] += p[1]; avg[2] += p[2];
        }
        centroids[c] = [
          Math.round(avg[0] / clusters[c].length),
          Math.round(avg[1] / clusters[c].length),
          Math.round(avg[2] / clusters[c].length)
        ];
      }
    }

    return centroids.map(c => new Color(c[0], c[1], c[2]));
  }
}
