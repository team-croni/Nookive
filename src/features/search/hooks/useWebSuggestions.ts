// src/features/search/hooks/useWebSuggestions.ts
// 로컬 검색 결과가 비었을 때만 Google 자동완성을 조회한다.
import { useEffect, useState } from 'react';
import { fetchGoogleSuggestions } from '../services/webSearchClient';
import { getWebSearchEnabled, WEB_SEARCH_PREFERENCE_EVENT } from '../../../utils/webSearchPreference';

const SUGGEST_DEBOUNCE_MS = 180;

interface SuggestState {
  query: string;
  suggestions: string[];
}

export function useWebSuggestions(query: string, enabled: boolean) {
  // 어떤 쿼리에 대한 결과인지 함께 저장해, 쿼리가 바뀐 직후 이전 제안이
  // 잠깐 노출되는 현상을 막는다.
  const [state, setState] = useState<SuggestState>({ query: '', suggestions: [] });
  const [isPreferenceEnabled, setIsPreferenceEnabled] = useState(getWebSearchEnabled);

  useEffect(() => {
    const refresh = () => setIsPreferenceEnabled(getWebSearchEnabled());
    window.addEventListener(WEB_SEARCH_PREFERENCE_EVENT, refresh);
    return () => window.removeEventListener(WEB_SEARCH_PREFERENCE_EVENT, refresh);
  }, []);

  useEffect(() => {
    // 검색창이 축소되거나 웹 검색 설정이 꺼지면 이전 요청 결과를 버린다.
    // 훅은 언마운트되지 않고 재사용되므로, 다음에 검색창이 다시 확장될 때
    // 직전 검색어의 자동완성 목록이 잠깐 나타나지 않도록 명시적으로 초기화한다.
    if (!enabled || !isPreferenceEnabled) {
      // eslint-disable-next-line react/set-state-in-effect -- 축소된 검색창과 자동완성 상태를 동기화한다.
      setState((previous) => (
        previous.query === '' && previous.suggestions.length === 0
          ? previous
          : { query: '', suggestions: [] }
      ));
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      const data = await fetchGoogleSuggestions(query);
      if (!cancelled) {
        setState({ query, suggestions: data });
      }
    }, SUGGEST_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, enabled, isPreferenceEnabled]);

  return {
    // 새 응답이 도착할 때까지 이전 목록을 유지해 목록 높이가 줄었다가
    // 다시 늘어나는 깜빡임을 막는다. 표시용 검색어도 같은 시점에 교체한다.
    suggestions: enabled && isPreferenceEnabled ? state.suggestions : [],
    query,
    displayQuery:
      enabled && isPreferenceEnabled && state.query && state.query !== query
        ? state.query
        : query,
    isLoading: enabled && isPreferenceEnabled && state.query !== query,
    isEnabled: isPreferenceEnabled,
  };
}
