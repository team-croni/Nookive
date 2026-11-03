import { describe, expect, it } from 'vitest';
import type { SearchResultItem } from '../../../types/search';
import { completeFromItem, pickInlineCompletion } from './inlineCompletion';

const app = (name: string, alternateNames: string[] = []): SearchResultItem => ({
  id: `application:/Applications/${name}.app`,
  file: {
    path: `/Applications/${name}.app`,
    name,
    extension: 'app',
    kind: 'application',
    sizeBytes: 0,
    modifiedAt: '',
    alternateNames,
  },
  similarityScore: 0,
  bestChunk: { chunkIndex: 0, textSnippet: name },
  category: 'application',
});

const doc: SearchResultItem = {
  id: '/r/claude-notes.md#0',
  file: { path: '/r/claude-notes.md', name: 'claude-notes.md', extension: 'md', sizeBytes: 0, modifiedAt: '' },
  similarityScore: 1,
  bestChunk: { chunkIndex: 0, textSnippet: '' },
  category: 'document',
};

describe('completeFromItem', () => {
  it('keeps typed case and takes the rest from the name', () => {
    expect(completeFromItem('c', app('Claude'))).toMatchObject({ suffix: 'laude', matchedName: 'Claude' });
    expect(completeFromItem('CL', app('Claude'))?.suffix).toBe('aude');
    expect(completeFromItem('claude', app('Claude'))?.suffix).toBe('');
  });

  it('matches alternate names and shows the display name', () => {
    const notes = app('메모', ['Notes']);
    expect(completeFromItem('No', notes)).toMatchObject({ suffix: 'tes', matchedName: 'Notes', displayName: '메모' });
    // macOS 이름처럼 분해형(NFD)이어도 맞춘다.
    expect(completeFromItem('메'.normalize('NFD'), notes)?.suffix).toBe('모');
  });

  it('only completes apps whose name starts with the query', () => {
    expect(completeFromItem('laude', app('Claude'))).toBeNull();
    expect(completeFromItem('claude', doc)).toBeNull();
    expect(completeFromItem(' c', app('Claude'))).toBeNull();
    expect(completeFromItem('', app('Claude'))).toBeNull();
  });
});

describe('pickInlineCompletion', () => {
  const apps = [app('Calendar'), app('Claude'), app('Chess')];

  it('uses only the first settled result once the search has finished', () => {
    const settled = { query: 'c', settledQuery: 'c', rankedApplications: apps };
    expect(pickInlineCompletion({ ...settled, settledResults: [app('Claude'), app('Chess')] })?.matchedName).toBe('Claude');
    // 첫 결과가 앱이 아니면 다른 앱이 맞아도 완성하지 않는다.
    expect(pickInlineCompletion({ ...settled, settledResults: [doc, app('Claude')] })).toBeNull();
  });

  it('completes from the app list before the search finishes', () => {
    const typing = { query: 'c', settledQuery: '', settledResults: [], rankedApplications: apps };
    // 넘겨준 순위 순서에서 처음 맞는 앱을 쓴다.
    expect(pickInlineCompletion(typing)?.matchedName).toBe('Calendar');
    expect(pickInlineCompletion({ ...typing, query: 'cl' })?.matchedName).toBe('Claude');
    // 글자를 더 입력하는 동안에는 직전 검색의 첫 결과가 맞으면 그 앱을 이어 간다.
    const stale = { query: 'ca', settledQuery: 'c', settledResults: [app('Calendar')], rankedApplications: apps };
    expect(pickInlineCompletion(stale)?.matchedName).toBe('Calendar');
  });
});

describe('names with non-breaking spaces', () => {
  it('completes after a typed space', () => {
    // macOS의 "나의 찾기" 이름은 가운데 공백이 U+00A0이다.
    const findMy = app('나의\u00a0찾기', ['Find My']);
    expect(completeFromItem('나의', findMy)?.suffix).toBe(' 찾기');
    expect(completeFromItem('나의 ', findMy)?.suffix).toBe('찾기');
    expect(completeFromItem('나의 찾', findMy)?.suffix).toBe('기');
  });
});
