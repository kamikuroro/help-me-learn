import { estimateTokens, splitSentences } from '../utils/text.js';

const MIN_CHUNK_TOKENS = 200;
const TARGET_CHUNK_TOKENS = 600;
const MAX_CHUNK_TOKENS = 800;

export interface Chunk {
  index: number;
  content: string;
  tokenCount: number;
}

/**
 * Split markdown content into semantic chunks.
 * Strategy: split at heading boundaries first, then paragraphs, then force-split long blocks.
 */
export function chunkText(text: string): Chunk[] {
  // Step 1: Split into sections by headings
  const sections = splitByHeadings(text);

  // Step 2: For each section, split into paragraph groups within token limits
  const rawChunks: string[] = [];
  for (const section of sections) {
    const tokens = estimateTokens(section);
    if (tokens <= MAX_CHUNK_TOKENS) {
      rawChunks.push(section);
    } else {
      // Split large sections by paragraphs
      const subChunks = splitByParagraphs(section);
      rawChunks.push(...subChunks);
    }
  }

  // Step 3: Merge very small chunks with neighbors
  const merged = mergeSmallChunks(rawChunks);

  // Step 4: Index and return
  return merged.map((content, index) => ({
    index,
    content: content.trim(),
    tokenCount: estimateTokens(content),
  })).filter((c) => c.content.length > 0);
}

/**
 * Split text at markdown heading boundaries (# ## ### etc).
 * Each heading starts a new section, with the heading included.
 */
function splitByHeadings(text: string): string[] {
  const lines = text.split('\n');
  const sections: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    // Match markdown headings (# to ######)
    if (/^#{1,6}\s/.test(line) && current.length > 0) {
      sections.push(current.join('\n'));
      current = [line];
    } else {
      current.push(line);
    }
  }

  if (current.length > 0) {
    sections.push(current.join('\n'));
  }

  return sections;
}

/**
 * Split a section by double newlines (paragraph boundaries).
 * Groups paragraphs together until reaching the target token count.
 */
function splitByParagraphs(text: string): string[] {
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current: string[] = [];
  let currentTokens = 0;

  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para);

    // If a single paragraph exceeds max, force-split by sentences
    if (paraTokens > MAX_CHUNK_TOKENS) {
      if (current.length > 0) {
        chunks.push(current.join('\n\n'));
        current = [];
        currentTokens = 0;
      }
      const sentenceChunks = splitBySentenceChunks(para);
      chunks.push(...sentenceChunks);
      continue;
    }

    if (currentTokens + paraTokens > TARGET_CHUNK_TOKENS && current.length > 0) {
      chunks.push(current.join('\n\n'));
      current = [para];
      currentTokens = paraTokens;
    } else {
      current.push(para);
      currentTokens += paraTokens;
    }
  }

  if (current.length > 0) {
    chunks.push(current.join('\n\n'));
  }

  return chunks;
}

/**
 * Last resort: split by sentences to fit within token limits.
 */
function splitBySentenceChunks(text: string): string[] {
  const sentences = splitSentences(text);
  const chunks: string[] = [];
  let current: string[] = [];
  let currentTokens = 0;

  for (const sentence of sentences) {
    const sentTokens = estimateTokens(sentence);

    if (currentTokens + sentTokens > TARGET_CHUNK_TOKENS && current.length > 0) {
      chunks.push(current.join(''));
      current = [sentence];
      currentTokens = sentTokens;
    } else {
      current.push(sentence);
      currentTokens += sentTokens;
    }
  }

  if (current.length > 0) {
    chunks.push(current.join(''));
  }

  return chunks;
}

/**
 * Merge chunks that are too small with their neighbors.
 */
function mergeSmallChunks(chunks: string[]): string[] {
  if (chunks.length <= 1) return chunks;

  const result: string[] = [];
  let buffer = chunks[0];

  for (let i = 1; i < chunks.length; i++) {
    const bufferTokens = estimateTokens(buffer);
    const nextTokens = estimateTokens(chunks[i]);

    if (bufferTokens < MIN_CHUNK_TOKENS && bufferTokens + nextTokens <= MAX_CHUNK_TOKENS) {
      // Merge small chunk with next
      buffer = buffer + '\n\n' + chunks[i];
    } else {
      result.push(buffer);
      buffer = chunks[i];
    }
  }

  result.push(buffer);
  return result;
}
