import { describe, it, expect } from 'vitest';
import { estimateTokens, countWords } from '../../src/utils/text.js';

describe('estimateTokens', () => {
  it('estimates ~4 chars per token', () => {
    const text = 'a'.repeat(400);
    expect(estimateTokens(text)).toBe(100);
  });

  it('rounds up partial tokens', () => {
    expect(estimateTokens('hello')).toBe(2);
  });

  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });
});

describe('countWords', () => {
  it('counts space-separated words', () => {
    expect(countWords('hello world foo')).toBe(3);
  });

  it('handles multiple spaces', () => {
    expect(countWords('hello   world')).toBe(2);
  });

  it('handles newlines and tabs', () => {
    expect(countWords('hello\nworld\tfoo')).toBe(3);
  });

  it('returns 0 for empty string', () => {
    expect(countWords('')).toBe(0);
  });

  it('returns 0 for whitespace-only string', () => {
    expect(countWords('   \n\t  ')).toBe(0);
  });
});
