import { describe, it, expect } from 'vitest';
import { reciprocalRankFusion } from '../../src/services/rag.service.js';

describe('reciprocalRankFusion', () => {
  it('returns empty array for empty inputs', () => {
    expect(reciprocalRankFusion([], [])).toEqual([]);
  });

  it('handles single list', () => {
    const result = reciprocalRankFusion(
      [{ chunk_id: 1, rank: 1 }, { chunk_id: 2, rank: 2 }],
      [],
    );
    expect(result).toHaveLength(2);
    expect(result[0].chunk_id).toBe(1);
    expect(result[1].chunk_id).toBe(2);
  });

  it('boosts items appearing in both lists', () => {
    const result = reciprocalRankFusion(
      [{ chunk_id: 1, rank: 1 }, { chunk_id: 2, rank: 2 }],
      [{ chunk_id: 2, rank: 1 }, { chunk_id: 3, rank: 2 }],
    );
    expect(result[0].chunk_id).toBe(2);
  });

  it('returns sorted by score descending', () => {
    const result = reciprocalRankFusion(
      [{ chunk_id: 10, rank: 3 }, { chunk_id: 20, rank: 1 }],
      [{ chunk_id: 30, rank: 1 }, { chunk_id: 10, rank: 2 }],
    );
    for (let i = 1; i < result.length; i++) {
      expect(result[i].score).toBeLessThanOrEqual(result[i - 1].score);
    }
  });

  it('uses k parameter for scoring', () => {
    const k10 = reciprocalRankFusion(
      [{ chunk_id: 1, rank: 1 }],
      [],
      10,
    );
    const k60 = reciprocalRankFusion(
      [{ chunk_id: 1, rank: 1 }],
      [],
      60,
    );
    expect(k10[0].score).toBeGreaterThan(k60[0].score);
  });

  it('deduplicates chunk_ids across lists', () => {
    const result = reciprocalRankFusion(
      [{ chunk_id: 1, rank: 1 }],
      [{ chunk_id: 1, rank: 1 }],
    );
    expect(result).toHaveLength(1);
    const singleScore = 1 / (60 + 1);
    expect(result[0].score).toBeCloseTo(singleScore * 2, 10);
  });
});
