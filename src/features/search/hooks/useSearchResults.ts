// src/features/search/hooks/useSearchResults.ts
// 검색어 입력, 디바운스된 시맨틱 검색, 섹션 정렬, 인덱스 갱신 구독을 담당한다.
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import type { SearchResultItem } from '../../../types/search';
import { getIndexStatus } from '../../../utils/tauriBridge';
import { searchClient } from '../services/searchClient';
import { orderResultsBySection } from '../utils/orderResults';

const SEARCH_DEBOUNCE_MS = 140;

export function useSearchResults() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  // 빈 검색창에서 처음 검색을 시작할 때만 결과 확장을 지연한다.
  // 이미 확장된 창에서 새 검색어를 입력하면 기존 확장 상태를 유지한다.
  const [isWindowExpanded, setIsWindowExpanded] = useState(false);
  // 마지막으로 "검색이 끝난" 쿼리. 현재 query와 같을 때만 결과(또는 빈 결과)가 확정된 상태다.
  // isLoading은 effect에서 뒤늦게 true가 되므로, 입력 직후 첫 렌더에서
  // "빈 결과"를 확정 상태로 오인해 웹 폴백이 먼저 마운트되는 것을 막는 데 쓴다.
  const [settledQuery, setSettledQuery] = useState('');
  // 실제 상태 전환이 발생한 뒤에만 네이티브 창 리사이즈를 예약한다.
  const previousExpandedRef = useRef(isWindowExpanded);

  // 인덱서 상태는 검색 결과 렌더링과 분리해 백그라운드에서 확인한다.
  // 검색 입력과 상태 IPC를 직렬화하지 않아 초기 검색 waterfall을 만들지 않는다.
  useEffect(() => {
    void getIndexStatus();
  }, []);

  // 검색어가 입력된 경우에만 결과 영역을 노출한다.
  const hasQuery = query.trim().length > 0;
  const isSettled = hasQuery && settledQuery === query;

  // 결과를 섹션 순서로 재정렬한다.
  const orderedResults = useMemo(() => orderResultsBySection(results), [results]);

  // 결과 목록도 지연(defer) 렌더: 입력 중에는 이전 목록을 그대로 유지해
  // 이미지/썸네일이 매 키 입력마다 리마운트·재로드되지 않도록 한다.
  const deferredResults = useDeferredValue(orderedResults);

  // 앱 시작 시 인덱스를 미리 로드해 즉시(동기) 검색이 가능하도록 한다.
  useEffect(() => {
    void searchClient.preload();
    const savedShortcut = localStorage.getItem('nookive-shortcut')?.replace('Option', 'Alt');
    if (savedShortcut) void invoke('set_search_shortcut', { shortcut: savedShortcut });
  }, []);

  // 처음 축소된 상태에서 검색을 시작하면 결과가 준비된 뒤 확장한다.
  // 이미 확장된 상태에서 검색어만 바뀌는 경우에는 창 크기를 유지한다.
  //
  // 네이티브 macOS blur는 창 크기와 함께 바뀐다. 네이티브 창을 먼저 키우면
  // 새로 드러난 투명 영역에 backdrop blur만 먼저 보일 수 있으므로, 웹뷰의
  // 확장 레이아웃을 먼저 커밋·페인트한 뒤 다음 프레임에 네이티브 창을 키운다.
  useEffect(() => {
    const shouldBeExpanded = hasQuery && (isSettled || isWindowExpanded);
    if (shouldBeExpanded !== isWindowExpanded) {
      // DOM 레이아웃 상태를 먼저 바꾼다. 네이티브 리사이즈는 아래 effect에서
      // 상태 변경이 커밋된 다음 예약해야 cleanup에 의해 취소되지 않는다.
      setIsWindowExpanded(shouldBeExpanded);
    }
  }, [hasQuery, isSettled, isWindowExpanded]);

  useEffect(() => {
    if (previousExpandedRef.current === isWindowExpanded) return;
    previousExpandedRef.current = isWindowExpanded;

    let cancelled = false;
    let secondFrame = 0;
    // 검색창 DOM이 먼저 페인트된 뒤 네이티브 창을 같은 방향으로 리사이즈한다.
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        if (!cancelled) {
          void invoke('resize_main_window', { compact: !isWindowExpanded });
        }
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(firstFrame);
      if (secondFrame) cancelAnimationFrame(secondFrame);
    };
  }, [isWindowExpanded]);

  // 검색어 입력 처리: 디바운스된 시맨틱 검색만 사용한다.
  // (한글 조합 중 짧은 쿼리가 무관한 이미지를 대량 노출하는 버스트 방지)
  useEffect(() => {
    if (!hasQuery) {
      setResults([]);
      setSelectedIndex(0);
      setIsLoading(false);
      setSettledQuery('');
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    const timer = setTimeout(async () => {
      try {
        const data = await searchClient.search(query);
        if (isMounted) {
          setResults(data);
          setSelectedIndex(0);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
          setSettledQuery(query);
        }
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [query, hasQuery]);

  // 설정 창에서 폴더/임베딩 인덱스가 실제로 바뀐 경우에만 검색 캐시를 갱신한다.
  // 검색창을 열 때마다 macOS 앱 전체를 재탐색하면 포커스 순간에 렉이 발생한다.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen('index-updated', () => {
      void searchClient.refresh();
    }).then((un) => {
      unlisten = un;
    }).catch(() => { });

    return () => {
      unlisten?.();
    };
  }, []);

  const resetSelection = useCallback(() => setSelectedIndex(0), []);

  return {
    query,
    setQuery,
    results,
    selectedIndex,
    setSelectedIndex,
    resetSelection,
    isLoading,
    hasQuery,
    isSettled,
    isWindowExpanded,
    orderedResults,
    deferredResults,
  };
}
