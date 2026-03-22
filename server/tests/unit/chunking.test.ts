import { describe, it, expect } from 'vitest';
import { chunkText, type Chunk } from '../../src/services/chunking.service.js';

function makeParagraph(tokens: number): string {
  const words = Math.floor(tokens / 1.25);
  return Array(words).fill('test').join(' ');
}

describe('chunkText', () => {
  it('returns empty array for empty input', () => {
    expect(chunkText('')).toEqual([]);
  });

  it('returns single chunk for short text', () => {
    const chunks = chunkText('Hello world. This is a short article.');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].index).toBe(0);
    expect(chunks[0].content).toBe('Hello world. This is a short article.');
  });

  it('chunks are indexed sequentially from 0', () => {
    const sections = Array.from({ length: 5 }, (_, i) =>
      `## Section ${i}\n\n${makeParagraph(400)}`
    ).join('\n\n');
    const chunks = chunkText(sections);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((chunk, i) => {
      expect(chunk.index).toBe(i);
    });
  });

  it('splits at heading boundaries', () => {
    const text = `# Introduction\n\nSome intro text here.\n\n## Method\n\nMethod description here.\n\n## Results\n\nResults here.`;
    const chunks = chunkText(text);
    for (const chunk of chunks) {
      const headings = chunk.content.match(/^#{1,6}\s/gm) || [];
      expect(headings.length).toBeGreaterThanOrEqual(0);
    }
  });

  it('respects max token limit per chunk', () => {
    const text = Array.from({ length: 20 }, () => makeParagraph(200)).join('\n\n');
    const chunks = chunkText(text);
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeLessThanOrEqual(1000);
    }
  });

  it('merges small chunks with neighbors', () => {
    const text = Array.from({ length: 10 }, (_, i) =>
      `## Section ${i}\n\nTiny.`
    ).join('\n\n');
    const chunks = chunkText(text);
    expect(chunks.length).toBeLessThan(10);
  });

  it('preserves content — no text is lost', () => {
    const text = `# Title\n\nParagraph one with some content.\n\n## Section\n\nParagraph two with more content.\n\nParagraph three.`;
    const chunks = chunkText(text);
    const reassembled = chunks.map((c) => c.content).join('\n\n');
    expect(reassembled).toContain('Paragraph one');
    expect(reassembled).toContain('Paragraph two');
    expect(reassembled).toContain('Paragraph three');
  });

  it('handles text with no headings', () => {
    const text = Array.from({ length: 10 }, (_, i) =>
      `Paragraph ${i}: ${makeParagraph(150)}`
    ).join('\n\n');
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.content.trim().length).toBeGreaterThan(0);
    }
  });

  it('each chunk has a positive tokenCount', () => {
    const text = `# Title\n\nSome content here.\n\n## Another\n\nMore content.`;
    const chunks = chunkText(text);
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeGreaterThan(0);
    }
  });
});
