/**
 * Validate and format a numeric vector as a PostgreSQL vector literal.
 * Throws if any value is non-finite (NaN, Infinity).
 */
export function toVectorLiteral(vector: number[]): string {
  for (let i = 0; i < vector.length; i++) {
    if (!Number.isFinite(vector[i])) {
      throw new Error(`Vector contains non-finite value at index ${i}: ${vector[i]}`);
    }
  }
  return `[${vector.join(',')}]`;
}
