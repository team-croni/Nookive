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
    if (!enabled || !isPreferenceEnabled) return;

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
