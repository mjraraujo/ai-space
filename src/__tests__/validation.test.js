import { describe, it, expect } from 'vitest';
import {
  z,
  ValidationError,
  validateSchema,
  createValidator,
  inferType,
  StringSchema,
  NumberSchema,
  BooleanSchema,
  ArraySchema,
  ObjectSchema,
  UnionSchema,
  LiteralSchema,
  EnumSchema,
  AnySchema,
  NeverSchema,
  LazySchema,
} from '../validation.js';

// ─── inferType ────────────────────────────────────────────────────────────────

describe('inferType', () => {
  it('returns "null" for null', () => expect(inferType(null)).toBe('null'));
  it('returns "array" for arrays', () => expect(inferType([1, 2])).toBe('array'));
  it('returns "date" for Date objects', () => expect(inferType(new Date())).toBe('date'));
  it('returns "number" for numbers', () => expect(inferType(42)).toBe('number'));
  it('returns "string" for strings', () => expect(inferType('hi')).toBe('string'));
  it('returns "boolean" for booleans', () => expect(inferType(true)).toBe('boolean'));
  it('returns "object" for plain objects', () => expect(inferType({})).toBe('object'));
  it('returns "undefined" for undefined', () => expect(inferType(undefined)).toBe('undefined'));
});

// ─── StringSchema ─────────────────────────────────────────────────────────────

describe('z.string()', () => {
  it('accepts a valid string', () => {
    const r = z.string().validate('hello');
    expect(r.valid).toBe(true);
    expect(r.value).toBe('hello');
  });

  it('rejects non-string values', () => {
    expect(z.string().validate(42).valid).toBe(false);
    expect(z.string().validate(true).valid).toBe(false);
  });

  it('rejects missing required value', () => {
    const r = z.string().required().validate(undefined);
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('accepts undefined when not required', () => {
    const r = z.string().optional().validate(undefined);
    expect(r.valid).toBe(true);
  });

  it('enforces min length', () => {
    const s = z.string().min(3);
    expect(s.validate('ab').valid).toBe(false);
    expect(s.validate('abc').valid).toBe(true);
  });

  it('enforces max length', () => {
    const s = z.string().max(3);
    expect(s.validate('abcd').valid).toBe(false);
    expect(s.validate('abc').valid).toBe(true);
  });

  it('enforces regex pattern', () => {
    const s = z.string().matches(/^\d+$/);
    expect(s.validate('123').valid).toBe(true);
    expect(s.validate('abc').valid).toBe(false);
  });

  it('trims with transform', () => {
    const s = z.string().transform(v => v.trim());
    const r = s.validate('  hello  ');
    expect(r.valid).toBe(true);
    expect(r.value).toBe('hello');
  });

  it('uses default value for undefined', () => {
    const s = z.string().default('fallback');
    const r = s.validate(undefined);
    expect(r.valid).toBe(true);
    expect(r.value).toBe('fallback');
  });

  it('coerces numbers to strings', () => {
    const s = z.coerce.string();
    const r = s.validate(42);
    expect(r.valid).toBe(true);
    expect(r.value).toBe('42');
  });
});

// ─── NumberSchema ─────────────────────────────────────────────────────────────

describe('z.number()', () => {
  it('accepts valid numbers', () => {
    expect(z.number().validate(0).valid).toBe(true);
    expect(z.number().validate(-1.5).valid).toBe(true);
    expect(z.number().validate(Infinity).valid).toBe(true);
  });

  it('rejects non-number values', () => {
    expect(z.number().validate('5').valid).toBe(false);
    expect(z.number().validate(true).valid).toBe(false);
  });

  it('enforces min', () => {
    const n = z.number().min(0);
    expect(n.validate(-1).valid).toBe(false);
    expect(n.validate(0).valid).toBe(true);
  });

  it('enforces max', () => {
    const n = z.number().max(100);
    expect(n.validate(101).valid).toBe(false);
    expect(n.validate(100).valid).toBe(true);
  });

  it('enforces integer constraint', () => {
    const n = z.number().integer();
    expect(n.validate(1.5).valid).toBe(false);
    expect(n.validate(2).valid).toBe(true);
  });

  it('coerces strings to numbers', () => {
    const r = z.coerce.number().validate('3.14');
    expect(r.valid).toBe(true);
    expect(r.value).toBeCloseTo(3.14);
  });
});

// ─── BooleanSchema ────────────────────────────────────────────────────────────

describe('z.boolean()', () => {
  it('accepts true/false', () => {
    expect(z.boolean().validate(true).valid).toBe(true);
    expect(z.boolean().validate(false).valid).toBe(true);
  });

  it('rejects non-booleans', () => {
    expect(z.boolean().validate(0).valid).toBe(false);
    expect(z.boolean().validate('true').valid).toBe(false);
  });

  it('coerces 0/1 to boolean', () => {
    const b = z.coerce.boolean();
    expect(b.validate(1).value).toBe(true);
    expect(b.validate(0).value).toBe(false);
  });
});

// ─── ArraySchema ──────────────────────────────────────────────────────────────

describe('z.array()', () => {
  it('accepts an empty array', () => {
    expect(z.array(z.number()).validate([]).valid).toBe(true);
  });

  it('accepts a valid array', () => {
    const r = z.array(z.number()).validate([1, 2, 3]);
    expect(r.valid).toBe(true);
    expect(r.value).toEqual([1, 2, 3]);
  });

  it('rejects non-array values', () => {
    // Strings are not arrays and are always rejected.
    expect(z.array(z.number()).validate('not an array').valid).toBe(false);
  });

  it('validates each element', () => {
    const r = z.array(z.number()).validate([1, 'two', 3]);
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('enforces minLength', () => {
    const a = z.array(z.number()).min(2);
    expect(a.validate([1]).valid).toBe(false);
    expect(a.validate([1, 2]).valid).toBe(true);
  });

  it('enforces maxLength', () => {
    const a = z.array(z.number()).max(2);
    expect(a.validate([1, 2, 3]).valid).toBe(false);
    expect(a.validate([1, 2]).valid).toBe(true);
  });
});

// ─── ObjectSchema ─────────────────────────────────────────────────────────────

describe('z.object()', () => {
  const PersonSchema = z.object({
    name: z.string().required(),
    age: z.number().required(),
  });

  it('accepts a valid object', () => {
    const r = PersonSchema.validate({ name: 'Alice', age: 30 });
    expect(r.valid).toBe(true);
    expect(r.value).toMatchObject({ name: 'Alice', age: 30 });
  });

  it('rejects non-objects', () => {
    // Arrays are not plain objects and should be rejected by object schema.
    expect(PersonSchema.validate([]).valid).toBe(false);
  });

  it('reports errors for invalid fields', () => {
    const r = PersonSchema.validate({ name: 123, age: 30 });
    expect(r.valid).toBe(false);
  });

  it('reports errors for missing required fields', () => {
    const r = PersonSchema.validate({ name: 'Bob' });
    expect(r.valid).toBe(false);
  });

  it('passes with extra keys (by default)', () => {
    const r = PersonSchema.validate({ name: 'Bob', age: 25, extra: 'x' });
    expect(r.valid).toBe(true);
  });

  it('supports nested objects', () => {
    const Schema = z.object({
      user: z.object({ name: z.string().required() }),
    });
    expect(Schema.validate({ user: { name: 'Carla' } }).valid).toBe(true);
    expect(Schema.validate({ user: { name: 42 } }).valid).toBe(false);
  });
});

// ─── UnionSchema ──────────────────────────────────────────────────────────────

describe('z.union()', () => {
  const StringOrNumber = z.union(z.string(), z.number());

  it('accepts any matching type', () => {
    expect(StringOrNumber.validate('hi').valid).toBe(true);
    expect(StringOrNumber.validate(42).valid).toBe(true);
  });

  it('rejects values that match no type', () => {
    // Booleans match neither string nor number in strict mode.
    expect(StringOrNumber.validate(false).valid).toBe(false);
  });
});

// ─── LiteralSchema ────────────────────────────────────────────────────────────

describe('z.literal()', () => {
  it('accepts the exact literal value', () => {
    expect(z.literal('hello').validate('hello').valid).toBe(true);
    expect(z.literal(42).validate(42).valid).toBe(true);
    expect(z.literal(true).validate(true).valid).toBe(true);
  });

  it('rejects different values', () => {
    expect(z.literal('hello').validate('world').valid).toBe(false);
    expect(z.literal(42).validate(43).valid).toBe(false);
  });
});

// ─── EnumSchema ───────────────────────────────────────────────────────────────

describe('z.enum()', () => {
  const Direction = z.enum('north', 'south', 'east', 'west');

  it('accepts valid enum members', () => {
    expect(Direction.validate('north').valid).toBe(true);
    expect(Direction.validate('west').valid).toBe(true);
  });

  it('rejects non-members', () => {
    expect(Direction.validate('up').valid).toBe(false);
    expect(Direction.validate('').valid).toBe(false);
  });
});

// ─── AnySchema / NeverSchema ──────────────────────────────────────────────────

describe('z.any()', () => {
  it('accepts any value', () => {
    for (const v of [null, undefined, 0, '', false, [], {}]) {
      expect(z.any().validate(v).valid).toBe(true);
    }
  });
});

describe('z.never()', () => {
  it('rejects defined non-null values', () => {
    for (const v of [0, '', false, [], {}]) {
      expect(z.never().validate(v).valid).toBe(false);
    }
  });
});

// ─── Custom validators ────────────────────────────────────────────────────────

describe('custom validators', () => {
  it('runs custom() validator on success', () => {
    const even = z.number().custom(v => v % 2 === 0, 'Must be even');
    expect(even.validate(4).valid).toBe(true);
    expect(even.validate(3).valid).toBe(false);
    expect(even.validate(3).errors[0].message).toContain('even');
  });

  it('supports chaining multiple custom validators', () => {
    const s = z.number()
      .custom(v => v > 0, 'Must be positive')
      .custom(v => v < 100, 'Must be less than 100');
    expect(s.validate(50).valid).toBe(true);
    expect(s.validate(-1).valid).toBe(false);
    expect(s.validate(200).valid).toBe(false);
  });
});

// ─── validateSchema / createValidator helpers ─────────────────────────────────

describe('validateSchema()', () => {
  it('delegates to schema.validate()', () => {
    const r = validateSchema(z.string(), 'hello');
    expect(r.valid).toBe(true);
    expect(r.value).toBe('hello');
  });
});

describe('createValidator()', () => {
  it('returns a callable validator function', () => {
    const validate = createValidator(z.number().min(0));
    expect(validate(5).valid).toBe(true);
    expect(validate(-1).valid).toBe(false);
  });
});

// ─── ValidationError ──────────────────────────────────────────────────────────

describe('ValidationError', () => {
  it('extends Error', () => {
    const e = new ValidationError('oops', ['a', 'b'], [{ message: 'oops' }]);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('ValidationError');
    expect(e.path).toEqual(['a', 'b']);
    expect(e.errors).toHaveLength(1);
  });

  it('toString() includes all error messages', () => {
    const e = new ValidationError('multi', [], [{ message: 'e1' }, { message: 'e2' }]);
    expect(e.toString()).toContain('e1');
    expect(e.toString()).toContain('e2');
  });

  it('toJSON() returns valid/errors shape', () => {
    const e = new ValidationError('fail', [], [{ message: 'bad' }]);
    const j = e.toJSON();
    expect(j.valid).toBe(false);
    expect(j.errors[0].message).toBe('bad');
  });
});

// ─── LazySchema ───────────────────────────────────────────────────────────────

describe('z.lazy()', () => {
  it('supports recursive schemas', () => {
    const nodeSchema = z.object({
      value: z.number().required(),
      children: z.array(z.lazy(() => nodeSchema)).optional(),
    });
    const r = nodeSchema.validate({
      value: 1,
      children: [{ value: 2 }, { value: 3, children: [{ value: 4 }] }],
    });
    expect(r.valid).toBe(true);
  });
});

// ─── Nullable / default values ────────────────────────────────────────────────

describe('nullable and defaults', () => {
  it('nullable() allows null', () => {
    const s = z.string().nullable();
    expect(s.validate(null).valid).toBe(true);
  });

  it('default() substitutes undefined with default value', () => {
    const n = z.number().default(0);
    expect(n.validate(undefined).value).toBe(0);
    expect(n.validate(5).value).toBe(5);
  });
});
