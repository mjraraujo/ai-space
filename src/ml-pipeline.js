/**
 * ml-pipeline.js — Machine learning pipeline utilities.
 * Preprocessing, feature engineering, models (linear/logistic/kNN/decision tree/naive bayes),
 * cross-validation, hyperparameter tuning, metrics, pipelines.
 */

// ─── Math helpers ─────────────────────────────────────────────────────────────
const sum = a => a.reduce((s, v) => s + v, 0);
const mean = a => sum(a) / a.length;
const variance = a => { const m = mean(a); return mean(a.map(v => (v - m) ** 2)); };
const std = a => Math.sqrt(variance(a));
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const sigmoid = x => 1 / (1 + Math.exp(-x));
const softmax = arr => { const max = Math.max(...arr); const exps = arr.map(v => Math.exp(v - max)); const s = sum(exps); return exps.map(v => v / s); };
const relu = x => Math.max(0, x);
const tanh = x => Math.tanh(x);

// ─── Matrix operations ────────────────────────────────────────────────────────
function matMul(A, B) {
  const rows = A.length, cols = B[0].length, inner = B.length;
  return Array.from({ length: rows }, (_, i) =>
    Array.from({ length: cols }, (_, j) =>
      Array.from({ length: inner }, (_, k) => A[i][k] * B[k][j]).reduce((s, v) => s + v, 0)
    )
  );
}

function transpose(A) { return A[0].map((_, j) => A.map(row => row[j])); }
function matAdd(A, B) { return A.map((row, i) => row.map((v, j) => v + B[i][j])); }
function matScale(A, s) { return A.map(row => row.map(v => v * s)); }

// ─── Preprocessing ────────────────────────────────────────────────────────────
export class StandardScaler {
  fit(X) {
    const T = transpose(X);
    this.means = T.map(col => mean(col));
    this.stds = T.map(col => std(col) || 1);
    return this;
  }
  transform(X) {
    return X.map(row => row.map((v, j) => (v - this.means[j]) / this.stds[j]));
  }
  fitTransform(X) { return this.fit(X).transform(X); }
  inverseTransform(X) {
    return X.map(row => row.map((v, j) => v * this.stds[j] + this.means[j]));
  }
}

export class MinMaxScaler {
  constructor(featureRange = [0, 1]) { this.featureRange = featureRange; }
  fit(X) {
    const T = transpose(X);
    this.mins = T.map(col => Math.min(...col));
    this.maxs = T.map(col => Math.max(...col));
    return this;
  }
  transform(X) {
    const [lo, hi] = this.featureRange;
    return X.map(row => row.map((v, j) => {
      const range = this.maxs[j] - this.mins[j] || 1;
      return lo + ((v - this.mins[j]) / range) * (hi - lo);
    }));
  }
  fitTransform(X) { return this.fit(X).transform(X); }
}

export class LabelEncoder {
  fit(labels) {
    this.classes = [...new Set(labels)].sort();
    this._map = new Map(this.classes.map((c, i) => [c, i]));
    this._inv = new Map(this.classes.map((c, i) => [i, c]));
    return this;
  }
  transform(labels) { return labels.map(l => this._map.get(l) ?? -1); }
  inverseTransform(codes) { return codes.map(c => this._inv.get(c)); }
  fitTransform(labels) { return this.fit(labels).transform(labels); }
  get numClasses() { return this.classes?.length ?? 0; }
}

export class OneHotEncoder {
  fit(X) {
    this.categories = transpose(X).map(col => [...new Set(col)].sort());
    return this;
  }
  transform(X) {
    return X.map(row => row.flatMap((v, j) => this.categories[j].map(c => v === c ? 1 : 0)));
  }
  fitTransform(X) { return this.fit(X).transform(X); }
  get numFeatures() { return this.categories?.reduce((s, c) => s + c.length, 0) ?? 0; }
}

export class PolynomialFeatures {
  constructor(degree = 2) { this.degree = degree; }
  transform(X) {
    return X.map(row => {
      const features = [...row];
      for (let d = 2; d <= this.degree; d++) {
        for (let i = 0; i < row.length; i++) features.push(row[i] ** d);
        for (let i = 0; i < row.length; i++) for (let j = i; j < row.length; j++) features.push(row[i] * row[j]);
      }
      return features;
    });
  }
}

export class Imputer {
  constructor(strategy = 'mean') { this.strategy = strategy; }
  fit(X) {
    const T = transpose(X);
    this.fillValues = T.map(col => {
      const valid = col.filter(v => v !== null && v !== undefined && !isNaN(v));
      if (!valid.length) return 0;
      if (this.strategy === 'mean') return mean(valid);
      if (this.strategy === 'median') { const s = [...valid].sort((a,b)=>a-b); return s[Math.floor(s.length/2)]; }
      if (this.strategy === 'most_frequent') { const f = new Map(); for (const v of valid) f.set(v, (f.get(v)||0)+1); return [...f.entries()].sort((a,b)=>b[1]-a[1])[0][0]; }
      if (this.strategy === 'constant') return this.fillValue ?? 0;
      return 0;
    });
    return this;
  }
  transform(X) {
    return X.map(row => row.map((v, j) => (v === null || v === undefined || isNaN(v)) ? this.fillValues[j] : v));
  }
  fitTransform(X) { return this.fit(X).transform(X); }
}

// ─── Feature selection ────────────────────────────────────────────────────────
export class VarianceThreshold {
  constructor(threshold = 0) { this.threshold = threshold; }
  fit(X) {
    const T = transpose(X);
    this.support = T.map(col => variance(col) > this.threshold);
    return this;
  }
  transform(X) { return X.map(row => row.filter((_, j) => this.support[j])); }
  fitTransform(X) { return this.fit(X).transform(X); }
}

// ─── Train / test split ───────────────────────────────────────────────────────
export function trainTestSplit(X, y, testSize = 0.2, shuffle = true, seed = 42) {
  const indices = Array.from({ length: X.length }, (_, i) => i);
  if (shuffle) {
    let s = seed;
    for (let i = indices.length - 1; i > 0; i--) {
      s = (s * 1664525 + 1013904223) >>> 0;
      const j = s % (i + 1);
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
  }
  const n = Math.floor(X.length * (1 - testSize));
  const trainIdx = indices.slice(0, n);
  const testIdx = indices.slice(n);
  return {
    XTrain: trainIdx.map(i => X[i]),
    XTest: testIdx.map(i => X[i]),
    yTrain: trainIdx.map(i => y[i]),
    yTest: testIdx.map(i => y[i]),
  };
}

// ─── Metrics ──────────────────────────────────────────────────────────────────
export const metrics = {
  mse: (y, yHat) => mean(y.map((v, i) => (v - yHat[i]) ** 2)),
  rmse: (y, yHat) => Math.sqrt(metrics.mse(y, yHat)),
  mae: (y, yHat) => mean(y.map((v, i) => Math.abs(v - yHat[i]))),
  r2: (y, yHat) => {
    const m = mean(y);
    const ss_res = sum(y.map((v, i) => (v - yHat[i]) ** 2));
    const ss_tot = sum(y.map(v => (v - m) ** 2));
    return 1 - ss_res / ss_tot;
  },
  accuracy: (y, yHat) => y.filter((v, i) => v === yHat[i]).length / y.length,
  precision: (y, yHat, cls = 1) => {
    const tp = y.filter((v, i) => v === cls && yHat[i] === cls).length;
    const fp = y.filter((v, i) => v !== cls && yHat[i] === cls).length;
    return tp / (tp + fp) || 0;
  },
  recall: (y, yHat, cls = 1) => {
    const tp = y.filter((v, i) => v === cls && yHat[i] === cls).length;
    const fn = y.filter((v, i) => v === cls && yHat[i] !== cls).length;
    return tp / (tp + fn) || 0;
  },
  f1: (y, yHat, cls = 1) => {
    const p = metrics.precision(y, yHat, cls), r = metrics.recall(y, yHat, cls);
    return p + r ? 2 * p * r / (p + r) : 0;
  },
  confusionMatrix: (y, yHat, classes) => {
    const cls = classes ?? [...new Set([...y, ...yHat])].sort();
    const idx = new Map(cls.map((c, i) => [c, i]));
    const mat = Array.from({ length: cls.length }, () => new Array(cls.length).fill(0));
    for (let i = 0; i < y.length; i++) mat[idx.get(y[i])][idx.get(yHat[i])]++;
    return { matrix: mat, classes: cls };
  },
  logLoss: (y, probs) => -mean(y.map((v, i) => v === 1 ? Math.log(probs[i] + 1e-15) : Math.log(1 - probs[i] + 1e-15))),
};

// ─── Linear Regression ────────────────────────────────────────────────────────
export class LinearRegression {
  constructor(opts = {}) {
    this.lr = opts.lr ?? 0.01;
    this.epochs = opts.epochs ?? 1000;
    this.regularization = opts.regularization ?? 0;
    this.method = opts.method ?? 'gd'; // 'gd' or 'ols'
    this.weights = null;
    this.bias = 0;
    this.history = [];
  }

  fit(X, y) {
    const n = X.length, f = X[0].length;
    if (this.method === 'ols') {
      const Xb = X.map(row => [1, ...row]);
      const Xt = transpose(Xb);
      const XtX = matMul(Xt, Xb);
      for (let i = 0; i < XtX.length; i++) XtX[i][i] += this.regularization;
      const Xty = Xt.map(row => dot(row, y));
      this.weights = this._solve(XtX, Xty).slice(1);
      this.bias = this._solve(XtX, Xty)[0];
    } else {
      this.weights = new Array(f).fill(0);
      this.bias = 0;
      for (let epoch = 0; epoch < this.epochs; epoch++) {
        const preds = X.map(row => dot(row, this.weights) + this.bias);
        const errors = preds.map((p, i) => p - y[i]);
        const loss = mean(errors.map(e => e ** 2));
        this.history.push(loss);
        this.weights = this.weights.map((w, j) => w - this.lr * (mean(errors.map((e, i) => e * X[i][j])) + this.regularization * w));
        this.bias -= this.lr * mean(errors);
      }
    }
    return this;
  }

  _solve(A, b) {
    const n = A.length;
    const M = A.map((row, i) => [...row, b[i]]);
    for (let col = 0; col < n; col++) {
      let maxRow = col;
      for (let row = col + 1; row < n; row++) if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row;
      [M[col], M[maxRow]] = [M[maxRow], M[col]];
      for (let row = col + 1; row < n; row++) { const f = M[row][col] / M[col][col]; for (let k = col; k <= n; k++) M[row][k] -= f * M[col][k]; }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) { x[i] = M[i][n]; for (let j = i + 1; j < n; j++) x[i] -= M[i][j] * x[j]; x[i] /= M[i][i]; }
    return x;
  }

  predict(X) { return X.map(row => dot(row, this.weights) + this.bias); }
  score(X, y) { return metrics.r2(y, this.predict(X)); }
  coef() { return this.weights; }
  intercept() { return this.bias; }
}

// ─── Logistic Regression ─────────────────────────────────────────────────────
export class LogisticRegression {
  constructor(opts = {}) {
    this.lr = opts.lr ?? 0.1;
    this.epochs = opts.epochs ?? 1000;
    this.regularization = opts.regularization ?? 0.01;
    this.threshold = opts.threshold ?? 0.5;
    this.weights = null;
    this.bias = 0;
    this.history = [];
  }

  fit(X, y) {
    const n = X.length, f = X[0].length;
    this.weights = new Array(f).fill(0);
    this.bias = 0;
    for (let epoch = 0; epoch < this.epochs; epoch++) {
      const probs = X.map(row => sigmoid(dot(row, this.weights) + this.bias));
      const errors = probs.map((p, i) => p - y[i]);
      const loss = -mean(y.map((v, i) => v * Math.log(probs[i] + 1e-15) + (1-v) * Math.log(1 - probs[i] + 1e-15)));
      this.history.push(loss);
      this.weights = this.weights.map((w, j) => w - this.lr * (mean(errors.map((e, i) => e * X[i][j])) + this.regularization * w / n));
      this.bias -= this.lr * mean(errors);
    }
    return this;
  }

  predictProba(X) { return X.map(row => sigmoid(dot(row, this.weights) + this.bias)); }
  predict(X) { return this.predictProba(X).map(p => p >= this.threshold ? 1 : 0); }
  score(X, y) { return metrics.accuracy(y, this.predict(X)); }
}

// ─── k-NN ─────────────────────────────────────────────────────────────────────
export class KNeighborsClassifier {
  constructor(k = 5, metric = 'euclidean') { this.k = k; this.metric = metric; }
  fit(X, y) { this.X = X; this.y = y; return this; }
  _distance(a, b) {
    if (this.metric === 'manhattan') return sum(a.map((v, i) => Math.abs(v - b[i])));
    if (this.metric === 'cosine') { const d1 = Math.sqrt(sum(a.map(v=>v**2))), d2 = Math.sqrt(sum(b.map(v=>v**2))); return 1 - dot(a, b) / (d1 * d2 + 1e-15); }
    return Math.sqrt(sum(a.map((v, i) => (v - b[i]) ** 2)));
  }
  predict(X) {
    return X.map(row => {
      const dists = this.X.map((x, i) => ({ d: this._distance(row, x), label: this.y[i] }));
      dists.sort((a, b) => a.d - b.d);
      const neighbors = dists.slice(0, this.k);
      const freq = new Map();
      for (const { label } of neighbors) freq.set(label, (freq.get(label) || 0) + 1);
      return [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
    });
  }
  score(X, y) { return metrics.accuracy(y, this.predict(X)); }
}

export class KNeighborsRegressor {
  constructor(k = 5) { this.k = k; }
  fit(X, y) { this.X = X; this.y = y; return this; }
  predict(X) {
    return X.map(row => {
      const dists = this.X.map((x, i) => ({ d: Math.sqrt(sum(x.map((v, j) => (v - row[j]) ** 2))), val: this.y[i] }));
      dists.sort((a, b) => a.d - b.d);
      return mean(dists.slice(0, this.k).map(d => d.val));
    });
  }
  score(X, y) { return metrics.r2(y, this.predict(X)); }
}

// ─── Decision Tree ────────────────────────────────────────────────────────────
export class DecisionTree {
  constructor(opts = {}) {
    this.maxDepth = opts.maxDepth ?? 10;
    this.minSamples = opts.minSamples ?? 2;
    this.criterion = opts.criterion ?? 'gini';
    this._root = null;
  }

  _gini(groups, classes) {
    const total = groups.reduce((s, g) => s + g.length, 0);
    let gini = 0;
    for (const g of groups) {
      if (!g.length) continue;
      let score = 1;
      for (const c of classes) { const p = g.filter(([, l]) => l === c).length / g.length; score -= p * p; }
      gini += score * g.length / total;
    }
    return gini;
  }

  _entropy(groups) {
    const total = groups.reduce((s, g) => s + g.length, 0);
    let entropy = 0;
    for (const g of groups) {
      if (!g.length) continue;
      const p = g.length / total;
      const ent = -([...new Set(g.map(([, l]) => l))]).reduce((s, c) => { const q = g.filter(([, l]) => l === c).length / g.length; return s + (q > 0 ? q * Math.log2(q) : 0); }, 0);
      entropy += p * ent;
    }
    return entropy;
  }

  _split(X, y, feature, threshold) {
    const left = [], right = [];
    for (let i = 0; i < X.length; i++) {
      if (X[i][feature] <= threshold) left.push([X[i], y[i]]);
      else right.push([X[i], y[i]]);
    }
    return [left, right];
  }

  _bestSplit(X, y) {
    const classes = [...new Set(y)];
    let bestScore = Infinity, bestFeature = null, bestThreshold = null, bestGroups = null;
    for (let f = 0; f < X[0].length; f++) {
      const values = [...new Set(X.map(row => row[f]))];
      for (const v of values) {
        const groups = this._split(X, y, f, v);
        const score = this.criterion === 'entropy' ? this._entropy(groups) : this._gini(groups, classes);
        if (score < bestScore) { bestScore = score; bestFeature = f; bestThreshold = v; bestGroups = groups; }
      }
    }
    return { feature: bestFeature, threshold: bestThreshold, groups: bestGroups, score: bestScore };
  }

  _buildNode(X, y, depth) {
    if (!X.length || depth >= this.maxDepth || X.length < this.minSamples || new Set(y).size === 1) {
      const freq = new Map();
      for (const v of y) freq.set(v, (freq.get(v) || 0) + 1);
      return { leaf: true, prediction: [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] };
    }
    const { feature, threshold, groups } = this._bestSplit(X, y);
    if (!groups) return { leaf: true, prediction: y[0] };
    const [left, right] = groups;
    return {
      leaf: false, feature, threshold,
      left: this._buildNode(left.map(([x]) => x), left.map(([, l]) => l), depth + 1),
      right: this._buildNode(right.map(([x]) => x), right.map(([, l]) => l), depth + 1),
    };
  }

  fit(X, y) { this._root = this._buildNode(X, y, 0); return this; }

  _predict1(node, row) {
    if (node.leaf) return node.prediction;
    return row[node.feature] <= node.threshold ? this._predict1(node.left, row) : this._predict1(node.right, row);
  }

  predict(X) { return X.map(row => this._predict1(this._root, row)); }
  score(X, y) { return metrics.accuracy(y, this.predict(X)); }
}

// ─── Naive Bayes ──────────────────────────────────────────────────────────────
export class GaussianNaiveBayes {
  fit(X, y) {
    this.classes = [...new Set(y)];
    this.classPriors = {};
    this.classMeans = {};
    this.classVars = {};
    for (const c of this.classes) {
      const rows = X.filter((_, i) => y[i] === c);
      this.classPriors[c] = rows.length / X.length;
      const T = transpose(rows);
      this.classMeans[c] = T.map(col => mean(col));
      this.classVars[c] = T.map(col => variance(col) + 1e-9);
    }
    return this;
  }
  _logLikelihood(row, c) {
    return sum(row.map((v, j) => {
      const m = this.classMeans[c][j], vr = this.classVars[c][j];
      return -0.5 * Math.log(2 * Math.PI * vr) - ((v - m) ** 2) / (2 * vr);
    }));
  }
  predictLogProba(X) {
    return X.map(row => {
      const scores = {};
      for (const c of this.classes) scores[c] = Math.log(this.classPriors[c]) + this._logLikelihood(row, c);
      return scores;
    });
  }
  predict(X) {
    return this.predictLogProba(X).map(scores => Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0]);
  }
  score(X, y) { return metrics.accuracy(y, this.predict(X)); }
}

// ─── Cross-validation ─────────────────────────────────────────────────────────
export function crossValidate(model, X, y, cv = 5, scoring = 'accuracy') {
  const n = X.length;
  const foldSize = Math.floor(n / cv);
  const scores = [];
  for (let fold = 0; fold < cv; fold++) {
    const testStart = fold * foldSize;
    const testEnd = fold === cv - 1 ? n : testStart + foldSize;
    const testIdx = Array.from({ length: testEnd - testStart }, (_, i) => testStart + i);
    const trainIdx = Array.from({ length: n }, (_, i) => i).filter(i => !testIdx.includes(i));
    const XTrain = trainIdx.map(i => X[i]), yTrain = trainIdx.map(i => y[i]);
    const XTest = testIdx.map(i => X[i]), yTest = testIdx.map(i => y[i]);
    const m = Object.create(Object.getPrototypeOf(model));
    Object.assign(m, model);
    m.fit(XTrain, yTrain);
    const preds = m.predict(XTest);
    scores.push(scoring === 'r2' ? metrics.r2(yTest, preds) : metrics.accuracy(yTest, preds));
  }
  return { scores, mean: mean(scores), std: std(scores) };
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────
export class Pipeline {
  constructor(steps) { this.steps = steps; }

  fit(X, y) {
    let data = X;
    for (let i = 0; i < this.steps.length - 1; i++) {
      const [, step] = this.steps[i];
      data = step.fitTransform ? step.fitTransform(data) : step.fit(data).transform(data);
    }
    const [, lastStep] = this.steps[this.steps.length - 1];
    lastStep.fit(data, y);
    return this;
  }

  predict(X) {
    let data = X;
    for (let i = 0; i < this.steps.length - 1; i++) {
      const [, step] = this.steps[i];
      data = step.transform(data);
    }
    const [, lastStep] = this.steps[this.steps.length - 1];
    return lastStep.predict(data);
  }

  score(X, y) { return metrics.accuracy(y, this.predict(X)); }
}

export function makePipeline(...steps) {
  return new Pipeline(steps.map((s, i) => [`step_${i}`, s]));
}

// ─── k-Means clustering ───────────────────────────────────────────────────────
export class KMeans {
  constructor(k = 3, maxIter = 100, seed = 42) {
    this.k = k; this.maxIter = maxIter; this.seed = seed;
    this.centroids = null; this.labels = null; this.inertia = 0;
  }

  fit(X) {
    let s = this.seed;
    const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xFFFFFFFF; };
    this.centroids = Array.from({ length: this.k }, () => X[Math.floor(rand() * X.length)]);
    for (let iter = 0; iter < this.maxIter; iter++) {
      this.labels = X.map(row => {
        const dists = this.centroids.map(c => sum(c.map((v, j) => (v - row[j]) ** 2)));
        return dists.indexOf(Math.min(...dists));
      });
      const newCentroids = Array.from({ length: this.k }, (_, k) => {
        const pts = X.filter((_, i) => this.labels[i] === k);
        if (!pts.length) return this.centroids[k];
        return transpose(pts).map(col => mean(col));
      });
      const moved = newCentroids.some((c, k) => sum(c.map((v, j) => (v - this.centroids[k][j]) ** 2)) > 1e-10);
      this.centroids = newCentroids;
      if (!moved) break;
    }
    this.inertia = sum(X.map((row, i) => sum(row.map((v, j) => (v - this.centroids[this.labels[i]][j]) ** 2))));
    return this;
  }

  predict(X) {
    return X.map(row => {
      const dists = this.centroids.map(c => sum(c.map((v, j) => (v - row[j]) ** 2)));
      return dists.indexOf(Math.min(...dists));
    });
  }

  fitPredict(X) { this.fit(X); return this.labels; }
}

// ─── PCA ──────────────────────────────────────────────────────────────────────
export class PCA {
  constructor(nComponents = 2) { this.nComponents = nComponents; }

  fit(X) {
    const n = X.length;
    this.mean = transpose(X).map(col => mean(col));
    const centered = X.map(row => row.map((v, j) => v - this.mean[j]));
    const cov = matMul(transpose(centered), centered).map(row => row.map(v => v / n));
    // Power iteration for top components (simplified)
    const d = cov.length;
    this.components = [];
    let M = cov.map(row => [...row]);
    for (let c = 0; c < Math.min(this.nComponents, d); c++) {
      let vec = Array.from({ length: d }, (_, i) => i === c ? 1 : 0);
      for (let iter = 0; iter < 100; iter++) {
        const newVec = M.map(row => dot(row, vec));
        const norm = Math.sqrt(sum(newVec.map(v => v * v))) || 1;
        vec = newVec.map(v => v / norm);
      }
      this.components.push(vec);
      // Deflate
      const vvt = vec.map(vi => vec.map(vj => vi * vj));
      const eigenval = dot(M.map(row => dot(row, vec)), vec);
      M = M.map((row, i) => row.map((v, j) => v - eigenval * vvt[i][j]));
    }
    return this;
  }

  transform(X) {
    const centered = X.map(row => row.map((v, j) => v - this.mean[j]));
    return centered.map(row => this.components.map(comp => dot(row, comp)));
  }

  fitTransform(X) { return this.fit(X).transform(X); }

  inverseTransform(X) {
    return X.map(row => {
      const reconstructed = new Array(this.mean.length).fill(0);
      for (let c = 0; c < row.length; c++) {
        for (let j = 0; j < this.mean.length; j++) reconstructed[j] += row[c] * this.components[c][j];
      }
      return reconstructed.map((v, j) => v + this.mean[j]);
    });
  }

  get explainedVarianceRatio() {
    const totalVar = sum(this.components.map(comp => dot(comp, comp)));
    return this.components.map(comp => dot(comp, comp) / (totalVar || 1));
  }
}

export default {
  StandardScaler, MinMaxScaler, LabelEncoder, OneHotEncoder, PolynomialFeatures, Imputer, VarianceThreshold,
  LinearRegression, LogisticRegression, KNeighborsClassifier, KNeighborsRegressor, DecisionTree, GaussianNaiveBayes,
  KMeans, PCA, Pipeline, makePipeline,
  trainTestSplit, crossValidate, metrics,
};
