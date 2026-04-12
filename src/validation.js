/**
 * validation.js — Comprehensive data validation library.
 * Schema validation, type coercion, custom validators, error formatting,
 * nested schemas, arrays, unions, transforms, localization.
 */

// ─── Validation error ─────────────────────────────────────────────────────────
export class ValidationError extends Error {
  constructor(message, path = [], errors = []) {
    super(message);
    this.name = 'ValidationError';
    this.path = path;
    this.errors = errors;
  }
  toString() { return `ValidationError: ${this.errors.map(e => e.message).join(', ')}`; }
  toJSON() { return { valid: false, errors: this.errors }; }
}

// ─── Result helpers ───────────────────────────────────────────────────────────
function ok(value) { return { valid: true, value, errors: [] }; }
function fail(message, path = []) { return { valid: false, value: undefined, errors: [{ message, path: path.join('.') || '.' }] }; }
function mergeResults(results) {
  const errors = results.flatMap(r => r.errors ?? []);
  return { valid: errors.length === 0, errors };
}

// ─── Base schema ──────────────────────────────────────────────────────────────
export class Schema {
  constructor(type) {
    this._type = type;
    this._required = false;
    this._nullable = false;
    this._label = null;
    this._default = undefined;
    this._transforms = [];
    this._validators = [];
    this._messages = {};
    this._coerce = false;
  }

  required(msg) { this._required = true; this._messages.required = msg; return this; }
  optional() { this._required = false; return this; }
  nullable() { this._nullable = true; return this; }
  default(val) { this._default = val; return this; }
  label(name) { this._label = name; return this; }
  coerce() { this._coerce = true; return this; }

  transform(fn) { this._transforms.push(fn); return this; }
  custom(fn, msg = 'Custom validation failed') {
    this._validators.push((v, path) => {
      const result = fn(v, path);
      if (result === false || result === null) return fail(msg, path);
      if (typeof result === 'string') return fail(result, path);
      if (result === true || result === undefined) return ok(v);
      return result;
    });
    return this;
  }

  test(name, fn) {
    return this.custom((v, path) => {
      const r = fn(v);
      if (r === false) return fail(`${this._label ?? 'Value'} failed validation: ${name}`, path);
      return true;
    });
  }

  _applyTransforms(value) {
    let v = value;
    for (const t of this._transforms) v = t(v);
    return v;
  }

  validate(value, path = []) {
    // Handle undefined/null
    if (value === undefined || value === null) {
      if (value === null && this._nullable) return ok(null);
      if (value === undefined && this._default !== undefined) return ok(this._default);
      if (!this._required) return ok(value ?? undefined);
      return fail(this._messages.required ?? `${this._label ?? 'Value'} is required`, path);
    }

    // Coerce if enabled
    let v = value;
    if (this._coerce) { const c = this._coerceValue(v); if (c.valid) v = c.value; else return c; }

    // Type check
    const typeResult = this._checkType(v, path);
    if (!typeResult.valid) return typeResult;
    v = typeResult.value;

    // Transforms
    v = this._applyTransforms(v);

    // Custom validators
    for (const validator of this._validators) {
      const r = validator(v, path);
      if (!r.valid) return r;
    }

    return ok(v);
  }

  _checkType(v, path) { return ok(v); }
  _coerceValue(v) { return ok(v); }

  parse(value) {
    const result = this.validate(value);
    if (!result.valid) throw new ValidationError('Validation failed', [], result.errors);
    return result.value;
  }

  safeParse(value) {
    try { return { success: true, data: this.parse(value), error: null }; }
    catch (e) { return { success: false, data: undefined, error: e }; }
  }

  isValid(value) { return this.validate(value).valid; }
  or(other) { return new UnionSchema([this, other]); }
  and(other) { return new IntersectionSchema([this, other]); }
  nullable() { const s = this._clone(); s._nullable = true; return s; }
  _clone() { return Object.assign(Object.create(Object.getPrototypeOf(this)), this); }
  describe() { return { type: this._type, required: this._required, label: this._label }; }
}

// ─── String ───────────────────────────────────────────────────────────────────
export class StringSchema extends Schema {
  constructor() { super('string'); this._minLen = null; this._maxLen = null; }
  _checkType(v, path) {
    if (typeof v !== 'string') return fail(`${this._label ?? 'Value'} must be a string`, path);
    return ok(v);
  }
  _coerceValue(v) { return ok(String(v)); }
  min(n, msg) { this._minLen = n; return this.custom((v, path) => v.length >= n || fail(msg ?? `${this._label ?? 'Value'} must be at least ${n} characters`, path)); }
  max(n, msg) { this._maxLen = n; return this.custom((v, path) => v.length <= n || fail(msg ?? `${this._label ?? 'Value'} must be at most ${n} characters`, path)); }
  length(n, msg) { return this.custom((v, path) => v.length === n || fail(msg ?? `${this._label ?? 'Value'} must be exactly ${n} characters`, path)); }
  matches(re, msg) { return this.custom((v, path) => re.test(v) || fail(msg ?? `${this._label ?? 'Value'} has invalid format`, path)); }
  email(msg) { return this.matches(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, msg ?? 'Invalid email address'); }
  url(msg) { return this.custom((v, path) => { try { new URL(v); return true; } catch { return fail(msg ?? 'Invalid URL', path); } }); }
  uuid(msg) { return this.matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, msg ?? 'Invalid UUID'); }
  ip(version) {
    const v4 = /^(\d{1,3}\.){3}\d{1,3}$/, v6 = /^([0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}$/i;
    return this.custom((v, path) => {
      if (!version || version === 4) if (v4.test(v) && v.split('.').every(n => n <= 255)) return true;
      if (!version || version === 6) if (v6.test(v)) return true;
      return fail(`Invalid IP address`, path);
    });
  }
  trim() { return this.transform(v => v.trim()); }
  lowercase() { return this.transform(v => v.toLowerCase()); }
  uppercase() { return this.transform(v => v.toUpperCase()); }
  oneOf(values, msg) { return this.custom((v, path) => values.includes(v) || fail(msg ?? `${this._label ?? 'Value'} must be one of: ${values.join(', ')}`, path)); }
  startsWith(prefix, msg) { return this.custom((v, path) => v.startsWith(prefix) || fail(msg ?? `Must start with "${prefix}"`, path)); }
  endsWith(suffix, msg) { return this.custom((v, path) => v.endsWith(suffix) || fail(msg ?? `Must end with "${suffix}"`, path)); }
  nonempty(msg) { return this.min(1, msg ?? 'Cannot be empty'); }
}

// ─── Number ───────────────────────────────────────────────────────────────────
export class NumberSchema extends Schema {
  constructor() { super('number'); }
  _checkType(v, path) {
    if (typeof v !== 'number' || isNaN(v)) return fail(`${this._label ?? 'Value'} must be a number`, path);
    return ok(v);
  }
  _coerceValue(v) { const n = Number(v); return isNaN(n) ? fail('Cannot coerce to number') : ok(n); }
  min(n, msg) { return this.custom((v, path) => v >= n || fail(msg ?? `Must be at least ${n}`, path)); }
  max(n, msg) { return this.custom((v, path) => v <= n || fail(msg ?? `Must be at most ${n}`, path)); }
  positive(msg) { return this.custom((v, path) => v > 0 || fail(msg ?? 'Must be positive', path)); }
  negative(msg) { return this.custom((v, path) => v < 0 || fail(msg ?? 'Must be negative', path)); }
  nonNegative(msg) { return this.custom((v, path) => v >= 0 || fail(msg ?? 'Must be non-negative', path)); }
  integer(msg) { return this.custom((v, path) => Number.isInteger(v) || fail(msg ?? 'Must be an integer', path)); }
  finite(msg) { return this.custom((v, path) => Number.isFinite(v) || fail(msg ?? 'Must be finite', path)); }
  multipleOf(n, msg) { return this.custom((v, path) => v % n === 0 || fail(msg ?? `Must be a multiple of ${n}`, path)); }
  safe(msg) { return this.custom((v, path) => Number.isSafeInteger(v) || fail(msg ?? 'Must be a safe integer', path)); }
}

// ─── Boolean ─────────────────────────────────────────────────────────────────
export class BooleanSchema extends Schema {
  constructor() { super('boolean'); }
  _checkType(v, path) {
    if (typeof v !== 'boolean') return fail(`${this._label ?? 'Value'} must be a boolean`, path);
    return ok(v);
  }
  _coerceValue(v) {
    if (v === 'true' || v === 1 || v === true) return ok(true);
    if (v === 'false' || v === 0 || v === false) return ok(false);
    return fail('Cannot coerce to boolean');
  }
  truthy(msg) { return this.custom((v, path) => v === true || fail(msg ?? 'Must be true', path)); }
  falsy(msg) { return this.custom((v, path) => v === false || fail(msg ?? 'Must be false', path)); }
}

// ─── Date ─────────────────────────────────────────────────────────────────────
export class DateSchema extends Schema {
  constructor() { super('date'); }
  _checkType(v, path) {
    const d = v instanceof Date ? v : new Date(v);
    if (isNaN(d.getTime())) return fail(`${this._label ?? 'Value'} must be a valid date`, path);
    return ok(d);
  }
  _coerceValue(v) {
    const d = new Date(v);
    return isNaN(d.getTime()) ? fail('Invalid date') : ok(d);
  }
  min(date, msg) { const d = new Date(date); return this.custom((v, path) => v >= d || fail(msg ?? `Date must be after ${date}`, path)); }
  max(date, msg) { const d = new Date(date); return this.custom((v, path) => v <= d || fail(msg ?? `Date must be before ${date}`, path)); }
  past(msg) { return this.custom((v, path) => v < new Date() || fail(msg ?? 'Must be in the past', path)); }
  future(msg) { return this.custom((v, path) => v > new Date() || fail(msg ?? 'Must be in the future', path)); }
  between(lo, hi, msg) { return this.min(lo, msg).max(hi, msg); }
}

// ─── Array ────────────────────────────────────────────────────────────────────
export class ArraySchema extends Schema {
  constructor(item) { super('array'); this._item = item; }
  _checkType(v, path) {
    if (!Array.isArray(v)) return fail(`${this._label ?? 'Value'} must be an array`, path);
    if (!this._item) return ok(v);
    const errors = [];
    const values = v.map((item, i) => {
      const r = this._item.validate(item, [...path, String(i)]);
      if (!r.valid) errors.push(...r.errors);
      return r.value;
    });
    if (errors.length) return { valid: false, value: undefined, errors };
    return ok(values);
  }
  _coerceValue(v) { return Array.isArray(v) ? ok(v) : ok([v]); }
  min(n, msg) { return this.custom((v, path) => v.length >= n || fail(msg ?? `Array must have at least ${n} items`, path)); }
  max(n, msg) { return this.custom((v, path) => v.length <= n || fail(msg ?? `Array must have at most ${n} items`, path)); }
  length(n, msg) { return this.custom((v, path) => v.length === n || fail(msg ?? `Array must have exactly ${n} items`, path)); }
  nonempty(msg) { return this.min(1, msg ?? 'Array cannot be empty'); }
  unique(msg) { return this.custom((v, path) => { const seen = new Set(); return v.every(item => { const k = JSON.stringify(item); if (seen.has(k)) return false; seen.add(k); return true; }) || fail(msg ?? 'Array must have unique items', path); }); }
  contains(val, msg) { return this.custom((v, path) => v.includes(val) || fail(msg ?? `Array must contain ${val}`, path)); }
}

// ─── Object ───────────────────────────────────────────────────────────────────
export class ObjectSchema extends Schema {
  constructor(shape = {}) { super('object'); this._shape = shape; this._strict = false; this._passthrough = false; }
  _checkType(v, path) {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return fail(`${this._label ?? 'Value'} must be an object`, path);
    const errors = [], result = {};

    // Check unknown keys
    if (this._strict) {
      const unknownKeys = Object.keys(v).filter(k => !(k in this._shape));
      if (unknownKeys.length) return fail(`Unknown keys: ${unknownKeys.join(', ')}`, path);
    }

    // Validate each field
    for (const [key, schema] of Object.entries(this._shape)) {
      const r = schema.validate(v[key], [...path, key]);
      if (!r.valid) errors.push(...r.errors);
      else if (r.value !== undefined) result[key] = r.value;
    }

    if (this._passthrough) {
      for (const [k, val] of Object.entries(v)) if (!(k in this._shape)) result[k] = val;
    }

    if (errors.length) return { valid: false, value: undefined, errors };
    return ok(result);
  }
  strict() { this._strict = true; return this; }
  passthrough() { this._passthrough = true; return this; }
  extend(extraShape) { return new ObjectSchema({ ...this._shape, ...extraShape }); }
  pick(keys) { return new ObjectSchema(Object.fromEntries(keys.map(k => [k, this._shape[k]]))); }
  omit(keys) { return new ObjectSchema(Object.fromEntries(Object.entries(this._shape).filter(([k]) => !keys.includes(k)))); }
  partial() { return new ObjectSchema(Object.fromEntries(Object.entries(this._shape).map(([k, s]) => [k, s.optional()]))); }
  keys() { return Object.keys(this._shape); }
}

// ─── Tuple ────────────────────────────────────────────────────────────────────
export class TupleSchema extends Schema {
  constructor(items) { super('tuple'); this._items = items; }
  _checkType(v, path) {
    if (!Array.isArray(v)) return fail('Must be an array', path);
    if (v.length !== this._items.length) return fail(`Tuple must have exactly ${this._items.length} elements`, path);
    const errors = [], result = [];
    for (let i = 0; i < this._items.length; i++) {
      const r = this._items[i].validate(v[i], [...path, String(i)]);
      if (!r.valid) errors.push(...r.errors);
      else result.push(r.value);
    }
    if (errors.length) return { valid: false, value: undefined, errors };
    return ok(result);
  }
}

// ─── Union ────────────────────────────────────────────────────────────────────
export class UnionSchema extends Schema {
  constructor(types) { super('union'); this._types = types; }
  _checkType(v, path) {
    for (const t of this._types) {
      const r = t.validate(v, path);
      if (r.valid) return r;
    }
    return fail(`Value does not match any of the union types`, path);
  }
}

// ─── Intersection ─────────────────────────────────────────────────────────────
export class IntersectionSchema extends Schema {
  constructor(types) { super('intersection'); this._types = types; }
  _checkType(v, path) {
    let result = v;
    for (const t of this._types) {
      const r = t.validate(v, path);
      if (!r.valid) return r;
      result = { ...result, ...r.value };
    }
    return ok(result);
  }
}

// ─── Literal ──────────────────────────────────────────────────────────────────
export class LiteralSchema extends Schema {
  constructor(value) { super('literal'); this._value = value; }
  _checkType(v, path) {
    return v === this._value ? ok(v) : fail(`Must be exactly ${JSON.stringify(this._value)}`, path);
  }
}

// ─── Enum ─────────────────────────────────────────────────────────────────────
export class EnumSchema extends Schema {
  constructor(values) { super('enum'); this._values = values; }
  _checkType(v, path) {
    return this._values.includes(v) ? ok(v) : fail(`Must be one of: ${this._values.map(v => JSON.stringify(v)).join(', ')}`, path);
  }
}

// ─── Record ───────────────────────────────────────────────────────────────────
export class RecordSchema extends Schema {
  constructor(keySchema, valueSchema) { super('record'); this._keySchema = keySchema; this._valueSchema = valueSchema; }
  _checkType(v, path) {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return fail('Must be an object', path);
    const errors = [], result = {};
    for (const [k, val] of Object.entries(v)) {
      const kr = this._keySchema.validate(k, [...path, k]);
      if (!kr.valid) errors.push(...kr.errors);
      const vr = this._valueSchema.validate(val, [...path, k]);
      if (!vr.valid) errors.push(...vr.errors);
      else result[k] = vr.value;
    }
    if (errors.length) return { valid: false, value: undefined, errors };
    return ok(result);
  }
}

// ─── Any / Unknown ────────────────────────────────────────────────────────────
export class AnySchema extends Schema { constructor() { super('any'); } _checkType(v) { return ok(v); } }
export class UnknownSchema extends Schema { constructor() { super('unknown'); } _checkType(v) { return ok(v); } }
export class NeverSchema extends Schema { constructor() { super('never'); } _checkType(v, path) { return fail('Never type always fails', path); } }

// ─── Lazy (for recursive schemas) ─────────────────────────────────────────────
export class LazySchema extends Schema {
  constructor(fn) { super('lazy'); this._fn = fn; }
  _checkType(v, path) { return this._fn().validate(v, path); }
}

// ─── Builder functions ────────────────────────────────────────────────────────
export const z = {
  string: () => new StringSchema(),
  number: () => new NumberSchema(),
  boolean: () => new BooleanSchema(),
  date: () => new DateSchema(),
  array: (item) => new ArraySchema(item),
  object: (shape) => new ObjectSchema(shape),
  tuple: (...items) => new TupleSchema(items),
  union: (...types) => new UnionSchema(types),
  intersection: (...types) => new IntersectionSchema(types),
  literal: (val) => new LiteralSchema(val),
  enum: (...values) => new EnumSchema(values),
  record: (k, v) => new RecordSchema(k, v),
  any: () => new AnySchema(),
  unknown: () => new UnknownSchema(),
  never: () => new NeverSchema(),
  lazy: (fn) => new LazySchema(fn),
  nullable: (schema) => schema.nullable(),
  optional: (schema) => schema.optional(),
  coerce: { string: () => new StringSchema().coerce(), number: () => new NumberSchema().coerce(), boolean: () => new BooleanSchema().coerce(), date: () => new DateSchema().coerce() },
};

// ─── Standalone validators ────────────────────────────────────────────────────
export function validateSchema(schema, value) { return schema.validate(value); }

export function createValidator(schema) {
  return (value) => {
    const r = schema.validate(value);
    return { valid: r.valid, errors: r.errors, value: r.value };
  };
}

export function inferType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (value instanceof Date) return 'date';
  return typeof value;
}

export default {
  Schema, StringSchema, NumberSchema, BooleanSchema, DateSchema,
  ArraySchema, ObjectSchema, TupleSchema, UnionSchema, IntersectionSchema,
  LiteralSchema, EnumSchema, RecordSchema, AnySchema, UnknownSchema, NeverSchema, LazySchema,
  ValidationError, z, validateSchema, createValidator, inferType,
};
