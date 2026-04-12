// ============================================================================
// Data Visualization Engine
// A comprehensive, self-contained data visualization library
// ============================================================================

// ============================================================================
// Section 1: Statistics Utilities
// ============================================================================

export class Statistics {
  static sum(arr) {
    let total = 0;
    for (let i = 0; i < arr.length; i++) total += arr[i];
    return total;
  }

  static mean(arr) {
    if (arr.length === 0) return 0;
    return Statistics.sum(arr) / arr.length;
  }

  static median(arr) {
    if (arr.length === 0) return 0;
    const sorted = arr.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  static mode(arr) {
    if (arr.length === 0) return null;
    const freq = {};
    let maxFreq = 0;
    let modes = [];
    for (const val of arr) {
      freq[val] = (freq[val] || 0) + 1;
      if (freq[val] > maxFreq) {
        maxFreq = freq[val];
        modes = [val];
      } else if (freq[val] === maxFreq) {
        modes.push(val);
      }
    }
    return modes.length === arr.length ? null : modes[0];
  }

  static variance(arr) {
    if (arr.length < 2) return 0;
    const m = Statistics.mean(arr);
    let sumSq = 0;
    for (const val of arr) sumSq += (val - m) * (val - m);
    return sumSq / (arr.length - 1);
  }

  static stdDev(arr) {
    return Math.sqrt(Statistics.variance(arr));
  }

  static percentile(arr, p) {
    if (arr.length === 0) return 0;
    const sorted = arr.slice().sort((a, b) => a - b);
    const idx = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    if (lower === upper) return sorted[lower];
    const frac = idx - lower;
    return sorted[lower] * (1 - frac) + sorted[upper] * frac;
  }

  static quartiles(arr) {
    return {
      q1: Statistics.percentile(arr, 25),
      q2: Statistics.percentile(arr, 50),
      q3: Statistics.percentile(arr, 75),
    };
  }

  static iqr(arr) {
    const q = Statistics.quartiles(arr);
    return q.q3 - q.q1;
  }

  static outliers(arr, factor = 1.5) {
    const q = Statistics.quartiles(arr);
    const range = Statistics.iqr(arr) * factor;
    const lower = q.q1 - range;
    const upper = q.q3 + range;
    return arr.filter((v) => v < lower || v > upper);
  }

  static linearRegression(xArr, yArr) {
    const n = Math.min(xArr.length, yArr.length);
    if (n < 2) return { slope: 0, intercept: 0, r2: 0 };
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    for (let i = 0; i < n; i++) {
      sumX += xArr[i];
      sumY += yArr[i];
      sumXY += xArr[i] * yArr[i];
      sumX2 += xArr[i] * xArr[i];
      sumY2 += yArr[i] * yArr[i];
    }
    const denom = n * sumX2 - sumX * sumX;
    if (denom === 0) return { slope: 0, intercept: 0, r2: 0 };
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    const ssRes = yArr.reduce((s, y, i) => {
      const pred = slope * xArr[i] + intercept;
      return s + (y - pred) * (y - pred);
    }, 0);
    const meanY = sumY / n;
    const ssTot = yArr.reduce((s, y) => s + (y - meanY) * (y - meanY), 0);
    const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
    return { slope, intercept, r2 };
  }

  static correlation(xArr, yArr) {
    const n = Math.min(xArr.length, yArr.length);
    if (n < 2) return 0;
    const mX = Statistics.mean(xArr.slice(0, n));
    const mY = Statistics.mean(yArr.slice(0, n));
    let num = 0, denX = 0, denY = 0;
    for (let i = 0; i < n; i++) {
      const dx = xArr[i] - mX;
      const dy = yArr[i] - mY;
      num += dx * dy;
      denX += dx * dx;
      denY += dy * dy;
    }
    const denom = Math.sqrt(denX * denY);
    return denom === 0 ? 0 : num / denom;
  }

  static covariance(xArr, yArr) {
    const n = Math.min(xArr.length, yArr.length);
    if (n < 2) return 0;
    const mX = Statistics.mean(xArr.slice(0, n));
    const mY = Statistics.mean(yArr.slice(0, n));
    let cov = 0;
    for (let i = 0; i < n; i++) {
      cov += (xArr[i] - mX) * (yArr[i] - mY);
    }
    return cov / (n - 1);
  }

  static min(arr) {
    let m = Infinity;
    for (const v of arr) if (v < m) m = v;
    return m;
  }

  static max(arr) {
    let m = -Infinity;
    for (const v of arr) if (v > m) m = v;
    return m;
  }

  static extent(arr) {
    return [Statistics.min(arr), Statistics.max(arr)];
  }

  static histogram(arr, bins = 10) {
    const [mn, mx] = Statistics.extent(arr);
    const binWidth = (mx - mn) / bins;
    const result = [];
    for (let i = 0; i < bins; i++) {
      result.push({
        x0: mn + i * binWidth,
        x1: mn + (i + 1) * binWidth,
        count: 0,
        values: [],
      });
    }
    for (const v of arr) {
      let idx = Math.floor((v - mn) / binWidth);
      if (idx >= bins) idx = bins - 1;
      if (idx < 0) idx = 0;
      result[idx].count++;
      result[idx].values.push(v);
    }
    return result;
  }

  static movingAverage(arr, window) {
    const result = [];
    for (let i = 0; i < arr.length; i++) {
      const start = Math.max(0, i - window + 1);
      let sum = 0;
      for (let j = start; j <= i; j++) sum += arr[j];
      result.push(sum / (i - start + 1));
    }
    return result;
  }

  static exponentialMovingAverage(arr, alpha = 0.3) {
    if (arr.length === 0) return [];
    const result = [arr[0]];
    for (let i = 1; i < arr.length; i++) {
      result.push(alpha * arr[i] + (1 - alpha) * result[i - 1]);
    }
    return result;
  }

  static zScore(arr) {
    const m = Statistics.mean(arr);
    const sd = Statistics.stdDev(arr);
    if (sd === 0) return arr.map(() => 0);
    return arr.map((v) => (v - m) / sd);
  }

  static normalize(arr, newMin = 0, newMax = 1) {
    const [mn, mx] = Statistics.extent(arr);
    const range = mx - mn;
    if (range === 0) return arr.map(() => (newMin + newMax) / 2);
    return arr.map((v) => newMin + ((v - mn) / range) * (newMax - newMin));
  }

  static polynomialRegression(xArr, yArr, degree = 2) {
    const n = Math.min(xArr.length, yArr.length);
    const size = degree + 1;
    const matrix = Array.from({ length: size }, () => new Array(size + 1).fill(0));
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        let s = 0;
        for (let k = 0; k < n; k++) s += Math.pow(xArr[k], i + j);
        matrix[i][j] = s;
      }
      let s = 0;
      for (let k = 0; k < n; k++) s += yArr[k] * Math.pow(xArr[k], i);
      matrix[i][size] = s;
    }
    for (let col = 0; col < size; col++) {
      let maxRow = col;
      for (let row = col + 1; row < size; row++) {
        if (Math.abs(matrix[row][col]) > Math.abs(matrix[maxRow][col])) maxRow = row;
      }
      [matrix[col], matrix[maxRow]] = [matrix[maxRow], matrix[col]];
      if (Math.abs(matrix[col][col]) < 1e-12) continue;
      for (let row = col + 1; row < size; row++) {
        const factor = matrix[row][col] / matrix[col][col];
        for (let j = col; j <= size; j++) matrix[row][j] -= factor * matrix[col][j];
      }
    }
    const coeffs = new Array(size).fill(0);
    for (let i = size - 1; i >= 0; i--) {
      coeffs[i] = matrix[i][size];
      for (let j = i + 1; j < size; j++) coeffs[i] -= matrix[i][j] * coeffs[j];
      if (Math.abs(matrix[i][i]) > 1e-12) coeffs[i] /= matrix[i][i];
    }
    return {
      coefficients: coeffs,
      predict: (x) => coeffs.reduce((sum, c, i) => sum + c * Math.pow(x, i), 0),
    };
  }
}

// ============================================================================
// Section 2: Color Scales
// ============================================================================

export class ColorScale {
  constructor(type = 'sequential', config = {}) {
    this.type = type;
    this.domain = config.domain || [0, 1];
    this.range = config.range || null;
    this.palette = config.palette || 'blues';
    this.clamp = config.clamp !== false;
    this._buildPalette();
  }

  _buildPalette() {
    this.palettes = {
      blues: ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#084594'],
      reds: ['#fff5f0', '#fee0d2', '#fcbba1', '#fc9272', '#fb6a4a', '#ef3b2c', '#cb181d', '#99000d'],
      greens: ['#f7fcf5', '#e5f5e0', '#c7e9c0', '#a1d99b', '#74c476', '#41ab5d', '#238b45', '#005a32'],
      oranges: ['#fff5eb', '#fee6ce', '#fdd0a2', '#fdae6b', '#fd8d3c', '#f16913', '#d94801', '#8c2d04'],
      purples: ['#fcfbfd', '#efedf5', '#dadaeb', '#bcbddc', '#9e9ac8', '#807dba', '#6a51a3', '#4a1486'],
      viridis: ['#440154', '#482777', '#3e4989', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'],
      inferno: ['#000004', '#1b0c41', '#4a0c6b', '#781c6d', '#a52c60', '#cf4446', '#ed6925', '#fb9b06', '#f7d13d', '#fcffa4'],
      plasma: ['#0d0887', '#46039f', '#7201a8', '#9c179e', '#bd3786', '#d8576b', '#ed7953', '#fb9f3a', '#fdca26', '#f0f921'],
      spectral: ['#9e0142', '#d53e4f', '#f46d43', '#fdae61', '#fee08b', '#ffffbf', '#e6f598', '#abdda4', '#66c2a5', '#3288bd', '#5e4fa2'],
      rdylgn: ['#a50026', '#d73027', '#f46d43', '#fdae61', '#fee08b', '#ffffbf', '#d9ef8b', '#a6d96a', '#66bd63', '#1a9850', '#006837'],
      rdbu: ['#67001f', '#b2182b', '#d6604d', '#f4a582', '#fddbc7', '#f7f7f7', '#d1e5f0', '#92c5de', '#4393c3', '#2166ac', '#053061'],
      category10: ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'],
      category20: [
        '#1f77b4', '#aec7e8', '#ff7f0e', '#ffbb78', '#2ca02c', '#98df8a',
        '#d62728', '#ff9896', '#9467bd', '#c5b0d5', '#8c564b', '#c49c94',
        '#e377c2', '#f7b6d2', '#7f7f7f', '#c7c7c7', '#bcbd22', '#dbdb8d',
        '#17becf', '#9edae5',
      ],
      pastel: ['#fbb4ae', '#b3cde3', '#ccebc5', '#decbe4', '#fed9a6', '#ffffcc', '#e5d8bd', '#fddaec'],
      dark: ['#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02', '#a6761d', '#666666'],
      tableau10: ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac'],
    };
    if (!this.range) {
      this.range = this.palettes[this.palette] || this.palettes.blues;
    }
  }

  _parseColor(hex) {
    const h = hex.replace('#', '');
    return {
      r: parseInt(h.substring(0, 2), 16),
      g: parseInt(h.substring(2, 4), 16),
      b: parseInt(h.substring(4, 6), 16),
    };
  }

  _toHex(r, g, b) {
    const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
    const toH = (v) => clamp(v).toString(16).padStart(2, '0');
    return `#${toH(r)}${toH(g)}${toH(b)}`;
  }

  _interpolateColor(c1, c2, t) {
    const a = this._parseColor(c1);
    const b = this._parseColor(c2);
    return this._toHex(
      a.r + (b.r - a.r) * t,
      a.g + (b.g - a.g) * t,
      a.b + (b.b - a.b) * t
    );
  }

  getColor(value) {
    if (this.type === 'categorical') {
      const idx = typeof value === 'number' ? value : Math.abs(this._hash(String(value)));
      return this.range[idx % this.range.length];
    }
    const [dMin, dMax] = this.domain;
    let t = dMax === dMin ? 0.5 : (value - dMin) / (dMax - dMin);
    if (this.clamp) t = Math.max(0, Math.min(1, t));
    const n = this.range.length - 1;
    const idx = t * n;
    const lower = Math.floor(idx);
    const upper = Math.min(Math.ceil(idx), n);
    if (lower === upper) return this.range[lower];
    return this._interpolateColor(this.range[lower], this.range[upper], idx - lower);
  }

  _hash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }

  invert(color) {
    const target = this._parseColor(color);
    let bestVal = this.domain[0];
    let bestDist = Infinity;
    const steps = 100;
    const [dMin, dMax] = this.domain;
    for (let i = 0; i <= steps; i++) {
      const val = dMin + (i / steps) * (dMax - dMin);
      const c = this._parseColor(this.getColor(val));
      const dist = Math.sqrt(
        (c.r - target.r) ** 2 + (c.g - target.g) ** 2 + (c.b - target.b) ** 2
      );
      if (dist < bestDist) {
        bestDist = dist;
        bestVal = val;
      }
    }
    return bestVal;
  }

  setDomain(domain) {
    this.domain = domain;
    return this;
  }

  setRange(range) {
    this.range = range;
    return this;
  }

  ticks(count = 5) {
    const [mn, mx] = this.domain;
    const step = (mx - mn) / (count - 1);
    const result = [];
    for (let i = 0; i < count; i++) {
      const val = mn + i * step;
      result.push({ value: val, color: this.getColor(val) });
    }
    return result;
  }

  static diverging(config = {}) {
    return new ColorScale('sequential', {
      ...config,
      palette: config.palette || 'rdbu',
    });
  }

  static categorical(config = {}) {
    return new ColorScale('categorical', {
      ...config,
      palette: config.palette || 'category10',
    });
  }

  static sequential(config = {}) {
    return new ColorScale('sequential', config);
  }
}

// ============================================================================
// Section 3: Scale System
// ============================================================================

export class LinearScale {
  constructor(config = {}) {
    this.domain = config.domain || [0, 1];
    this.range = config.range || [0, 1];
    this._clamp = config.clamp || false;
  }

  scale(value) {
    const [d0, d1] = this.domain;
    const [r0, r1] = this.range;
    const dRange = d1 - d0;
    if (dRange === 0) return (r0 + r1) / 2;
    let t = (value - d0) / dRange;
    if (this._clamp) t = Math.max(0, Math.min(1, t));
    return r0 + t * (r1 - r0);
  }

  invert(pixel) {
    const [d0, d1] = this.domain;
    const [r0, r1] = this.range;
    const rRange = r1 - r0;
    if (rRange === 0) return (d0 + d1) / 2;
    let t = (pixel - r0) / rRange;
    if (this._clamp) t = Math.max(0, Math.min(1, t));
    return d0 + t * (d1 - d0);
  }

  nice(count = 10) {
    const [d0, d1] = this.domain;
    const span = d1 - d0;
    if (span === 0) return this;
    const step = this._niceStep(span / count);
    this.domain = [Math.floor(d0 / step) * step, Math.ceil(d1 / step) * step];
    return this;
  }

  _niceStep(roughStep) {
    const exp = Math.floor(Math.log10(roughStep));
    const frac = roughStep / Math.pow(10, exp);
    let niceFrac;
    if (frac <= 1.5) niceFrac = 1;
    else if (frac <= 3) niceFrac = 2;
    else if (frac <= 7) niceFrac = 5;
    else niceFrac = 10;
    return niceFrac * Math.pow(10, exp);
  }

  ticks(count = 10) {
    const [d0, d1] = this.domain;
    const step = this._niceStep((d1 - d0) / count);
    const start = Math.ceil(d0 / step) * step;
    const result = [];
    for (let v = start; v <= d1 + step * 0.001; v += step) {
      result.push(Math.round(v * 1e12) / 1e12);
    }
    return result;
  }

  clamp(enabled = true) {
    this._clamp = enabled;
    return this;
  }

  copy() {
    return new LinearScale({
      domain: [...this.domain],
      range: [...this.range],
      clamp: this._clamp,
    });
  }
}

export class LogScale {
  constructor(config = {}) {
    this.domain = config.domain || [1, 1000];
    this.range = config.range || [0, 1];
    this.base = config.base || 10;
    this._clamp = config.clamp || false;
  }

  _log(v) {
    return Math.log(Math.max(v, 1e-10)) / Math.log(this.base);
  }

  scale(value) {
    const [d0, d1] = this.domain;
    const [r0, r1] = this.range;
    const logD0 = this._log(d0);
    const logD1 = this._log(d1);
    const logRange = logD1 - logD0;
    if (logRange === 0) return (r0 + r1) / 2;
    let t = (this._log(value) - logD0) / logRange;
    if (this._clamp) t = Math.max(0, Math.min(1, t));
    return r0 + t * (r1 - r0);
  }

  invert(pixel) {
    const [d0, d1] = this.domain;
    const [r0, r1] = this.range;
    const rRange = r1 - r0;
    if (rRange === 0) return (d0 + d1) / 2;
    let t = (pixel - r0) / rRange;
    if (this._clamp) t = Math.max(0, Math.min(1, t));
    const logD0 = this._log(d0);
    const logD1 = this._log(d1);
    return Math.pow(this.base, logD0 + t * (logD1 - logD0));
  }

  ticks(count = 10) {
    const [d0, d1] = this.domain;
    const logMin = Math.floor(this._log(d0));
    const logMax = Math.ceil(this._log(d1));
    const result = [];
    for (let i = logMin; i <= logMax; i++) {
      const v = Math.pow(this.base, i);
      if (v >= d0 && v <= d1) result.push(v);
    }
    if (result.length < count) {
      for (let i = logMin; i < logMax; i++) {
        const base = Math.pow(this.base, i);
        for (let j = 2; j < this.base; j++) {
          const v = base * j;
          if (v >= d0 && v <= d1) result.push(v);
        }
      }
      result.sort((a, b) => a - b);
    }
    return result.slice(0, count);
  }

  nice() {
    const [d0, d1] = this.domain;
    const logMin = Math.floor(this._log(d0));
    const logMax = Math.ceil(this._log(d1));
    this.domain = [Math.pow(this.base, logMin), Math.pow(this.base, logMax)];
    return this;
  }

  clamp(enabled = true) {
    this._clamp = enabled;
    return this;
  }

  copy() {
    return new LogScale({
      domain: [...this.domain],
      range: [...this.range],
      base: this.base,
      clamp: this._clamp,
    });
  }
}

export class PowerScale {
  constructor(config = {}) {
    this.domain = config.domain || [0, 1];
    this.range = config.range || [0, 1];
    this.exponent = config.exponent || 2;
    this._clamp = config.clamp || false;
  }

  scale(value) {
    const [d0, d1] = this.domain;
    const [r0, r1] = this.range;
    const dRange = d1 - d0;
    if (dRange === 0) return (r0 + r1) / 2;
    let t = (value - d0) / dRange;
    if (this._clamp) t = Math.max(0, Math.min(1, t));
    const sign = t < 0 ? -1 : 1;
    t = sign * Math.pow(Math.abs(t), this.exponent);
    return r0 + t * (r1 - r0);
  }

  invert(pixel) {
    const [d0, d1] = this.domain;
    const [r0, r1] = this.range;
    const rRange = r1 - r0;
    if (rRange === 0) return (d0 + d1) / 2;
    let t = (pixel - r0) / rRange;
    if (this._clamp) t = Math.max(0, Math.min(1, t));
    const sign = t < 0 ? -1 : 1;
    t = sign * Math.pow(Math.abs(t), 1 / this.exponent);
    return d0 + t * (d1 - d0);
  }

  ticks(count = 10) {
    const linear = new LinearScale({ domain: this.domain });
    return linear.ticks(count);
  }

  nice(count = 10) {
    const linear = new LinearScale({ domain: this.domain });
    linear.nice(count);
    this.domain = linear.domain;
    return this;
  }

  clamp(enabled = true) {
    this._clamp = enabled;
    return this;
  }

  copy() {
    return new PowerScale({
      domain: [...this.domain],
      range: [...this.range],
      exponent: this.exponent,
      clamp: this._clamp,
    });
  }
}

export class TimeScale {
  constructor(config = {}) {
    this.domain = config.domain || [new Date(2020, 0, 1), new Date(2025, 0, 1)];
    this.range = config.range || [0, 1];
    this._clamp = config.clamp || false;
  }

  _toNum(d) {
    return d instanceof Date ? d.getTime() : d;
  }

  scale(value) {
    const d0 = this._toNum(this.domain[0]);
    const d1 = this._toNum(this.domain[1]);
    const v = this._toNum(value);
    const [r0, r1] = this.range;
    const dRange = d1 - d0;
    if (dRange === 0) return (r0 + r1) / 2;
    let t = (v - d0) / dRange;
    if (this._clamp) t = Math.max(0, Math.min(1, t));
    return r0 + t * (r1 - r0);
  }

  invert(pixel) {
    const d0 = this._toNum(this.domain[0]);
    const d1 = this._toNum(this.domain[1]);
    const [r0, r1] = this.range;
    const rRange = r1 - r0;
    if (rRange === 0) return new Date((d0 + d1) / 2);
    let t = (pixel - r0) / rRange;
    if (this._clamp) t = Math.max(0, Math.min(1, t));
    return new Date(d0 + t * (d1 - d0));
  }

  ticks(count = 10) {
    const d0 = this._toNum(this.domain[0]);
    const d1 = this._toNum(this.domain[1]);
    const step = (d1 - d0) / (count - 1);
    const result = [];
    for (let i = 0; i < count; i++) {
      result.push(new Date(d0 + i * step));
    }
    return result;
  }

  nice() {
    const d0 = new Date(this._toNum(this.domain[0]));
    const d1 = new Date(this._toNum(this.domain[1]));
    d0.setHours(0, 0, 0, 0);
    d1.setHours(23, 59, 59, 999);
    this.domain = [d0, d1];
    return this;
  }

  clamp(enabled = true) {
    this._clamp = enabled;
    return this;
  }

  copy() {
    return new TimeScale({
      domain: [new Date(this._toNum(this.domain[0])), new Date(this._toNum(this.domain[1]))],
      range: [...this.range],
      clamp: this._clamp,
    });
  }
}

export class OrdinalScale {
  constructor(config = {}) {
    this.domain = config.domain || [];
    this.range = config.range || [];
    this.unknown = config.unknown || null;
    this._map = new Map();
    this._buildMap();
  }

  _buildMap() {
    this._map.clear();
    for (let i = 0; i < this.domain.length; i++) {
      this._map.set(this.domain[i], this.range[i % this.range.length]);
    }
  }

  scale(value) {
    if (this._map.has(value)) return this._map.get(value);
    if (this.unknown !== null) return this.unknown;
    this.domain.push(value);
    this._buildMap();
    return this._map.get(value);
  }

  invert(rangeVal) {
    for (const [key, val] of this._map) {
      if (val === rangeVal) return key;
    }
    return null;
  }

  setDomain(domain) {
    this.domain = domain;
    this._buildMap();
    return this;
  }

  setRange(range) {
    this.range = range;
    this._buildMap();
    return this;
  }

  copy() {
    return new OrdinalScale({
      domain: [...this.domain],
      range: [...this.range],
      unknown: this.unknown,
    });
  }
}

export class BandScale {
  constructor(config = {}) {
    this.domain = config.domain || [];
    this.range = config.range || [0, 1];
    this._paddingInner = config.paddingInner || 0;
    this._paddingOuter = config.paddingOuter || 0;
    this._align = config.align || 0.5;
    this._round = config.round || false;
    this._compute();
  }

  _compute() {
    const n = this.domain.length;
    if (n === 0) {
      this._bandwidth = 0;
      this._step = 0;
      this._starts = [];
      return;
    }
    const [r0, r1] = this.range;
    const totalRange = r1 - r0;
    const totalPadding = this._paddingOuter * 2 + this._paddingInner * (n - 1);
    this._step = totalRange / (n + totalPadding);
    this._bandwidth = this._step * (1 - this._paddingInner);
    if (this._round) {
      this._step = Math.floor(this._step);
      this._bandwidth = Math.floor(this._bandwidth);
    }
    const offset = r0 + this._paddingOuter * this._step;
    this._starts = [];
    for (let i = 0; i < n; i++) {
      let start = offset + i * this._step;
      if (this._round) start = Math.round(start);
      this._starts.push(start);
    }
  }

  scale(value) {
    const idx = this.domain.indexOf(value);
    if (idx === -1) return undefined;
    return this._starts[idx];
  }

  bandwidth() {
    return this._bandwidth;
  }

  step() {
    return this._step;
  }

  paddingInner(p) {
    if (p === undefined) return this._paddingInner;
    this._paddingInner = p;
    this._compute();
    return this;
  }

  paddingOuter(p) {
    if (p === undefined) return this._paddingOuter;
    this._paddingOuter = p;
    this._compute();
    return this;
  }

  setDomain(domain) {
    this.domain = domain;
    this._compute();
    return this;
  }

  setRange(range) {
    this.range = range;
    this._compute();
    return this;
  }

  copy() {
    return new BandScale({
      domain: [...this.domain],
      range: [...this.range],
      paddingInner: this._paddingInner,
      paddingOuter: this._paddingOuter,
      align: this._align,
      round: this._round,
    });
  }
}

// ============================================================================
// Section 4: Axis System
// ============================================================================

export class Axis {
  constructor(config = {}) {
    this.position = config.position || 'bottom';
    this.scale = config.scale || new LinearScale();
    this.tickCount = config.tickCount || 10;
    this.tickSize = config.tickSize || 6;
    this.tickPadding = config.tickPadding || 3;
    this.tickFormat = config.tickFormat || null;
    this.label = config.label || '';
    this.labelOffset = config.labelOffset || 40;
    this.gridLines = config.gridLines || false;
    this.gridLength = config.gridLength || 0;
    this.gridStyle = config.gridStyle || { stroke: '#e0e0e0', strokeWidth: 1, dashArray: '2,2' };
    this.lineStyle = config.lineStyle || { stroke: '#333', strokeWidth: 1 };
    this.tickStyle = config.tickStyle || { stroke: '#333', strokeWidth: 1 };
    this.labelStyle = config.labelStyle || { fontSize: 12, fill: '#333', fontFamily: 'sans-serif' };
    this.titleStyle = config.titleStyle || { fontSize: 14, fill: '#333', fontFamily: 'sans-serif', fontWeight: 'bold' };
  }

  _formatTick(value) {
    if (this.tickFormat) return this.tickFormat(value);
    if (value instanceof Date) {
      return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    }
    if (typeof value === 'number') {
      if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
      if (Math.abs(value) >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
      return Number.isInteger(value) ? String(value) : value.toFixed(2);
    }
    return String(value);
  }

  generateTicks() {
    if (this.scale.ticks) {
      return this.scale.ticks(this.tickCount);
    }
    if (this.scale.domain && Array.isArray(this.scale.domain)) {
      return this.scale.domain;
    }
    return [];
  }

  render(origin = { x: 0, y: 0 }, length = 500) {
    const ticks = this.generateTicks();
    const isHorizontal = this.position === 'bottom' || this.position === 'top';
    const isReverse = this.position === 'top' || this.position === 'left';
    const tickDir = isReverse ? -1 : 1;
    const instructions = {
      type: 'axis',
      position: this.position,
      line: null,
      ticks: [],
      labels: [],
      gridLines: [],
      title: null,
    };

    if (isHorizontal) {
      instructions.line = {
        x1: origin.x,
        y1: origin.y,
        x2: origin.x + length,
        y2: origin.y,
        ...this.lineStyle,
      };
    } else {
      instructions.line = {
        x1: origin.x,
        y1: origin.y,
        x2: origin.x,
        y2: origin.y + length,
        ...this.lineStyle,
      };
    }

    for (const tick of ticks) {
      let pos;
      if (this.scale.scale) {
        pos = this.scale.scale(tick);
      } else {
        pos = tick;
      }

      if (isHorizontal) {
        const x = origin.x + pos;
        instructions.ticks.push({
          x1: x, y1: origin.y,
          x2: x, y2: origin.y + this.tickSize * tickDir,
          ...this.tickStyle,
        });
        instructions.labels.push({
          x, y: origin.y + (this.tickSize + this.tickPadding) * tickDir,
          text: this._formatTick(tick),
          anchor: 'middle',
          baseline: isReverse ? 'auto' : 'hanging',
          ...this.labelStyle,
        });
        if (this.gridLines && this.gridLength > 0) {
          instructions.gridLines.push({
            x1: x, y1: origin.y,
            x2: x, y2: origin.y - this.gridLength * tickDir,
            ...this.gridStyle,
          });
        }
      } else {
        const y = origin.y + pos;
        instructions.ticks.push({
          x1: origin.x, y1: y,
          x2: origin.x - this.tickSize * tickDir, y2: y,
          ...this.tickStyle,
        });
        instructions.labels.push({
          x: origin.x - (this.tickSize + this.tickPadding) * tickDir,
          y,
          text: this._formatTick(tick),
          anchor: isReverse ? 'start' : 'end',
          baseline: 'middle',
          ...this.labelStyle,
        });
        if (this.gridLines && this.gridLength > 0) {
          instructions.gridLines.push({
            x1: origin.x, y1: y,
            x2: origin.x + this.gridLength * tickDir, y2: y,
            ...this.gridStyle,
          });
        }
      }
    }

    if (this.label) {
      if (isHorizontal) {
        instructions.title = {
          x: origin.x + length / 2,
          y: origin.y + this.labelOffset * tickDir,
          text: this.label,
          anchor: 'middle',
          rotate: 0,
          ...this.titleStyle,
        };
      } else {
        instructions.title = {
          x: origin.x - this.labelOffset * tickDir,
          y: origin.y + length / 2,
          text: this.label,
          anchor: 'middle',
          rotate: -90,
          ...this.titleStyle,
        };
      }
    }

    return instructions;
  }

  setScale(scale) {
    this.scale = scale;
    return this;
  }

  setTickFormat(fn) {
    this.tickFormat = fn;
    return this;
  }

  setLabel(label) {
    this.label = label;
    return this;
  }
}

// ============================================================================
// Section 5: Data Transformations
// ============================================================================

export class DataTransform {
  static aggregate(data, groupBy, aggField, aggFunc = 'sum') {
    const groups = {};
    for (const item of data) {
      const key = typeof groupBy === 'function' ? groupBy(item) : item[groupBy];
      if (!groups[key]) groups[key] = [];
      groups[key].push(item[aggField]);
    }
    const funcs = {
      sum: (arr) => Statistics.sum(arr),
      mean: (arr) => Statistics.mean(arr),
      median: (arr) => Statistics.median(arr),
      min: (arr) => Statistics.min(arr),
      max: (arr) => Statistics.max(arr),
      count: (arr) => arr.length,
      first: (arr) => arr[0],
      last: (arr) => arr[arr.length - 1],
    };
    const fn = funcs[aggFunc] || funcs.sum;
    return Object.entries(groups).map(([key, values]) => ({
      key,
      value: fn(values),
      count: values.length,
    }));
  }

  static groupBy(data, field) {
    const groups = {};
    for (const item of data) {
      const key = typeof field === 'function' ? field(item) : item[field];
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    return groups;
  }

  static pivot(data, rowField, colField, valueField, aggFunc = 'sum') {
    const rows = new Set();
    const cols = new Set();
    const cells = {};
    for (const item of data) {
      const row = item[rowField];
      const col = item[colField];
      rows.add(row);
      cols.add(col);
      const key = `${row}::${col}`;
      if (!cells[key]) cells[key] = [];
      cells[key].push(item[valueField]);
    }
    const aggFuncs = {
      sum: (arr) => Statistics.sum(arr),
      mean: (arr) => Statistics.mean(arr),
      count: (arr) => arr.length,
    };
    const fn = aggFuncs[aggFunc] || aggFuncs.sum;
    const result = [];
    for (const row of rows) {
      const entry = { [rowField]: row };
      for (const col of cols) {
        const key = `${row}::${col}`;
        entry[col] = cells[key] ? fn(cells[key]) : 0;
      }
      result.push(entry);
    }
    return { rows: [...rows], columns: [...cols], data: result };
  }

  static rollingAverage(data, field, window) {
    return data.map((item, i) => {
      const start = Math.max(0, i - window + 1);
      const slice = data.slice(start, i + 1);
      const avg = Statistics.mean(slice.map((d) => d[field]));
      return { ...item, [`${field}_rolling`]: avg };
    });
  }

  static normalizeField(data, field) {
    const values = data.map((d) => d[field]);
    const normalized = Statistics.normalize(values);
    return data.map((item, i) => ({ ...item, [`${field}_normalized`]: normalized[i] }));
  }

  static detectOutliers(data, field, factor = 1.5) {
    const values = data.map((d) => d[field]);
    const q = Statistics.quartiles(values);
    const range = Statistics.iqr(values) * factor;
    const lower = q.q1 - range;
    const upper = q.q3 + range;
    return data.map((item) => ({
      ...item,
      isOutlier: item[field] < lower || item[field] > upper,
    }));
  }

  static sort(data, field, ascending = true) {
    return data.slice().sort((a, b) => {
      const va = a[field], vb = b[field];
      if (va < vb) return ascending ? -1 : 1;
      if (va > vb) return ascending ? 1 : -1;
      return 0;
    });
  }

  static filter(data, predicate) {
    return data.filter(predicate);
  }

  static cumulative(data, field) {
    let running = 0;
    return data.map((item) => {
      running += item[field];
      return { ...item, [`${field}_cumulative`]: running };
    });
  }

  static rank(data, field, ascending = true) {
    const sorted = data.slice().sort((a, b) => ascending ? a[field] - b[field] : b[field] - a[field]);
    return sorted.map((item, i) => ({ ...item, rank: i + 1 }));
  }

  static bin(data, field, binCount = 10) {
    const values = data.map((d) => d[field]);
    const bins = Statistics.histogram(values, binCount);
    return bins.map((b) => ({
      x0: b.x0,
      x1: b.x1,
      count: b.count,
      items: data.filter((d) => d[field] >= b.x0 && d[field] < b.x1),
    }));
  }

  static stack(data, categories, valueField) {
    const stacked = [];
    for (const item of data) {
      let y0 = 0;
      for (const cat of categories) {
        const val = item[cat] || 0;
        stacked.push({
          category: cat,
          key: item[valueField] || item.key,
          y0,
          y1: y0 + val,
          value: val,
        });
        y0 += val;
      }
    }
    return stacked;
  }

  static crossTabulate(data, field1, field2) {
    const result = {};
    const vals1 = new Set();
    const vals2 = new Set();
    for (const item of data) {
      const v1 = item[field1];
      const v2 = item[field2];
      vals1.add(v1);
      vals2.add(v2);
      if (!result[v1]) result[v1] = {};
      result[v1][v2] = (result[v1][v2] || 0) + 1;
    }
    return { table: result, rows: [...vals1], columns: [...vals2] };
  }
}

// ============================================================================
// Section 6: Animation System
// ============================================================================

export class AnimationSystem {
  constructor() {
    this.animations = [];
    this._frame = 0;
    this._running = false;
  }

  static easing = {
    linear: (t) => t,
    easeIn: (t) => t * t,
    easeOut: (t) => t * (2 - t),
    easeInOut: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
    easeInCubic: (t) => t * t * t,
    easeOutCubic: (t) => (--t) * t * t + 1,
    easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1),
    easeInQuart: (t) => t * t * t * t,
    easeOutQuart: (t) => 1 - (--t) * t * t * t,
    easeInOutQuart: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t),
    bounce: (t) => {
      const n1 = 7.5625, d1 = 2.75;
      if (t < 1 / d1) return n1 * t * t;
      if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
      if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
      return n1 * (t -= 2.625 / d1) * t + 0.984375;
    },
    elastic: (t) => {
      if (t === 0 || t === 1) return t;
      return -Math.pow(2, 10 * (t - 1)) * Math.sin((t - 1.1) * 5 * Math.PI);
    },
    back: (t) => {
      const s = 1.70158;
      return t * t * ((s + 1) * t - s);
    },
  };

  tween(config) {
    const anim = {
      id: `anim_${++this._frame}`,
      from: config.from || {},
      to: config.to || {},
      duration: config.duration || 500,
      delay: config.delay || 0,
      easing: config.easing || 'easeInOut',
      onUpdate: config.onUpdate || (() => {}),
      onComplete: config.onComplete || (() => {}),
      startTime: null,
      state: 'pending',
      currentValues: { ...config.from },
    };
    this.animations.push(anim);
    return anim;
  }

  stagger(items, config) {
    const anims = [];
    const staggerDelay = config.staggerDelay || 50;
    for (let i = 0; i < items.length; i++) {
      const anim = this.tween({
        ...config,
        from: items[i].from || config.from,
        to: items[i].to || config.to,
        delay: (config.delay || 0) + i * staggerDelay,
        onUpdate: (values) => {
          if (config.onUpdate) config.onUpdate(values, i);
        },
      });
      anims.push(anim);
    }
    return anims;
  }

  interpolate(from, to, t) {
    if (typeof from === 'number' && typeof to === 'number') {
      return from + (to - from) * t;
    }
    if (typeof from === 'string' && from.startsWith('#')) {
      const cs = new ColorScale();
      const c1 = cs._parseColor(from);
      const c2 = cs._parseColor(to);
      return cs._toHex(
        c1.r + (c2.r - c1.r) * t,
        c1.g + (c2.g - c1.g) * t,
        c1.b + (c2.b - c1.b) * t
      );
    }
    if (Array.isArray(from) && Array.isArray(to)) {
      return from.map((v, i) => this.interpolate(v, to[i] || v, t));
    }
    if (typeof from === 'object' && from !== null) {
      const result = {};
      for (const key of Object.keys(from)) {
        result[key] = to[key] !== undefined
          ? this.interpolate(from[key], to[key], t)
          : from[key];
      }
      return result;
    }
    return t < 0.5 ? from : to;
  }

  tick(currentTime) {
    const completed = [];
    for (const anim of this.animations) {
      if (anim.state === 'completed') continue;
      if (anim.startTime === null) anim.startTime = currentTime;
      const elapsed = currentTime - anim.startTime - anim.delay;
      if (elapsed < 0) continue;
      anim.state = 'running';
      let progress = Math.min(elapsed / anim.duration, 1);
      const easingFn = AnimationSystem.easing[anim.easing] || AnimationSystem.easing.linear;
      const easedProgress = easingFn(progress);
      anim.currentValues = this.interpolate(anim.from, anim.to, easedProgress);
      anim.onUpdate(anim.currentValues);
      if (progress >= 1) {
        anim.state = 'completed';
        anim.onComplete(anim.currentValues);
        completed.push(anim);
      }
    }
    this.animations = this.animations.filter((a) => a.state !== 'completed');
    return completed;
  }

  morphPath(fromPoints, toPoints, t) {
    const maxLen = Math.max(fromPoints.length, toPoints.length);
    const result = [];
    for (let i = 0; i < maxLen; i++) {
      const from = fromPoints[i % fromPoints.length];
      const to = toPoints[i % toPoints.length];
      result.push({
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
      });
    }
    return result;
  }

  spring(config) {
    const { mass = 1, stiffness = 100, damping = 10, from = 0, to = 1 } = config;
    const steps = config.steps || 60;
    const dt = 1 / 60;
    let velocity = 0;
    let position = from;
    const positions = [];
    for (let i = 0; i < steps; i++) {
      const force = -stiffness * (position - to) - damping * velocity;
      velocity += (force / mass) * dt;
      position += velocity * dt;
      positions.push(position);
    }
    return positions;
  }

  reset() {
    this.animations = [];
    this._frame = 0;
  }

  isRunning() {
    return this.animations.length > 0;
  }
}

// ============================================================================
// Section 7: Tooltip System
// ============================================================================

export class TooltipSystem {
  constructor(config = {}) {
    this.enabled = config.enabled !== false;
    this.followMouse = config.followMouse !== false;
    this.snapToData = config.snapToData || false;
    this.offset = config.offset || { x: 10, y: 10 };
    this.style = config.style || {
      background: 'rgba(0,0,0,0.8)',
      color: '#fff',
      padding: '8px 12px',
      borderRadius: '4px',
      fontSize: '12px',
      maxWidth: '250px',
    };
    this.formatter = config.formatter || null;
    this.currentData = null;
    this.position = { x: 0, y: 0 };
    this.visible = false;
  }

  show(data, position) {
    if (!this.enabled) return null;
    this.currentData = data;
    this.position = position;
    this.visible = true;
    return this.render();
  }

  hide() {
    this.visible = false;
    this.currentData = null;
    return { type: 'tooltip', visible: false };
  }

  move(position) {
    if (!this.visible) return null;
    this.position = this.followMouse
      ? { x: position.x + this.offset.x, y: position.y + this.offset.y }
      : this.position;
    return this.render();
  }

  render() {
    if (!this.visible || !this.currentData) {
      return { type: 'tooltip', visible: false };
    }
    return {
      type: 'tooltip',
      visible: true,
      x: this.position.x,
      y: this.position.y,
      content: this.formatContent(this.currentData),
      style: this.style,
    };
  }

  formatContent(data) {
    if (this.formatter) return this.formatter(data);
    if (typeof data === 'string') return data;
    if (typeof data === 'number') return String(data);
    if (Array.isArray(data)) {
      return data.map((item) => this._formatEntry(item)).join('\n');
    }
    return this._formatEntry(data);
  }

  _formatEntry(item) {
    if (typeof item !== 'object' || item === null) return String(item);
    const parts = [];
    if (item.label) parts.push(`${item.label}`);
    if (item.value !== undefined) parts.push(`Value: ${item.value}`);
    if (item.x !== undefined) parts.push(`X: ${item.x}`);
    if (item.y !== undefined) parts.push(`Y: ${item.y}`);
    if (item.series) parts.push(`Series: ${item.series}`);
    if (item.category) parts.push(`Category: ${item.category}`);
    if (parts.length === 0) {
      return Object.entries(item)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
    }
    return parts.join(' | ');
  }

  snapTo(dataPoints, mousePos) {
    if (!this.snapToData || dataPoints.length === 0) return mousePos;
    let closest = dataPoints[0];
    let minDist = Infinity;
    for (const p of dataPoints) {
      const dist = Math.sqrt(
        (p.x - mousePos.x) ** 2 + (p.y - mousePos.y) ** 2
      );
      if (dist < minDist) {
        minDist = dist;
        closest = p;
      }
    }
    return { x: closest.x, y: closest.y, data: closest };
  }

  setFormatter(fn) {
    this.formatter = fn;
    return this;
  }
}

// ============================================================================
// Section 8: Legend System
// ============================================================================

export class LegendSystem {
  constructor(config = {}) {
    this.position = config.position || 'right';
    this.orientation = config.orientation || (this.position === 'top' || this.position === 'bottom' ? 'horizontal' : 'vertical');
    this.items = config.items || [];
    this.interactive = config.interactive !== false;
    this.toggledOff = new Set();
    this.itemSize = config.itemSize || 12;
    this.itemSpacing = config.itemSpacing || 8;
    this.padding = config.padding || 16;
    this.style = config.style || {
      fontSize: 12,
      fontFamily: 'sans-serif',
      fill: '#333',
    };
    this.symbolType = config.symbolType || 'rect';
    this.maxWidth = config.maxWidth || 200;
    this.maxHeight = config.maxHeight || 400;
  }

  addItem(item) {
    this.items.push({
      id: item.id || `item_${this.items.length}`,
      label: item.label,
      color: item.color,
      shape: item.shape || this.symbolType,
      dashed: item.dashed || false,
      active: true,
    });
    return this;
  }

  removeItem(id) {
    this.items = this.items.filter((i) => i.id !== id);
    this.toggledOff.delete(id);
    return this;
  }

  toggle(id) {
    if (this.toggledOff.has(id)) {
      this.toggledOff.delete(id);
    } else {
      this.toggledOff.add(id);
    }
    return this;
  }

  isActive(id) {
    return !this.toggledOff.has(id);
  }

  getActiveItems() {
    return this.items.filter((i) => !this.toggledOff.has(i.id));
  }

  render(bounds = { x: 0, y: 0, width: 800, height: 600 }) {
    const instructions = {
      type: 'legend',
      position: this.position,
      items: [],
      background: null,
    };
    let x, y;
    if (this.position === 'right') {
      x = bounds.x + bounds.width + this.padding;
      y = bounds.y;
    } else if (this.position === 'left') {
      x = bounds.x - this.maxWidth - this.padding;
      y = bounds.y;
    } else if (this.position === 'top') {
      x = bounds.x;
      y = bounds.y - this.padding - this.itemSize;
    } else {
      x = bounds.x;
      y = bounds.y + bounds.height + this.padding;
    }

    let cx = x;
    let cy = y;
    for (const item of this.items) {
      const active = this.isActive(item.id);
      const entry = {
        id: item.id,
        symbol: {
          type: item.shape,
          x: cx,
          y: cy,
          size: this.itemSize,
          fill: active ? item.color : '#ccc',
          stroke: item.color,
          opacity: active ? 1 : 0.3,
          dashed: item.dashed,
        },
        label: {
          x: cx + this.itemSize + 6,
          y: cy + this.itemSize / 2,
          text: item.label,
          ...this.style,
          opacity: active ? 1 : 0.5,
        },
        active,
        interactive: this.interactive,
      };
      instructions.items.push(entry);
      if (this.orientation === 'vertical') {
        cy += this.itemSize + this.itemSpacing;
      } else {
        const textWidth = item.label.length * 7;
        cx += this.itemSize + 6 + textWidth + this.itemSpacing;
        if (cx > x + this.maxWidth) {
          cx = x;
          cy += this.itemSize + this.itemSpacing;
        }
      }
    }

    const totalW = this.orientation === 'horizontal' ? cx - x : this.maxWidth;
    const totalH = cy - y + this.itemSize;
    instructions.background = {
      x: x - 4,
      y: y - 4,
      width: totalW + 8,
      height: totalH + 8,
      fill: 'rgba(255,255,255,0.9)',
      stroke: '#ddd',
      strokeWidth: 1,
      borderRadius: 4,
    };

    return instructions;
  }

  setItems(items) {
    this.items = items.map((item, i) => ({
      id: item.id || `item_${i}`,
      label: item.label,
      color: item.color,
      shape: item.shape || this.symbolType,
      dashed: item.dashed || false,
    }));
    return this;
  }

  clear() {
    this.items = [];
    this.toggledOff.clear();
    return this;
  }
}

// ============================================================================
// Section 9: Annotation System
// ============================================================================

export class AnnotationSystem {
  constructor() {
    this.annotations = [];
  }

  addReferenceLine(config) {
    this.annotations.push({
      type: 'referenceLine',
      id: config.id || `ref_${this.annotations.length}`,
      axis: config.axis || 'y',
      value: config.value,
      label: config.label || '',
      style: config.style || { stroke: '#e74c3c', strokeWidth: 2, dashArray: '5,5' },
      labelStyle: config.labelStyle || { fontSize: 11, fill: '#e74c3c' },
      labelPosition: config.labelPosition || 'end',
    });
    return this;
  }

  addBand(config) {
    this.annotations.push({
      type: 'band',
      id: config.id || `band_${this.annotations.length}`,
      axis: config.axis || 'y',
      from: config.from,
      to: config.to,
      label: config.label || '',
      style: config.style || { fill: 'rgba(52,152,219,0.1)', stroke: 'none' },
      labelStyle: config.labelStyle || { fontSize: 11, fill: '#3498db' },
    });
    return this;
  }

  addMarker(config) {
    this.annotations.push({
      type: 'marker',
      id: config.id || `marker_${this.annotations.length}`,
      x: config.x,
      y: config.y,
      label: config.label || '',
      shape: config.shape || 'circle',
      size: config.size || 8,
      style: config.style || { fill: '#e74c3c', stroke: '#fff', strokeWidth: 2 },
      labelStyle: config.labelStyle || { fontSize: 11, fill: '#333' },
    });
    return this;
  }

  addArrow(config) {
    this.annotations.push({
      type: 'arrow',
      id: config.id || `arrow_${this.annotations.length}`,
      from: config.from,
      to: config.to,
      label: config.label || '',
      style: config.style || { stroke: '#333', strokeWidth: 2 },
      headSize: config.headSize || 8,
      labelStyle: config.labelStyle || { fontSize: 11, fill: '#333' },
    });
    return this;
  }

  addLabel(config) {
    this.annotations.push({
      type: 'label',
      id: config.id || `label_${this.annotations.length}`,
      x: config.x,
      y: config.y,
      text: config.text,
      style: config.style || {
        fontSize: 12, fill: '#333', fontFamily: 'sans-serif',
        background: 'rgba(255,255,255,0.8)', padding: 4, borderRadius: 2,
      },
      anchor: config.anchor || 'start',
      rotate: config.rotate || 0,
    });
    return this;
  }

  render(scaleX, scaleY, bounds) {
    const instructions = [];
    for (const ann of this.annotations) {
      switch (ann.type) {
        case 'referenceLine':
          instructions.push(this._renderReferenceLine(ann, scaleX, scaleY, bounds));
          break;
        case 'band':
          instructions.push(this._renderBand(ann, scaleX, scaleY, bounds));
          break;
        case 'marker':
          instructions.push(this._renderMarker(ann, scaleX, scaleY));
          break;
        case 'arrow':
          instructions.push(this._renderArrow(ann, scaleX, scaleY));
          break;
        case 'label':
          instructions.push(this._renderLabel(ann));
          break;
      }
    }
    return instructions;
  }

  _renderReferenceLine(ann, scaleX, scaleY, bounds) {
    const isY = ann.axis === 'y';
    const pos = isY ? scaleY.scale(ann.value) : scaleX.scale(ann.value);
    const line = isY
      ? { x1: bounds.x, y1: pos, x2: bounds.x + bounds.width, y2: pos }
      : { x1: pos, y1: bounds.y, x2: pos, y2: bounds.y + bounds.height };
    return {
      type: 'annotation-referenceLine',
      id: ann.id,
      line: { ...line, ...ann.style },
      label: ann.label ? {
        x: ann.labelPosition === 'start' ? line.x1 + 4 : line.x2 - 4,
        y: isY ? pos - 4 : line.y1 + 14,
        text: ann.label,
        anchor: ann.labelPosition === 'start' ? 'start' : 'end',
        ...ann.labelStyle,
      } : null,
    };
  }

  _renderBand(ann, scaleX, scaleY, bounds) {
    const isY = ann.axis === 'y';
    const from = isY ? scaleY.scale(ann.from) : scaleX.scale(ann.from);
    const to = isY ? scaleY.scale(ann.to) : scaleX.scale(ann.to);
    const rect = isY
      ? { x: bounds.x, y: Math.min(from, to), width: bounds.width, height: Math.abs(to - from) }
      : { x: Math.min(from, to), y: bounds.y, width: Math.abs(to - from), height: bounds.height };
    return {
      type: 'annotation-band',
      id: ann.id,
      rect: { ...rect, ...ann.style },
      label: ann.label ? {
        x: rect.x + rect.width / 2,
        y: rect.y + 14,
        text: ann.label,
        anchor: 'middle',
        ...ann.labelStyle,
      } : null,
    };
  }

  _renderMarker(ann, scaleX, scaleY) {
    const x = scaleX ? scaleX.scale(ann.x) : ann.x;
    const y = scaleY ? scaleY.scale(ann.y) : ann.y;
    return {
      type: 'annotation-marker',
      id: ann.id,
      shape: ann.shape,
      x, y,
      size: ann.size,
      style: ann.style,
      label: ann.label ? {
        x: x + ann.size + 4,
        y,
        text: ann.label,
        ...ann.labelStyle,
      } : null,
    };
  }

  _renderArrow(ann, scaleX, scaleY) {
    const fx = scaleX ? scaleX.scale(ann.from.x) : ann.from.x;
    const fy = scaleY ? scaleY.scale(ann.from.y) : ann.from.y;
    const tx = scaleX ? scaleX.scale(ann.to.x) : ann.to.x;
    const ty = scaleY ? scaleY.scale(ann.to.y) : ann.to.y;
    const angle = Math.atan2(ty - fy, tx - fx);
    const hs = ann.headSize;
    return {
      type: 'annotation-arrow',
      id: ann.id,
      line: { x1: fx, y1: fy, x2: tx, y2: ty, ...ann.style },
      head: [
        { x: tx, y: ty },
        { x: tx - hs * Math.cos(angle - Math.PI / 6), y: ty - hs * Math.sin(angle - Math.PI / 6) },
        { x: tx - hs * Math.cos(angle + Math.PI / 6), y: ty - hs * Math.sin(angle + Math.PI / 6) },
      ],
      label: ann.label ? {
        x: (fx + tx) / 2,
        y: (fy + ty) / 2 - 8,
        text: ann.label,
        anchor: 'middle',
        ...ann.labelStyle,
      } : null,
    };
  }

  _renderLabel(ann) {
    return {
      type: 'annotation-label',
      id: ann.id,
      x: ann.x, y: ann.y,
      text: ann.text,
      anchor: ann.anchor,
      rotate: ann.rotate,
      style: ann.style,
    };
  }

  remove(id) {
    this.annotations = this.annotations.filter((a) => a.id !== id);
    return this;
  }

  clear() {
    this.annotations = [];
    return this;
  }
}

// ============================================================================
// Section 10: Layout Algorithms
// ============================================================================

export class ForceLayout {
  constructor(config = {}) {
    this.nodes = [];
    this.edges = [];
    this.width = config.width || 800;
    this.height = config.height || 600;
    this.gravity = config.gravity || 0.1;
    this.repulsion = config.repulsion || 500;
    this.springLength = config.springLength || 100;
    this.springStrength = config.springStrength || 0.05;
    this.damping = config.damping || 0.9;
    this.iterations = config.iterations || 100;
    this.theta = config.theta || 0.8;
  }

  setNodes(nodes) {
    this.nodes = nodes.map((n, i) => ({
      ...n,
      id: n.id || `node_${i}`,
      x: n.x !== undefined ? n.x : Math.random() * this.width,
      y: n.y !== undefined ? n.y : Math.random() * this.height,
      vx: 0,
      vy: 0,
      mass: n.mass || 1,
      fixed: n.fixed || false,
    }));
    return this;
  }

  setEdges(edges) {
    this.edges = edges.map((e) => ({
      source: e.source,
      target: e.target,
      weight: e.weight || 1,
    }));
    return this;
  }

  simulate() {
    for (let iter = 0; iter < this.iterations; iter++) {
      this._applyForces();
      this._updatePositions();
    }
    return this.nodes;
  }

  _applyForces() {
    const nodeMap = {};
    for (const node of this.nodes) {
      nodeMap[node.id] = node;
      if (node.fixed) continue;
      node.fx = 0;
      node.fy = 0;
    }

    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        const a = this.nodes[i];
        const b = this.nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1) dist = 1;
        const force = this.repulsion / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        if (!a.fixed) { a.fx -= fx; a.fy -= fy; }
        if (!b.fixed) { b.fx += fx; b.fy += fy; }
      }
    }

    for (const edge of this.edges) {
      const a = nodeMap[edge.source];
      const b = nodeMap[edge.target];
      if (!a || !b) continue;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) dist = 1;
      const displacement = dist - this.springLength;
      const force = this.springStrength * displacement * edge.weight;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      if (!a.fixed) { a.fx += fx; a.fy += fy; }
      if (!b.fixed) { b.fx -= fx; b.fy -= fy; }
    }

    const cx = this.width / 2;
    const cy = this.height / 2;
    for (const node of this.nodes) {
      if (node.fixed) continue;
      node.fx += (cx - node.x) * this.gravity;
      node.fy += (cy - node.y) * this.gravity;
    }
  }

  _updatePositions() {
    for (const node of this.nodes) {
      if (node.fixed) continue;
      node.vx = (node.vx + node.fx / node.mass) * this.damping;
      node.vy = (node.vy + node.fy / node.mass) * this.damping;
      node.x += node.vx;
      node.y += node.vy;
      node.x = Math.max(0, Math.min(this.width, node.x));
      node.y = Math.max(0, Math.min(this.height, node.y));
    }
  }

  step() {
    this._applyForces();
    this._updatePositions();
    return this.nodes;
  }
}

export class TreemapLayout {
  constructor(config = {}) {
    this.padding = config.padding || 2;
    this.ratio = config.ratio || ((1 + Math.sqrt(5)) / 2);
  }

  layout(data, bounds) {
    const { x, y, width, height } = bounds;
    const total = this._sumValues(data);
    if (total === 0) return [];
    const items = data.map((d) => ({
      ...d,
      area: ((d.value || 0) / total) * width * height,
    }));
    items.sort((a, b) => b.area - a.area);
    return this._squarify(items, { x, y, width, height });
  }

  _sumValues(data) {
    return data.reduce((s, d) => s + (d.value || 0), 0);
  }

  _squarify(items, rect) {
    if (items.length === 0) return [];
    if (items.length === 1) {
      const item = items[0];
      const result = {
        ...item,
        x: rect.x + this.padding,
        y: rect.y + this.padding,
        width: Math.max(0, rect.width - 2 * this.padding),
        height: Math.max(0, rect.height - 2 * this.padding),
      };
      if (item.children && item.children.length > 0) {
        result.children = this.layout(item.children, {
          x: result.x,
          y: result.y,
          width: result.width,
          height: result.height,
        });
      }
      return [result];
    }

    const totalArea = items.reduce((s, i) => s + i.area, 0);
    const results = [];
    let remaining = [...items];
    let currentRect = { ...rect };

    while (remaining.length > 0) {
      const isWide = currentRect.width >= currentRect.height;
      const side = isWide ? currentRect.height : currentRect.width;
      const row = [];
      let rowArea = 0;
      let bestRatio = Infinity;

      for (const item of remaining) {
        row.push(item);
        rowArea += item.area;
        const rowWidth = rowArea / side;
        let worst = 0;
        for (const r of row) {
          const h = r.area / rowWidth;
          const ratio = Math.max(rowWidth / h, h / rowWidth);
          worst = Math.max(worst, ratio);
        }
        if (worst > bestRatio && row.length > 1) {
          row.pop();
          rowArea -= item.area;
          break;
        }
        bestRatio = worst;
      }

      const rowWidth = rowArea / side;
      let offset = 0;
      for (const item of row) {
        const h = item.area / rowWidth;
        const entry = {
          ...item,
          x: (isWide ? currentRect.x : currentRect.x + offset) + this.padding,
          y: (isWide ? currentRect.y + offset : currentRect.y) + this.padding,
          width: Math.max(0, (isWide ? rowWidth : h) - 2 * this.padding),
          height: Math.max(0, (isWide ? h : rowWidth) - 2 * this.padding),
        };
        if (item.children && item.children.length > 0) {
          entry.children = this.layout(item.children, {
            x: entry.x, y: entry.y, width: entry.width, height: entry.height,
          });
        }
        results.push(entry);
        offset += h;
      }

      remaining = remaining.slice(row.length);
      if (isWide) {
        currentRect = {
          x: currentRect.x + rowWidth,
          y: currentRect.y,
          width: currentRect.width - rowWidth,
          height: currentRect.height,
        };
      } else {
        currentRect = {
          x: currentRect.x,
          y: currentRect.y + rowWidth,
          width: currentRect.width,
          height: currentRect.height - rowWidth,
        };
      }
    }

    return results;
  }
}

export class SunburstLayout {
  constructor(config = {}) {
    this.centerX = config.centerX || 300;
    this.centerY = config.centerY || 300;
    this.innerRadius = config.innerRadius || 0;
    this.outerRadius = config.outerRadius || 250;
    this.startAngle = config.startAngle || 0;
    this.endAngle = config.endAngle || Math.PI * 2;
  }

  layout(root) {
    const maxDepth = this._maxDepth(root, 0);
    const bandWidth = (this.outerRadius - this.innerRadius) / (maxDepth + 1);
    return this._layoutNode(root, this.startAngle, this.endAngle, 0, bandWidth);
  }

  _maxDepth(node, depth) {
    if (!node.children || node.children.length === 0) return depth;
    let max = depth;
    for (const child of node.children) {
      max = Math.max(max, this._maxDepth(child, depth + 1));
    }
    return max;
  }

  _sumValues(node) {
    if (!node.children || node.children.length === 0) return node.value || 1;
    return node.children.reduce((s, c) => s + this._sumValues(c), 0);
  }

  _layoutNode(node, startAngle, endAngle, depth, bandWidth) {
    const innerR = this.innerRadius + depth * bandWidth;
    const outerR = innerR + bandWidth;
    const result = {
      ...node,
      depth,
      startAngle,
      endAngle,
      innerRadius: innerR,
      outerRadius: outerR,
      centerX: this.centerX,
      centerY: this.centerY,
      midAngle: (startAngle + endAngle) / 2,
      midRadius: (innerR + outerR) / 2,
      children: [],
    };

    if (node.children && node.children.length > 0) {
      const total = this._sumValues(node);
      let angle = startAngle;
      for (const child of node.children) {
        const childValue = this._sumValues(child);
        const childAngle = ((endAngle - startAngle) * childValue) / total;
        result.children.push(
          this._layoutNode(child, angle, angle + childAngle, depth + 1, bandWidth)
        );
        angle += childAngle;
      }
    }

    return result;
  }
}

export class SankeyLayout {
  constructor(config = {}) {
    this.width = config.width || 800;
    this.height = config.height || 600;
    this.nodeWidth = config.nodeWidth || 20;
    this.nodePadding = config.nodePadding || 10;
    this.iterations = config.iterations || 32;
  }

  layout(data) {
    const nodes = data.nodes.map((n, i) => ({
      ...n,
      id: n.id || `node_${i}`,
      sourceLinks: [],
      targetLinks: [],
      value: 0,
      x: 0, y: 0,
      width: this.nodeWidth,
      height: 0,
      depth: 0,
    }));
    const nodeMap = {};
    for (const node of nodes) nodeMap[node.id] = node;

    const links = data.links.map((l) => ({
      source: nodeMap[l.source],
      target: nodeMap[l.target],
      value: l.value || 1,
      width: 0,
      y0: 0,
      y1: 0,
    }));

    for (const link of links) {
      if (link.source) link.source.sourceLinks.push(link);
      if (link.target) link.target.targetLinks.push(link);
    }

    for (const node of nodes) {
      node.value = Math.max(
        node.sourceLinks.reduce((s, l) => s + l.value, 0),
        node.targetLinks.reduce((s, l) => s + l.value, 0)
      );
    }

    this._computeNodeDepths(nodes);
    this._computeNodePositions(nodes);
    this._computeLinkPositions(links);

    return { nodes, links };
  }

  _computeNodeDepths(nodes) {
    let remaining = [...nodes];
    let depth = 0;
    while (remaining.length > 0) {
      const next = [];
      for (const node of remaining) {
        if (node.targetLinks.length === 0 ||
            node.targetLinks.every((l) => l.source.depth < depth)) {
          node.depth = depth;
        } else {
          next.push(node);
        }
      }
      if (next.length === remaining.length) {
        for (const n of next) n.depth = depth;
        break;
      }
      remaining = next;
      depth++;
    }

    const maxDepth = Math.max(...nodes.map((n) => n.depth));
    const columnWidth = (this.width - this.nodeWidth) / Math.max(maxDepth, 1);
    for (const node of nodes) {
      node.x = node.depth * columnWidth;
    }
  }

  _computeNodePositions(nodes) {
    const columns = {};
    for (const node of nodes) {
      if (!columns[node.depth]) columns[node.depth] = [];
      columns[node.depth].push(node);
    }

    for (const col of Object.values(columns)) {
      const totalValue = col.reduce((s, n) => s + n.value, 0);
      const availHeight = this.height - this.nodePadding * (col.length - 1);
      let y = 0;
      for (const node of col) {
        node.height = Math.max(1, (node.value / totalValue) * availHeight);
        node.y = y;
        y += node.height + this.nodePadding;
      }
    }
  }

  _computeLinkPositions(links) {
    for (const link of links) {
      const sourceNode = link.source;
      const targetNode = link.target;
      if (!sourceNode || !targetNode) continue;
      const totalSourceValue = sourceNode.sourceLinks.reduce((s, l) => s + l.value, 0);
      const totalTargetValue = targetNode.targetLinks.reduce((s, l) => s + l.value, 0);
      link.width = Math.max(1, (link.value / Math.max(totalSourceValue, 1)) * sourceNode.height);
      const sourceIdx = sourceNode.sourceLinks.indexOf(link);
      const targetIdx = targetNode.targetLinks.indexOf(link);
      let sy = sourceNode.y;
      for (let i = 0; i < sourceIdx; i++) {
        sy += (sourceNode.sourceLinks[i].value / totalSourceValue) * sourceNode.height;
      }
      let ty = targetNode.y;
      for (let i = 0; i < targetIdx; i++) {
        ty += (targetNode.targetLinks[i].value / totalTargetValue) * targetNode.height;
      }
      link.y0 = sy;
      link.y1 = ty;
    }
  }
}

// ============================================================================
// Section 11: Base Chart Class
// ============================================================================

class BaseChart {
  constructor(config = {}) {
    this.width = config.width || 800;
    this.height = config.height || 600;
    this.margin = config.margin || { top: 40, right: 40, bottom: 60, left: 60 };
    this.title = config.title || '';
    this.data = [];
    this.tooltip = new TooltipSystem(config.tooltip || {});
    this.legend = new LegendSystem(config.legend || {});
    this.annotations = new AnnotationSystem();
    this.animation = new AnimationSystem();
    this.colorScale = config.colorScale || ColorScale.categorical();
    this._plotWidth = this.width - this.margin.left - this.margin.right;
    this._plotHeight = this.height - this.margin.top - this.margin.bottom;
    this._animationState = {};
  }

  setData(data) {
    this.data = data;
    this._processData();
    return this;
  }

  _processData() {
    // Override in subclasses
  }

  render() {
    return { type: this.constructor.name, elements: [] };
  }

  update(newData) {
    const oldData = this.data;
    this.setData(newData);
    return { previous: oldData, current: this.data };
  }

  getTooltip(position) {
    return this.tooltip.show(null, position);
  }

  animate(config = {}) {
    return this.animation.tween({
      from: { progress: 0 },
      to: { progress: 1 },
      duration: config.duration || 800,
      easing: config.easing || 'easeInOut',
      ...config,
    });
  }

  serialize() {
    return {
      type: this.constructor.name,
      width: this.width,
      height: this.height,
      margin: this.margin,
      title: this.title,
      data: this.data,
    };
  }

  deserialize(state) {
    this.width = state.width || this.width;
    this.height = state.height || this.height;
    this.margin = state.margin || this.margin;
    this.title = state.title || this.title;
    this._plotWidth = this.width - this.margin.left - this.margin.right;
    this._plotHeight = this.height - this.margin.top - this.margin.bottom;
    if (state.data) this.setData(state.data);
    return this;
  }

  _renderTitle() {
    if (!this.title) return null;
    return {
      type: 'text',
      x: this.width / 2,
      y: this.margin.top / 2,
      text: this.title,
      anchor: 'middle',
      fontSize: 16,
      fontWeight: 'bold',
      fill: '#333',
    };
  }

  _plotBounds() {
    return {
      x: this.margin.left,
      y: this.margin.top,
      width: this._plotWidth,
      height: this._plotHeight,
    };
  }
}

// ============================================================================
// Section 12: LineChart
// ============================================================================

export class LineChart extends BaseChart {
  constructor(config = {}) {
    super(config);
    this.interpolation = config.interpolation || 'linear';
    this.showMarkers = config.showMarkers !== false;
    this.markerSize = config.markerSize || 4;
    this.areaFill = config.areaFill || false;
    this.areaOpacity = config.areaOpacity || 0.2;
    this.lineWidth = config.lineWidth || 2;
    this.curveType = config.curveType || 'linear';
    this.series = [];
    this.xScale = null;
    this.yScale = null;
  }

  _processData() {
    if (!this.data || this.data.length === 0) return;
    if (Array.isArray(this.data[0])) {
      this.series = this.data;
    } else if (this.data[0] && this.data[0].series) {
      const groups = DataTransform.groupBy(this.data, 'series');
      this.series = Object.values(groups);
    } else {
      this.series = [this.data];
    }
    const allX = this.series.flatMap((s) => s.map((d) => d.x));
    const allY = this.series.flatMap((s) => s.map((d) => d.y));
    const xExtent = Statistics.extent(allX.filter((v) => typeof v === 'number'));
    const yExtent = Statistics.extent(allY);
    this.xScale = new LinearScale({
      domain: xExtent,
      range: [0, this._plotWidth],
    }).nice();
    this.yScale = new LinearScale({
      domain: [Math.min(0, yExtent[0]), yExtent[1]],
      range: [this._plotHeight, 0],
    }).nice();
  }

  _interpolatePoints(points) {
    if (points.length < 2) return points;
    switch (this.interpolation) {
      case 'step':
        return this._stepInterpolation(points);
      case 'monotone':
        return this._monotoneInterpolation(points);
      case 'basis':
        return this._basisInterpolation(points);
      default:
        return points;
    }
  }

  _stepInterpolation(points) {
    const result = [];
    for (let i = 0; i < points.length; i++) {
      result.push(points[i]);
      if (i < points.length - 1) {
        result.push({ x: points[i + 1].x, y: points[i].y });
      }
    }
    return result;
  }

  _monotoneInterpolation(points) {
    if (points.length < 3) return points;
    const result = [];
    const n = points.length;
    const tangents = new Array(n);
    for (let i = 0; i < n; i++) {
      if (i === 0) {
        tangents[i] = (points[1].y - points[0].y) / (points[1].x - points[0].x || 1);
      } else if (i === n - 1) {
        tangents[i] = (points[n - 1].y - points[n - 2].y) / (points[n - 1].x - points[n - 2].x || 1);
      } else {
        tangents[i] = ((points[i + 1].y - points[i - 1].y) / (points[i + 1].x - points[i - 1].x || 1));
      }
    }
    for (let i = 0; i < n - 1; i++) {
      const steps = 10;
      for (let j = 0; j <= steps; j++) {
        const t = j / steps;
        const h00 = 2 * t * t * t - 3 * t * t + 1;
        const h10 = t * t * t - 2 * t * t + t;
        const h01 = -2 * t * t * t + 3 * t * t;
        const h11 = t * t * t - t * t;
        const dx = points[i + 1].x - points[i].x;
        result.push({
          x: points[i].x + dx * t,
          y: h00 * points[i].y + h10 * dx * tangents[i] + h01 * points[i + 1].y + h11 * dx * tangents[i + 1],
        });
      }
    }
    return result;
  }

  _basisInterpolation(points) {
    if (points.length < 4) return points;
    const result = [];
    for (let i = 1; i < points.length - 2; i++) {
      const p0 = points[i - 1];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2];
      for (let t = 0; t <= 1; t += 0.1) {
        const t2 = t * t;
        const t3 = t2 * t;
        const x = ((-t3 + 3 * t2 - 3 * t + 1) * p0.x + (3 * t3 - 6 * t2 + 4) * p1.x +
          (-3 * t3 + 3 * t2 + 3 * t + 1) * p2.x + t3 * p3.x) / 6;
        const y = ((-t3 + 3 * t2 - 3 * t + 1) * p0.y + (3 * t3 - 6 * t2 + 4) * p1.y +
          (-3 * t3 + 3 * t2 + 3 * t + 1) * p2.y + t3 * p3.y) / 6;
        result.push({ x, y });
      }
    }
    return result;
  }

  render() {
    const elements = [];
    const bounds = this._plotBounds();
    const title = this._renderTitle();
    if (title) elements.push(title);

    const xAxis = new Axis({
      position: 'bottom',
      scale: this.xScale,
      label: 'X Axis',
      gridLines: true,
      gridLength: this._plotHeight,
    });
    const yAxis = new Axis({
      position: 'left',
      scale: this.yScale,
      label: 'Y Axis',
      gridLines: true,
      gridLength: this._plotWidth,
    });
    elements.push(xAxis.render({ x: bounds.x, y: bounds.y + bounds.height }, this._plotWidth));
    elements.push(yAxis.render({ x: bounds.x, y: bounds.y }, this._plotHeight));

    for (let s = 0; s < this.series.length; s++) {
      const seriesData = this.series[s];
      const color = this.colorScale.getColor(s);
      const rawPoints = seriesData.map((d) => ({
        x: bounds.x + this.xScale.scale(d.x),
        y: bounds.y + this.yScale.scale(d.y),
        data: d,
      }));
      const interpolated = this._interpolatePoints(rawPoints);

      if (this.areaFill) {
        const baseline = bounds.y + this.yScale.scale(0);
        const areaPoints = [
          { x: interpolated[0].x, y: baseline },
          ...interpolated,
          { x: interpolated[interpolated.length - 1].x, y: baseline },
        ];
        elements.push({
          type: 'polygon',
          points: areaPoints,
          fill: color,
          opacity: this.areaOpacity,
          seriesIndex: s,
        });
      }

      elements.push({
        type: 'polyline',
        points: interpolated,
        stroke: color,
        strokeWidth: this.lineWidth,
        fill: 'none',
        seriesIndex: s,
      });

      if (this.showMarkers) {
        for (const p of rawPoints) {
          elements.push({
            type: 'circle',
            cx: p.x,
            cy: p.y,
            r: this.markerSize,
            fill: color,
            stroke: '#fff',
            strokeWidth: 2,
            data: p.data,
            seriesIndex: s,
          });
        }
      }

      this.legend.addItem({
        id: `series_${s}`,
        label: seriesData[0]?.series || `Series ${s + 1}`,
        color,
      });
    }

    elements.push(this.legend.render(bounds));
    elements.push(...this.annotations.render(this.xScale, this.yScale, bounds));

    return { type: 'LineChart', elements, bounds };
  }

  getTooltip(position) {
    const bounds = this._plotBounds();
    const dataX = this.xScale.invert(position.x - bounds.x);
    const closest = [];
    for (let s = 0; s < this.series.length; s++) {
      let minDist = Infinity;
      let best = null;
      for (const d of this.series[s]) {
        const dist = Math.abs(d.x - dataX);
        if (dist < minDist) {
          minDist = dist;
          best = d;
        }
      }
      if (best) closest.push({ ...best, series: s });
    }
    return this.tooltip.show(closest, position);
  }

  animate(config = {}) {
    return this.animation.tween({
      from: { clipWidth: 0 },
      to: { clipWidth: this._plotWidth },
      duration: config.duration || 1000,
      easing: config.easing || 'easeOut',
      onUpdate: (values) => {
        this._animationState.clipWidth = values.clipWidth;
      },
    });
  }

  serialize() {
    return {
      ...super.serialize(),
      interpolation: this.interpolation,
      showMarkers: this.showMarkers,
      areaFill: this.areaFill,
      lineWidth: this.lineWidth,
    };
  }

  deserialize(state) {
    super.deserialize(state);
    this.interpolation = state.interpolation || this.interpolation;
    this.showMarkers = state.showMarkers !== undefined ? state.showMarkers : this.showMarkers;
    this.areaFill = state.areaFill || this.areaFill;
    this.lineWidth = state.lineWidth || this.lineWidth;
    return this;
  }
}

// ============================================================================
// Section 13: BarChart
// ============================================================================

export class BarChart extends BaseChart {
  constructor(config = {}) {
    super(config);
    this.mode = config.mode || 'grouped';
    this.horizontal = config.horizontal || false;
    this.showLabels = config.showLabels || false;
    this.barPadding = config.barPadding || 0.2;
    this.groupPadding = config.groupPadding || 0.1;
    this.cornerRadius = config.cornerRadius || 0;
    this.categories = [];
    this.groups = [];
    this.xScale = null;
    this.yScale = null;
  }

  _processData() {
    if (!this.data || this.data.length === 0) return;
    this.categories = [...new Set(this.data.map((d) => d.category || d.x))];
    this.groups = [...new Set(this.data.map((d) => d.group || 'default'))];

    const categoryScale = new BandScale({
      domain: this.categories,
      range: this.horizontal ? [0, this._plotHeight] : [0, this._plotWidth],
      paddingInner: this.barPadding,
      paddingOuter: this.barPadding / 2,
    });

    let maxVal = 0;
    if (this.mode === 'stacked') {
      const totals = {};
      for (const d of this.data) {
        const cat = d.category || d.x;
        totals[cat] = (totals[cat] || 0) + Math.abs(d.value || d.y || 0);
      }
      maxVal = Math.max(...Object.values(totals));
    } else {
      maxVal = Math.max(...this.data.map((d) => Math.abs(d.value || d.y || 0)));
    }

    const valueScale = new LinearScale({
      domain: [0, maxVal],
      range: this.horizontal ? [0, this._plotWidth] : [this._plotHeight, 0],
    }).nice();

    this.xScale = this.horizontal ? valueScale : categoryScale;
    this.yScale = this.horizontal ? categoryScale : valueScale;
  }

  render() {
    const elements = [];
    const bounds = this._plotBounds();
    const title = this._renderTitle();
    if (title) elements.push(title);

    if (this.mode === 'stacked') {
      this._renderStacked(elements, bounds);
    } else {
      this._renderGrouped(elements, bounds);
    }

    const xAxis = new Axis({ position: 'bottom', scale: this.horizontal ? this.xScale : this.xScale });
    const yAxis = new Axis({ position: 'left', scale: this.horizontal ? this.yScale : this.yScale });
    elements.push(xAxis.render({ x: bounds.x, y: bounds.y + bounds.height }, this._plotWidth));
    elements.push(yAxis.render({ x: bounds.x, y: bounds.y }, this._plotHeight));

    for (let g = 0; g < this.groups.length; g++) {
      this.legend.addItem({
        id: `group_${g}`,
        label: this.groups[g],
        color: this.colorScale.getColor(g),
      });
    }
    elements.push(this.legend.render(bounds));

    return { type: 'BarChart', elements, bounds };
  }

  _renderGrouped(elements, bounds) {
    const groupScale = new BandScale({
      domain: this.groups,
      range: [0, this.horizontal ? this.yScale.bandwidth() : this.xScale.bandwidth()],
      paddingInner: this.groupPadding,
    });

    for (const d of this.data) {
      const cat = d.category || d.x;
      const group = d.group || 'default';
      const val = d.value || d.y || 0;
      const gIdx = this.groups.indexOf(group);
      const color = this.colorScale.getColor(gIdx);

      if (this.horizontal) {
        const catPos = this.yScale.scale(cat);
        const groupOffset = groupScale.scale(group);
        if (catPos === undefined) continue;
        const barY = bounds.y + catPos + (groupOffset || 0);
        const barHeight = groupScale.bandwidth();
        const barWidth = this.xScale.scale(Math.abs(val));
        const barX = bounds.x;
        elements.push({
          type: 'rect',
          x: barX,
          y: barY,
          width: barWidth,
          height: barHeight,
          fill: color,
          rx: this.cornerRadius,
          data: d,
        });
        if (this.showLabels) {
          elements.push({
            type: 'text',
            x: barX + barWidth + 4,
            y: barY + barHeight / 2,
            text: String(val),
            anchor: 'start',
            baseline: 'middle',
            fontSize: 10,
            fill: '#333',
          });
        }
      } else {
        const catPos = this.xScale.scale(cat);
        const groupOffset = groupScale.scale(group);
        if (catPos === undefined) continue;
        const barX = bounds.x + catPos + (groupOffset || 0);
        const barWidth = groupScale.bandwidth();
        const barTop = bounds.y + this.yScale.scale(Math.abs(val));
        const barHeight = bounds.y + this._plotHeight - barTop;
        elements.push({
          type: 'rect',
          x: barX,
          y: barTop,
          width: barWidth,
          height: barHeight,
          fill: color,
          rx: this.cornerRadius,
          data: d,
        });
        if (this.showLabels) {
          elements.push({
            type: 'text',
            x: barX + barWidth / 2,
            y: barTop - 4,
            text: String(val),
            anchor: 'middle',
            fontSize: 10,
            fill: '#333',
          });
        }
      }
    }
  }

  _renderStacked(elements, bounds) {
    const stackMap = {};
    for (const d of this.data) {
      const cat = d.category || d.x;
      if (!stackMap[cat]) stackMap[cat] = [];
      stackMap[cat].push(d);
    }
    for (const cat of this.categories) {
      const items = stackMap[cat] || [];
      let yOffset = 0;
      for (const d of items) {
        const val = d.value || d.y || 0;
        const group = d.group || 'default';
        const gIdx = this.groups.indexOf(group);
        const color = this.colorScale.getColor(gIdx);
        if (this.horizontal) {
          const catPos = this.yScale.scale(cat);
          if (catPos === undefined) continue;
          const barY = bounds.y + catPos;
          const barHeight = this.yScale.bandwidth();
          const barWidth = this.xScale.scale(val) - this.xScale.scale(0);
          elements.push({
            type: 'rect',
            x: bounds.x + this.xScale.scale(0) + yOffset,
            y: barY,
            width: Math.abs(barWidth),
            height: barHeight,
            fill: color,
            rx: this.cornerRadius,
            data: d,
          });
          yOffset += Math.abs(barWidth);
        } else {
          const catPos = this.xScale.scale(cat);
          if (catPos === undefined) continue;
          const barX = bounds.x + catPos;
          const barWidth = this.xScale.bandwidth();
          const barHeight = this._plotHeight - this.yScale.scale(val);
          const barY = bounds.y + this.yScale.scale(val) - yOffset - barHeight + this._plotHeight;
          elements.push({
            type: 'rect',
            x: barX,
            y: bounds.y + this._plotHeight - yOffset - barHeight,
            width: barWidth,
            height: barHeight,
            fill: color,
            rx: this.cornerRadius,
            data: d,
          });
          yOffset += barHeight;
        }
      }
    }
  }

  getTooltip(position) {
    const bounds = this._plotBounds();
    for (const d of this.data) {
      const cat = d.category || d.x;
      const val = d.value || d.y || 0;
      const catPos = this.horizontal ? this.yScale.scale(cat) : this.xScale.scale(cat);
      if (catPos === undefined) continue;
      const bw = this.horizontal ? this.yScale.bandwidth() : this.xScale.bandwidth();
      const start = (this.horizontal ? bounds.y : bounds.x) + catPos;
      const mousePos = this.horizontal ? position.y : position.x;
      if (mousePos >= start && mousePos <= start + bw) {
        return this.tooltip.show({
          category: cat,
          value: val,
          group: d.group || 'default',
        }, position);
      }
    }
    return this.tooltip.hide();
  }

  animate(config = {}) {
    const items = this.data.map((_, i) => ({
      from: { height: 0, opacity: 0 },
      to: { height: 1, opacity: 1 },
    }));
    return this.animation.stagger(items, {
      duration: config.duration || 600,
      staggerDelay: config.staggerDelay || 30,
      easing: config.easing || 'easeOutCubic',
    });
  }

  serialize() {
    return {
      ...super.serialize(),
      mode: this.mode,
      horizontal: this.horizontal,
      showLabels: this.showLabels,
      barPadding: this.barPadding,
    };
  }

  deserialize(state) {
    super.deserialize(state);
    this.mode = state.mode || this.mode;
    this.horizontal = state.horizontal || this.horizontal;
    this.showLabels = state.showLabels || this.showLabels;
    return this;
  }
}

// ============================================================================
// Section 14: PieChart
// ============================================================================

export class PieChart extends BaseChart {
  constructor(config = {}) {
    super(config);
    this.donut = config.donut || false;
    this.innerRadiusRatio = config.innerRadiusRatio || 0.5;
    this.showLabels = config.showLabels !== false;
    this.labelStyle = config.labelStyle || 'outside';
    this.explodeIndex = config.explodeIndex || -1;
    this.explodeDistance = config.explodeDistance || 15;
    this.startAngle = config.startAngle || 0;
    this.sortValues = config.sortValues || false;
    this.slices = [];
  }

  _processData() {
    if (!this.data || this.data.length === 0) return;
    let processedData = this.data.map((d) => ({
      label: d.label || d.category || d.name || '',
      value: d.value || d.y || 0,
      color: d.color || null,
    }));
    if (this.sortValues) {
      processedData.sort((a, b) => b.value - a.value);
    }
    const total = processedData.reduce((s, d) => s + d.value, 0);
    let angle = this.startAngle;
    this.slices = processedData.map((d, i) => {
      const sliceAngle = total > 0 ? (d.value / total) * Math.PI * 2 : 0;
      const slice = {
        ...d,
        color: d.color || this.colorScale.getColor(i),
        startAngle: angle,
        endAngle: angle + sliceAngle,
        midAngle: angle + sliceAngle / 2,
        percentage: total > 0 ? (d.value / total) * 100 : 0,
        index: i,
      };
      angle += sliceAngle;
      return slice;
    });
  }

  render() {
    const elements = [];
    const bounds = this._plotBounds();
    const title = this._renderTitle();
    if (title) elements.push(title);

    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    const outerRadius = Math.min(bounds.width, bounds.height) / 2 - 20;
    const innerRadius = this.donut ? outerRadius * this.innerRadiusRatio : 0;

    for (const slice of this.slices) {
      const isExploded = slice.index === this.explodeIndex;
      let offsetX = 0, offsetY = 0;
      if (isExploded) {
        offsetX = Math.cos(slice.midAngle) * this.explodeDistance;
        offsetY = Math.sin(slice.midAngle) * this.explodeDistance;
      }
      elements.push({
        type: 'arc',
        cx: cx + offsetX,
        cy: cy + offsetY,
        innerRadius,
        outerRadius,
        startAngle: slice.startAngle,
        endAngle: slice.endAngle,
        fill: slice.color,
        stroke: '#fff',
        strokeWidth: 2,
        data: slice,
      });

      if (this.showLabels) {
        const labelRadius = this.labelStyle === 'inside'
          ? (innerRadius + outerRadius) / 2
          : outerRadius + 20;
        const lx = cx + offsetX + Math.cos(slice.midAngle) * labelRadius;
        const ly = cy + offsetY + Math.sin(slice.midAngle) * labelRadius;
        elements.push({
          type: 'text',
          x: lx,
          y: ly,
          text: `${slice.label} (${slice.percentage.toFixed(1)}%)`,
          anchor: slice.midAngle > Math.PI / 2 && slice.midAngle < Math.PI * 1.5 ? 'end' : 'start',
          baseline: 'middle',
          fontSize: 11,
          fill: this.labelStyle === 'inside' ? '#fff' : '#333',
        });
      }

      this.legend.addItem({
        id: `slice_${slice.index}`,
        label: slice.label,
        color: slice.color,
      });
    }

    if (this.donut) {
      const total = this.slices.reduce((s, sl) => s + sl.value, 0);
      elements.push({
        type: 'text',
        x: cx,
        y: cy,
        text: String(total),
        anchor: 'middle',
        baseline: 'middle',
        fontSize: 20,
        fontWeight: 'bold',
        fill: '#333',
      });
    }

    elements.push(this.legend.render(bounds));
    return { type: 'PieChart', elements, bounds };
  }

  getTooltip(position) {
    const bounds = this._plotBounds();
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    const dx = position.x - cx;
    const dy = position.y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const outerRadius = Math.min(bounds.width, bounds.height) / 2 - 20;
    const innerRadius = this.donut ? outerRadius * this.innerRadiusRatio : 0;
    if (dist < innerRadius || dist > outerRadius) return this.tooltip.hide();

    let angle = Math.atan2(dy, dx);
    if (angle < 0) angle += Math.PI * 2;
    for (const slice of this.slices) {
      let start = slice.startAngle % (Math.PI * 2);
      let end = slice.endAngle % (Math.PI * 2);
      if (start < 0) start += Math.PI * 2;
      if (end < 0) end += Math.PI * 2;
      if (angle >= start && angle <= end) {
        return this.tooltip.show({
          label: slice.label,
          value: slice.value,
          percentage: slice.percentage.toFixed(1) + '%',
        }, position);
      }
    }
    return this.tooltip.hide();
  }

  animate(config = {}) {
    return this.animation.tween({
      from: { endAngle: this.startAngle },
      to: { endAngle: this.startAngle + Math.PI * 2 },
      duration: config.duration || 1200,
      easing: config.easing || 'easeOut',
      onUpdate: (values) => {
        this._animationState.maxAngle = values.endAngle;
      },
    });
  }

  serialize() {
    return {
      ...super.serialize(),
      donut: this.donut,
      innerRadiusRatio: this.innerRadiusRatio,
      showLabels: this.showLabels,
      explodeIndex: this.explodeIndex,
    };
  }

  deserialize(state) {
    super.deserialize(state);
    this.donut = state.donut || this.donut;
    this.innerRadiusRatio = state.innerRadiusRatio || this.innerRadiusRatio;
    this.showLabels = state.showLabels !== undefined ? state.showLabels : this.showLabels;
    this.explodeIndex = state.explodeIndex !== undefined ? state.explodeIndex : this.explodeIndex;
    return this;
  }
}

// ============================================================================
// Section 15: ScatterPlot
// ============================================================================

export class ScatterPlot extends BaseChart {
  constructor(config = {}) {
    super(config);
    this.bubbleMode = config.bubbleMode || false;
    this.sizeField = config.sizeField || 'size';
    this.minSize = config.minSize || 3;
    this.maxSize = config.maxSize || 30;
    this.showQuadrants = config.showQuadrants || false;
    this.showTrendLine = config.showTrendLine || false;
    this.clusterField = config.clusterField || null;
    this.xScale = null;
    this.yScale = null;
    this.sizeScale = null;
  }

  _processData() {
    if (!this.data || this.data.length === 0) return;
    const xVals = this.data.map((d) => d.x);
    const yVals = this.data.map((d) => d.y);
    this.xScale = new LinearScale({
      domain: Statistics.extent(xVals),
      range: [0, this._plotWidth],
    }).nice();
    this.yScale = new LinearScale({
      domain: Statistics.extent(yVals),
      range: [this._plotHeight, 0],
    }).nice();
    if (this.bubbleMode) {
      const sizes = this.data.map((d) => d[this.sizeField] || 1);
      this.sizeScale = new LinearScale({
        domain: Statistics.extent(sizes),
        range: [this.minSize, this.maxSize],
      });
    }
  }

  render() {
    const elements = [];
    const bounds = this._plotBounds();
    const title = this._renderTitle();
    if (title) elements.push(title);

    const xAxis = new Axis({
      position: 'bottom',
      scale: this.xScale,
      gridLines: true,
      gridLength: this._plotHeight,
    });
    const yAxis = new Axis({
      position: 'left',
      scale: this.yScale,
      gridLines: true,
      gridLength: this._plotWidth,
    });
    elements.push(xAxis.render({ x: bounds.x, y: bounds.y + bounds.height }, this._plotWidth));
    elements.push(yAxis.render({ x: bounds.x, y: bounds.y }, this._plotHeight));

    if (this.showQuadrants) {
      const midX = bounds.x + this._plotWidth / 2;
      const midY = bounds.y + this._plotHeight / 2;
      elements.push({
        type: 'line',
        x1: midX, y1: bounds.y,
        x2: midX, y2: bounds.y + bounds.height,
        stroke: '#ccc', strokeWidth: 1, dashArray: '4,4',
      });
      elements.push({
        type: 'line',
        x1: bounds.x, y1: midY,
        x2: bounds.x + bounds.width, y2: midY,
        stroke: '#ccc', strokeWidth: 1, dashArray: '4,4',
      });
    }

    const clusters = {};
    for (const d of this.data) {
      const cluster = this.clusterField ? (d[this.clusterField] || 'default') : 'default';
      if (!clusters[cluster]) clusters[cluster] = [];
      clusters[cluster].push(d);
    }

    const clusterKeys = Object.keys(clusters);
    for (let c = 0; c < clusterKeys.length; c++) {
      const cluster = clusterKeys[c];
      const points = clusters[cluster];
      const color = this.colorScale.getColor(c);

      for (const d of points) {
        const cx = bounds.x + this.xScale.scale(d.x);
        const cy = bounds.y + this.yScale.scale(d.y);
        const r = this.bubbleMode && this.sizeScale
          ? this.sizeScale.scale(d[this.sizeField] || 1)
          : 5;
        elements.push({
          type: 'circle',
          cx, cy, r,
          fill: color,
          opacity: 0.7,
          stroke: color,
          strokeWidth: 1,
          data: d,
        });
      }

      if (clusterKeys.length > 1) {
        this.legend.addItem({ id: `cluster_${c}`, label: cluster, color });
      }
    }

    if (this.showTrendLine) {
      const xVals = this.data.map((d) => d.x);
      const yVals = this.data.map((d) => d.y);
      const reg = Statistics.linearRegression(xVals, yVals);
      const [xMin, xMax] = this.xScale.domain;
      const y1 = reg.slope * xMin + reg.intercept;
      const y2 = reg.slope * xMax + reg.intercept;
      elements.push({
        type: 'line',
        x1: bounds.x + this.xScale.scale(xMin),
        y1: bounds.y + this.yScale.scale(y1),
        x2: bounds.x + this.xScale.scale(xMax),
        y2: bounds.y + this.yScale.scale(y2),
        stroke: '#e74c3c',
        strokeWidth: 2,
        dashArray: '6,3',
      });
      elements.push({
        type: 'text',
        x: bounds.x + bounds.width - 10,
        y: bounds.y + this.yScale.scale(y2) - 10,
        text: `R² = ${reg.r2.toFixed(3)}`,
        anchor: 'end',
        fontSize: 10,
        fill: '#e74c3c',
      });
    }

    elements.push(this.legend.render(bounds));
    elements.push(...this.annotations.render(this.xScale, this.yScale, bounds));
    return { type: 'ScatterPlot', elements, bounds };
  }

  getTooltip(position) {
    const bounds = this._plotBounds();
    let closest = null;
    let minDist = Infinity;
    for (const d of this.data) {
      const px = bounds.x + this.xScale.scale(d.x);
      const py = bounds.y + this.yScale.scale(d.y);
      const dist = Math.sqrt((px - position.x) ** 2 + (py - position.y) ** 2);
      if (dist < minDist && dist < 20) {
        minDist = dist;
        closest = d;
      }
    }
    if (closest) {
      return this.tooltip.show({
        x: closest.x,
        y: closest.y,
        ...(this.bubbleMode ? { size: closest[this.sizeField] } : {}),
      }, position);
    }
    return this.tooltip.hide();
  }

  animate(config = {}) {
    const items = this.data.map(() => ({
      from: { scale: 0, opacity: 0 },
      to: { scale: 1, opacity: 0.7 },
    }));
    return this.animation.stagger(items, {
      duration: config.duration || 500,
      staggerDelay: 20,
      easing: 'easeOutCubic',
    });
  }

  serialize() {
    return { ...super.serialize(), bubbleMode: this.bubbleMode, showTrendLine: this.showTrendLine, showQuadrants: this.showQuadrants };
  }

  deserialize(state) {
    super.deserialize(state);
    this.bubbleMode = state.bubbleMode || this.bubbleMode;
    this.showTrendLine = state.showTrendLine || this.showTrendLine;
    this.showQuadrants = state.showQuadrants || this.showQuadrants;
    return this;
  }
}

// ============================================================================
// Section 16: Histogram
// ============================================================================

export class Histogram extends BaseChart {
  constructor(config = {}) {
    super(config);
    this.binCount = config.binCount || 20;
    this.showCumulative = config.showCumulative || false;
    this.showDensity = config.showDensity || false;
    this.showMean = config.showMean || false;
    this.barColor = config.barColor || '#4292c6';
    this.bins = [];
    this.xScale = null;
    this.yScale = null;
  }

  _processData() {
    if (!this.data || this.data.length === 0) return;
    const values = this.data.map((d) => (typeof d === 'number' ? d : d.value || d.x || 0));
    this.bins = Statistics.histogram(values, this.binCount);
    const maxCount = Math.max(...this.bins.map((b) => b.count));
    this.xScale = new LinearScale({
      domain: [this.bins[0].x0, this.bins[this.bins.length - 1].x1],
      range: [0, this._plotWidth],
    });
    this.yScale = new LinearScale({
      domain: [0, this.showDensity ? maxCount / values.length : maxCount],
      range: [this._plotHeight, 0],
    }).nice();
  }

  render() {
    const elements = [];
    const bounds = this._plotBounds();
    const title = this._renderTitle();
    if (title) elements.push(title);

    const values = this.data.map((d) => (typeof d === 'number' ? d : d.value || d.x || 0));
    const totalCount = values.length;

    for (let i = 0; i < this.bins.length; i++) {
      const bin = this.bins[i];
      const x = bounds.x + this.xScale.scale(bin.x0);
      const w = this.xScale.scale(bin.x1) - this.xScale.scale(bin.x0);
      const val = this.showDensity ? bin.count / totalCount : bin.count;
      const y = bounds.y + this.yScale.scale(val);
      const h = bounds.y + this._plotHeight - y;
      elements.push({
        type: 'rect',
        x, y, width: Math.max(0, w - 1), height: h,
        fill: this.barColor,
        stroke: '#fff',
        strokeWidth: 1,
        data: bin,
      });
    }

    if (this.showCumulative) {
      let cumSum = 0;
      const cumPoints = this.bins.map((bin) => {
        cumSum += bin.count;
        const midX = (bin.x0 + bin.x1) / 2;
        return {
          x: bounds.x + this.xScale.scale(midX),
          y: bounds.y + this._plotHeight * (1 - cumSum / totalCount),
        };
      });
      elements.push({
        type: 'polyline',
        points: cumPoints,
        stroke: '#e74c3c',
        strokeWidth: 2,
        fill: 'none',
      });
    }

    if (this.showMean) {
      const mean = Statistics.mean(values);
      const mx = bounds.x + this.xScale.scale(mean);
      elements.push({
        type: 'line',
        x1: mx, y1: bounds.y,
        x2: mx, y2: bounds.y + this._plotHeight,
        stroke: '#e74c3c', strokeWidth: 2, dashArray: '4,4',
      });
      elements.push({
        type: 'text',
        x: mx + 4, y: bounds.y + 14,
        text: `μ = ${mean.toFixed(2)}`,
        fontSize: 11, fill: '#e74c3c',
      });
    }

    const xAxis = new Axis({ position: 'bottom', scale: this.xScale });
    const yAxis = new Axis({ position: 'left', scale: this.yScale, label: this.showDensity ? 'Density' : 'Frequency' });
    elements.push(xAxis.render({ x: bounds.x, y: bounds.y + bounds.height }, this._plotWidth));
    elements.push(yAxis.render({ x: bounds.x, y: bounds.y }, this._plotHeight));

    return { type: 'Histogram', elements, bounds };
  }

  getTooltip(position) {
    const bounds = this._plotBounds();
    const dataX = this.xScale.invert(position.x - bounds.x);
    for (const bin of this.bins) {
      if (dataX >= bin.x0 && dataX < bin.x1) {
        return this.tooltip.show({
          range: `${bin.x0.toFixed(2)} - ${bin.x1.toFixed(2)}`,
          count: bin.count,
        }, position);
      }
    }
    return this.tooltip.hide();
  }

  animate(config = {}) {
    const items = this.bins.map(() => ({
      from: { height: 0 },
      to: { height: 1 },
    }));
    return this.animation.stagger(items, {
      duration: config.duration || 600,
      staggerDelay: 30,
      easing: 'easeOutCubic',
    });
  }

  serialize() {
    return { ...super.serialize(), binCount: this.binCount, showCumulative: this.showCumulative, showDensity: this.showDensity };
  }

  deserialize(state) {
    super.deserialize(state);
    this.binCount = state.binCount || this.binCount;
    this.showCumulative = state.showCumulative || this.showCumulative;
    this.showDensity = state.showDensity || this.showDensity;
    return this;
  }
}

// ============================================================================
// Section 17: HeatMap
// ============================================================================

export class HeatMap extends BaseChart {
  constructor(config = {}) {
    super(config);
    this.xField = config.xField || 'x';
    this.yField = config.yField || 'y';
    this.valueField = config.valueField || 'value';
    this.palette = config.palette || 'viridis';
    this.showValues = config.showValues || false;
    this.cellPadding = config.cellPadding || 1;
    this.clusterRows = config.clusterRows || false;
    this.clusterCols = config.clusterCols || false;
    this.xLabels = [];
    this.yLabels = [];
    this.matrix = [];
  }

  _processData() {
    if (!this.data || this.data.length === 0) return;
    this.xLabels = [...new Set(this.data.map((d) => d[this.xField]))];
    this.yLabels = [...new Set(this.data.map((d) => d[this.yField]))];

    this.matrix = Array.from({ length: this.yLabels.length }, () =>
      new Array(this.xLabels.length).fill(0)
    );
    for (const d of this.data) {
      const xi = this.xLabels.indexOf(d[this.xField]);
      const yi = this.yLabels.indexOf(d[this.yField]);
      if (xi >= 0 && yi >= 0) {
        this.matrix[yi][xi] = d[this.valueField] || 0;
      }
    }

    const allValues = this.matrix.flat();
    this.colorScale = new ColorScale('sequential', {
      domain: Statistics.extent(allValues),
      palette: this.palette,
    });
  }

  render() {
    const elements = [];
    const bounds = this._plotBounds();
    const title = this._renderTitle();
    if (title) elements.push(title);

    const cellWidth = (bounds.width - this.cellPadding * (this.xLabels.length - 1)) / this.xLabels.length;
    const cellHeight = (bounds.height - this.cellPadding * (this.yLabels.length - 1)) / this.yLabels.length;

    for (let yi = 0; yi < this.yLabels.length; yi++) {
      for (let xi = 0; xi < this.xLabels.length; xi++) {
        const value = this.matrix[yi][xi];
        const x = bounds.x + xi * (cellWidth + this.cellPadding);
        const y = bounds.y + yi * (cellHeight + this.cellPadding);
        elements.push({
          type: 'rect',
          x, y,
          width: cellWidth,
          height: cellHeight,
          fill: this.colorScale.getColor(value),
          stroke: 'none',
          data: {
            x: this.xLabels[xi],
            y: this.yLabels[yi],
            value,
          },
        });
        if (this.showValues) {
          elements.push({
            type: 'text',
            x: x + cellWidth / 2,
            y: y + cellHeight / 2,
            text: typeof value === 'number' ? value.toFixed(1) : String(value),
            anchor: 'middle',
            baseline: 'middle',
            fontSize: Math.min(cellWidth, cellHeight) * 0.3,
            fill: value > (this.colorScale.domain[0] + this.colorScale.domain[1]) / 2 ? '#fff' : '#333',
          });
        }
      }
    }

    for (let i = 0; i < this.xLabels.length; i++) {
      elements.push({
        type: 'text',
        x: bounds.x + i * (cellWidth + this.cellPadding) + cellWidth / 2,
        y: bounds.y + bounds.height + 14,
        text: String(this.xLabels[i]),
        anchor: 'middle',
        fontSize: 10,
        fill: '#333',
      });
    }
    for (let i = 0; i < this.yLabels.length; i++) {
      elements.push({
        type: 'text',
        x: bounds.x - 8,
        y: bounds.y + i * (cellHeight + this.cellPadding) + cellHeight / 2,
        text: String(this.yLabels[i]),
        anchor: 'end',
        baseline: 'middle',
        fontSize: 10,
        fill: '#333',
      });
    }

    const legendTicks = this.colorScale.ticks(5);
    const legendWidth = 20;
    const legendHeight = bounds.height;
    const legendX = bounds.x + bounds.width + 20;
    for (let i = 0; i < legendTicks.length - 1; i++) {
      const y = bounds.y + (i / (legendTicks.length - 1)) * legendHeight;
      const h = legendHeight / (legendTicks.length - 1);
      elements.push({
        type: 'rect',
        x: legendX, y, width: legendWidth, height: h,
        fill: legendTicks[i].color,
      });
      elements.push({
        type: 'text',
        x: legendX + legendWidth + 4,
        y: y + h / 2,
        text: legendTicks[i].value.toFixed(1),
        fontSize: 9,
        baseline: 'middle',
        fill: '#333',
      });
    }

    return { type: 'HeatMap', elements, bounds };
  }

  getTooltip(position) {
    const bounds = this._plotBounds();
    const cellWidth = bounds.width / this.xLabels.length;
    const cellHeight = bounds.height / this.yLabels.length;
    const xi = Math.floor((position.x - bounds.x) / cellWidth);
    const yi = Math.floor((position.y - bounds.y) / cellHeight);
    if (xi >= 0 && xi < this.xLabels.length && yi >= 0 && yi < this.yLabels.length) {
      return this.tooltip.show({
        x: this.xLabels[xi],
        y: this.yLabels[yi],
        value: this.matrix[yi][xi],
      }, position);
    }
    return this.tooltip.hide();
  }

  animate(config = {}) {
    return this.animation.tween({
      from: { opacity: 0 },
      to: { opacity: 1 },
      duration: config.duration || 800,
      easing: 'easeInOut',
    });
  }

  serialize() {
    return { ...super.serialize(), palette: this.palette, showValues: this.showValues, cellPadding: this.cellPadding };
  }

  deserialize(state) {
    super.deserialize(state);
    this.palette = state.palette || this.palette;
    this.showValues = state.showValues || this.showValues;
    return this;
  }
}

// ============================================================================
// Section 18: TreeMap
// ============================================================================

export class TreeMap extends BaseChart {
  constructor(config = {}) {
    super(config);
    this.showLabels = config.showLabels !== false;
    this.showValues = config.showValues || false;
    this.padding = config.padding || 2;
    this.layout = new TreemapLayout({ padding: this.padding });
    this.nodes = [];
  }

  _processData() {
    if (!this.data || this.data.length === 0) return;
    this.nodes = this.layout.layout(this.data, this._plotBounds());
  }

  render() {
    const elements = [];
    const title = this._renderTitle();
    if (title) elements.push(title);
    this._renderNodes(this.nodes, elements, 0);
    return { type: 'TreeMap', elements, bounds: this._plotBounds() };
  }

  _renderNodes(nodes, elements, depth) {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const color = this.colorScale.getColor(i + depth * 10);
      elements.push({
        type: 'rect',
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        fill: color,
        stroke: '#fff',
        strokeWidth: depth === 0 ? 2 : 1,
        opacity: 0.85,
        data: node,
      });
      if (this.showLabels && node.width > 40 && node.height > 20) {
        elements.push({
          type: 'text',
          x: node.x + node.width / 2,
          y: node.y + node.height / 2 - (this.showValues ? 6 : 0),
          text: node.label || node.name || '',
          anchor: 'middle',
          baseline: 'middle',
          fontSize: Math.min(12, node.width / 6),
          fill: '#fff',
          fontWeight: 'bold',
        });
      }
      if (this.showValues && node.width > 30 && node.height > 30) {
        elements.push({
          type: 'text',
          x: node.x + node.width / 2,
          y: node.y + node.height / 2 + 10,
          text: String(node.value || ''),
          anchor: 'middle',
          baseline: 'middle',
          fontSize: Math.min(10, node.width / 8),
          fill: 'rgba(255,255,255,0.8)',
        });
      }
      if (node.children) {
        this._renderNodes(node.children, elements, depth + 1);
      }
    }
  }

  getTooltip(position) {
    const found = this._findNode(this.nodes, position);
    if (found) {
      return this.tooltip.show({
        label: found.label || found.name,
        value: found.value,
      }, position);
    }
    return this.tooltip.hide();
  }

  _findNode(nodes, pos) {
    for (const node of nodes) {
      if (pos.x >= node.x && pos.x <= node.x + node.width &&
          pos.y >= node.y && pos.y <= node.y + node.height) {
        if (node.children) {
          const child = this._findNode(node.children, pos);
          if (child) return child;
        }
        return node;
      }
    }
    return null;
  }

  animate(config = {}) {
    return this.animation.tween({
      from: { scale: 0 },
      to: { scale: 1 },
      duration: config.duration || 800,
      easing: 'easeOutCubic',
    });
  }

  serialize() {
    return { ...super.serialize(), showLabels: this.showLabels, showValues: this.showValues, padding: this.padding };
  }

  deserialize(state) {
    super.deserialize(state);
    this.showLabels = state.showLabels !== undefined ? state.showLabels : this.showLabels;
    this.showValues = state.showValues || this.showValues;
    return this;
  }
}

// ============================================================================
// Section 19: RadarChart
// ============================================================================

export class RadarChart extends BaseChart {
  constructor(config = {}) {
    super(config);
    this.filled = config.filled !== false;
    this.fillOpacity = config.fillOpacity || 0.2;
    this.showLabels = config.showLabels !== false;
    this.showGrid = config.showGrid !== false;
    this.gridLevels = config.gridLevels || 5;
    this.maxValue = config.maxValue || null;
    this.axes = [];
    this.seriesData = [];
  }

  _processData() {
    if (!this.data || this.data.length === 0) return;
    if (this.data[0] && this.data[0].axes) {
      this.axes = this.data[0].axes.map((a) => a.axis || a.label);
      this.seriesData = this.data;
    } else {
      this.axes = Object.keys(this.data[0]).filter((k) => k !== 'label' && k !== 'series' && k !== 'name');
      this.seriesData = this.data.map((d) => ({
        label: d.label || d.name || d.series || '',
        axes: this.axes.map((axis) => ({ axis, value: d[axis] || 0 })),
      }));
    }
    if (!this.maxValue) {
      this.maxValue = Math.max(
        ...this.seriesData.flatMap((s) => s.axes.map((a) => a.value))
      );
    }
  }

  render() {
    const elements = [];
    const bounds = this._plotBounds();
    const title = this._renderTitle();
    if (title) elements.push(title);

    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    const radius = Math.min(bounds.width, bounds.height) / 2 - 30;
    const angleStep = (Math.PI * 2) / this.axes.length;

    if (this.showGrid) {
      for (let level = 1; level <= this.gridLevels; level++) {
        const r = (level / this.gridLevels) * radius;
        const gridPoints = [];
        for (let i = 0; i < this.axes.length; i++) {
          const angle = i * angleStep - Math.PI / 2;
          gridPoints.push({
            x: cx + Math.cos(angle) * r,
            y: cy + Math.sin(angle) * r,
          });
        }
        gridPoints.push(gridPoints[0]);
        elements.push({
          type: 'polyline',
          points: gridPoints,
          stroke: '#ddd',
          strokeWidth: 1,
          fill: 'none',
        });
      }

      for (let i = 0; i < this.axes.length; i++) {
        const angle = i * angleStep - Math.PI / 2;
        elements.push({
          type: 'line',
          x1: cx, y1: cy,
          x2: cx + Math.cos(angle) * radius,
          y2: cy + Math.sin(angle) * radius,
          stroke: '#ddd', strokeWidth: 1,
        });
      }
    }

    if (this.showLabels) {
      for (let i = 0; i < this.axes.length; i++) {
        const angle = i * angleStep - Math.PI / 2;
        const lx = cx + Math.cos(angle) * (radius + 16);
        const ly = cy + Math.sin(angle) * (radius + 16);
        elements.push({
          type: 'text',
          x: lx, y: ly,
          text: this.axes[i],
          anchor: 'middle',
          baseline: 'middle',
          fontSize: 11,
          fill: '#333',
        });
      }
    }

    for (let s = 0; s < this.seriesData.length; s++) {
      const series = this.seriesData[s];
      const color = this.colorScale.getColor(s);
      const points = series.axes.map((a, i) => {
        const angle = i * angleStep - Math.PI / 2;
        const r = (a.value / this.maxValue) * radius;
        return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
      });
      points.push(points[0]);

      if (this.filled) {
        elements.push({
          type: 'polygon',
          points,
          fill: color,
          opacity: this.fillOpacity,
          stroke: color,
          strokeWidth: 2,
        });
      } else {
        elements.push({
          type: 'polyline',
          points,
          stroke: color,
          strokeWidth: 2,
          fill: 'none',
        });
      }

      for (const p of points.slice(0, -1)) {
        elements.push({
          type: 'circle',
          cx: p.x, cy: p.y, r: 4,
          fill: color,
          stroke: '#fff',
          strokeWidth: 2,
        });
      }

      this.legend.addItem({ id: `radar_${s}`, label: series.label || `Series ${s + 1}`, color });
    }

    elements.push(this.legend.render(bounds));
    return { type: 'RadarChart', elements, bounds };
  }

  getTooltip(position) {
    const bounds = this._plotBounds();
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    const dx = position.x - cx;
    const dy = position.y - cy;
    let angle = Math.atan2(dy, dx) + Math.PI / 2;
    if (angle < 0) angle += Math.PI * 2;
    const angleStep = (Math.PI * 2) / this.axes.length;
    const axisIdx = Math.round(angle / angleStep) % this.axes.length;
    const values = this.seriesData.map((s) => ({
      series: s.label,
      axis: this.axes[axisIdx],
      value: s.axes[axisIdx]?.value,
    }));
    return this.tooltip.show(values, position);
  }

  animate(config = {}) {
    return this.animation.tween({
      from: { scale: 0 },
      to: { scale: 1 },
      duration: config.duration || 800,
      easing: 'easeOutCubic',
    });
  }

  serialize() {
    return { ...super.serialize(), filled: this.filled, fillOpacity: this.fillOpacity, gridLevels: this.gridLevels, maxValue: this.maxValue };
  }

  deserialize(state) {
    super.deserialize(state);
    this.filled = state.filled !== undefined ? state.filled : this.filled;
    this.fillOpacity = state.fillOpacity || this.fillOpacity;
    this.gridLevels = state.gridLevels || this.gridLevels;
    this.maxValue = state.maxValue || this.maxValue;
    return this;
  }
}

// ============================================================================
// Section 20: CandlestickChart
// ============================================================================

export class CandlestickChart extends BaseChart {
  constructor(config = {}) {
    super(config);
    this.upColor = config.upColor || '#26a69a';
    this.downColor = config.downColor || '#ef5350';
    this.wickWidth = config.wickWidth || 1;
    this.bodyWidth = config.bodyWidth || 0.6;
    this.showVolume = config.showVolume || false;
    this.volumeHeight = config.volumeHeight || 0.2;
    this.showMA = config.showMA || [];
    this.maColors = config.maColors || ['#ff9800', '#2196f3', '#9c27b0'];
    this.xScale = null;
    this.yScale = null;
  }

  _processData() {
    if (!this.data || this.data.length === 0) return;
    const allPrices = this.data.flatMap((d) => [d.open, d.high, d.low, d.close]);
    this.xScale = new BandScale({
      domain: this.data.map((_, i) => i),
      range: [0, this._plotWidth],
      paddingInner: 0.2,
    });

    const mainHeight = this.showVolume ? this._plotHeight * (1 - this.volumeHeight) : this._plotHeight;
    this.yScale = new LinearScale({
      domain: Statistics.extent(allPrices),
      range: [mainHeight, 0],
    }).nice();

    if (this.showVolume) {
      const volumes = this.data.map((d) => d.volume || 0);
      this.volumeScale = new LinearScale({
        domain: [0, Statistics.max(volumes)],
        range: [this._plotHeight, mainHeight + 10],
      });
    }
  }

  render() {
    const elements = [];
    const bounds = this._plotBounds();
    const title = this._renderTitle();
    if (title) elements.push(title);

    for (let i = 0; i < this.data.length; i++) {
      const d = this.data[i];
      const x = bounds.x + this.xScale.scale(i);
      const bw = this.xScale.bandwidth();
      const isUp = d.close >= d.open;
      const color = isUp ? this.upColor : this.downColor;
      const bodyTop = bounds.y + this.yScale.scale(Math.max(d.open, d.close));
      const bodyBottom = bounds.y + this.yScale.scale(Math.min(d.open, d.close));
      const highY = bounds.y + this.yScale.scale(d.high);
      const lowY = bounds.y + this.yScale.scale(d.low);
      const bodyHeight = Math.max(1, bodyBottom - bodyTop);
      const bodyW = bw * this.bodyWidth;
      const bodyX = x + (bw - bodyW) / 2;
      const wickX = x + bw / 2;

      elements.push({
        type: 'line',
        x1: wickX, y1: highY,
        x2: wickX, y2: lowY,
        stroke: color,
        strokeWidth: this.wickWidth,
      });
      elements.push({
        type: 'rect',
        x: bodyX, y: bodyTop,
        width: bodyW, height: bodyHeight,
        fill: isUp ? color : color,
        stroke: color,
        strokeWidth: 1,
        data: d,
      });

      if (this.showVolume && d.volume !== undefined) {
        const volY = bounds.y + this.volumeScale.scale(d.volume);
        const volH = bounds.y + this._plotHeight - volY;
        elements.push({
          type: 'rect',
          x: bodyX, y: volY,
          width: bodyW, height: volH,
          fill: color,
          opacity: 0.3,
        });
      }
    }

    for (let m = 0; m < this.showMA.length; m++) {
      const period = this.showMA[m];
      const closes = this.data.map((d) => d.close);
      const ma = Statistics.movingAverage(closes, period);
      const maPoints = ma.map((v, i) => ({
        x: bounds.x + this.xScale.scale(i) + this.xScale.bandwidth() / 2,
        y: bounds.y + this.yScale.scale(v),
      }));
      elements.push({
        type: 'polyline',
        points: maPoints,
        stroke: this.maColors[m % this.maColors.length],
        strokeWidth: 1.5,
        fill: 'none',
      });
      this.legend.addItem({
        id: `ma_${period}`,
        label: `MA(${period})`,
        color: this.maColors[m % this.maColors.length],
      });
    }

    const xAxis = new Axis({ position: 'bottom', scale: this.xScale, tickCount: 10 });
    const yAxis = new Axis({ position: 'left', scale: this.yScale });
    elements.push(xAxis.render({ x: bounds.x, y: bounds.y + bounds.height }, this._plotWidth));
    elements.push(yAxis.render({ x: bounds.x, y: bounds.y }, this._plotHeight));
    elements.push(this.legend.render(bounds));

    return { type: 'CandlestickChart', elements, bounds };
  }

  getTooltip(position) {
    const bounds = this._plotBounds();
    for (let i = 0; i < this.data.length; i++) {
      const x = bounds.x + this.xScale.scale(i);
      const bw = this.xScale.bandwidth();
      if (position.x >= x && position.x <= x + bw) {
        const d = this.data[i];
        return this.tooltip.show({
          label: d.date || `Bar ${i}`,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
          volume: d.volume,
        }, position);
      }
    }
    return this.tooltip.hide();
  }

  animate(config = {}) {
    return this.animation.tween({
      from: { clipWidth: 0 },
      to: { clipWidth: this._plotWidth },
      duration: config.duration || 1000,
      easing: 'easeOut',
    });
  }

  serialize() {
    return { ...super.serialize(), upColor: this.upColor, downColor: this.downColor, showVolume: this.showVolume, showMA: this.showMA };
  }

  deserialize(state) {
    super.deserialize(state);
    this.upColor = state.upColor || this.upColor;
    this.downColor = state.downColor || this.downColor;
    this.showVolume = state.showVolume || this.showVolume;
    this.showMA = state.showMA || this.showMA;
    return this;
  }
}

// ============================================================================
// Section 21: BoxPlot
// ============================================================================

export class BoxPlot extends BaseChart {
  constructor(config = {}) {
    super(config);
    this.violinMode = config.violinMode || false;
    this.showOutliers = config.showOutliers !== false;
    this.showMean = config.showMean || false;
    this.whiskerType = config.whiskerType || 'tukey';
    this.jitter = config.jitter || false;
    this.boxWidth = config.boxWidth || 0.6;
    this.categories = [];
    this.boxData = [];
    this.xScale = null;
    this.yScale = null;
  }

  _processData() {
    if (!this.data || this.data.length === 0) return;
    const groups = DataTransform.groupBy(this.data, 'category');
    this.categories = Object.keys(groups);
    this.boxData = this.categories.map((cat) => {
      const values = groups[cat].map((d) => d.value || d.y || 0);
      const sorted = values.slice().sort((a, b) => a - b);
      const q = Statistics.quartiles(sorted);
      const iqrVal = q.q3 - q.q1;
      const whiskerLow = this.whiskerType === 'tukey'
        ? Math.max(q.q1 - 1.5 * iqrVal, Statistics.min(sorted))
        : Statistics.min(sorted);
      const whiskerHigh = this.whiskerType === 'tukey'
        ? Math.min(q.q3 + 1.5 * iqrVal, Statistics.max(sorted))
        : Statistics.max(sorted);
      const outliers = sorted.filter((v) => v < whiskerLow || v > whiskerHigh);
      return {
        category: cat,
        min: whiskerLow,
        q1: q.q1,
        median: q.q2,
        q3: q.q3,
        max: whiskerHigh,
        mean: Statistics.mean(sorted),
        outliers,
        values: sorted,
      };
    });

    this.xScale = new BandScale({
      domain: this.categories,
      range: [0, this._plotWidth],
      paddingInner: 0.3,
      paddingOuter: 0.2,
    });

    const allValues = this.boxData.flatMap((b) => [b.min, b.max, ...b.outliers]);
    this.yScale = new LinearScale({
      domain: Statistics.extent(allValues),
      range: [this._plotHeight, 0],
    }).nice();
  }

  render() {
    const elements = [];
    const bounds = this._plotBounds();
    const title = this._renderTitle();
    if (title) elements.push(title);

    for (let i = 0; i < this.boxData.length; i++) {
      const box = this.boxData[i];
      const x = bounds.x + this.xScale.scale(box.category);
      const bw = this.xScale.bandwidth();
      const boxW = bw * this.boxWidth;
      const boxX = x + (bw - boxW) / 2;
      const centerX = x + bw / 2;

      if (this.violinMode) {
        this._renderViolin(elements, box, centerX, boxW, bounds);
      }

      const q1Y = bounds.y + this.yScale.scale(box.q1);
      const q3Y = bounds.y + this.yScale.scale(box.q3);
      const medianY = bounds.y + this.yScale.scale(box.median);
      const minY = bounds.y + this.yScale.scale(box.min);
      const maxY = bounds.y + this.yScale.scale(box.max);

      elements.push({
        type: 'line',
        x1: centerX, y1: maxY,
        x2: centerX, y2: q3Y,
        stroke: '#333', strokeWidth: 1,
      });
      elements.push({
        type: 'line',
        x1: centerX, y1: q1Y,
        x2: centerX, y2: minY,
        stroke: '#333', strokeWidth: 1,
      });

      elements.push({
        type: 'line',
        x1: boxX + boxW * 0.25, y1: maxY,
        x2: boxX + boxW * 0.75, y2: maxY,
        stroke: '#333', strokeWidth: 1,
      });
      elements.push({
        type: 'line',
        x1: boxX + boxW * 0.25, y1: minY,
        x2: boxX + boxW * 0.75, y2: minY,
        stroke: '#333', strokeWidth: 1,
      });

      const color = this.colorScale.getColor(i);
      elements.push({
        type: 'rect',
        x: boxX, y: q3Y,
        width: boxW, height: q1Y - q3Y,
        fill: color,
        stroke: '#333',
        strokeWidth: 1,
        opacity: this.violinMode ? 0.7 : 1,
        data: box,
      });

      elements.push({
        type: 'line',
        x1: boxX, y1: medianY,
        x2: boxX + boxW, y2: medianY,
        stroke: '#333', strokeWidth: 2,
      });

      if (this.showMean) {
        const meanY = bounds.y + this.yScale.scale(box.mean);
        elements.push({
          type: 'circle',
          cx: centerX, cy: meanY, r: 4,
          fill: '#e74c3c',
          stroke: '#fff',
          strokeWidth: 1,
        });
      }

      if (this.showOutliers) {
        for (const outlier of box.outliers) {
          const oy = bounds.y + this.yScale.scale(outlier);
          const ox = this.jitter ? centerX + (Math.random() - 0.5) * boxW * 0.5 : centerX;
          elements.push({
            type: 'circle',
            cx: ox, cy: oy, r: 3,
            fill: 'none',
            stroke: '#333',
            strokeWidth: 1,
          });
        }
      }
    }

    const xAxis = new Axis({ position: 'bottom', scale: this.xScale });
    const yAxis = new Axis({ position: 'left', scale: this.yScale });
    elements.push(xAxis.render({ x: bounds.x, y: bounds.y + bounds.height }, this._plotWidth));
    elements.push(yAxis.render({ x: bounds.x, y: bounds.y }, this._plotHeight));

    return { type: 'BoxPlot', elements, bounds };
  }

  _renderViolin(elements, box, centerX, boxW, bounds) {
    const bandwidth = (box.max - box.min) / 20 || 1;
    const densityPoints = [];
    for (let v = box.min; v <= box.max; v += bandwidth) {
      let density = 0;
      for (const val of box.values) {
        const z = (v - val) / bandwidth;
        density += Math.exp(-0.5 * z * z) / (bandwidth * Math.sqrt(2 * Math.PI));
      }
      densityPoints.push({ value: v, density });
    }
    const maxDensity = Math.max(...densityPoints.map((p) => p.density));
    const halfWidth = boxW / 2;
    const leftPoints = densityPoints.map((p) => ({
      x: centerX - (p.density / maxDensity) * halfWidth,
      y: bounds.y + this.yScale.scale(p.value),
    }));
    const rightPoints = densityPoints.map((p) => ({
      x: centerX + (p.density / maxDensity) * halfWidth,
      y: bounds.y + this.yScale.scale(p.value),
    })).reverse();
    elements.push({
      type: 'polygon',
      points: [...leftPoints, ...rightPoints],
      fill: '#ddd',
      opacity: 0.5,
      stroke: '#999',
      strokeWidth: 1,
    });
  }

  getTooltip(position) {
    const bounds = this._plotBounds();
    for (const box of this.boxData) {
      const x = bounds.x + this.xScale.scale(box.category);
      const bw = this.xScale.bandwidth();
      if (position.x >= x && position.x <= x + bw) {
        return this.tooltip.show({
          category: box.category,
          min: box.min.toFixed(2),
          q1: box.q1.toFixed(2),
          median: box.median.toFixed(2),
          q3: box.q3.toFixed(2),
          max: box.max.toFixed(2),
          mean: box.mean.toFixed(2),
        }, position);
      }
    }
    return this.tooltip.hide();
  }

  animate(config = {}) {
    return this.animation.tween({
      from: { scaleY: 0 },
      to: { scaleY: 1 },
      duration: config.duration || 800,
      easing: 'easeOutCubic',
    });
  }

  serialize() {
    return { ...super.serialize(), violinMode: this.violinMode, showOutliers: this.showOutliers, showMean: this.showMean };
  }

  deserialize(state) {
    super.deserialize(state);
    this.violinMode = state.violinMode || this.violinMode;
    this.showOutliers = state.showOutliers !== undefined ? state.showOutliers : this.showOutliers;
    this.showMean = state.showMean || this.showMean;
    return this;
  }
}

// ============================================================================
// Section 22: GaugeChart
// ============================================================================

export class GaugeChart extends BaseChart {
  constructor(config = {}) {
    super(config);
    this.mode = config.mode || 'radial';
    this.minValue = config.minValue || 0;
    this.maxValue = config.maxValue || 100;
    this.value = config.value || 0;
    this.thresholds = config.thresholds || [
      { value: 33, color: '#2ecc71', label: 'Low' },
      { value: 66, color: '#f39c12', label: 'Medium' },
      { value: 100, color: '#e74c3c', label: 'High' },
    ];
    this.startAngle = config.startAngle || -Math.PI * 0.75;
    this.endAngle = config.endAngle || Math.PI * 0.75;
    this.thickness = config.thickness || 20;
    this.showValue = config.showValue !== false;
    this.showLabels = config.showLabels !== false;
    this.needle = config.needle !== false;
    this.animated = config.animated || false;
  }

  setData(data) {
    if (typeof data === 'number') {
      this.value = data;
    } else if (data && data.value !== undefined) {
      this.value = data.value;
      if (data.thresholds) this.thresholds = data.thresholds;
    }
    return this;
  }

  _processData() {}

  render() {
    if (this.mode === 'linear') return this._renderLinear();
    return this._renderRadial();
  }

  _renderRadial() {
    const elements = [];
    const bounds = this._plotBounds();
    const title = this._renderTitle();
    if (title) elements.push(title);

    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height * 0.65;
    const outerRadius = Math.min(bounds.width, bounds.height) / 2 - 10;
    const innerRadius = outerRadius - this.thickness;
    const angleRange = this.endAngle - this.startAngle;

    let prevThresholdVal = this.minValue;
    for (const threshold of this.thresholds) {
      const startFrac = (prevThresholdVal - this.minValue) / (this.maxValue - this.minValue);
      const endFrac = (threshold.value - this.minValue) / (this.maxValue - this.minValue);
      const sAngle = this.startAngle + startFrac * angleRange;
      const eAngle = this.startAngle + endFrac * angleRange;
      elements.push({
        type: 'arc',
        cx, cy,
        innerRadius,
        outerRadius,
        startAngle: sAngle,
        endAngle: eAngle,
        fill: threshold.color,
        opacity: 0.3,
      });
      prevThresholdVal = threshold.value;
    }

    const valueFrac = Math.max(0, Math.min(1, (this.value - this.minValue) / (this.maxValue - this.minValue)));
    const valueAngle = this.startAngle + valueFrac * angleRange;

    let valueColor = this.thresholds[this.thresholds.length - 1].color;
    for (const t of this.thresholds) {
      if (this.value <= t.value) {
        valueColor = t.color;
        break;
      }
    }

    elements.push({
      type: 'arc',
      cx, cy,
      innerRadius,
      outerRadius,
      startAngle: this.startAngle,
      endAngle: valueAngle,
      fill: valueColor,
    });

    if (this.needle) {
      const needleLength = outerRadius - 5;
      const nx = cx + Math.cos(valueAngle) * needleLength;
      const ny = cy + Math.sin(valueAngle) * needleLength;
      elements.push({
        type: 'line',
        x1: cx, y1: cy,
        x2: nx, y2: ny,
        stroke: '#333',
        strokeWidth: 3,
      });
      elements.push({
        type: 'circle',
        cx, cy, r: 6,
        fill: '#333',
      });
    }

    if (this.showValue) {
      elements.push({
        type: 'text',
        x: cx, y: cy + 20,
        text: typeof this.value === 'number' ? this.value.toFixed(1) : String(this.value),
        anchor: 'middle',
        baseline: 'middle',
        fontSize: 28,
        fontWeight: 'bold',
        fill: valueColor,
      });
    }

    if (this.showLabels) {
      elements.push({
        type: 'text',
        x: cx + Math.cos(this.startAngle) * (outerRadius + 14),
        y: cy + Math.sin(this.startAngle) * (outerRadius + 14),
        text: String(this.minValue),
        anchor: 'middle',
        fontSize: 10,
        fill: '#666',
      });
      elements.push({
        type: 'text',
        x: cx + Math.cos(this.endAngle) * (outerRadius + 14),
        y: cy + Math.sin(this.endAngle) * (outerRadius + 14),
        text: String(this.maxValue),
        anchor: 'middle',
        fontSize: 10,
        fill: '#666',
      });
    }

    return { type: 'GaugeChart', elements, bounds };
  }

  _renderLinear() {
    const elements = [];
    const bounds = this._plotBounds();
    const title = this._renderTitle();
    if (title) elements.push(title);

    const barY = bounds.y + bounds.height / 2 - this.thickness / 2;
    const barWidth = bounds.width;

    let prevVal = this.minValue;
    for (const threshold of this.thresholds) {
      const startFrac = (prevVal - this.minValue) / (this.maxValue - this.minValue);
      const endFrac = (threshold.value - this.minValue) / (this.maxValue - this.minValue);
      elements.push({
        type: 'rect',
        x: bounds.x + startFrac * barWidth,
        y: barY,
        width: (endFrac - startFrac) * barWidth,
        height: this.thickness,
        fill: threshold.color,
        opacity: 0.3,
      });
      prevVal = threshold.value;
    }

    const valueFrac = Math.max(0, Math.min(1, (this.value - this.minValue) / (this.maxValue - this.minValue)));
    let valueColor = this.thresholds[this.thresholds.length - 1].color;
    for (const t of this.thresholds) {
      if (this.value <= t.value) {
        valueColor = t.color;
        break;
      }
    }

    elements.push({
      type: 'rect',
      x: bounds.x,
      y: barY,
      width: valueFrac * barWidth,
      height: this.thickness,
      fill: valueColor,
      rx: 3,
    });

    if (this.needle) {
      const nx = bounds.x + valueFrac * barWidth;
      elements.push({
        type: 'polygon',
        points: [
          { x: nx, y: barY - 8 },
          { x: nx - 5, y: barY - 16 },
          { x: nx + 5, y: barY - 16 },
        ],
        fill: '#333',
      });
    }

    if (this.showValue) {
      elements.push({
        type: 'text',
        x: bounds.x + barWidth / 2,
        y: barY + this.thickness + 25,
        text: String(this.value.toFixed(1)),
        anchor: 'middle',
        fontSize: 22,
        fontWeight: 'bold',
        fill: valueColor,
      });
    }

    return { type: 'GaugeChart', elements, bounds };
  }

  getTooltip(position) {
    return this.tooltip.show({
      value: this.value,
      min: this.minValue,
      max: this.maxValue,
      percentage: (((this.value - this.minValue) / (this.maxValue - this.minValue)) * 100).toFixed(1) + '%',
    }, position);
  }

  animate(config = {}) {
    const targetValue = this.value;
    return this.animation.tween({
      from: { value: this.minValue },
      to: { value: targetValue },
      duration: config.duration || 1200,
      easing: config.easing || 'easeOutCubic',
      onUpdate: (values) => {
        this.value = values.value;
      },
    });
  }

  serialize() {
    return { ...super.serialize(), value: this.value, minValue: this.minValue, maxValue: this.maxValue, thresholds: this.thresholds, mode: this.mode };
  }

  deserialize(state) {
    super.deserialize(state);
    this.value = state.value !== undefined ? state.value : this.value;
    this.minValue = state.minValue !== undefined ? state.minValue : this.minValue;
    this.maxValue = state.maxValue !== undefined ? state.maxValue : this.maxValue;
    this.thresholds = state.thresholds || this.thresholds;
    this.mode = state.mode || this.mode;
    return this;
  }
}

// ============================================================================
// Section 23: SankeyDiagram
// ============================================================================

export class SankeyDiagram extends BaseChart {
  constructor(config = {}) {
    super(config);
    this.nodeWidth = config.nodeWidth || 20;
    this.nodePadding = config.nodePadding || 10;
    this.nodeColors = config.nodeColors || null;
    this.linkOpacity = config.linkOpacity || 0.4;
    this.showLabels = config.showLabels !== false;
    this.showValues = config.showValues || false;
    this.layoutEngine = new SankeyLayout({
      width: this._plotWidth,
      height: this._plotHeight,
      nodeWidth: this.nodeWidth,
      nodePadding: this.nodePadding,
    });
    this.layoutResult = null;
  }

  _processData() {
    if (!this.data) return;
    this.layoutEngine.width = this._plotWidth;
    this.layoutEngine.height = this._plotHeight;
    this.layoutResult = this.layoutEngine.layout(this.data);
  }

  render() {
    if (!this.layoutResult) return { type: 'SankeyDiagram', elements: [], bounds: this._plotBounds() };
    const elements = [];
    const bounds = this._plotBounds();
    const title = this._renderTitle();
    if (title) elements.push(title);

    const { nodes, links } = this.layoutResult;

    for (const link of links) {
      if (!link.source || !link.target) continue;
      const sx = bounds.x + link.source.x + link.source.width;
      const sy = bounds.y + link.y0;
      const tx = bounds.x + link.target.x;
      const ty = bounds.y + link.y1;
      const midX = (sx + tx) / 2;
      elements.push({
        type: 'path',
        d: `M${sx},${sy} C${midX},${sy} ${midX},${ty} ${tx},${ty}`,
        stroke: this.colorScale.getColor(nodes.indexOf(link.source)),
        strokeWidth: Math.max(1, link.width),
        fill: 'none',
        opacity: this.linkOpacity,
        data: { source: link.source.id, target: link.target.id, value: link.value },
      });
    }

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const color = this.nodeColors ? this.nodeColors[i % this.nodeColors.length] : this.colorScale.getColor(i);
      elements.push({
        type: 'rect',
        x: bounds.x + node.x,
        y: bounds.y + node.y,
        width: node.width,
        height: Math.max(1, node.height),
        fill: color,
        stroke: '#333',
        strokeWidth: 0.5,
        data: node,
      });

      if (this.showLabels) {
        const isLeft = node.depth < (Math.max(...nodes.map((n) => n.depth)) / 2);
        const labelX = isLeft
          ? bounds.x + node.x + node.width + 6
          : bounds.x + node.x - 6;
        elements.push({
          type: 'text',
          x: labelX,
          y: bounds.y + node.y + Math.max(1, node.height) / 2,
          text: this.showValues ? `${node.id || node.name} (${node.value})` : (node.id || node.name || ''),
          anchor: isLeft ? 'start' : 'end',
          baseline: 'middle',
          fontSize: 11,
          fill: '#333',
        });
      }
    }

    return { type: 'SankeyDiagram', elements, bounds };
  }

  getTooltip(position) {
    if (!this.layoutResult) return this.tooltip.hide();
    const bounds = this._plotBounds();
    for (const node of this.layoutResult.nodes) {
      const nx = bounds.x + node.x;
      const ny = bounds.y + node.y;
      if (position.x >= nx && position.x <= nx + node.width &&
          position.y >= ny && position.y <= ny + node.height) {
        return this.tooltip.show({
          label: node.id || node.name,
          value: node.value,
          incoming: node.targetLinks.length,
          outgoing: node.sourceLinks.length,
        }, position);
      }
    }
    return this.tooltip.hide();
  }

  animate(config = {}) {
    return this.animation.tween({
      from: { opacity: 0 },
      to: { opacity: 1 },
      duration: config.duration || 1000,
      easing: 'easeInOut',
    });
  }

  serialize() {
    return { ...super.serialize(), nodeWidth: this.nodeWidth, nodePadding: this.nodePadding, linkOpacity: this.linkOpacity };
  }

  deserialize(state) {
    super.deserialize(state);
    this.nodeWidth = state.nodeWidth || this.nodeWidth;
    this.nodePadding = state.nodePadding || this.nodePadding;
    this.linkOpacity = state.linkOpacity || this.linkOpacity;
    return this;
  }
}

// ============================================================================
// Section 24: NetworkGraph
// ============================================================================

export class NetworkGraph extends BaseChart {
  constructor(config = {}) {
    super(config);
    this.nodeSize = config.nodeSize || 8;
    this.nodeColorField = config.nodeColorField || null;
    this.edgeWidth = config.edgeWidth || 1;
    this.showLabels = config.showLabels || false;
    this.directed = config.directed || false;
    this.iterations = config.iterations || 100;
    this.gravity = config.gravity || 0.1;
    this.repulsion = config.repulsion || 500;
    this.forceLayout = new ForceLayout({
      width: this._plotWidth,
      height: this._plotHeight,
      gravity: this.gravity,
      repulsion: this.repulsion,
      iterations: this.iterations,
    });
    this.layoutNodes = [];
    this.layoutEdges = [];
  }

  _processData() {
    if (!this.data) return;
    this.forceLayout.width = this._plotWidth;
    this.forceLayout.height = this._plotHeight;
    this.forceLayout.setNodes(this.data.nodes || []);
    this.forceLayout.setEdges(this.data.edges || []);
    this.layoutNodes = this.forceLayout.simulate();
    this.layoutEdges = this.forceLayout.edges;
  }

  render() {
    const elements = [];
    const bounds = this._plotBounds();
    const title = this._renderTitle();
    if (title) elements.push(title);

    const nodeMap = {};
    for (const node of this.layoutNodes) nodeMap[node.id] = node;

    for (const edge of this.layoutEdges) {
      const source = nodeMap[edge.source];
      const target = nodeMap[edge.target];
      if (!source || !target) continue;
      elements.push({
        type: 'line',
        x1: bounds.x + source.x,
        y1: bounds.y + source.y,
        x2: bounds.x + target.x,
        y2: bounds.y + target.y,
        stroke: '#999',
        strokeWidth: this.edgeWidth * (edge.weight || 1),
        opacity: 0.6,
        data: edge,
      });

      if (this.directed) {
        const angle = Math.atan2(target.y - source.y, target.x - source.x);
        const hs = 8;
        const tx = bounds.x + target.x - Math.cos(angle) * this.nodeSize;
        const ty = bounds.y + target.y - Math.sin(angle) * this.nodeSize;
        elements.push({
          type: 'polygon',
          points: [
            { x: tx, y: ty },
            { x: tx - hs * Math.cos(angle - Math.PI / 6), y: ty - hs * Math.sin(angle - Math.PI / 6) },
            { x: tx - hs * Math.cos(angle + Math.PI / 6), y: ty - hs * Math.sin(angle + Math.PI / 6) },
          ],
          fill: '#999',
        });
      }
    }

    for (let i = 0; i < this.layoutNodes.length; i++) {
      const node = this.layoutNodes[i];
      const color = this.nodeColorField
        ? this.colorScale.getColor(node[this.nodeColorField] || i)
        : this.colorScale.getColor(i);
      const size = node.size || this.nodeSize;
      elements.push({
        type: 'circle',
        cx: bounds.x + node.x,
        cy: bounds.y + node.y,
        r: size,
        fill: color,
        stroke: '#fff',
        strokeWidth: 2,
        data: node,
      });

      if (this.showLabels) {
        elements.push({
          type: 'text',
          x: bounds.x + node.x,
          y: bounds.y + node.y + size + 12,
          text: node.label || node.id || '',
          anchor: 'middle',
          fontSize: 10,
          fill: '#333',
        });
      }
    }

    return { type: 'NetworkGraph', elements, bounds };
  }

  getTooltip(position) {
    const bounds = this._plotBounds();
    for (const node of this.layoutNodes) {
      const nx = bounds.x + node.x;
      const ny = bounds.y + node.y;
      const dist = Math.sqrt((position.x - nx) ** 2 + (position.y - ny) ** 2);
      if (dist <= (node.size || this.nodeSize) + 4) {
        return this.tooltip.show({
          label: node.label || node.id,
          connections: node.sourceLinks?.length || 0,
        }, position);
      }
    }
    return this.tooltip.hide();
  }

  animate(config = {}) {
    return this.animation.tween({
      from: { progress: 0 },
      to: { progress: 1 },
      duration: config.duration || 2000,
      easing: 'easeOutCubic',
    });
  }

  serialize() {
    return { ...super.serialize(), nodeSize: this.nodeSize, directed: this.directed, iterations: this.iterations };
  }

  deserialize(state) {
    super.deserialize(state);
    this.nodeSize = state.nodeSize || this.nodeSize;
    this.directed = state.directed || this.directed;
    this.iterations = state.iterations || this.iterations;
    return this;
  }
}

// ============================================================================
// Section 25: SunburstChart
// ============================================================================

export class SunburstChart extends BaseChart {
  constructor(config = {}) {
    super(config);
    this.innerRadius = config.innerRadius || 30;
    this.showLabels = config.showLabels !== false;
    this.highlightPath = config.highlightPath || false;
    this.drillDownEnabled = config.drillDownEnabled || false;
    this.currentRoot = null;
    this.drillStack = [];
    this.layoutEngine = null;
    this.layoutResult = null;
  }

  _processData() {
    if (!this.data) return;
    const radius = Math.min(this._plotWidth, this._plotHeight) / 2 - 20;
    this.layoutEngine = new SunburstLayout({
      centerX: this._plotWidth / 2,
      centerY: this._plotHeight / 2,
      innerRadius: this.innerRadius,
      outerRadius: radius,
    });
    this.currentRoot = this.data;
    this.layoutResult = this.layoutEngine.layout(this.currentRoot);
  }

  render() {
    if (!this.layoutResult) return { type: 'SunburstChart', elements: [], bounds: this._plotBounds() };
    const elements = [];
    const bounds = this._plotBounds();
    const title = this._renderTitle();
    if (title) elements.push(title);
    this._renderNode(this.layoutResult, elements, bounds, 0);
    return { type: 'SunburstChart', elements, bounds };
  }

  _renderNode(node, elements, bounds, colorIdx) {
    if (node.endAngle - node.startAngle < 0.001) return;
    const color = this.colorScale.getColor(colorIdx);
    elements.push({
      type: 'arc',
      cx: bounds.x + node.centerX,
      cy: bounds.y + node.centerY,
      innerRadius: node.innerRadius,
      outerRadius: node.outerRadius,
      startAngle: node.startAngle,
      endAngle: node.endAngle,
      fill: color,
      stroke: '#fff',
      strokeWidth: 1,
      opacity: 0.85,
      data: { name: node.name || node.label, value: node.value, depth: node.depth },
    });

    if (this.showLabels && (node.endAngle - node.startAngle) > 0.15 && node.outerRadius - node.innerRadius > 20) {
      const labelAngle = node.midAngle;
      const labelR = node.midRadius;
      const lx = bounds.x + node.centerX + Math.cos(labelAngle) * labelR;
      const ly = bounds.y + node.centerY + Math.sin(labelAngle) * labelR;
      const rotate = (labelAngle * 180 / Math.PI);
      const flipRotate = rotate > 90 && rotate < 270 ? rotate + 180 : rotate;
      elements.push({
        type: 'text',
        x: lx, y: ly,
        text: node.name || node.label || '',
        anchor: 'middle',
        baseline: 'middle',
        fontSize: 9,
        fill: '#333',
        rotate: flipRotate,
      });
    }

    if (node.children) {
      for (let i = 0; i < node.children.length; i++) {
        this._renderNode(node.children[i], elements, bounds, colorIdx + i + 1);
      }
    }
  }

  drillDown(nodeName) {
    if (!this.drillDownEnabled || !this.currentRoot) return;
    const target = this._findNodeByName(this.currentRoot, nodeName);
    if (target && target.children) {
      this.drillStack.push(this.currentRoot);
      this.currentRoot = target;
      const radius = Math.min(this._plotWidth, this._plotHeight) / 2 - 20;
      this.layoutEngine = new SunburstLayout({
        centerX: this._plotWidth / 2,
        centerY: this._plotHeight / 2,
        innerRadius: this.innerRadius,
        outerRadius: radius,
      });
      this.layoutResult = this.layoutEngine.layout(this.currentRoot);
    }
  }

  drillUp() {
    if (this.drillStack.length === 0) return;
    this.currentRoot = this.drillStack.pop();
    this.layoutResult = this.layoutEngine.layout(this.currentRoot);
  }

  _findNodeByName(node, name) {
    if ((node.name || node.label) === name) return node;
    if (node.children) {
      for (const child of node.children) {
        const found = this._findNodeByName(child, name);
        if (found) return found;
      }
    }
    return null;
  }

  getTooltip(position) {
    const bounds = this._plotBounds();
    const cx = bounds.x + this._plotWidth / 2;
    const cy = bounds.y + this._plotHeight / 2;
    const dx = position.x - cx;
    const dy = position.y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    let angle = Math.atan2(dy, dx);
    if (angle < 0) angle += Math.PI * 2;

    const found = this._findArcAt(this.layoutResult, dist, angle);
    if (found) {
      return this.tooltip.show({
        label: found.name || found.label,
        value: found.value,
        depth: found.depth,
      }, position);
    }
    return this.tooltip.hide();
  }

  _findArcAt(node, dist, angle) {
    if (dist >= node.innerRadius && dist <= node.outerRadius) {
      let start = node.startAngle;
      let end = node.endAngle;
      if (start < 0) start += Math.PI * 2;
      if (end < 0) end += Math.PI * 2;
      if (angle >= start && angle <= end) return node;
    }
    if (node.children) {
      for (const child of node.children) {
        const found = this._findArcAt(child, dist, angle);
        if (found) return found;
      }
    }
    return null;
  }

  animate(config = {}) {
    return this.animation.tween({
      from: { endAngle: 0 },
      to: { endAngle: Math.PI * 2 },
      duration: config.duration || 1200,
      easing: 'easeOutCubic',
    });
  }

  serialize() {
    return { ...super.serialize(), innerRadius: this.innerRadius, drillDownEnabled: this.drillDownEnabled };
  }

  deserialize(state) {
    super.deserialize(state);
    this.innerRadius = state.innerRadius || this.innerRadius;
    this.drillDownEnabled = state.drillDownEnabled || this.drillDownEnabled;
    return this;
  }
}

// ============================================================================
// Section 26: WaterfallChart
// ============================================================================

export class WaterfallChart extends BaseChart {
  constructor(config = {}) {
    super(config);
    this.positiveColor = config.positiveColor || '#2ecc71';
    this.negativeColor = config.negativeColor || '#e74c3c';
    this.totalColor = config.totalColor || '#3498db';
    this.showConnectors = config.showConnectors !== false;
    this.showLabels = config.showLabels || false;
    this.processedData = [];
    this.xScale = null;
    this.yScale = null;
  }

  _processData() {
    if (!this.data || this.data.length === 0) return;
    let runningTotal = 0;
    this.processedData = this.data.map((d) => {
      const value = d.value || d.y || 0;
      const isTotal = d.isTotal || false;
      const start = isTotal ? 0 : runningTotal;
      const end = isTotal ? value : runningTotal + value;
      if (!isTotal) runningTotal += value;
      else runningTotal = value;
      return {
        label: d.label || d.category || d.x || '',
        value,
        start,
        end,
        isTotal,
        isPositive: value >= 0,
      };
    });

    const allValues = this.processedData.flatMap((d) => [d.start, d.end]);
    const categories = this.processedData.map((d) => d.label);

    this.xScale = new BandScale({
      domain: categories,
      range: [0, this._plotWidth],
      paddingInner: 0.3,
      paddingOuter: 0.1,
    });
    this.yScale = new LinearScale({
      domain: [Math.min(0, Statistics.min(allValues)), Statistics.max(allValues)],
      range: [this._plotHeight, 0],
    }).nice();
  }

  render() {
    const elements = [];
    const bounds = this._plotBounds();
    const title = this._renderTitle();
    if (title) elements.push(title);

    for (let i = 0; i < this.processedData.length; i++) {
      const d = this.processedData[i];
      const x = bounds.x + this.xScale.scale(d.label);
      const bw = this.xScale.bandwidth();
      const y0 = bounds.y + this.yScale.scale(Math.max(d.start, d.end));
      const y1 = bounds.y + this.yScale.scale(Math.min(d.start, d.end));
      const h = Math.max(1, y1 - y0);
      const color = d.isTotal ? this.totalColor : (d.isPositive ? this.positiveColor : this.negativeColor);

      elements.push({
        type: 'rect',
        x, y: y0,
        width: bw, height: h,
        fill: color,
        stroke: 'none',
        data: d,
      });

      if (this.showLabels) {
        elements.push({
          type: 'text',
          x: x + bw / 2,
          y: y0 - 6,
          text: d.value >= 0 ? `+${d.value}` : String(d.value),
          anchor: 'middle',
          fontSize: 10,
          fill: color,
          fontWeight: 'bold',
        });
      }

      if (this.showConnectors && i < this.processedData.length - 1) {
        const nextX = bounds.x + this.xScale.scale(this.processedData[i + 1].label);
        const connY = bounds.y + this.yScale.scale(d.end);
        elements.push({
          type: 'line',
          x1: x + bw, y1: connY,
          x2: nextX, y2: connY,
          stroke: '#999',
          strokeWidth: 1,
          dashArray: '3,3',
        });
      }
    }

    const xAxis = new Axis({ position: 'bottom', scale: this.xScale });
    const yAxis = new Axis({ position: 'left', scale: this.yScale });
    elements.push(xAxis.render({ x: bounds.x, y: bounds.y + bounds.height }, this._plotWidth));
    elements.push(yAxis.render({ x: bounds.x, y: bounds.y }, this._plotHeight));

    return { type: 'WaterfallChart', elements, bounds };
  }

  getTooltip(position) {
    const bounds = this._plotBounds();
    for (const d of this.processedData) {
      const x = bounds.x + this.xScale.scale(d.label);
      const bw = this.xScale.bandwidth();
      if (position.x >= x && position.x <= x + bw) {
        return this.tooltip.show({
          label: d.label,
          value: d.value,
          runningTotal: d.end,
          type: d.isTotal ? 'Total' : (d.isPositive ? 'Increase' : 'Decrease'),
        }, position);
      }
    }
    return this.tooltip.hide();
  }

  animate(config = {}) {
    const items = this.processedData.map(() => ({
      from: { height: 0 },
      to: { height: 1 },
    }));
    return this.animation.stagger(items, {
      duration: config.duration || 600,
      staggerDelay: 60,
      easing: 'easeOutCubic',
    });
  }

  serialize() {
    return { ...super.serialize(), positiveColor: this.positiveColor, negativeColor: this.negativeColor, showConnectors: this.showConnectors };
  }

  deserialize(state) {
    super.deserialize(state);
    this.positiveColor = state.positiveColor || this.positiveColor;
    this.negativeColor = state.negativeColor || this.negativeColor;
    this.showConnectors = state.showConnectors !== undefined ? state.showConnectors : this.showConnectors;
    return this;
  }
}

// ============================================================================
// Section 27: FunnelChart
// ============================================================================

export class FunnelChart extends BaseChart {
  constructor(config = {}) {
    super(config);
    this.showLabels = config.showLabels !== false;
    this.showPercentages = config.showPercentages !== false;
    this.showConversion = config.showConversion || false;
    this.orientation = config.orientation || 'vertical';
    this.curved = config.curved || false;
    this.neckWidth = config.neckWidth || 0.3;
    this.processedData = [];
  }

  _processData() {
    if (!this.data || this.data.length === 0) return;
    const maxValue = Math.max(...this.data.map((d) => d.value || d.y || 0));
    this.processedData = this.data.map((d, i) => {
      const value = d.value || d.y || 0;
      const prevValue = i > 0 ? (this.data[i - 1].value || this.data[i - 1].y || 0) : value;
      return {
        label: d.label || d.category || d.name || `Stage ${i + 1}`,
        value,
        percentage: maxValue > 0 ? (value / maxValue) * 100 : 0,
        conversion: prevValue > 0 ? (value / prevValue) * 100 : 100,
        widthRatio: maxValue > 0 ? value / maxValue : 0,
        index: i,
      };
    });
  }

  render() {
    const elements = [];
    const bounds = this._plotBounds();
    const title = this._renderTitle();
    if (title) elements.push(title);

    const n = this.processedData.length;
    if (n === 0) return { type: 'FunnelChart', elements, bounds };

    const isVertical = this.orientation === 'vertical';
    const segmentSize = isVertical ? bounds.height / n : bounds.width / n;

    for (let i = 0; i < n; i++) {
      const d = this.processedData[i];
      const nextD = i < n - 1 ? this.processedData[i + 1] : null;
      const color = this.colorScale.getColor(i);

      if (isVertical) {
        const topWidth = d.widthRatio * bounds.width;
        const bottomWidth = nextD ? nextD.widthRatio * bounds.width : topWidth * this.neckWidth;
        const y = bounds.y + i * segmentSize;
        const cx = bounds.x + bounds.width / 2;

        const points = [
          { x: cx - topWidth / 2, y },
          { x: cx + topWidth / 2, y },
          { x: cx + bottomWidth / 2, y: y + segmentSize },
          { x: cx - bottomWidth / 2, y: y + segmentSize },
        ];
        elements.push({
          type: 'polygon',
          points,
          fill: color,
          stroke: '#fff',
          strokeWidth: 2,
          opacity: 0.85,
          data: d,
        });

        if (this.showLabels) {
          elements.push({
            type: 'text',
            x: cx,
            y: y + segmentSize / 2 - (this.showPercentages ? 8 : 0),
            text: d.label,
            anchor: 'middle',
            baseline: 'middle',
            fontSize: 12,
            fontWeight: 'bold',
            fill: '#fff',
          });
        }
        if (this.showPercentages) {
          elements.push({
            type: 'text',
            x: cx,
            y: y + segmentSize / 2 + 10,
            text: `${d.percentage.toFixed(1)}%`,
            anchor: 'middle',
            baseline: 'middle',
            fontSize: 11,
            fill: 'rgba(255,255,255,0.8)',
          });
        }
        if (this.showConversion && i > 0) {
          elements.push({
            type: 'text',
            x: bounds.x + bounds.width + 10,
            y: y + segmentSize / 2,
            text: `↓ ${d.conversion.toFixed(1)}%`,
            anchor: 'start',
            fontSize: 10,
            fill: '#666',
          });
        }
      } else {
        const leftHeight = d.widthRatio * bounds.height;
        const rightHeight = nextD ? nextD.widthRatio * bounds.height : leftHeight * this.neckWidth;
        const x = bounds.x + i * segmentSize;
        const cy = bounds.y + bounds.height / 2;

        const points = [
          { x, y: cy - leftHeight / 2 },
          { x: x + segmentSize, y: cy - rightHeight / 2 },
          { x: x + segmentSize, y: cy + rightHeight / 2 },
          { x, y: cy + leftHeight / 2 },
        ];
        elements.push({
          type: 'polygon',
          points,
          fill: color,
          stroke: '#fff',
          strokeWidth: 2,
          opacity: 0.85,
          data: d,
        });

        if (this.showLabels) {
          elements.push({
            type: 'text',
            x: x + segmentSize / 2,
            y: cy,
            text: `${d.label} (${d.percentage.toFixed(1)}%)`,
            anchor: 'middle',
            baseline: 'middle',
            fontSize: 11,
            fill: '#fff',
          });
        }
      }
    }

    return { type: 'FunnelChart', elements, bounds };
  }

  getTooltip(position) {
    const bounds = this._plotBounds();
    const n = this.processedData.length;
    const isVertical = this.orientation === 'vertical';
    const segmentSize = isVertical ? bounds.height / n : bounds.width / n;

    for (let i = 0; i < n; i++) {
      const d = this.processedData[i];
      const segStart = isVertical ? bounds.y + i * segmentSize : bounds.x + i * segmentSize;
      const mousePos = isVertical ? position.y : position.x;
      if (mousePos >= segStart && mousePos <= segStart + segmentSize) {
        return this.tooltip.show({
          label: d.label,
          value: d.value,
          percentage: `${d.percentage.toFixed(1)}%`,
          conversion: i > 0 ? `${d.conversion.toFixed(1)}%` : 'N/A',
        }, position);
      }
    }
    return this.tooltip.hide();
  }

  animate(config = {}) {
    const items = this.processedData.map(() => ({
      from: { scale: 0, opacity: 0 },
      to: { scale: 1, opacity: 0.85 },
    }));
    return this.animation.stagger(items, {
      duration: config.duration || 500,
      staggerDelay: 100,
      easing: 'easeOutCubic',
    });
  }

  serialize() {
    return { ...super.serialize(), orientation: this.orientation, showConversion: this.showConversion, neckWidth: this.neckWidth };
  }

  deserialize(state) {
    super.deserialize(state);
    this.orientation = state.orientation || this.orientation;
    this.showConversion = state.showConversion || this.showConversion;
    this.neckWidth = state.neckWidth || this.neckWidth;
    return this;
  }
}

// ============================================================================
// Section 28: Chart Factory & Utilities
// ============================================================================

export class ChartFactory {
  static create(type, config = {}) {
    const charts = {
      line: LineChart,
      bar: BarChart,
      pie: PieChart,
      scatter: ScatterPlot,
      histogram: Histogram,
      heatmap: HeatMap,
      treemap: TreeMap,
      radar: RadarChart,
      candlestick: CandlestickChart,
      boxplot: BoxPlot,
      gauge: GaugeChart,
      sankey: SankeyDiagram,
      network: NetworkGraph,
      sunburst: SunburstChart,
      waterfall: WaterfallChart,
      funnel: FunnelChart,
    };
    const ChartClass = charts[type.toLowerCase()];
    if (!ChartClass) {
      throw new Error(`Unknown chart type: ${type}. Available: ${Object.keys(charts).join(', ')}`);
    }
    return new ChartClass(config);
  }

  static types() {
    return [
      'line', 'bar', 'pie', 'scatter', 'histogram', 'heatmap',
      'treemap', 'radar', 'candlestick', 'boxplot', 'gauge',
      'sankey', 'network', 'sunburst', 'waterfall', 'funnel',
    ];
  }
}

export function createScale(type, config = {}) {
  const scales = {
    linear: LinearScale,
    log: LogScale,
    power: PowerScale,
    time: TimeScale,
    ordinal: OrdinalScale,
    band: BandScale,
  };
  const ScaleClass = scales[type.toLowerCase()];
  if (!ScaleClass) throw new Error(`Unknown scale type: ${type}`);
  return new ScaleClass(config);
}

export function createChart(type, config = {}) {
  return ChartFactory.create(type, config);
}

export function computeLayout(type, data, config = {}) {
  switch (type.toLowerCase()) {
    case 'force': {
      const layout = new ForceLayout(config);
      layout.setNodes(data.nodes || []);
      layout.setEdges(data.edges || []);
      return layout.simulate();
    }
    case 'treemap': {
      const layout = new TreemapLayout(config);
      return layout.layout(data, config.bounds || { x: 0, y: 0, width: 800, height: 600 });
    }
    case 'sunburst': {
      const layout = new SunburstLayout(config);
      return layout.layout(data);
    }
    case 'sankey': {
      const layout = new SankeyLayout(config);
      return layout.layout(data);
    }
    default:
      throw new Error(`Unknown layout type: ${type}`);
  }
}

export function generateColorPalette(name, count = 10) {
  const cs = new ColorScale('categorical', { palette: name });
  const colors = [];
  for (let i = 0; i < count; i++) {
    colors.push(cs.getColor(i));
  }
  return colors;
}

export function interpolateColors(color1, color2, steps = 10) {
  const cs = new ColorScale();
  const result = [];
  for (let i = 0; i < steps; i++) {
    result.push(cs._interpolateColor(color1, color2, i / (steps - 1)));
  }
  return result;
}

export function formatNumber(value, options = {}) {
  const { decimals = 2, prefix = '', suffix = '', thousands = true } = options;
  let formatted = value.toFixed(decimals);
  if (thousands) {
    const parts = formatted.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    formatted = parts.join('.');
  }
  return `${prefix}${formatted}${suffix}`;
}

export function formatDate(date, format = 'YYYY-MM-DD') {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds);
}

export function debounce(fn, delay = 100) {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

export function throttle(fn, limit = 100) {
  let lastCall = 0;
  return function (...args) {
    const now = Date.now();
    if (now - lastCall >= limit) {
      lastCall = now;
      return fn.apply(this, args);
    }
  };
}

export function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function pointInRect(px, py, rx, ry, rw, rh) {
  return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}

export function pointDistance(x1, y1, x2, y2) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

export function degToRad(degrees) {
  return degrees * Math.PI / 180;
}

export function radToDeg(radians) {
  return radians * 180 / Math.PI;
}

export function polarToCartesian(cx, cy, radius, angleRad) {
  return {
    x: cx + Math.cos(angleRad) * radius,
    y: cy + Math.sin(angleRad) * radius,
  };
}

export function cartesianToPolar(cx, cy, x, y) {
  const dx = x - cx;
  const dy = y - cy;
  return {
    radius: Math.sqrt(dx * dx + dy * dy),
    angle: Math.atan2(dy, dx),
  };
}
