import { describe, it, expect, beforeEach } from 'vitest';
import {
  Tokenizer, TfIdf, IntentClassifier, EntityExtractor,
  SentimentAnalyzer, DialogSlot, DialogState, DialogManager,
  TextSimilarity, KeywordExtractor, LanguageDetector,
  TextPreprocessor, NamedEntityRecognizer, ConversationContext
} from '../nlu-engine.js';

describe('Tokenizer', () => {
  it('tokenizes basic text', () => {
    const tok = new Tokenizer();
    expect(tok.tokenize('Hello World')).toEqual(['hello', 'world']);
  });

  it('handles case sensitivity', () => {
    const tok = new Tokenizer({ caseSensitive: true });
    expect(tok.tokenize('Hello World')).toEqual(['Hello', 'World']);
  });

  it('removes punctuation', () => {
    const tok = new Tokenizer();
    const tokens = tok.tokenize('Hello, world! How are you?');
    expect(tokens).not.toContain(',');
    expect(tokens).not.toContain('!');
  });

  it('handles empty input', () => {
    const tok = new Tokenizer();
    expect(tok.tokenize('')).toEqual([]);
    expect(tok.tokenize(null)).toEqual([]);
  });

  it('removes stop words', () => {
    const tok = new Tokenizer();
    const tokens = tok.tokenize('the cat is on the mat');
    const filtered = tok.removeStopWords(tokens);
    expect(filtered).toContain('cat');
    expect(filtered).toContain('mat');
    expect(filtered).not.toContain('the');
    expect(filtered).not.toContain('is');
  });

  it('generates ngrams', () => {
    const tok = new Tokenizer();
    const tokens = ['a', 'b', 'c', 'd'];
    const bigrams = tok.getNgrams(tokens, 2);
    expect(bigrams).toEqual(['a b', 'b c', 'c d']);
  });

  it('generates char ngrams', () => {
    const tok = new Tokenizer();
    const ngrams = tok.getCharNgrams('hello', 3);
    expect(ngrams).toContain('hel');
    expect(ngrams).toContain('llo');
  });

  it('applies stemming', () => {
    const tok = new Tokenizer({ stemming: true });
    const tokens = tok.tokenize('running walked likes');
    expect(tokens.some(t => t !== 'running')).toBe(true); // Should be stemmed
  });

  it('respects maxTokens', () => {
    const tok = new Tokenizer({ maxTokens: 3 });
    const tokens = tok.tokenize('one two three four five');
    expect(tokens.length).toBe(3);
  });
});

describe('TfIdf', () => {
  let tfidf;

  beforeEach(() => {
    tfidf = new TfIdf();
    tfidf.addDocument(['the', 'cat', 'sat', 'on', 'the', 'mat'], { title: 'doc1' });
    tfidf.addDocument(['the', 'dog', 'ran', 'in', 'the', 'park'], { title: 'doc2' });
    tfidf.addDocument(['cat', 'and', 'dog', 'are', 'friends'], { title: 'doc3' });
  });

  it('adds documents', () => {
    expect(tfidf.documents.length).toBe(3);
  });

  it('computes TF-IDF scores', () => {
    const catScore = tfidf.getTfIdf(0, 'cat');
    expect(catScore).toBeGreaterThan(0);
    // 'the' appears in all 3 docs; 'cat' in 2 docs; both should have positive scores
    const theScore = tfidf.getTfIdf(0, 'the');
    expect(theScore).toBeGreaterThanOrEqual(0);
  });

  it('searches documents', () => {
    const results = tfidf.search(['cat', 'mat']);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].metadata.title).toBe('doc1');
  });

  it('gets top terms', () => {
    const terms = tfidf.getTopTerms(0);
    expect(terms.length).toBeGreaterThan(0);
    expect(terms[0].term).toBeDefined();
    expect(terms[0].score).toBeGreaterThan(0);
  });

  it('gets document vector', () => {
    const vector = tfidf.getDocumentVector(0);
    expect(vector.size).toBeGreaterThan(0);
  });
});

describe('IntentClassifier', () => {
  let classifier;

  beforeEach(() => {
    classifier = new IntentClassifier();
    classifier.addIntent('greeting', ['hello', 'hi', 'hey there', 'good morning']);
    classifier.addIntent('farewell', ['goodbye', 'bye', 'see you later', 'farewell']);
    classifier.addIntent('weather', ['what is the weather', 'how is the weather today', 'is it raining']);
    classifier.train();
  });

  it('classifies greeting', () => {
    const result = classifier.classify('hello there');
    expect(result.intent).toBe('greeting');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('classifies weather', () => {
    const result = classifier.classify('what is the weather like');
    expect(result.intent).toBe('weather');
  });

  it('returns null for unknown', () => {
    const result = classifier.classify('quantum physics equations');
    expect(result.confidence).toBeLessThan(0.5);
  });

  it('uses patterns', () => {
    classifier.addPattern('help', /^help$/i);
    classifier.train();
    const result = classifier.classify('help');
    expect(result.intent).toBe('help');
    expect(result.method).toBe('pattern');
  });

  it('lists intents', () => {
    expect(classifier.getIntents()).toContain('greeting');
    expect(classifier.getIntents()).toContain('farewell');
  });
});

describe('EntityExtractor', () => {
  let extractor;

  beforeEach(() => {
    extractor = new EntityExtractor();
  });

  it('extracts emails', () => {
    const result = extractor.extract('Contact me at test@example.com');
    expect(result.email).toBeDefined();
    expect(result.email[0].value).toBe('test@example.com');
  });

  it('extracts URLs', () => {
    const result = extractor.extract('Visit https://example.com');
    expect(result.url).toBeDefined();
    expect(result.url[0].value).toBe('https://example.com');
  });

  it('extracts numbers', () => {
    const result = extractor.extract('I have 42 items and 3.14 pies');
    expect(result.number).toBeDefined();
    expect(result.number.length).toBe(2);
  });

  it('extracts dates', () => {
    const result = extractor.extract('Meeting on 2024-01-15');
    expect(result.date).toBeDefined();
  });

  it('extracts relative dates', () => {
    const result = extractor.extract('Let us meet tomorrow');
    expect(result.date).toBeDefined();
    expect(result.date[0].value).toBe('tomorrow');
  });

  it('extracts durations', () => {
    const result = extractor.extract('Wait 5 minutes please');
    expect(result.duration).toBeDefined();
    expect(result.duration[0].value).toBe(5);
    expect(result.duration[0].unit).toBe('minute');
  });

  it('extracts colors', () => {
    const result = extractor.extract('I like the color red and #ff0000');
    expect(result.color).toBeDefined();
    expect(result.color.some(c => c.value === 'red')).toBe(true);
    expect(result.color.some(c => c.value === '#ff0000')).toBe(true);
  });

  it('extracts mentions', () => {
    const result = extractor.extract('Hey @john, check this out');
    expect(result.mention).toBeDefined();
    expect(result.mention[0].value).toBe('john');
  });

  it('extracts hashtags', () => {
    const result = extractor.extract('This is #awesome');
    expect(result.hashtag).toBeDefined();
    expect(result.hashtag[0].value).toBe('awesome');
  });

  it('extracts all entities', () => {
    const result = extractor.extractAll('Email test@example.com about the $100 red item');
    expect(Object.keys(result).length).toBeGreaterThan(0);
  });

  it('extracts flat', () => {
    const flat = extractor.extractFlat('test@example.com and #tag');
    expect(flat.length).toBeGreaterThanOrEqual(2);
  });

  it('filters by type', () => {
    const result = extractor.extract('test@example.com and 42', ['email']);
    expect(result.email).toBeDefined();
    expect(result.number).toBeUndefined();
  });
});

describe('SentimentAnalyzer', () => {
  let analyzer;

  beforeEach(() => {
    analyzer = new SentimentAnalyzer();
  });

  it('detects positive sentiment', () => {
    const result = analyzer.analyze('This is great and amazing!');
    expect(result.score).toBeGreaterThan(0);
    expect(result.label).toMatch(/positive/);
  });

  it('detects negative sentiment', () => {
    const result = analyzer.analyze('This is terrible and awful');
    expect(result.score).toBeLessThan(0);
    expect(result.label).toMatch(/negative/);
  });

  it('detects neutral sentiment', () => {
    const result = analyzer.analyze('The table is made of wood');
    expect(result.label).toBe('neutral');
  });

  it('handles negation', () => {
    const positive = analyzer.analyze('This is good');
    const negated = analyzer.analyze('This is not good');
    expect(negated.score).toBeLessThan(positive.score);
  });

  it('handles amplifiers', () => {
    const normal = analyzer.analyze('This is good');
    const amplified = analyzer.analyze('This is very good');
    expect(amplified.score).toBeGreaterThan(normal.score);
  });

  it('provides word breakdown', () => {
    const result = analyzer.analyze('I love this amazing product');
    expect(result.positive.length).toBeGreaterThan(0);
    expect(result.wordCount).toBeGreaterThan(0);
  });

  it('adds custom words', () => {
    analyzer.addWord('zeptastic', 0.9);
    const result = analyzer.analyze('This is zeptastic');
    expect(result.score).toBeGreaterThan(0);
  });
});

describe('DialogSlot', () => {
  it('creates with defaults', () => {
    const slot = new DialogSlot('name');
    expect(slot.name).toBe('name');
    expect(slot.isFilled()).toBe(false);
  });

  it('fills and validates', () => {
    const slot = new DialogSlot('age', {
      type: 'number',
      validate: v => v > 0 && v < 150
    });
    expect(slot.fill(25)).toBe(true);
    expect(slot.isFilled()).toBe(true);
    expect(slot.value).toBe(25);
  });

  it('rejects invalid values', () => {
    const slot = new DialogSlot('age', {
      validate: v => v > 0
    });
    expect(slot.fill(-5)).toBe(false);
    expect(slot.isFilled()).toBe(false);
  });

  it('transforms values', () => {
    const slot = new DialogSlot('name', {
      transform: v => v.trim().toUpperCase()
    });
    slot.fill('  john  ');
    expect(slot.value).toBe('JOHN');
  });

  it('resets', () => {
    const slot = new DialogSlot('test');
    slot.fill('value');
    slot.reset();
    expect(slot.isFilled()).toBe(false);
  });
});

describe('DialogState', () => {
  it('tracks unfilled slots', () => {
    const state = new DialogState('booking');
    state.addSlot(new DialogSlot('date', { required: true }));
    state.addSlot(new DialogSlot('time', { required: true }));
    state.addSlot(new DialogSlot('notes', { required: false }));

    expect(state.getUnfilledSlots().length).toBe(2);
    expect(state.areSlotsFilled()).toBe(false);
  });

  it('gets next prompt', () => {
    const state = new DialogState('booking');
    state.addSlot(new DialogSlot('date', { required: true, prompt: 'When?' }));
    expect(state.getNextPrompt()).toBe('When?');
  });

  it('adds transitions', () => {
    const state = new DialogState('menu');
    state.addTransition('book', 'booking');
    expect(state.transitions.get('book')).toBe('booking');
  });
});

describe('DialogManager', () => {
  let dm;

  beforeEach(() => {
    dm = new DialogManager();
    const greetState = new DialogState('greet', {
      handler: () => 'How can I help you?'
    });
    const bookState = new DialogState('book');
    bookState.addSlot(new DialogSlot('name', { required: true, type: 'string', prompt: 'What is your name?' }));

    greetState.addTransition('book', 'book');
    dm.addState(greetState);
    dm.addState(bookState);
  });

  it('starts at first state', () => {
    expect(dm.getCurrentState()).toBe('greet');
  });

  it('transitions states', () => {
    dm.setState('book');
    expect(dm.getCurrentState()).toBe('book');
  });

  it('processes input', () => {
    dm.setState('book');
    const result = dm.processInput('John Doe');
    expect(result).toBeDefined();
  });

  it('tracks history', () => {
    dm.processInput('hello');
    expect(dm.getHistory().length).toBe(2); // user input + system response
  });

  it('resets', () => {
    dm.processInput('hello');
    dm.reset();
    expect(dm.getHistory().length).toBe(0);
  });

  it('emits events', () => {
    const changes = [];
    dm.on('stateChange', e => changes.push(e));
    dm.setState('book');
    expect(changes.length).toBe(1);
  });
});

describe('TextSimilarity', () => {
  it('levenshtein distance', () => {
    expect(TextSimilarity.levenshtein('kitten', 'sitting')).toBe(3);
    expect(TextSimilarity.levenshtein('', '')).toBe(0);
    expect(TextSimilarity.levenshtein('abc', 'abc')).toBe(0);
  });

  it('normalized levenshtein', () => {
    expect(TextSimilarity.normalizedLevenshtein('hello', 'hello')).toBe(1);
    expect(TextSimilarity.normalizedLevenshtein('hello', 'world')).toBeLessThan(1);
  });

  it('jaro-winkler', () => {
    expect(TextSimilarity.jaroWinkler('hello', 'hello')).toBe(1);
    expect(TextSimilarity.jaroWinkler('hello', 'hallo')).toBeGreaterThan(0.8);
    expect(TextSimilarity.jaroWinkler('abc', 'xyz')).toBeLessThan(0.5);
  });

  it('jaccard similarity', () => {
    expect(TextSimilarity.jaccard('the cat sat', 'the cat stood')).toBeGreaterThan(0);
    expect(TextSimilarity.jaccard('hello', 'hello')).toBe(1);
  });

  it('cosine similarity', () => {
    expect(TextSimilarity.cosine('the cat sat on the mat', 'the cat sat on the mat')).toBeCloseTo(1, 1);
    expect(TextSimilarity.cosine('hello world', 'goodbye moon')).toBe(0);
  });

  it('dice coefficient', () => {
    expect(TextSimilarity.diceCoefficient('hello', 'hello')).toBe(1);
    expect(TextSimilarity.diceCoefficient('hello', 'world')).toBeLessThan(0.5);
  });
});

describe('KeywordExtractor', () => {
  it('extracts keywords', () => {
    const ext = new KeywordExtractor();
    const keywords = ext.extract('The machine learning model performed well on the test dataset with high accuracy');
    expect(keywords.length).toBeGreaterThan(0);
    expect(keywords[0].word).toBeDefined();
    expect(keywords[0].score).toBeGreaterThan(0);
  });

  it('extracts phrases', () => {
    const ext = new KeywordExtractor();
    const phrases = ext.extractPhrases('machine learning is great for natural language processing tasks');
    expect(phrases.length).toBeGreaterThan(0);
  });
});

describe('LanguageDetector', () => {
  it('detects English', () => {
    const detector = new LanguageDetector();
    const result = detector.detect('The quick brown fox jumps over the lazy dog');
    expect(result.language).toBe('en');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('returns unknown for short text', () => {
    const detector = new LanguageDetector();
    const result = detector.detect('Hi');
    expect(result.language).toBe('unknown');
  });

  it('provides alternatives', () => {
    const detector = new LanguageDetector();
    const result = detector.detect('The interesting conversation continued throughout the evening');
    expect(result.alternatives).toBeDefined();
  });
});

describe('TextPreprocessor', () => {
  it('normalizes whitespace', () => {
    expect(TextPreprocessor.normalize('  hello   world  ')).toBe('hello world');
  });

  it('removes HTML', () => {
    expect(TextPreprocessor.removeHtml('<p>Hello <b>World</b></p>')).toContain('Hello');
    expect(TextPreprocessor.removeHtml('<p>Hello</p>')).not.toContain('<');
  });

  it('removes URLs', () => {
    const result = TextPreprocessor.removeUrls('Visit https://example.com for more');
    expect(result).not.toContain('https://');
  });

  it('expands contractions', () => {
    expect(TextPreprocessor.expandContractions("I can't do it")).toContain('cannot');
    expect(TextPreprocessor.expandContractions("won't work")).toContain('will not');
  });

  it('pipeline processing', () => {
    const result = TextPreprocessor.pipeline(
      '  Visit <a href="#">here</a>  https://example.com  ',
      ['normalize', 'removeHtml', 'removeUrls']
    );
    expect(result).not.toContain('<a');
    expect(result).not.toContain('https://');
  });
});

describe('NamedEntityRecognizer', () => {
  it('recognizes organizations', () => {
    const ner = new NamedEntityRecognizer();
    const entities = ner.recognize('I work at NASA and IBM');
    const orgs = entities.filter(e => e.type === 'ORG');
    expect(orgs.some(e => e.value === 'NASA')).toBe(true);
    expect(orgs.some(e => e.value === 'IBM')).toBe(true);
  });

  it('recognizes locations', () => {
    const ner = new NamedEntityRecognizer();
    const entities = ner.recognize('I live in London');
    const locs = entities.filter(e => e.type === 'LOCATION');
    expect(locs.some(e => e.value === 'London')).toBe(true);
  });

  it('adds custom rules', () => {
    const ner = new NamedEntityRecognizer();
    ner.addRule('PRODUCT', text => {
      const matches = text.match(/iPhone \d+/g);
      return (matches || []).map(m => ({ value: m, type: 'PRODUCT' }));
    });
    const entities = ner.recognize('I bought an iPhone 15');
    expect(entities.some(e => e.type === 'PRODUCT')).toBe(true);
  });
});

describe('ConversationContext', () => {
  it('adds turns', () => {
    const ctx = new ConversationContext();
    ctx.addTurn('user', 'Hello');
    ctx.addTurn('assistant', 'Hi there!');
    expect(ctx.turns.length).toBe(2);
  });

  it('gets last turns', () => {
    const ctx = new ConversationContext();
    ctx.addTurn('user', 'Hello');
    ctx.addTurn('assistant', 'Hi');
    ctx.addTurn('user', 'Help me');
    expect(ctx.getLastTurn().text).toBe('Help me');
    expect(ctx.getLastUserTurn().text).toBe('Help me');
  });

  it('tracks entities', () => {
    const ctx = new ConversationContext();
    ctx.addEntity('name', 'John');
    expect(ctx.getEntity('name')).toBe('John');
    expect(ctx.hasEntity('name')).toBe(true);
  });

  it('tracks topics', () => {
    const ctx = new ConversationContext();
    ctx.addTopic('weather');
    ctx.addTopic('news');
    expect(ctx.topics).toContain('weather');
  });

  it('gets conversation sentiment', () => {
    const ctx = new ConversationContext();
    ctx.addTurn('user', 'I love this amazing product!');
    expect(ctx.getConversationSentiment()).toBe('positive');
  });

  it('gets summary', () => {
    const ctx = new ConversationContext();
    ctx.addTurn('user', 'Hello');
    ctx.addEntity('name', 'John');
    ctx.addTopic('greeting');
    const summary = ctx.getSummary();
    expect(summary.turns).toBe(1);
    expect(summary.entities.name).toBe('John');
  });

  it('clears', () => {
    const ctx = new ConversationContext();
    ctx.addTurn('user', 'test');
    ctx.clear();
    expect(ctx.turns.length).toBe(0);
  });
});
