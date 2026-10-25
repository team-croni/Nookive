// src/features/search/hooks/usePreviewSelection.ts
// 미리보기 대상 선택을 안정화(디바운스)해 타이핑/방향키 연타 시 깜빡임을 줄인다.
import type { SearchResultItem } from '../../../types/search';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';

export function usePreviewSelection(
  query: string,
  currentSelected: SearchResultItem | undefined,
) {
  // 미리보기용 검색어는 "입력이 멈춘 뒤"에만 갱신한다.
  // (PDF 하이라이트 재스캔/캔버스 렌더가 매 키 입력마다 반복되는 것을 방지)
  const previewQuery = useDebouncedValue(query, 220);

  // 검색 선택도 짧게 디바운스해 타이핑 중간 결과를 미리보기에 반영하지 않는다.
  // 상태를 effect에서 다시 저장하지 않아 입력 중 cascading render를 피한다.
  const previewSelected = useDebouncedValue(currentSelected, 220);

  return { previewQuery, previewSelected };
}
