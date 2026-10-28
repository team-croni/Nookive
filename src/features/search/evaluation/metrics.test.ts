import { describe, expect, it } from 'vitest';
import type { SearchResultItem } from '../../../types/search';
import { aggregate, evaluateQuery, type LabeledQuery } from './metrics';

const result = (path: string, chunk: Partial<SearchResultItem['bestChunk']> = {}): SearchResultItem => ({
  id: path,
  file: { path, name: path, extension: 'md', sizeBytes: 0, modifiedAt: '' },
  similarityScore: 0,
  bestChunk: { chunkIndex: 0, textSnippet: '', ...chunk },
  category: 'document',
});

describe('evaluation metrics', () => {
  const queries: LabeledQuery[] = [
    { query: 'a', tags: [], relevant: ['/a', '/b'] },
    { query: 'c', tags: [], relevant: ['/c'], location: { pageNumber: 2 } },
    { query: 'none', tags: [], relevant: [] },
    { query: 'none2', tags: [], relevant: [] },
  ];

  it('computes recall, MRR, false positives and location accuracy', () => {
    const outcomes = [
      evaluateQuery(queries[0], [result('/x'), result('/a')]),
      evaluateQuery(queries[1], [result('/c', { pageNumber: 2 })]),
      evaluateQuery(queries[2], [result('/x')]),
      evaluateQuery(queries[3], []),
    ];

    expect(outcomes[0].firstRelevantRank).toBe(2);
    expect(outcomes[0].recallAt5).toBe(0.5);
    expect(aggregate(queries, outcomes)).toEqual({
      recallAt5: 0.75,
      recallAt10: 0.75,
      mrr: 0.75,
      noAnswerFalsePositiveRate: 0.5,
      locationAccuracy: 1,
    });
  });

  it('checks line and timestamp locations within tolerance', () => {
    const line: LabeledQuery = { query: 'l', tags: [], relevant: ['/l'], location: { lineStart: 45, tolerance: 3 } };
    expect(evaluateQuery(line, [result('/l', { lineStart: 43 })]).locationMatched).toBe(true);
    expect(evaluateQuery(line, [result('/l', { lineStart: 40 })]).locationMatched).toBe(false);
    expect(evaluateQuery(line, [result('/x')]).locationMatched).toBe(false);
  });
});

describe('path normalization', () => {
  it('matches decomposed (NFD) macOS paths against NFC labels', () => {
    const labeled: LabeledQuery = { query: 'q', tags: [], relevant: ['/eval/임대차.pdf'] };
    const outcome = evaluateQuery(labeled, [result('/eval/임대차.pdf'.normalize('NFD'))]);
    expect(outcome.firstRelevantRank).toBe(1);
  });
});
