// src/features/search/hooks/usePreviewSelection.ts
// 미리보기 대상 선택을 안정화(디바운스)해 타이핑/방향키 연타 시 깜빡임을 줄인다.
import { useEffect, useState } from 'react';
import type { SearchResultItem } from '../../../types/search';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';

export function usePreviewSelection(
  query: string,
  currentSelected: SearchResultItem | undefined,
) {
  // 미리보기용 검색어는 "입력이 멈춘 뒤"에만 갱신한다.
  // (PDF 하이라이트 재스캔/캔버스 렌더가 매 키 입력마다 반복되는 것을 방지)
  const previewQuery = useDebouncedValue(query, 220);

  // 1) 검색어가 안정된 뒤의 선택만 반영 → 타이핑 중 결과가 바뀌며
  //    미리보기가 깜빡이는 것을 막는다.
  const [settledSelected, setSettledSelected] = useState<SearchResultItem | undefined>(undefined);
  useEffect(() => {
    if (previewQuery === query) {
      setSettledSelected(currentSelected);
    }
  }, [previewQuery, query, currentSelected]);

  // 2) 방향키 연타 시 중간 항목의 무거운 미리보기 로딩을 건너뛰되,
  //    정보 패널이 늦게 나타나지 않도록 최소한의 지연만 둔다.
  const previewSelected = useDebouncedValue(settledSelected, 32);

  return { previewQuery, previewSelected };
}
