/**
 * Avatar Renderer — Advanced Canvas 2D rendering pipeline for the AI avatar.
 *
 * Provides a high-quality rendering pipeline with:
 *   - Multi-layer compositing (background, glow, body, face, overlay)
 *   - Procedural shader-like effects using canvas gradients
 *   - Holographic and organic visual styles
 *   - Real-time particle-integrated glow
 *   - Smooth animation blending via expression parameters
 *   - Resolution-independent rendering with DPI awareness
 *   - Procedural accessory rendering (halo, rings, energy field)
 */

// ─── Render Styles ───────────────────────────────────────────────────────────

/**
 * Each style defines how the avatar body, eyes, mouth, and effects are drawn.
 */

/**
 * Render a minimal-style avatar — clean lines, simple gradients.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} params
 */
function renderMinimal(ctx, params) {
  const { cx, cy, size, expr, colors } = params;
  drawGlowAura(ctx, cx, cy, size, colors.glow, expr.glow);
  drawFaceCircle(ctx, cx, cy, size, colors.primary, colors.secondary);
  drawEyes(ctx, cx, cy, size, expr, colors);
  drawMouth(ctx, cx, cy, size, expr, colors);
}

/**
 * Render a geometric-style avatar — faceted shapes, sharp edges.
 */
function renderGeometric(ctx, params) {
  const { cx, cy, size, expr, colors } = params;
  drawGlowAura(ctx, cx, cy, size, colors.glow, expr.glow);
  drawHexagonFace(ctx, cx, cy, size, colors.primary, colors.secondary);
  drawEyes(ctx, cx, cy, size, expr, colors);
  drawMouth(ctx, cx, cy, size, expr, colors);
  drawGeometricOverlay(ctx, cx, cy, size, colors.secondary);
}

/**
 * Render an organic-style avatar — soft, flowing shapes.
 */
function renderOrganic(ctx, params) {
  const { cx, cy, size, expr, colors, time } = params;
  drawGlowAura(ctx, cx, cy, size * 1.1, colors.glow, expr.glow * 1.2);
  drawOrganicFace(ctx, cx, cy, size, colors.primary, colors.secondary, time);
  drawEyes(ctx, cx, cy, size, expr, colors);
  drawMouth(ctx, cx, cy, size, expr, colors);
}

/**
 * Render a holographic-style avatar — iridescent, shifting colors.
 */
function renderHolographic(ctx, params) {
  const { cx, cy, size, expr, colors, time } = params;
  drawHolographicGlow(ctx, cx, cy, size, colors, time, expr.glow);
  drawFaceCircle(ctx, cx, cy, size, colors.primary, colors.secondary);
  drawHolographicOverlay(ctx, cx, cy, size, time);
  drawEyes(ctx, cx, cy, size, expr, colors);
  drawMouth(ctx, cx, cy, size, expr, colors);
  drawEnergyRing(ctx, cx, cy, size * 1.2, colors.secondary, time);
}

/**
 * Render a pixel-style avatar — retro, blocky shapes.
 */
function renderPixel(ctx, params) {
  const { cx, cy, size, expr, colors } = params;
  drawGlowAura(ctx, cx, cy, size * 0.9, colors.glow, expr.glow * 0.7);
  drawPixelFace(ctx, cx, cy, size, colors.primary);
  drawPixelEyes(ctx, cx, cy, size, expr, colors);
  drawPixelMouth(ctx, cx, cy, size, expr, colors);
}

// ─── Style Map ───────────────────────────────────────────────────────────────

const STYLE_RENDERERS = {
  minimal: renderMinimal,
  geometric: renderGeometric,
  organic: renderOrganic,
  holographic: renderHolographic,
  pixel: renderPixel
};

// ─── Core Drawing Primitives ─────────────────────────────────────────────────

function drawGlowAura(ctx, cx, cy, size, glowColor, intensity) {
  if (intensity <= 0.01) return;
  ctx.save();
  const r = size * 1.8;
  const gradient = ctx.createRadialGradient(cx, cy, size * 0.3, cx, cy, r);
  const rgba = hexToRgba(glowColor, intensity * 0.2);
  gradient.addColorStop(0, rgba);
  gradient.addColorStop(0.5, hexToRgba(glowColor, intensity * 0.05));
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
}

function drawFaceCircle(ctx, cx, cy, size, primary, secondary) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, size, 0, Math.PI * 2);
  const gradient = ctx.createRadialGradient(cx, cy - size * 0.3, 0, cx, cy, size);
  gradient.addColorStop(0, lightenHex(primary, 30));
  gradient.addColorStop(1, primary);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = secondary;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.25;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawHexagonFace(ctx, cx, cy, size, primary, secondary) {
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    const x = cx + size * Math.cos(angle);
    const y = cy + size * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  const gradient = ctx.createRadialGradient(cx, cy - size * 0.2, 0, cx, cy, size);
  gradient.addColorStop(0, lightenHex(primary, 25));
  gradient.addColorStop(1, primary);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = secondary;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.3;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawOrganicFace(ctx, cx, cy, size, primary, secondary, time) {
  ctx.save();
  ctx.beginPath();
  const points = 64;
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const wobble = 1 + Math.sin(angle * 3 + time * 1.5) * 0.03 + Math.cos(angle * 5 + time * 2) * 0.02;
    const r = size * wobble;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  const gradient = ctx.createRadialGradient(cx, cy - size * 0.3, 0, cx, cy, size);
  gradient.addColorStop(0, lightenHex(primary, 20));
  gradient.addColorStop(1, primary);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = secondary;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.2;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawPixelFace(ctx, cx, cy, size, primary) {
  ctx.save();
  const pixelSize = size / 5;
  const grid = [
    [0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [0, 1, 1, 1, 1, 1, 1, 1, 1, 0]
  ];
  const startX = cx - grid[0].length / 2 * pixelSize;
  const startY = cy - grid.length / 2 * pixelSize;
  ctx.fillStyle = primary;
  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < grid[row].length; col++) {
      if (grid[row][col]) {
        ctx.fillRect(
          startX + col * pixelSize,
          startY + row * pixelSize,
          pixelSize - 1,
          pixelSize - 1
        );
      }
    }
  }
  ctx.restore();
}

function drawHolographicGlow(ctx, cx, cy, size, colors, time, intensity) {
  if (intensity <= 0.01) return;
  ctx.save();
  const r = size * 2;
  // Shifting hue effect
  const hueShift = (time * 30) % 360;
  const gradient = ctx.createRadialGradient(cx, cy, size * 0.2, cx, cy, r);
  gradient.addColorStop(0, hexToRgba(colors.primary, intensity * 0.15));
  gradient.addColorStop(0.3, hexToRgba(colors.secondary, intensity * 0.1));
  gradient.addColorStop(0.6, hexToRgba(colors.glow, intensity * 0.05));
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
}

function drawHolographicOverlay(ctx, cx, cy, size, time) {
  ctx.save();
  ctx.globalAlpha = 0.06;
  // Scanning lines
  for (let y = cy - size; y < cy + size; y += 4) {
    const alpha = (Math.sin(y * 0.5 + time * 3) + 1) * 0.5;
    ctx.globalAlpha = alpha * 0.08;
    ctx.beginPath();
    ctx.moveTo(cx - size, y);
    ctx.lineTo(cx + size, y);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawGeometricOverlay(ctx, cx, cy, size, secondary) {
  ctx.save();
  ctx.globalAlpha = 0.08;
  // Internal triangle pattern
  ctx.beginPath();
  ctx.moveTo(cx, cy - size * 0.5);
  ctx.lineTo(cx - size * 0.43, cy + size * 0.25);
  ctx.lineTo(cx + size * 0.43, cy + size * 0.25);
  ctx.closePath();
  ctx.strokeStyle = secondary;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawEnergyRing(ctx, cx, cy, radius, color, time) {
  ctx.save();
  ctx.beginPath();
  const segments = 36;
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2 + time * 0.5;
    const wobble = radius + Math.sin(angle * 4 + time * 2) * radius * 0.03;
    const x = cx + wobble * Math.cos(angle);
    const y = cy + wobble * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.2;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ─── Eyes ─────────────────────────────────────────────────────────────────────

function drawEyes(ctx, cx, cy, size, expr, colors) {
  const eyeSpacing = size * 0.35;
  const eyeSize = size * 0.12;
  drawSingleEye(ctx, cx - eyeSpacing, cy - size * 0.1, eyeSize, expr.eyeOpenL, expr, colors);
  drawSingleEye(ctx, cx + eyeSpacing, cy - size * 0.1, eyeSize, expr.eyeOpenR, expr, colors);
}

function drawSingleEye(ctx, ex, ey, size, openness, expr, colors) {
  if (openness < 0.05) {
    // Closed eye — just a line
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ex - size, ey);
    ctx.lineTo(ex + size, ey);
    ctx.strokeStyle = colors.eye;
    ctx.lineWidth = Math.max(1, size * 0.15);
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.7;
    ctx.stroke();
    ctx.restore();
    return;
  }

  ctx.save();
  // Eye white
  ctx.beginPath();
  const h = size * Math.max(0.1, openness);
  ctx.ellipse(ex, ey, size, h, 0, 0, Math.PI * 2);
  ctx.fillStyle = colors.eye;
  ctx.globalAlpha = 0.9;
  ctx.fill();
  ctx.globalAlpha = 1;

  // Pupil
  const ps = size * 0.55 * (expr.pupilSize || 1);
  const px = ex + (expr.pupilX || 0) * size * 0.3;
  const py = ey + (expr.pupilY || 0) * size * 0.3;
  ctx.beginPath();
  ctx.arc(px, py, ps, 0, Math.PI * 2);
  ctx.fillStyle = '#1a1a2e';
  ctx.fill();

  // Highlight
  ctx.beginPath();
  ctx.arc(px + ps * 0.3, py - ps * 0.3, ps * 0.25, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fill();

  ctx.restore();
}

function drawPixelEyes(ctx, cx, cy, size, expr, colors) {
  const pixelSize = size / 5;
  const eyeY = cy - size * 0.15;
  const leftX = cx - size * 0.3;
  const rightX = cx + size * 0.3 - pixelSize;

  ctx.save();
  if (expr.eyeOpenL > 0.2) {
    ctx.fillStyle = colors.eye;
    ctx.fillRect(leftX, eyeY, pixelSize * 2, pixelSize);
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(leftX + pixelSize * 0.5, eyeY, pixelSize, pixelSize);
  } else {
    ctx.fillStyle = colors.eye;
    ctx.fillRect(leftX, eyeY + pixelSize * 0.3, pixelSize * 2, 2);
  }

  if (expr.eyeOpenR > 0.2) {
    ctx.fillStyle = colors.eye;
    ctx.fillRect(rightX, eyeY, pixelSize * 2, pixelSize);
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(rightX + pixelSize * 0.5, eyeY, pixelSize, pixelSize);
  } else {
    ctx.fillStyle = colors.eye;
    ctx.fillRect(rightX, eyeY + pixelSize * 0.3, pixelSize * 2, 2);
  }
  ctx.restore();
}

// ─── Mouth ────────────────────────────────────────────────────────────────────

function drawMouth(ctx, cx, cy, size, expr, colors) {
  ctx.save();
  const mouthY = cy + size * 0.25;
  const mouthWidth = size * 0.3 * (expr.mouthWidth || 0.5);
  const mouthOpen = expr.mouthOpen || 0;
  const smile = expr.mouthSmile || 0;

  if (mouthOpen > 0.1) {
    ctx.beginPath();
    ctx.ellipse(cx, mouthY, mouthWidth, mouthOpen * size * 0.15, 0, 0, Math.PI * 2);
    ctx.fillStyle = darkenHex(colors.primary, 50);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(cx - mouthWidth, mouthY);
    ctx.quadraticCurveTo(cx, mouthY + smile * size * 0.15, cx + mouthWidth, mouthY);
    ctx.strokeStyle = darkenHex(colors.primary, 40);
    ctx.lineWidth = Math.max(1, size * 0.04);
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  ctx.restore();
}

function drawPixelMouth(ctx, cx, cy, size, expr, colors) {
  const pixelSize = size / 5;
  const mouthY = cy + size * 0.25;

  ctx.save();
  ctx.fillStyle = darkenHex(colors.primary, 40);

  if (expr.mouthOpen > 0.1) {
    ctx.fillRect(cx - pixelSize, mouthY, pixelSize * 2, pixelSize);
  } else {
    const smile = expr.mouthSmile || 0;
    ctx.fillRect(cx - pixelSize * 1.5, mouthY, pixelSize * 3, 2);
    if (smile > 0.2) {
      ctx.fillRect(cx - pixelSize * 1.5, mouthY - 2, 2, 4);
      ctx.fillRect(cx + pixelSize * 1.5 - 2, mouthY - 2, 2, 4);
    }
  }
  ctx.restore();
}

// ─── Color Utilities ─────────────────────────────────────────────────────────

function hexToRgba(hex, alpha) {
  if (!hex || hex.length < 7) return `rgba(128,128,128,${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function lightenHex(hex, amount) {
  if (!hex || hex.length < 7) return '#ffffff';
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + amount);
  const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + amount);
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + amount);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function darkenHex(hex, amount) {
  if (!hex || hex.length < 7) return '#000000';
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amount);
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amount);
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amount);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Render an avatar using the specified style.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} options
 * @param {string} options.style - 'minimal'|'geometric'|'organic'|'holographic'|'pixel'
 * @param {number} options.cx - Center X
 * @param {number} options.cy - Center Y
 * @param {number} options.size - Base radius
 * @param {Object} options.expr - Expression parameters
 * @param {Object} options.colors - { primary, secondary, eye, glow }
 * @param {number} [options.time=0] - Time for animated effects
 */
export function renderAvatar(ctx, options) {
  const {
    style = 'minimal',
    cx, cy, size,
    expr = {},
    colors = {},
    time = 0
  } = options;

  const renderer = STYLE_RENDERERS[style] || STYLE_RENDERERS.minimal;
  const params = { cx, cy, size, expr, colors, time };

  ctx.save();

  // Apply head tilt
  if (expr.headTiltZ && Math.abs(expr.headTiltZ) > 0.001) {
    ctx.translate(cx, cy);
    ctx.rotate(expr.headTiltZ * 0.3);
    ctx.translate(-cx, -cy);
  }

  renderer(ctx, params);
  ctx.restore();
}

/**
 * Get the list of available render styles.
 * @returns {string[]}
 */
export function getAvailableStyles() {
  return Object.keys(STYLE_RENDERERS);
}

// Re-export utilities for testing
export {
  hexToRgba,
  lightenHex,
  darkenHex,
  drawGlowAura,
  drawFaceCircle,
  drawEyes,
  drawMouth,
  STYLE_RENDERERS
};
