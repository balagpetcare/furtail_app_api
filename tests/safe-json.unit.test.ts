import { AppError } from '../src/core/errors/app-error';
import { safeJsonStringify } from '../src/shared/safe-json';

describe('safeJsonStringify', () => {
  it('serializes BigInt as a string', () => {
    const result = safeJsonStringify({ id: 42n });
    expect(JSON.parse(result)).toEqual({ id: '42' });
  });

  it('serializes Date as an ISO 8601 string', () => {
    const date = new Date('2026-01-15T10:30:00.000Z');
    const result = safeJsonStringify({ createdAt: date });
    expect(JSON.parse(result)).toEqual({ createdAt: '2026-01-15T10:30:00.000Z' });
  });

  it('omits undefined values from objects (native JSON.stringify behavior)', () => {
    const result = safeJsonStringify({ a: 1, b: undefined });
    expect(JSON.parse(result)).toEqual({ a: 1 });
  });

  it('converts undefined to null inside arrays (native JSON.stringify behavior)', () => {
    const result = safeJsonStringify([1, undefined, 3]);
    expect(JSON.parse(result)).toEqual([1, null, 3]);
  });

  it('serializes nested arrays and objects correctly', () => {
    const value = {
      users: [
        { id: 1n, name: 'Ava', joined: new Date('2026-02-01T00:00:00.000Z') },
        { id: 2n, name: 'Bo', tags: ['a', 'b', { nested: true }] },
      ],
    };
    const result = safeJsonStringify(value);
    expect(JSON.parse(result)).toEqual({
      users: [
        { id: '1', name: 'Ava', joined: '2026-02-01T00:00:00.000Z' },
        { id: '2', name: 'Bo', tags: ['a', 'b', { nested: true }] },
      ],
    });
  });

  it('does not false-positive on non-circular shared references', () => {
    // The same object appearing twice as siblings is valid JSON, not a cycle.
    const shared = { value: 1 };
    const value = { a: shared, b: shared };
    const result = safeJsonStringify(value);
    expect(JSON.parse(result)).toEqual({ a: { value: 1 }, b: { value: 1 } });
  });

  it('correctly backtracks after a nested object so a later sibling is not falsely flagged', () => {
    const value = {
      first: { child: { deep: true } },
      second: { child: { deep: true } },
    };
    const result = safeJsonStringify(value);
    expect(JSON.parse(result)).toEqual(value);
  });

  it('throws a typed AppError for a direct circular reference', () => {
    const obj: Record<string, unknown> = { name: 'circular' };
    obj.self = obj;

    expect(() => safeJsonStringify(obj)).toThrow(AppError);
    try {
      safeJsonStringify(obj);
      throw new Error('expected safeJsonStringify to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('SERIALIZATION_ERROR');
      expect((err as AppError).statusCode).toBe(500);
    }
  });

  it('throws a typed AppError for a nested circular reference', () => {
    const child: Record<string, unknown> = { name: 'child' };
    const parent: Record<string, unknown> = { name: 'parent', child };
    child.parent = parent;

    expect(() => safeJsonStringify({ root: parent })).toThrow(AppError);
  });
});
