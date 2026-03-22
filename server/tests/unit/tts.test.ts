import { describe, it, expect } from 'vitest';
import { splitIntoSegments } from '../../src/services/tts.service.js';

describe('splitIntoSegments', () => {
  it('returns empty array for empty text', () => {
    expect(splitIntoSegments('')).toEqual([]);
  });

  it('returns empty array for whitespace-only text', () => {
    expect(splitIntoSegments('   \n\n   ')).toEqual([]);
  });

  it('returns single segment for short text', () => {
    const text = 'Hello world. This is a short paragraph.';
    const segments = splitIntoSegments(text);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toBe(text);
  });

  it('splits at paragraph boundaries', () => {
    const para1 = 'A'.repeat(3000);
    const para2 = 'B'.repeat(3000);
    const text = para1 + '\n\n' + para2;
    const segments = splitIntoSegments(text);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toBe(para1);
    expect(segments[1]).toBe(para2);
  });

  it('keeps paragraphs together when under limit', () => {
    const text = 'Para one.\n\nPara two.\n\nPara three.';
    const segments = splitIntoSegments(text);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toContain('Para one');
    expect(segments[0]).toContain('Para three');
  });

  it('respects max segment char limit', () => {
    const segments = splitIntoSegments(
      Array.from({ length: 20 }, (_, i) => `Paragraph ${i}: ${'x'.repeat(400)}`).join('\n\n'),
    );
    for (const segment of segments) {
      expect(segment.length).toBeLessThanOrEqual(4600);
    }
  });

  it('splits single very long paragraph by sentences', () => {
    const sentences = Array.from({ length: 20 }, (_, i) => `Sentence number ${i} with extra content here.`);
    const text = sentences.join(' ');
    const segments = splitIntoSegments(text);
    for (const segment of segments) {
      expect(segment.length).toBeLessThanOrEqual(4600);
    }
    const reassembled = segments.join(' ');
    expect(reassembled).toContain('Sentence number 0');
    expect(reassembled).toContain('Sentence number 19');
  });
});
