/**
 * Rough token count estimate. ~3.5 chars per token for English text.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/**
 * Count words in text.
 */
export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Split text into sentences at sentence boundaries (. ! ? followed by space or end).
 */
export function splitSentences(text: string): string[] {
  return text.match(/[^.!?]+[.!?]+[\s]?|[^.!?]+$/g) || [text];
}
