import { describe, expect, it } from 'vitest';
import type { SearchResultItem } from '../../../types/search';
import { rankQuery } from './rankQuery';

const app = (
  name: string,
  bundleId = '',
  bundleFile = name,
  alternateNames?: string[],
): SearchResultItem => ({
  id: `application:/Applications/${bundleFile}.app`,
  file: {
    path: `/Applications/${bundleFile}.app`,
    name,
    extension: 'app',
    kind: 'application',
    bundleId,
    ...(alternateNames ? { alternateNames } : {}),
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
  // 한국어 환경에서는 현지화 이름을 표시하고 Info.plist 이름을 검색용 이름으로 둔다.
  app('카카오톡', 'com.kakao.KakaoTalkMac', 'KakaoTalk', ['KakaoTalk']),
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
  it('matches both the localized name and the Info.plist name', () => {
    expect(search('카카오톡')).toEqual(['카카오톡']);
    expect(search('kakaotalk')).toEqual(['카카오톡']);
  });

  it('matches the bundle file name when the display name differs', () => {
    expect(search('visual studio code')).toEqual(['Code']);
    expect(search('code')).toContain('Code');
  });
});

describe('semantic statistics', () => {
  // 쿼리와 점점 덜 비슷한 문서 10개. 의미 점수만으로 상위 몇 개가 게이트를 통과한다.
  const documents = Array.from({ length: 10 }, (_, index) =>
    file(`doc-${index}.md`, 'md', `document number ${index}`, [1 - index * 0.08, index * 0.08, 0.1]),
  );
  const apps = Array.from({ length: 300 }, (_, index) => app(`Utility ${index}`));
  const names = (items: SearchResultItem[]) =>
    rankQuery(items, '관련 문서 찾기', QUERY_VECTOR).map((item) => item.file.name);

  it('does not depend on how many vectorless apps are installed', () => {
    expect(names([...documents, ...apps])).toEqual(names(documents));
  });
});
