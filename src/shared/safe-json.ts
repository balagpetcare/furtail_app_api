import { AppError } from '../core/errors/app-error';
import { ErrorCode } from '../core/errors/error-codes';
import { Decimal } from '@prisma/client/runtime/client';

/**
 * JSON-serializes a value while deliberately handling the cases native
 * `JSON.stringify` gets wrong or throws on for API responses:
 *
 * - `BigInt`  -> string (native JSON.stringify throws TypeError)
 * - `Date`    -> ISO 8601 string (native behavior, made explicit/tested here)
 * - `undefined` in objects -> key omitted; in arrays -> `null` (native
 *   JSON.stringify behavior, preserved rather than reinvented)
 * - circular references -> throws a typed `AppError` instead of a raw
 *   `TypeError: Converting circular structure to JSON`
 *
 * Circular detection tracks only the current ancestor chain (ancestors of
 * the value currently being visited), popping entries as the traversal
 * backtracks (detected via the replacer's `this` binding, which is the
 * holder object of the current key). A plain "all visited objects" set
 * would false-positive on non-circular shared references — e.g.
 * `{ a: shared, b: shared }` is valid JSON, not a cycle.
 *
 * Deliberately does NOT monkey-patch `BigInt.prototype.toJSON` or
 * `JSON.stringify` — this is an explicit, opt-in serialization path used
 * only by the response envelope helpers, so unrelated code (logging,
 * third-party libs) is unaffected.
 */
export function safeJsonStringify(value: unknown): string {
  try {
    const sanitized = sanitizeValue(value, new Set<unknown>());
    return JSON.stringify(sanitized) ?? 'null';
  } catch (err) {
    if (err instanceof CircularReferenceError) {
      throw new AppError(
        ErrorCode.SERIALIZATION_ERROR,
        'Refused to serialize a circular data structure',
        500,
      );
    }
    throw err;
  }
}

function sanitizeValue(value: unknown, ancestors: Set<unknown>): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new AppError(
        ErrorCode.SERIALIZATION_ERROR,
        'Refused to serialize an invalid Date',
        500,
      );
    }
    return value.toISOString();
  }
  if (value instanceof Decimal) {
    return value.toString();
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      throw new CircularReferenceError();
    }
    ancestors.add(value);
    const output = value.map((item) => sanitizeValue(item, ancestors));
    ancestors.delete(value);
    return output;
  }
  if (ancestors.has(value)) {
    throw new CircularReferenceError();
  }
  ancestors.add(value);
  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    const sanitized = sanitizeValue(nested, ancestors);
    if (sanitized !== undefined) {
      output[key] = sanitized;
    }
  }
  ancestors.delete(value);
  return output;
}

/** Internal sentinel thrown by the replacer, translated to an AppError above. */
class CircularReferenceError extends Error {
  constructor() {
    super('circular reference detected during JSON serialization');
    this.name = 'CircularReferenceError';
  }
}
