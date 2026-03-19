import { describe, it, expect } from 'vitest';
import { titleSimilarity } from '../src/references/verifier.js';

describe('titleSimilarity', () => {
  it('returns 1.0 for identical titles', () => {
    const title = 'ChatGPT for good? On opportunities and challenges';
    expect(titleSimilarity(title, title)).toBe(1.0);
  });

  it('returns 1.0 for case-insensitive match', () => {
    expect(titleSimilarity(
      'ChatGPT for Good',
      'chatgpt for good',
    )).toBe(1.0);
  });

  it('returns high similarity for minor differences', () => {
    const a = 'ChatGPT for good? On opportunities and challenges of large language models for education';
    const b = 'ChatGPT for Good? On Opportunities and Challenges of Large Language Models for Education';
    expect(titleSimilarity(a, b)).toBeGreaterThanOrEqual(0.9);
  });

  it('returns low similarity for unrelated titles', () => {
    expect(titleSimilarity(
      'Machine learning in healthcare',
      'The history of French cuisine',
    )).toBeLessThan(0.2);
  });

  it('returns 0 for empty strings', () => {
    expect(titleSimilarity('', 'Some title')).toBe(0);
    expect(titleSimilarity('Some title', '')).toBe(0);
    expect(titleSimilarity('', '')).toBe(0);
  });

  it('ignores punctuation', () => {
    expect(titleSimilarity(
      'Nudge: Improving Decisions About Health, Wealth, and Happiness',
      'Nudge Improving Decisions About Health Wealth and Happiness',
    )).toBe(1.0);
  });

  it('handles partial overlap correctly', () => {
    const sim = titleSimilarity(
      'Mind in Society',
      'Mind in Society: The Development of Higher Psychological Processes',
    );
    // 3 words overlap out of ~9 unique → should be moderate
    expect(sim).toBeGreaterThan(0.3);
    expect(sim).toBeLessThan(0.7);
  });
});
