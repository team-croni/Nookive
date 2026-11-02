import { describe, expect, it } from 'vitest';
import type { SearchResultItem } from '../../../types/search';
import {
  FEEDBACK_COOLDOWN_MS,
  FEEDBACK_HALF_LIFE_MS,
  MAX_FEEDBACK_BOOST,
  MAX_FEEDBACK_ENTRIES,
  createRankBoost,
  normalizeFeedbackQuery,
  parseFeedbackEntries,
  recordOpen,
  type FeedbackEntry,
} from './feedback';
import { rankQuery } from './rankQuery';
import { rankResults } from './scoring';

const NOW = Date.UTC(2026, 10, 2);

const result = (name: string, rankScore: number, extension = 'md'): SearchResultItem => ({
  id: `/r/${name}#0`,
  file: { path: `/r/${name}`, name, extension, sizeBytes: 0, modifiedAt: '' },
  similarityScore: rankScore / 10,
  rankScore,
  bestChunk: { chunkIndex: 0, textSnippet: name },
  category: 'document',
});

const app = (name: string): SearchResultItem => ({
  id: `application:/Applications/${name}.app`,
  file: {
    path: `/Applications/${name}.app`,
    name,
    extension: 'app',
    kind: 'application',
    sizeBytes: 0,
    modifiedAt: '',
  },
  similarityScore: 0,
  bestChunk: { chunkIndex: 0, textSnippet: `macOS application: ${name}` },
  category: 'application',
});

/** 같은 쿼리로 경로를 n번 연다. 쿨다운을 넘기도록 한 시간씩 띄운다. */
function openTimes(entries: FeedbackEntry[], query: string, path: string, times: number, start = NOW) {
  let next = entries;
  for (let i = 0; i < times; i += 1) next = recordOpen(next, query, path, start + i * 60 * 60 * 1000);
  return next;
}

describe('normalizeFeedbackQuery', () => {
  it('normalizes case, spacing, and Unicode composition', () => {
    expect(normalizeFeedbackQuery('  Visual   Studio ')).toBe('visual studio');
    // macOS 경로처럼 분해형(NFD)으로 들어와도 같은 키가 된다.
    expect(normalizeFeedbackQuery('메모'.normalize('NFD'))).toBe('메모');
  });
});

describe('recordOpen', () => {
  it('ignores empty queries and repeated opens within the cooldown', () => {
    const empty: FeedbackEntry[] = [];
    expect(recordOpen(empty, '   ', '/r/a', NOW)).toBe(empty);

    const once = recordOpen(empty, 'slack', '/Applications/Slack.app', NOW);
    expect(once).toHaveLength(1);
    expect(recordOpen(once, 'Slack', '/Applications/Slack.app', NOW + FEEDBACK_COOLDOWN_MS - 1)).toBe(once);

    const twice = recordOpen(once, 'slack', '/Applications/Slack.app', NOW + FEEDBACK_COOLDOWN_MS);
    expect(twice).toHaveLength(1);
    expect(twice[0].strength).toBeCloseTo(2, 3);
  });

  it('decays earlier opens before adding a new one', () => {
    const first = recordOpen([], 'report', '/r/a', NOW);
    const later = recordOpen(first, 'report', '/r/a', NOW + FEEDBACK_HALF_LIFE_MS);
    expect(later[0].strength).toBeCloseTo(1.5, 5);
  });

  it('keeps only the most recently used entries', () => {
    let entries: FeedbackEntry[] = [];
    for (let i = 0; i <= MAX_FEEDBACK_ENTRIES; i += 1) entries = recordOpen(entries, `q${i}`, '/r/a', NOW + i);
    expect(entries).toHaveLength(MAX_FEEDBACK_ENTRIES);
    expect(entries.some((entry) => entry.query === 'q0')).toBe(false);
    expect(entries[0].query).toBe(`q${MAX_FEEDBACK_ENTRIES}`);
  });
});

describe('createRankBoost', () => {
  it('returns nothing when the query has no history', () => {
    const entries = recordOpen([], 'slack', '/Applications/Slack.app', NOW);
    expect(createRankBoost(entries, 'notes', NOW)).toBeUndefined();
  });

  it('grows with repeated opens and never exceeds the cap', () => {
    const path = '/Applications/Slack.app';
    const boostAfter = (times: number) => createRankBoost(openTimes([], 'slack', path, times), 'slack', NOW)!(path);
    expect(boostAfter(1)).toBeCloseTo(1 + MAX_FEEDBACK_BOOST * 0.5, 2);
    expect(boostAfter(2)).toBeGreaterThan(boostAfter(1));
    expect(boostAfter(50)).toBeLessThanOrEqual(1 + MAX_FEEDBACK_BOOST);

    const boost = createRankBoost(openTimes([], 'slack', path, 1), 'slack', NOW)!;
    expect(boost('/Applications/Other.app')).toBe(1);
  });

  it('fades as the history gets older', () => {
    const path = '/r/a';
    const entries = openTimes([], 'report', path, 3);
    const fresh = createRankBoost(entries, 'report', NOW)!(path);
    const old = createRankBoost(entries, 'report', NOW + 4 * FEEDBACK_HALF_LIFE_MS)!(path);
    expect(old).toBeGreaterThan(1);
    expect(old).toBeLessThan(fresh);
  });
});

describe('rankResults with feedback', () => {
  it('lifts an opened result over a close neighbor without changing similarityScore', () => {
    const items = [result('a.md', 5), result('b.md', 4.8)];
    const boost = createRankBoost(openTimes([], 'notes', '/r/b.md', 3), 'notes', NOW);

    const ranked = rankResults(items, 'notes', boost);
    expect(ranked.map((item) => item.file.name)).toEqual(['b.md', 'a.md']);
    expect(ranked[0].similarityScore).toBe(items[1].similarityScore);
  });

  it('cannot overcome a gap larger than the cap', () => {
    const items = [result('a.md', 5), result('b.md', 4)];
    const boost = createRankBoost(openTimes([], 'notes', '/r/b.md', 50), 'notes', NOW);
    expect(rankResults(items, 'notes', boost).map((item) => item.file.name)).toEqual(['a.md', 'b.md']);
  });

  it('never brings back a result that failed the relevance gate', () => {
    const items = [result('a.md', 5), result('gated.md', 0)];
    const boost = createRankBoost(openTimes([], 'notes', '/r/gated.md', 50), 'notes', NOW);
    expect(rankResults(items, 'notes', boost).map((item) => item.file.name)).toEqual(['a.md']);
  });

  it('leaves ranking unchanged for apps that do not match the query', () => {
    const records = [app('Slack'), app('Notes')];
    const boost = createRankBoost(openTimes([], 'slack', '/Applications/Notes.app', 50), 'slack', NOW);
    expect(rankQuery(records, 'slack', null, boost).map((item) => item.file.name)).toEqual(['Slack']);
  });
});

describe('parseFeedbackEntries', () => {
  it('drops malformed entries and accepts missing data', () => {
    expect(parseFeedbackEntries(null)).toEqual([]);
    expect(parseFeedbackEntries({ entries: 'broken' })).toEqual([]);
    const valid = { query: 'slack', path: '/Applications/Slack.app', strength: 1, lastOpenedAt: NOW };
    expect(parseFeedbackEntries({ entries: [valid, { query: 'x' }, null] })).toEqual([valid]);
  });
});
