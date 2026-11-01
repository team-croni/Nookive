import { describe, expect, it } from 'vitest';
import type { SearchResultItem } from '../../../types/search';
import { aggregate, aggregateWhere, evaluateQuery, type LabeledQuery } from './metrics';

const result = (path: string, chunk: Partial<SearchResultItem['bestChunk']> = {}): SearchResultItem => ({
  id: path,
  file: { path, name: path, extension: 'md', sizeBytes: 0, modifiedAt: '' },
  similarityScore: 0,
  bestChunk: { chunkIndex: 0, textSnippet: '', ...chunk },
  category: 'document',
});

const labeled = (query: Partial<LabeledQuery> & Pick<LabeledQuery, 'relevant'>): LabeledQuery => ({
  query: 'q',
  tags: [],
  split: 'dev',
  ...query,
});

describe('evaluation metrics', () => {
  const queries: LabeledQuery[] = [
    labeled({ query: 'a', relevant: ['/a', '/b'] }),
    labeled({ query: 'c', relevant: ['/c'], location: { pageNumber: 2 }, split: 'test' }),
    labeled({ query: 'none', relevant: [] }),
    labeled({ query: 'none2', relevant: [], split: 'test' }),
  ];
  const outcomes = [
    evaluateQuery(queries[0], [result('/x'), result('/a')]),
    evaluateQuery(queries[1], [result('/c', { pageNumber: 2 })]),
    evaluateQuery(queries[2], [result('/x')]),
    evaluateQuery(queries[3], []),
  ];

  it('computes recall, MRR, precision, noise, false positives and location accuracy', () => {
    expect(outcomes[0].firstRelevantRank).toBe(2);
    expect(outcomes[0].recallAt5).toBe(0.5);
    expect(outcomes[0].precisionAt5).toBe(0.5);
    expect(outcomes[0].noiseRate).toBe(0.5);
    const metrics = aggregate(queries, outcomes);
    expect(metrics).toMatchObject({
      recallAt5: 0.75,
      recallAt10: 0.75,
      mrr: 0.75,
      precisionAt5: 0.75,
      noiseRate: 0.25,
      noAnswerFalsePositiveRate: 0.5,
      locationAccuracy: 1,
    });
  });

  it('aggregates a subset of queries', () => {
    const test = aggregateWhere(queries, outcomes, (query) => query.split === 'test');
    expect(test.count).toBe(2);
    expect(test.metrics.recallAt5).toBe(1);
    expect(test.metrics.noAnswerFalsePositiveRate).toBe(0);
  });

  it('does not count acceptable results as noise', () => {
    const query = labeled({ relevant: ['/a'], acceptable: ['/b'] });
    const outcome = evaluateQuery(query, [result('/b'), result('/a'), result('/x')]);
    expect(outcome.precisionAt5).toBeCloseTo(2 / 3);
    expect(outcome.noiseRate).toBeCloseTo(1 / 3);
  });

  it('scores nDCG with graded gains', () => {
    const query = labeled({ relevant: ['/a'], acceptable: ['/b'] });
    expect(evaluateQuery(query, [result('/a'), result('/b')]).ndcgAt10).toBeCloseTo(1);
    const swapped = evaluateQuery(query, [result('/b'), result('/a')]).ndcgAt10;
    expect(swapped).toBeLessThan(1);
    expect(swapped).toBeGreaterThan(0.7);
    expect(evaluateQuery(query, [result('/x')]).ndcgAt10).toBe(0);
  });

  it('checks line and timestamp locations within tolerance', () => {
    const line = labeled({ relevant: ['/l'], location: { lineStart: 45, tolerance: 3 } });
    expect(evaluateQuery(line, [result('/l', { lineStart: 43 })]).locationMatched).toBe(true);
    expect(evaluateQuery(line, [result('/l', { lineStart: 40 })]).locationMatched).toBe(false);
    expect(evaluateQuery(line, [result('/x')]).locationMatched).toBe(false);
  });
});

describe('path normalization', () => {
  it('matches decomposed (NFD) macOS paths against NFC labels', () => {
    const query = labeled({ relevant: ['/eval/임대차.pdf'] });
    const outcome = evaluateQuery(query, [result('/eval/임대차.pdf'.normalize('NFD'))]);
    expect(outcome.firstRelevantRank).toBe(1);
  });
});
