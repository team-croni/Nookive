// src/features/search/utils/orderResults.ts
import type { SearchResultItem } from '../../../types/search';
import { FILE_SECTION_ORDER, getFileSection, type FileSection } from '../../../utils/fileType';

/**
 * 결과를 섹션(문서 → 이미지 → 비디오 → 오디오 → 코드) 순서로 재정렬한다.
 * 섹션 내부에서는 기존 유사도 점수 순서를 유지한다.
 */
export function orderResultsBySection(results: SearchResultItem[]): SearchResultItem[] {
  const buckets = new Map<FileSection, SearchResultItem[]>();
  for (const item of results) {
    const section = getFileSection(item.file.extension);
    const arr = buckets.get(section);
    if (arr) arr.push(item);
    else buckets.set(section, [item]);
  }

  // 섹션을 "그 섹션 내 최고 점수" 기준 내림차순으로 정렬한다.
  // → 가장 관련 있는 섹션이 위로 온다(예: 오디오가 최상위면 오디오 섹션이 맨 위).
  // 동점이면 기본 순서(문서→이미지→비디오→오디오→코드)를 유지.
  const bestScore = (arr: SearchResultItem[]) =>
    arr.reduce((m, it) => Math.max(m, it.similarityScore || 0), 0);
  const sections = Array.from(buckets.keys()).sort((a, b) => {
    const diff = bestScore(buckets.get(b)!) - bestScore(buckets.get(a)!);
    if (diff !== 0) return diff;
    return FILE_SECTION_ORDER.indexOf(a) - FILE_SECTION_ORDER.indexOf(b);
  });

  const ordered: SearchResultItem[] = [];
  for (const section of sections) ordered.push(...(buckets.get(section)!));
  return ordered;
}
