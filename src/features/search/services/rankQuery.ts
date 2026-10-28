// src/features/search/services/rankQuery.ts
// I/O 없이 레코드와 쿼리 벡터만으로 검색 결과를 계산한다. (SearchClient와 평가 테스트가 공유)
import type { SearchResultItem } from '../../../types/search';
import {
  groupAndDeduplicate,
  rankResults,
  scoreRecords,
  type ScoredSearchResult,
} from './scoring';
import { expandKeywords, nfc, tokenizeKeywords } from './textUtils';

/**
 * 임베딩이 의미 없는 방향으로 쏠리는 쿼리인지 판별한다.
 * 자음/모음만 있거나 1글자인 쿼리는 대부분의 문서/영상과 높은 코사인 유사도를 보여
 * 무관한 결과가 쏟아진다. 같은 이유로 "aaaaaaaaa", "zzzzzz" 같은 반복 문자열과
 * "asdf..." 같은 키보드 연타도 시맨틱 검색에서 제외한다.
 */
export function isLowSignalQuery(query: string): boolean {
  const trimmedQuery = nfc(query).trim();
  const compactQuery = trimmedQuery.replace(/\s+/g, '');
  const jamoOnly = /^[ㄱ-ㆎ\s]+$/.test(trimmedQuery);
  const repeatedChar =
    compactQuery.length >= 3 && new Set(compactQuery).size === 1;
  const keyboardMash = /^(asdf|qwer|zxcv|1234|hjkl)/i.test(compactQuery);
  return (
    jamoOnly ||
    compactQuery.length < 2 ||
    repeatedChar ||
    keyboardMash
  );
}

/**
 * 하이브리드 점수 계산 → 파일 단위 그룹화 → 게이트 통과 결과 정렬.
 * queryVector가 null이면 키워드 전용 검색으로 동작한다.
 */
export function rankQuery(
  records: SearchResultItem[],
  query: string,
  queryVector: number[] | null,
): SearchResultItem[] {
  const qLower = nfc(query).toLowerCase().trim();
  const baseKeywords = tokenizeKeywords(qLower);
  const queryKeywords = expandKeywords(baseKeywords);

  // 1. 하이브리드 검색 점수 계산
  //    (모달리티별 z-score 정규화 + 렉시컬 키워드 coverage 부스트)
  const scored: ScoredSearchResult[] = scoreRecords(records, {
    queryVector,
    semanticMode: queryVector !== null,
    baseKeywords,
    queryKeywords,
    query,
  });

  // 2. 파일 단위 그룹화 (동일 파일의 다수 청크를 하나로 통합)
  //    baseKeywords를 넘겨 단어 단위 타임스탬프로 뱃지를 보정한다.
  const deduplicated = groupAndDeduplicate(scored, baseKeywords);

  // 3. z-score 게이트 통과 결과만 정렬해 반환
  const sorted = deduplicated.sort(
    (a, b) => (b.rankScore ?? 0) - (a.rankScore ?? 0),
  );
  return rankResults(sorted, query);
}
