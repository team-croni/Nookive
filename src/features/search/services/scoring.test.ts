import { describe, expect, it } from 'vitest';
import type { SearchResultItem } from '../../../types/search';
import { rankQuery } from './rankQuery';

const app = (name: string, bundleId = '', bundleFile = name): SearchResultItem => ({
  id: `application:/Applications/${bundleFile}.app`,
  file: {
    path: `/Applications/${bundleFile}.app`,
    name,
    extension: 'app',
    kind: 'application',
    bundleId,
    sizeBytes: 0,
    modifiedAt: '',
  },
  similarityScore: 0,
  bestChunk: { chunkIndex: 0, textSnippet: `macOS application: ${name}` },
  category: 'application',
});

const file = (name: string, extension: string, snippet: string, vector: number[]): SearchResultItem => ({
  id: `/r/${name}#0`,
  file: { path: `/r/${name}`, name, extension, sizeBytes: 0, modifiedAt: '' },
  similarityScore: 0,
  bestChunk: { chunkIndex: 0, textSnippet: snippet },
  category: 'document',
  vector,
});

// 쿼리 벡터와 직교하는 벡터: 의미 유사도가 0이라 키워드만으로 통과 여부가 결정된다.
const QUERY_VECTOR = [1, 0, 0];
const UNRELATED = [0, 1, 0];

const records = [
  // 실제 VS Code는 표시 이름이 "Code"이고 번들 파일명이 "Visual Studio Code.app"이다.
  app('Code', 'com.microsoft.VSCode', 'Visual Studio Code'),
  app('Android Studio', 'com.google.android.studio'),
  app('Microsoft Word', 'com.microsoft.Word'),
  app('Microsoft Excel', 'com.microsoft.Excel'),
  app('Slack', 'com.tinyspeck.slackmacgap'),
  file('studio-booking.md', 'md', 'The photo studio is booked for March.', UNRELATED),
  file('receipt.png', 'png', '[사진 이미지] 사물/객체: 문서 서류. Vision: document', UNRELATED),
];

const search = (query: string) =>
  rankQuery(records, query, QUERY_VECTOR).map((item) => item.file.name);

describe('partial keyword matches', () => {
  it('drops items that share only one word of a multi-word query', () => {
    expect(search('visual studio')).toEqual(['Code']);
    expect(search('세금 서류')).toEqual([]);
  });

  it('drops partial matches when another name matches every word', () => {
    expect(search('microsoft word')).toEqual(['Microsoft Word']);
  });

  it('keeps an app whose name starts with the first word of the query', () => {
    expect(search('slack 앱')).toEqual(['Slack']);
  });

  it('still matches single-word queries', () => {
    expect(search('studio')).toContain('studio-booking.md');
  });
});

describe('application names', () => {
  it('matches the bundle file name when the display name differs', () => {
    expect(search('visual studio code')).toEqual(['Code']);
    expect(search('code')).toContain('Code');
  });
});
