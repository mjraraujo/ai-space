import { describe, it, expect } from 'vitest';
import {
  TokenKind,
  Token,
  CompilerLexer,
  CompilerParser,
  Scope,
  SemanticAnalyzer,
  IRGen,
  Optimizer,
  CodeGen,
  Minifier,
  Compiler,
  compile,
  parse,
  tokenize,
} from '../compiler.js';

// ─── Tokenizer ────────────────────────────────────────────────────────────────

describe('CompilerLexer — tokenize', () => {
  function lex(src) {
    return new CompilerLexer(src).tokenize();
  }

  it('tokenizes integer literals', () => {
    const tokens = lex('42');
    expect(tokens[0].kind).toBe(TokenKind.NUMBER);
    // val is the raw source text; numerical value is obtained via parseFloat/parseInt
    expect(Number(tokens[0].val)).toBe(42);
  });

  it('tokenizes float literals', () => {
    const tokens = lex('3.14');
    expect(tokens[0].kind).toBe(TokenKind.NUMBER);
    expect(parseFloat(tokens[0].val)).toBeCloseTo(3.14);
  });

  it('tokenizes hex literals', () => {
    const tokens = lex('0xFF');
    expect(tokens[0].kind).toBe(TokenKind.NUMBER);
    // Hex literals are stored as their raw source string
    expect(tokens[0].val).toMatch(/0[xX][fF][fF]/i);
  });

  it('tokenizes string literals', () => {
    const tokens = lex('"hello"');
    expect(tokens[0].kind).toBe(TokenKind.STRING);
    expect(tokens[0].val).toBe('hello');
  });

  it('tokenizes single-quoted strings', () => {
    const tokens = lex("'world'");
    expect(tokens[0].kind).toBe(TokenKind.STRING);
    expect(tokens[0].val).toBe('world');
  });

  it('tokenizes boolean literals', () => {
    const tokens = lex('true false');
    expect(tokens[0].kind).toBe(TokenKind.BOOL);
    expect(tokens[0].val).toBe(true);
    expect(tokens[1].kind).toBe(TokenKind.BOOL);
    expect(tokens[1].val).toBe(false);
  });

  it('tokenizes null and undefined', () => {
    const tokens = lex('null undefined');
    expect(tokens[0].kind).toBe(TokenKind.NULL);
    expect(tokens[1].kind).toBe(TokenKind.UNDEFINED);
  });

  it('tokenizes identifiers', () => {
    const tokens = lex('foo bar _baz $x');
    expect(tokens[0].kind).toBe(TokenKind.IDENT);
    expect(tokens[0].val).toBe('foo');
    expect(tokens[1].val).toBe('bar');
    expect(tokens[2].val).toBe('_baz');
    expect(tokens[3].val).toBe('$x');
  });

  it('tokenizes keywords', () => {
    const tokens = lex('let const function return');
    expect(tokens[0].kind).toBe(TokenKind.LET);
    expect(tokens[1].kind).toBe(TokenKind.CONST);
    expect(tokens[2].kind).toBe(TokenKind.FUNCTION);
    expect(tokens[3].kind).toBe(TokenKind.RETURN);
  });

  it('tokenizes operators', () => {
    const tokens = lex('+ - * / % **');
    expect(tokens.map(t => t.kind)).toEqual([
      TokenKind.PLUS, TokenKind.MINUS, TokenKind.STAR,
      TokenKind.SLASH, TokenKind.MOD, TokenKind.POW,
      TokenKind.EOF
    ]);
  });

  it('tokenizes comparison operators', () => {
    const tokens = lex('=== !== == != <= >=');
    expect(tokens[0].kind).toBe(TokenKind.EEQ);
    expect(tokens[1].kind).toBe(TokenKind.NEEQ);
    expect(tokens[2].kind).toBe(TokenKind.EQ);
    expect(tokens[3].kind).toBe(TokenKind.NEQ);
    expect(tokens[4].kind).toBe(TokenKind.LTE);
    expect(tokens[5].kind).toBe(TokenKind.GTE);
  });

  it('skips single-line comments', () => {
    const tokens = lex('1 // comment\n2');
    const numbers = tokens.filter(t => t.kind === TokenKind.NUMBER);
    expect(numbers).toHaveLength(2);
  });

  it('skips block comments', () => {
    const tokens = lex('1 /* block comment */ 2');
    const numbers = tokens.filter(t => t.kind === TokenKind.NUMBER);
    expect(numbers).toHaveLength(2);
  });

  it('records source location (line/col)', () => {
    const tokens = lex('a\nb');
    expect(tokens[0].loc.line).toBe(1);
    expect(tokens[1].loc.line).toBe(2);
  });

  it('tokenizes template literals', () => {
    const tokens = lex('`hello world`');
    expect(tokens[0].kind).toBe(TokenKind.TEMPLATE);
  });

  it('ends with an EOF token', () => {
    const tokens = lex('x');
    expect(tokens[tokens.length - 1].kind).toBe(TokenKind.EOF);
  });
});

// ─── tokenize() helper ────────────────────────────────────────────────────────

describe('tokenize() top-level helper', () => {
  it('returns an array of Token objects', () => {
    const tokens = tokenize('let x = 1;');
    expect(Array.isArray(tokens)).toBe(true);
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens[0]).toBeInstanceOf(Token);
  });

  it('includes an EOF token at the end', () => {
    const tokens = tokenize('1 + 2');
    expect(tokens[tokens.length - 1].kind).toBe(TokenKind.EOF);
  });
});

// ─── parse() helper ───────────────────────────────────────────────────────────

describe('parse() top-level helper', () => {
  it('returns an AST with a body array for an empty program', () => {
    const ast = parse('');
    expect(ast).toHaveProperty('body');
    expect(Array.isArray(ast.body)).toBe(true);
  });

  it('parses a variable declaration', () => {
    const ast = parse('let x = 1;');
    expect(ast.body.length).toBeGreaterThanOrEqual(1);
    const decl = ast.body[0];
    expect(decl.nodeType).toMatch(/Var/);
  });

  it('parses a function declaration', () => {
    const ast = parse('function add(a, b) { return a + b; }');
    const stmt = ast.body[0];
    // Function declarations may be wrapped in ExprStmt or FuncDecl nodes.
    const fn = stmt.expr || stmt;
    expect(fn.name).toBe('add');
  });

  it('parses an if statement', () => {
    const ast = parse('if (x > 0) { x = 1; }');
    const stmt = ast.body[0];
    expect(stmt.nodeType).toMatch(/If/);
  });

  it('parses a while loop', () => {
    const ast = parse('while (i < 10) { i++; }');
    const stmt = ast.body[0];
    expect(stmt.nodeType).toMatch(/While/);
  });

  it('parses a for loop', () => {
    const ast = parse('for (let i = 0; i < 10; i++) {}');
    const stmt = ast.body[0];
    expect(stmt.nodeType).toMatch(/For/);
  });

  it('parses arrow functions', () => {
    const ast = parse('const f = (x) => x * 2;');
    const decl = ast.body[0];
    expect(decl.nodeType).toMatch(/Var/);
  });

  it('parses class declarations', () => {
    const ast = parse('class Foo { constructor() {} }');
    const cls = ast.body[0];
    expect(cls.nodeType).toMatch(/Class/);
    expect(cls.name).toBe('Foo');
  });

  it('parses try/catch/finally', () => {
    const ast = parse('try { foo(); } catch(e) { bar(); } finally { baz(); }');
    const stmt = ast.body[0];
    expect(stmt.nodeType).toMatch(/Try/);
  });

  it('parses object literals', () => {
    const ast = parse('const o = { a: 1, b: 2 };');
    expect(ast.body.length).toBeGreaterThan(0);
  });

  it('parses array literals', () => {
    const ast = parse('const arr = [1, 2, 3];');
    expect(ast.body.length).toBeGreaterThan(0);
  });

  it('parses spread expressions', () => {
    const ast = parse('const b = [...a];');
    expect(ast.body.length).toBeGreaterThan(0);
  });

  it('parses destructuring assignment', () => {
    const ast = parse('const { x, y } = obj;');
    expect(ast.body.length).toBeGreaterThan(0);
  });

  it('parses optional chaining', () => {
    const ast = parse('const x = a?.b?.c;');
    expect(ast.body.length).toBeGreaterThan(0);
  });

  it('parses nullish coalescing', () => {
    const ast = parse('const x = a ?? b;');
    expect(ast.body.length).toBeGreaterThan(0);
  });

  it('parses async/await — async flag is set on the function node', () => {
    const ast = parse('async function f() { await g(); }');
    const stmt = ast.body[0];
    // The parser wraps async function declarations in ExprStmt nodes.
    const fn = stmt.expr || stmt;
    expect(fn.async).toBe(true);
  });
});

// ─── Scope ────────────────────────────────────────────────────────────────────

describe('Scope', () => {
  it('defines and looks up variables', () => {
    const scope = new Scope(null);
    scope.define('x', { type: 'number' });
    const result = scope.lookup('x');
    // lookup() returns {scope, info} — check the info field.
    expect(result.info).toMatchObject({ type: 'number' });
  });

  it('looks up variables in parent scope', () => {
    const parent = new Scope(null);
    parent.define('y', { type: 'string' });
    const child = new Scope(parent);
    const result = child.lookup('y');
    expect(result.info).toMatchObject({ type: 'string' });
  });

  it('returns null/undefined for undeclared variables', () => {
    const scope = new Scope(null);
    const result = scope.lookup('z');
    expect(result == null || result === undefined || result === null).toBe(true);
  });

  it('child scope shadows parent', () => {
    const parent = new Scope(null);
    parent.define('x', { type: 'number' });
    const child = new Scope(parent);
    child.define('x', { type: 'string' });
    const result = child.lookup('x');
    expect(result.info).toMatchObject({ type: 'string' });
  });
});

// ─── compile() result structure ───────────────────────────────────────────────

describe('compile() result', () => {
  it('returns an object with ok, code, ast, errors fields', () => {
    const result = compile('let x = 1;');
    expect(result).toHaveProperty('ok');
    expect(result).toHaveProperty('code');
    expect(result).toHaveProperty('ast');
    expect(result).toHaveProperty('errors');
  });

  it('ok is true for valid code', () => {
    expect(compile('let x = 42;').ok).toBe(true);
  });

  it('code contains expected content for variable declarations', () => {
    const { code } = compile('let x = 42;');
    expect(code).toContain('42');
  });

  it('code contains expected content for function declarations', () => {
    const { code } = compile('function greet(name) { return "Hello " + name; }');
    expect(code).toContain('greet');
    expect(code).toContain('return');
  });

  it('code contains if/else keywords', () => {
    const { code } = compile('if (x > 0) { y = 1; } else { y = 0; }');
    expect(code).toContain('if');
    expect(code).toContain('else');
  });

  it('code contains while keyword', () => {
    const { code } = compile('while (i < 10) { i = i + 1; }');
    expect(code).toContain('while');
  });

  it('code contains for keyword', () => {
    const { code } = compile('for (let i = 0; i < 3; i++) { sum = sum + i; }');
    expect(code).toContain('for');
  });

  it('code contains class keyword', () => {
    const { code } = compile('class Animal { constructor(n) { this.name = n; } }');
    expect(code).toContain('class');
    expect(code).toContain('Animal');
  });

  it('code is a non-empty string for non-trivial programs', () => {
    const src = `
      function fib(n) {
        if (n <= 1) return n;
        return fib(n - 1) + fib(n - 2);
      }
    `;
    const { code } = compile(src);
    expect(typeof code).toBe('string');
    expect(code.trim().length).toBeGreaterThan(0);
  });

  it('code contains key identifiers', () => {
    const { code } = compile('const answer = 42;');
    expect(code).toContain('answer');
  });

  it('ok is true and code is a non-empty string when minify option is set', () => {
    const result = compile('let longVariableName = 1 + 2 + 3;', { minify: true });
    expect(result.ok).toBe(true);
    expect(typeof result.code).toBe('string');
    expect(result.code.length).toBeGreaterThan(0);
  });

  it('has empty errors array for valid code', () => {
    const { errors } = compile('const x = 1;');
    expect(Array.isArray(errors)).toBe(true);
    expect(errors.length).toBe(0);
  });
});

// ─── Minifier ─────────────────────────────────────────────────────────────────

describe('Minifier', () => {
  it('reduces whitespace in simple code', () => {
    const m = new Minifier();
    const src = 'let   x   =   1;';
    const out = m.minify(src);
    expect(out.length).toBeLessThan(src.length);
  });

  it('strips single-line comments', () => {
    const m = new Minifier();
    const out = m.minify('let x = 1; // comment\n');
    expect(out).not.toContain('comment');
  });
});
