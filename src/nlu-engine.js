/* ============================================================================
 *  nlu-engine.js — Natural Language Understanding engine
 *  Intent parsing, entity extraction, sentiment analysis, dialog management
 * ========================================================================== */

// ─── Tokenizer ──────────────────────────────────────────────────────────────
export class Tokenizer {
  constructor(opts = {}) {
    this.caseSensitive = opts.caseSensitive ?? false;
    this.stemming = opts.stemming ?? false;
    this.stopWords = new Set(opts.stopWords ?? DEFAULT_STOP_WORDS);
    this.keepPunctuation = opts.keepPunctuation ?? false;
    this.minLength = opts.minLength ?? 1;
    this.maxTokens = opts.maxTokens ?? 1000;
  }

  tokenize(text) {
    if (!text || typeof text !== 'string') return [];
    let normalized = text.trim();
    if (!this.caseSensitive) normalized = normalized.toLowerCase();

    let tokens;
    if (this.keepPunctuation) {
      tokens = normalized.match(/\S+/g) || [];
    } else {
      tokens = normalized.replace(/[^\p{L}\p{N}\s'-]/gu, ' ').split(/\s+/).filter(Boolean);
    }

    tokens = tokens.filter(t => t.length >= this.minLength);

    if (this.stemming) {
      tokens = tokens.map(t => simpleStem(t));
    }

    return tokens.slice(0, this.maxTokens);
  }

  removeStopWords(tokens) {
    return tokens.filter(t => !this.stopWords.has(t.toLowerCase()));
  }

  getNgrams(tokens, n) {
    const ngrams = [];
    for (let i = 0; i <= tokens.length - n; i++) {
      ngrams.push(tokens.slice(i, i + n).join(' '));
    }
    return ngrams;
  }

  getCharNgrams(text, n) {
    const ngrams = [];
    const clean = text.toLowerCase().replace(/\s+/g, ' ');
    for (let i = 0; i <= clean.length - n; i++) {
      ngrams.push(clean.substring(i, i + n));
    }
    return ngrams;
  }
}

function simpleStem(word) {
  // Very simplified Porter-like stemmer
  let s = word;
  if (s.endsWith('ies') && s.length > 4) s = s.slice(0, -3) + 'y';
  else if (s.endsWith('es') && s.length > 3) s = s.slice(0, -2);
  else if (s.endsWith('s') && !s.endsWith('ss') && s.length > 3) s = s.slice(0, -1);
  if (s.endsWith('ing') && s.length > 5) s = s.slice(0, -3);
  else if (s.endsWith('ed') && s.length > 4) s = s.slice(0, -2);
  if (s.endsWith('ly') && s.length > 4) s = s.slice(0, -2);
  if (s.endsWith('tion') && s.length > 5) s = s.slice(0, -4) + 't';
  if (s.endsWith('ment') && s.length > 5) s = s.slice(0, -4);
  if (s.endsWith('ness') && s.length > 5) s = s.slice(0, -4);
  return s;
}

const DEFAULT_STOP_WORDS = [
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'shall', 'should', 'may', 'might', 'must', 'can', 'could', 'it',
  'its', 'this', 'that', 'these', 'those', 'i', 'me', 'my', 'mine',
  'we', 'us', 'our', 'you', 'your', 'he', 'him', 'his', 'she', 'her',
  'they', 'them', 'their', 'what', 'which', 'who', 'whom', 'where',
  'when', 'why', 'how', 'not', 'no', 'nor', 'so', 'if', 'then',
  'than', 'too', 'very', 'just', 'about', 'up', 'down', 'out', 'off'
];

// ─── TF-IDF ─────────────────────────────────────────────────────────────────
export class TfIdf {
  constructor() {
    this.documents = [];
    this.vocab = new Map();
    this.idf = new Map();
    this._dirty = true;
  }

  addDocument(tokens, metadata = {}) {
    const id = this.documents.length;
    const tf = new Map();
    for (const token of tokens) {
      tf.set(token, (tf.get(token) || 0) + 1);
      if (!this.vocab.has(token)) this.vocab.set(token, new Set());
      this.vocab.get(token).add(id);
    }

    // Normalize TF
    const maxTf = Math.max(...tf.values(), 1);
    for (const [k, v] of tf) tf.set(k, v / maxTf);

    this.documents.push({ id, tf, tokens, metadata, length: tokens.length });
    this._dirty = true;
    return id;
  }

  _computeIdf() {
    if (!this._dirty) return;
    const N = this.documents.length;
    this.idf.clear();
    for (const [term, docs] of this.vocab) {
      this.idf.set(term, Math.log(1 + N / (1 + docs.size)));
    }
    this._dirty = false;
  }

  getTfIdf(docIndex, term) {
    this._computeIdf();
    const doc = this.documents[docIndex];
    if (!doc) return 0;
    const tf = doc.tf.get(term) || 0;
    const idf = this.idf.get(term) || 0;
    return tf * idf;
  }

  getDocumentVector(docIndex) {
    this._computeIdf();
    const doc = this.documents[docIndex];
    if (!doc) return new Map();
    const vector = new Map();
    for (const [term, tf] of doc.tf) {
      vector.set(term, tf * (this.idf.get(term) || 0));
    }
    return vector;
  }

  search(queryTokens, topK = 5) {
    this._computeIdf();
    const queryTf = new Map();
    for (const t of queryTokens) queryTf.set(t, (queryTf.get(t) || 0) + 1);
    const maxQTf = Math.max(...queryTf.values(), 1);
    for (const [k, v] of queryTf) queryTf.set(k, v / maxQTf);

    const queryVector = new Map();
    for (const [term, tf] of queryTf) {
      queryVector.set(term, tf * (this.idf.get(term) || 0));
    }

    const scores = [];
    for (let i = 0; i < this.documents.length; i++) {
      const docVector = this.getDocumentVector(i);
      const score = cosineSimilarity(queryVector, docVector);
      if (score > 0) scores.push({ docIndex: i, score, metadata: this.documents[i].metadata });
    }

    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, topK);
  }

  getTopTerms(docIndex, topK = 10) {
    const vector = this.getDocumentVector(docIndex);
    const terms = Array.from(vector.entries());
    terms.sort((a, b) => b[1] - a[1]);
    return terms.slice(0, topK).map(([term, score]) => ({ term, score }));
  }
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (const [key, val] of a) {
    normA += val * val;
    const bVal = b.get(key) || 0;
    dot += val * bVal;
  }
  for (const [, val] of b) normB += val * val;
  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);
  if (normA === 0 || normB === 0) return 0;
  return dot / (normA * normB);
}

// ─── Intent Classifier ─────────────────────────────────────────────────────
export class IntentClassifier {
  constructor(opts = {}) {
    this.tokenizer = new Tokenizer(opts.tokenizer);
    this.tfidf = new TfIdf();
    this.intents = new Map();
    this.threshold = opts.threshold ?? 0.3;
    this._trained = false;
  }

  addIntent(name, examples, entities = []) {
    if (!this.intents.has(name)) {
      this.intents.set(name, { examples: [], entities, patterns: [] });
    }
    const intent = this.intents.get(name);
    intent.examples.push(...examples);
    intent.entities = [...new Set([...intent.entities, ...entities])];
    this._trained = false;
  }

  addPattern(intentName, pattern) {
    if (!this.intents.has(intentName)) {
      this.intents.set(intentName, { examples: [], entities: [], patterns: [] });
    }
    this.intents.get(intentName).patterns.push(
      typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern
    );
  }

  train() {
    this.tfidf = new TfIdf();
    for (const [name, intent] of this.intents) {
      for (const example of intent.examples) {
        const tokens = this.tokenizer.tokenize(example);
        const filtered = this.tokenizer.removeStopWords(tokens);
        this.tfidf.addDocument(filtered, { intent: name });
      }
    }
    this._trained = true;
  }

  classify(text) {
    if (!this._trained) this.train();

    // Check patterns first
    for (const [name, intent] of this.intents) {
      for (const pattern of intent.patterns) {
        if (pattern.test(text)) {
          return { intent: name, confidence: 0.95, method: 'pattern' };
        }
      }
    }

    // TF-IDF based classification
    const tokens = this.tokenizer.tokenize(text);
    const filtered = this.tokenizer.removeStopWords(tokens);
    const results = this.tfidf.search(filtered, 5);

    if (results.length === 0) return { intent: null, confidence: 0, method: 'tfidf' };

    // Aggregate scores by intent
    const intentScores = new Map();
    for (const result of results) {
      const intentName = result.metadata.intent;
      const current = intentScores.get(intentName) || { score: 0, count: 0 };
      current.score += result.score;
      current.count++;
      intentScores.set(intentName, current);
    }

    // Find best intent
    let bestIntent = null, bestScore = 0;
    for (const [name, data] of intentScores) {
      const avgScore = data.score / data.count;
      if (avgScore > bestScore) {
        bestScore = avgScore;
        bestIntent = name;
      }
    }

    if (bestScore < this.threshold) {
      return { intent: null, confidence: bestScore, method: 'tfidf' };
    }

    return {
      intent: bestIntent,
      confidence: Math.min(1, bestScore),
      method: 'tfidf',
      alternatives: Array.from(intentScores.entries())
        .filter(([n]) => n !== bestIntent)
        .map(([name, data]) => ({ intent: name, confidence: data.score / data.count }))
        .sort((a, b) => b.confidence - a.confidence)
    };
  }

  getIntents() { return Array.from(this.intents.keys()); }
}

// ─── Entity Extractor ───────────────────────────────────────────────────────
export class EntityExtractor {
  constructor() {
    this.extractors = new Map();
    this._setupBuiltins();
  }

  _setupBuiltins() {
    // Email
    this.addExtractor('email', text => {
      const matches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
      return (matches || []).map(m => ({ value: m, type: 'email' }));
    });

    // URL
    this.addExtractor('url', text => {
      const matches = text.match(/https?:\/\/[^\s<>"{}|\\^`[\]]+/g);
      return (matches || []).map(m => ({ value: m, type: 'url' }));
    });

    // Phone numbers
    this.addExtractor('phone', text => {
      const matches = text.match(/(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g);
      return (matches || []).map(m => ({ value: m.trim(), type: 'phone' }));
    });

    // Numbers
    this.addExtractor('number', text => {
      const matches = text.match(/-?\d+(?:\.\d+)?(?:\s*%)?/g);
      return (matches || []).map(m => ({
        value: parseFloat(m),
        raw: m.trim(),
        type: 'number',
        isPercentage: m.includes('%')
      }));
    });

    // Date patterns
    this.addExtractor('date', text => {
      const results = [];
      // ISO date
      const isoMatches = text.match(/\d{4}-\d{2}-\d{2}/g);
      if (isoMatches) results.push(...isoMatches.map(m => ({ value: m, type: 'date', format: 'iso' })));
      // Relative dates
      const relativePatterns = [
        { pattern: /\btoday\b/i, value: 'today' },
        { pattern: /\btomorrow\b/i, value: 'tomorrow' },
        { pattern: /\byesterday\b/i, value: 'yesterday' },
        { pattern: /\bnext\s+(week|month|year)\b/i, value: 'next' },
        { pattern: /\blast\s+(week|month|year)\b/i, value: 'last' }
      ];
      for (const { pattern, value } of relativePatterns) {
        const match = text.match(pattern);
        if (match) results.push({ value, raw: match[0], type: 'date', format: 'relative' });
      }
      return results;
    });

    // Time patterns
    this.addExtractor('time', text => {
      const matches = text.match(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)?\b/g);
      return (matches || []).filter(m => /\d/.test(m) && m.length > 1)
        .map(m => ({ value: m.trim(), type: 'time' }));
    });

    // Duration
    this.addExtractor('duration', text => {
      const results = [];
      const durationPattern = /(\d+)\s*(second|minute|hour|day|week|month|year)s?\b/gi;
      let match;
      while ((match = durationPattern.exec(text)) !== null) {
        results.push({ value: parseInt(match[1]), unit: match[2].toLowerCase(), type: 'duration' });
      }
      return results;
    });

    // Currency
    this.addExtractor('currency', text => {
      const matches = text.match(/[$€£¥]\s*\d+(?:,\d{3})*(?:\.\d{2})?|\d+(?:,\d{3})*(?:\.\d{2})?\s*(?:dollars?|euros?|pounds?|yen)/gi);
      return (matches || []).map(m => ({ value: m.trim(), type: 'currency' }));
    });

    // Color
    this.addExtractor('color', text => {
      const results = [];
      const hexMatches = text.match(/#[0-9a-fA-F]{3,8}\b/g);
      if (hexMatches) results.push(...hexMatches.map(m => ({ value: m, type: 'color', format: 'hex' })));
      const namedColors = ['red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'black', 'white', 'gray', 'grey', 'brown', 'cyan', 'magenta'];
      const lower = text.toLowerCase();
      for (const color of namedColors) {
        if (lower.includes(color)) {
          results.push({ value: color, type: 'color', format: 'named' });
        }
      }
      return results;
    });

    // Mention (@user)
    this.addExtractor('mention', text => {
      const matches = text.match(/@\w+/g);
      return (matches || []).map(m => ({ value: m.slice(1), type: 'mention' }));
    });

    // Hashtag
    this.addExtractor('hashtag', text => {
      const matches = text.match(/#\w+/g);
      return (matches || []).map(m => ({ value: m.slice(1), type: 'hashtag' }));
    });
  }

  addExtractor(name, fn) {
    this.extractors.set(name, fn);
  }

  removeExtractor(name) {
    this.extractors.delete(name);
  }

  extract(text, types) {
    const results = {};
    const extractorNames = types || Array.from(this.extractors.keys());

    for (const name of extractorNames) {
      const fn = this.extractors.get(name);
      if (fn) {
        const entities = fn(text);
        if (entities.length > 0) results[name] = entities;
      }
    }
    return results;
  }

  extractAll(text) {
    return this.extract(text);
  }

  extractFlat(text, types) {
    const grouped = this.extract(text, types);
    const flat = [];
    for (const entities of Object.values(grouped)) {
      flat.push(...entities);
    }
    return flat;
  }
}

// ─── Sentiment Analyzer ─────────────────────────────────────────────────────
export class SentimentAnalyzer {
  constructor(opts = {}) {
    this.tokenizer = new Tokenizer(opts.tokenizer || { stemming: false });
    this.lexicon = new Map(SENTIMENT_LEXICON.map(([word, score]) => [word, score]));
    this.negations = new Set(['not', "n't", 'no', 'never', 'neither', 'nobody', 'nothing',
      'nowhere', 'nor', 'cannot', "can't", "won't", "shouldn't", "wouldn't", "couldn't",
      "didn't", "doesn't", "don't", "hasn't", "haven't", "isn't", "wasn't", "weren't"]);
    this.amplifiers = new Map([
      ['very', 1.5], ['really', 1.4], ['extremely', 1.8], ['absolutely', 1.7],
      ['totally', 1.5], ['incredibly', 1.6], ['somewhat', 0.7], ['slightly', 0.6],
      ['fairly', 0.8], ['quite', 1.2], ['remarkably', 1.5], ['utterly', 1.7],
      ['barely', 0.4], ['hardly', 0.4], ['super', 1.5]
    ]);
  }

  analyze(text) {
    const tokens = this.tokenizer.tokenize(text);
    let score = 0;
    let wordCount = 0;
    let negation = false;
    let amplifier = 1;
    const details = [];

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      if (this.negations.has(token)) {
        negation = true;
        continue;
      }

      if (this.amplifiers.has(token)) {
        amplifier = this.amplifiers.get(token);
        continue;
      }

      const wordScore = this.lexicon.get(token);
      if (wordScore !== undefined) {
        let finalScore = wordScore * amplifier;
        if (negation) { finalScore *= -0.75; negation = false; }
        score += finalScore;
        wordCount++;
        details.push({ word: token, score: finalScore });
      }

      amplifier = 1;
    }

    // Punctuation modifiers
    const exclamation = (text.match(/!/g) || []).length;
    const question = (text.match(/\?/g) || []).length;
    if (exclamation > 0) score *= (1 + exclamation * 0.1);
    if (question > 0 && score < 0) score *= 0.9;

    // Capitalization intensity (ALL CAPS)
    const capsWords = tokens.filter(t => t === t.toUpperCase() && t.length > 1).length;
    if (capsWords > 0) score *= (1 + capsWords * 0.05);

    const normalized = wordCount > 0 ? score / wordCount : 0;

    return {
      score: Math.max(-1, Math.min(1, normalized)),
      comparative: normalized,
      raw: score,
      wordCount,
      positive: details.filter(d => d.score > 0),
      negative: details.filter(d => d.score < 0),
      label: this._getLabel(normalized),
      confidence: Math.min(1, wordCount / 5)
    };
  }

  _getLabel(score) {
    if (score >= 0.5) return 'very_positive';
    if (score >= 0.15) return 'positive';
    if (score > -0.15) return 'neutral';
    if (score > -0.5) return 'negative';
    return 'very_negative';
  }

  addWord(word, score) {
    this.lexicon.set(word.toLowerCase(), score);
  }

  removeWord(word) {
    this.lexicon.delete(word.toLowerCase());
  }
}

// Sentiment lexicon (subset)
const SENTIMENT_LEXICON = [
  ['good', 0.6], ['great', 0.8], ['excellent', 0.9], ['amazing', 0.9], ['wonderful', 0.85],
  ['fantastic', 0.9], ['awesome', 0.85], ['brilliant', 0.85], ['outstanding', 0.9],
  ['perfect', 0.95], ['beautiful', 0.8], ['lovely', 0.75], ['nice', 0.5], ['fine', 0.3],
  ['happy', 0.8], ['glad', 0.6], ['pleased', 0.6], ['delighted', 0.8], ['thrilled', 0.85],
  ['excited', 0.7], ['love', 0.9], ['like', 0.4], ['enjoy', 0.6], ['adore', 0.85],
  ['fun', 0.6], ['cool', 0.5], ['super', 0.7], ['impressive', 0.7], ['remarkable', 0.7],
  ['incredible', 0.8], ['magnificent', 0.9], ['superior', 0.7], ['exceptional', 0.85],
  ['positive', 0.5], ['optimistic', 0.6], ['cheerful', 0.7], ['joyful', 0.8],
  ['grateful', 0.7], ['thankful', 0.6], ['blessed', 0.7], ['fortunate', 0.6],
  ['successful', 0.7], ['helpful', 0.6], ['useful', 0.5], ['valuable', 0.6],
  ['worthy', 0.5], ['reliable', 0.5], ['trustworthy', 0.6], ['efficient', 0.5],
  ['effective', 0.5], ['innovative', 0.6], ['creative', 0.5], ['inspiring', 0.7],
  ['bad', -0.6], ['terrible', -0.9], ['horrible', -0.9], ['awful', -0.85],
  ['dreadful', -0.85], ['poor', -0.5], ['worse', -0.7], ['worst', -0.9],
  ['ugly', -0.7], ['nasty', -0.8], ['disgusting', -0.9], ['hate', -0.9],
  ['dislike', -0.5], ['loathe', -0.9], ['despise', -0.85], ['angry', -0.7],
  ['furious', -0.9], ['annoyed', -0.5], ['irritated', -0.5], ['frustrated', -0.6],
  ['sad', -0.7], ['unhappy', -0.6], ['miserable', -0.8], ['depressed', -0.8],
  ['disappointed', -0.6], ['upset', -0.6], ['worried', -0.5], ['anxious', -0.5],
  ['scared', -0.6], ['frightened', -0.7], ['afraid', -0.6], ['terrified', -0.8],
  ['boring', -0.5], ['dull', -0.4], ['stupid', -0.7], ['idiotic', -0.8],
  ['useless', -0.7], ['worthless', -0.8], ['broken', -0.5], ['failed', -0.6],
  ['failure', -0.7], ['wrong', -0.5], ['error', -0.4], ['mistake', -0.5],
  ['problem', -0.4], ['issue', -0.3], ['bug', -0.4], ['crash', -0.6],
  ['slow', -0.3], ['complex', -0.2], ['difficult', -0.3], ['hard', -0.2],
  ['confusing', -0.5], ['complicated', -0.4], ['painful', -0.6], ['ugly', -0.6],
  ['ok', 0.1], ['okay', 0.1], ['average', 0], ['normal', 0], ['typical', 0],
  ['fair', 0.2], ['decent', 0.3], ['adequate', 0.2], ['acceptable', 0.2],
  ['recommend', 0.5], ['suggest', 0.2], ['prefer', 0.3], ['wish', 0.1],
  ['hope', 0.3], ['want', 0.1], ['need', 0], ['must', 0], ['should', 0]
];

// ─── Dialog Manager ─────────────────────────────────────────────────────────
export class DialogSlot {
  constructor(name, opts = {}) {
    this.name = name;
    this.type = opts.type || 'string';
    this.required = opts.required ?? false;
    this.prompt = opts.prompt || `What is the ${name}?`;
    this.validate = opts.validate || (() => true);
    this.transform = opts.transform || (v => v);
    this.value = null;
    this.confirmed = false;
  }

  fill(value) {
    const transformed = this.transform(value);
    if (this.validate(transformed)) {
      this.value = transformed;
      return true;
    }
    return false;
  }

  isFilled() { return this.value !== null; }

  reset() {
    this.value = null;
    this.confirmed = false;
  }
}

export class DialogState {
  constructor(name, opts = {}) {
    this.name = name;
    this.slots = new Map();
    this.transitions = new Map();
    this.onEnter = opts.onEnter || null;
    this.onExit = opts.onExit || null;
    this.handler = opts.handler || null;
    this.fallback = opts.fallback || null;
    this.maxTurns = opts.maxTurns ?? 10;
    this._turns = 0;
  }

  addSlot(slot) {
    this.slots.set(slot.name, slot);
    return this;
  }

  addTransition(trigger, targetState) {
    this.transitions.set(trigger, targetState);
    return this;
  }

  getUnfilledSlots() {
    return Array.from(this.slots.values()).filter(s => s.required && !s.isFilled());
  }

  areSlotsFilled() {
    return this.getUnfilledSlots().length === 0;
  }

  getNextPrompt() {
    const unfilled = this.getUnfilledSlots();
    return unfilled.length > 0 ? unfilled[0].prompt : null;
  }

  reset() {
    for (const slot of this.slots.values()) slot.reset();
    this._turns = 0;
  }
}

export class DialogManager {
  constructor(opts = {}) {
    this.states = new Map();
    this.currentState = null;
    this.context = {};
    this.history = [];
    this.maxHistory = opts.maxHistory ?? 50;
    this._listeners = { stateChange: [], slotFill: [], complete: [], error: [] };
    this.intentClassifier = opts.intentClassifier || null;
    this.entityExtractor = opts.entityExtractor || new EntityExtractor();
  }

  addState(state) {
    this.states.set(state.name, state);
    if (!this.currentState) this.currentState = state.name;
    return this;
  }

  setState(stateName) {
    const prevState = this.currentState;
    const prevStateObj = this.states.get(prevState);
    const newStateObj = this.states.get(stateName);

    if (!newStateObj) return false;

    if (prevStateObj?.onExit) prevStateObj.onExit(this.context);
    this.currentState = stateName;
    if (newStateObj.onEnter) newStateObj.onEnter(this.context);

    this._emit('stateChange', { from: prevState, to: stateName });
    return true;
  }

  processInput(text) {
    const state = this.states.get(this.currentState);
    if (!state) return { response: 'No active dialog state', action: 'error' };

    state._turns++;
    this.history.push({ role: 'user', text, state: this.currentState, timestamp: Date.now() });
    if (this.history.length > this.maxHistory) this.history.shift();

    // Extract entities and try to fill slots
    const entities = this.entityExtractor.extractAll(text);
    const filledSlots = this._tryFillSlots(state, text, entities);

    // Check for state transitions
    if (this.intentClassifier) {
      const classification = this.intentClassifier.classify(text);
      if (classification.intent && state.transitions.has(classification.intent)) {
        const targetState = state.transitions.get(classification.intent);
        this.setState(targetState);
        return { response: null, action: 'transition', target: targetState, intent: classification.intent };
      }
    }

    // Check if all required slots are filled
    if (state.areSlotsFilled()) {
      const slotValues = {};
      for (const [name, slot] of state.slots) {
        slotValues[name] = slot.value;
      }

      if (state.handler) {
        const result = state.handler(slotValues, this.context);
        this._emit('complete', { state: this.currentState, slots: slotValues, result });

        const response = { response: result, action: 'complete', slots: slotValues };
        this.history.push({ role: 'system', ...response, timestamp: Date.now() });
        return response;
      }
    }

    // Ask for next slot
    const nextPrompt = state.getNextPrompt();
    if (nextPrompt) {
      const response = { response: nextPrompt, action: 'prompt', filledSlots };
      this.history.push({ role: 'system', text: nextPrompt, timestamp: Date.now() });
      return response;
    }

    // Fallback
    if (state.fallback) {
      const response = { response: state.fallback(text, this.context), action: 'fallback' };
      this.history.push({ role: 'system', ...response, timestamp: Date.now() });
      return response;
    }

    // Max turns check
    if (state._turns > state.maxTurns) {
      this._emit('error', { type: 'maxTurns', state: this.currentState });
      return { response: 'This conversation has gone on too long. Let me reset.', action: 'timeout' };
    }

    return { response: "I'm not sure how to help with that.", action: 'unknown' };
  }

  _tryFillSlots(state, text, entities) {
    const filled = [];
    for (const [name, slot] of state.slots) {
      if (slot.isFilled()) continue;

      // Try entity-based filling
      if (entities[slot.type]) {
        const entity = entities[slot.type][0];
        if (slot.fill(entity.value)) {
          filled.push({ slot: name, value: entity.value, source: 'entity' });
          this._emit('slotFill', { slot: name, value: entity.value });
          continue;
        }
      }

      // Try text-based filling for simple slots
      if (slot.type === 'string' || slot.type === 'text') {
        const unfilled = state.getUnfilledSlots();
        if (unfilled.length === 1 && unfilled[0].name === name) {
          if (slot.fill(text)) {
            filled.push({ slot: name, value: text, source: 'text' });
            this._emit('slotFill', { slot: name, value: text });
          }
        }
      }
    }
    return filled;
  }

  getContext() { return { ...this.context }; }
  setContext(key, value) { this.context[key] = value; }
  getHistory() { return [...this.history]; }
  getCurrentState() { return this.currentState; }

  reset() {
    for (const state of this.states.values()) state.reset();
    this.context = {};
    this.history = [];
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
}

// ─── Text Similarity ────────────────────────────────────────────────────────
export class TextSimilarity {
  static levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) => [i]);
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i-1] === b[j-1]) {
          dp[i][j] = dp[i-1][j-1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
        }
      }
    }
    return dp[m][n];
  }

  static normalizedLevenshtein(a, b) {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    return 1 - this.levenshtein(a, b) / maxLen;
  }

  static jaroWinkler(a, b) {
    if (a === b) return 1;
    const matchWindow = Math.floor(Math.max(a.length, b.length) / 2) - 1;
    const aMatches = new Array(a.length).fill(false);
    const bMatches = new Array(b.length).fill(false);
    let matches = 0, transpositions = 0;

    for (let i = 0; i < a.length; i++) {
      const start = Math.max(0, i - matchWindow);
      const end = Math.min(i + matchWindow + 1, b.length);
      for (let j = start; j < end; j++) {
        if (bMatches[j] || a[i] !== b[j]) continue;
        aMatches[i] = true;
        bMatches[j] = true;
        matches++;
        break;
      }
    }

    if (matches === 0) return 0;

    let k = 0;
    for (let i = 0; i < a.length; i++) {
      if (!aMatches[i]) continue;
      while (!bMatches[k]) k++;
      if (a[i] !== b[k]) transpositions++;
      k++;
    }

    const jaro = (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3;

    // Winkler prefix bonus
    let prefix = 0;
    for (let i = 0; i < Math.min(4, Math.min(a.length, b.length)); i++) {
      if (a[i] === b[i]) prefix++;
      else break;
    }

    return jaro + prefix * 0.1 * (1 - jaro);
  }

  static jaccard(a, b) {
    const setA = new Set(a.toLowerCase().split(/\s+/));
    const setB = new Set(b.toLowerCase().split(/\s+/));
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  static cosine(a, b) {
    const tokensA = a.toLowerCase().split(/\s+/);
    const tokensB = b.toLowerCase().split(/\s+/);
    const tfA = new Map();
    const tfB = new Map();
    for (const t of tokensA) tfA.set(t, (tfA.get(t) || 0) + 1);
    for (const t of tokensB) tfB.set(t, (tfB.get(t) || 0) + 1);
    return cosineSimilarity(tfA, tfB);
  }

  static diceCoefficient(a, b) {
    const bigramsA = new Set();
    const bigramsB = new Set();
    for (let i = 0; i < a.length - 1; i++) bigramsA.add(a.substring(i, i + 2).toLowerCase());
    for (let i = 0; i < b.length - 1; i++) bigramsB.add(b.substring(i, i + 2).toLowerCase());
    const intersection = new Set([...bigramsA].filter(x => bigramsB.has(x)));
    return (2 * intersection.size) / (bigramsA.size + bigramsB.size) || 0;
  }
}

// ─── Keyword Extractor ──────────────────────────────────────────────────────
export class KeywordExtractor {
  constructor(opts = {}) {
    this.tokenizer = new Tokenizer(opts.tokenizer);
    this.minFrequency = opts.minFrequency ?? 1;
    this.maxKeywords = opts.maxKeywords ?? 10;
  }

  extract(text) {
    const tokens = this.tokenizer.tokenize(text);
    const filtered = this.tokenizer.removeStopWords(tokens);

    // Count frequencies
    const freq = new Map();
    for (const token of filtered) {
      freq.set(token, (freq.get(token) || 0) + 1);
    }

    // Score by TF * position weight
    const scored = [];
    for (const [word, count] of freq) {
      if (count < this.minFrequency) continue;
      const firstPos = filtered.indexOf(word);
      const posWeight = 1 - (firstPos / filtered.length) * 0.5;
      const lengthWeight = Math.min(1, word.length / 8);
      scored.push({ word, score: count * posWeight * lengthWeight, count });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, this.maxKeywords);
  }

  extractPhrases(text, maxPhraseLength = 3) {
    const tokens = this.tokenizer.tokenize(text);
    const phrases = new Map();

    for (let n = 2; n <= maxPhraseLength; n++) {
      const ngrams = this.tokenizer.getNgrams(tokens, n);
      for (const gram of ngrams) {
        const words = gram.split(' ');
        const hasStopOnly = words.every(w => this.tokenizer.stopWords.has(w));
        if (hasStopOnly) continue;
        phrases.set(gram, (phrases.get(gram) || 0) + 1);
      }
    }

    const results = Array.from(phrases.entries())
      .filter(([, count]) => count >= this.minFrequency)
      .map(([phrase, count]) => ({ phrase, count, score: count * phrase.split(' ').length }))
      .sort((a, b) => b.score - a.score);

    return results.slice(0, this.maxKeywords);
  }
}

// ─── Language Detector ──────────────────────────────────────────────────────
export class LanguageDetector {
  constructor() {
    this.profiles = new Map(LANGUAGE_PROFILES);
  }

  detect(text) {
    const clean = text.toLowerCase().replace(/[0-9]/g, '').trim();
    if (clean.length < 3) return { language: 'unknown', confidence: 0 };

    // Character-based trigrams
    const trigrams = new Map();
    for (let i = 0; i <= clean.length - 3; i++) {
      const tri = clean.substring(i, i + 3);
      trigrams.set(tri, (trigrams.get(tri) || 0) + 1);
    }

    const scores = [];
    for (const [lang, profile] of this.profiles) {
      let score = 0;
      for (const [tri, count] of trigrams) {
        if (profile.has(tri)) {
          score += count * profile.get(tri);
        }
      }
      scores.push({ language: lang, score });
    }

    scores.sort((a, b) => b.score - a.score);

    if (scores.length === 0) return { language: 'unknown', confidence: 0 };

    const total = scores.reduce((s, x) => s + x.score, 0);
    const confidence = total > 0 ? scores[0].score / total : 0;

    return {
      language: scores[0].language,
      confidence: Math.min(1, confidence),
      alternatives: scores.slice(1, 4).map(s => ({
        language: s.language,
        confidence: total > 0 ? s.score / total : 0
      }))
    };
  }
}

// Simple language profiles (trigram frequencies)
const LANGUAGE_PROFILES = [
  ['en', new Map([
    ['the', 5], ['and', 4], ['ing', 4], ['ion', 3], ['tion', 3], ['ent', 3],
    ['her', 2], ['for', 2], ['tha', 2], ['nth', 2], ['int', 2], ['ere', 2],
    ['tio', 3], ['hat', 2], ['ato', 2], ['ter', 2], ['his', 2], ['res', 2],
    ['ver', 2], ['all', 2], ['ith', 2], ['rea', 2], ['con', 2], ['are', 2]
  ])],
  ['es', new Map([
    ['de ', 5], ['los', 4], ['las', 4], ['ión', 3], ['ent', 3], ['aci', 3],
    ['que', 4], ['ción', 3], ['el ', 3], ['en ', 3], ['es ', 3], ['la ', 4],
    ['del', 2], ['con', 2], ['por', 2], ['est', 2], ['nte', 2], ['ado', 2],
    ['ero', 2], ['com', 2], ['tra', 2], ['tos', 2], ['par', 2], ['mente', 2]
  ])],
  ['pt', new Map([
    ['de ', 5], ['que', 4], ['os ', 4], ['ão ', 3], ['ção', 3], ['ent', 3],
    ['com', 3], ['do ', 3], ['da ', 3], ['em ', 3], ['um ', 3], ['as ', 3],
    ['par', 2], ['est', 2], ['nte', 2], ['ado', 2], ['men', 2], ['res', 2],
    ['mos', 2], ['dos', 2], ['das', 2], ['não', 3], ['ser', 2], ['uma', 2]
  ])],
  ['fr', new Map([
    ['les', 4], ['des', 4], ['ent', 3], ['que', 4], ['ion', 3], ['de ', 5],
    ['le ', 3], ['la ', 3], ['tion', 3], ['est', 3], ['et ', 3], ['en ', 3],
    ['ment', 2], ['pas', 2], ['pour', 2], ['dans', 2], ['sur', 2], ['par', 2],
    ['une', 2], ['son', 2], ['ont', 2], ['qui', 2], ['aux', 2], ['mais', 2]
  ])],
  ['de', new Map([
    ['der', 4], ['die', 4], ['und', 4], ['den', 3], ['ein', 3], ['sch', 3],
    ['ich', 3], ['ung', 3], ['ber', 2], ['das', 3], ['ist', 3], ['eit', 2],
    ['ach', 2], ['auf', 2], ['uch', 2], ['ine', 2], ['nicht', 2], ['mit', 2],
    ['von', 2], ['ver', 2], ['lich', 2], ['erd', 2], ['gen', 2], ['für', 2]
  ])]
];

// ─── Text Preprocessor ─────────────────────────────────────────────────────
export class TextPreprocessor {
  static normalize(text) {
    return text
      .replace(/\s+/g, ' ')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .trim();
  }

  static removeEmojis(text) {
    return text.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '');
  }

  static removeHtml(text) {
    return text.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/g, ' ');
  }

  static removeUrls(text) {
    return text.replace(/https?:\/\/\S+/g, '');
  }

  static expandContractions(text) {
    const contractions = {
      "can't": "cannot", "won't": "will not", "n't": " not",
      "'re": " are", "'ve": " have", "'ll": " will",
      "'d": " would", "'m": " am", "let's": "let us",
      "it's": "it is", "i'm": "i am", "he's": "he is",
      "she's": "she is", "that's": "that is", "what's": "what is",
      "there's": "there is", "here's": "here is"
    };
    let result = text.toLowerCase();
    for (const [contraction, expansion] of Object.entries(contractions)) {
      result = result.replace(new RegExp(contraction.replace("'", "'?"), 'gi'), expansion);
    }
    return result;
  }

  static pipeline(text, steps = ['normalize', 'removeUrls', 'removeHtml']) {
    let result = text;
    for (const step of steps) {
      if (typeof this[step] === 'function') {
        result = this[step](result);
      }
    }
    return result;
  }
}

// ─── Named Entity Recognition (Rule-based) ─────────────────────────────────
export class NamedEntityRecognizer {
  constructor() {
    this.rules = [];
    this._setupDefaultRules();
  }

  _setupDefaultRules() {
    // Person names (capitalized words)
    this.addRule('PERSON', text => {
      const matches = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g);
      return (matches || []).map(m => ({ value: m, type: 'PERSON', start: text.indexOf(m) }));
    });

    // Organization (capitalized acronyms)
    this.addRule('ORG', text => {
      const matches = text.match(/\b[A-Z]{2,}\b/g);
      return (matches || []).filter(m => m.length >= 2 && m.length <= 10)
        .map(m => ({ value: m, type: 'ORG', start: text.indexOf(m) }));
    });

    // Location (preceded by "in", "at", "from", etc.)
    this.addRule('LOCATION', text => {
      const matches = text.match(/(?:in|at|from|to|near)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g);
      return (matches || []).map(m => {
        const loc = m.replace(/^(?:in|at|from|to|near)\s+/, '');
        return { value: loc, type: 'LOCATION', start: text.indexOf(loc) };
      });
    });
  }

  addRule(type, extractor) {
    this.rules.push({ type, extractor });
  }

  recognize(text) {
    const entities = [];
    for (const rule of this.rules) {
      const found = rule.extractor(text);
      entities.push(...found);
    }
    // Remove duplicates
    const seen = new Set();
    return entities.filter(e => {
      const key = `${e.type}:${e.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

// ─── Conversation Context ───────────────────────────────────────────────────
export class ConversationContext {
  constructor(opts = {}) {
    this.maxTurns = opts.maxTurns ?? 20;
    this.turns = [];
    this.entities = new Map();
    this.topics = [];
    this.metadata = {};
    this._sentiment = null;
    this._analyzer = new SentimentAnalyzer();
  }

  addTurn(role, text, metadata = {}) {
    this.turns.push({
      role,
      text,
      timestamp: Date.now(),
      sentiment: this._analyzer.analyze(text),
      ...metadata
    });

    if (this.turns.length > this.maxTurns) {
      this.turns.shift();
    }
  }

  getLastTurn() { return this.turns[this.turns.length - 1] || null; }
  getLastUserTurn() { return [...this.turns].reverse().find(t => t.role === 'user') || null; }

  getConversationSentiment() {
    if (this.turns.length === 0) return 'neutral';
    const recentTurns = this.turns.slice(-5);
    const avgScore = recentTurns.reduce((sum, t) => sum + (t.sentiment?.score || 0), 0) / recentTurns.length;
    if (avgScore > 0.2) return 'positive';
    if (avgScore < -0.2) return 'negative';
    return 'neutral';
  }

  addEntity(name, value) { this.entities.set(name, value); }
  getEntity(name) { return this.entities.get(name); }
  hasEntity(name) { return this.entities.has(name); }

  addTopic(topic) {
    if (!this.topics.includes(topic)) {
      this.topics.push(topic);
      if (this.topics.length > 10) this.topics.shift();
    }
  }

  getSummary() {
    return {
      turns: this.turns.length,
      sentiment: this.getConversationSentiment(),
      entities: Object.fromEntries(this.entities),
      topics: [...this.topics],
      lastUserMessage: this.getLastUserTurn()?.text || null
    };
  }

  clear() {
    this.turns = [];
    this.entities.clear();
    this.topics = [];
    this.metadata = {};
  }
}
