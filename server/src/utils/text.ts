/**
 * Rough token count estimate. ~4 chars per token for English text.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Count words in text.
 */
export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
