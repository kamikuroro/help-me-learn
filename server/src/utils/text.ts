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

/**
 * Detect whether text is primarily Chinese or English.
 * Returns 'zh' if CJK characters make up > 30% of the text.
 */
export function detectLanguage(text: string): 'zh' | 'en' {
  const cjk = text.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  return cjk / text.length > 0.3 ? 'zh' : 'en';
}
