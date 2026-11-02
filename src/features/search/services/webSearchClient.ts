// src/features/search/services/webSearchClient.ts
// 웹 폴백과 웹 검색 모드에서 쓰는 자동완성/웹 검색 브리지. 설정에서 고른 검색 엔진을 쓴다.
import { invoke } from '@tauri-apps/api/core';
import i18n from '../../../i18n';
import { getWebSearchEngine } from '../../../utils/webSearchPreference';

/** 검색 엔진의 언어 값으로 쓸 현재 앱 언어 (예: en, ko, zh-TW) */
const currentLanguage = (): string => i18n.resolvedLanguage ?? i18n.language ?? 'en';

const SUGGEST_CACHE_LIMIT = 50;
const suggestCache = new Map<string, string[]>();

/** 고른 검색 엔진의 자동완성 제안 조회 (Rust 커맨드로 CORS 우회) */
export async function fetchWebSuggestions(query: string): Promise<string[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  // 같은 검색어라도 엔진과 언어마다 제안이 다르므로 캐시 키에 함께 넣는다.
  const engine = getWebSearchEngine().id;
  const language = currentLanguage();
  const key = `${engine}\n${language}\n${trimmed}`;
  const cached = suggestCache.get(key);
  if (cached) return cached;

  try {
    const suggestions = await invoke<string[]>('web_suggest', { engine, query: trimmed, language });
    const normalized = suggestions
      .map((item) => item.trim())
      .filter((item, index, arr) => item.length > 0 && arr.indexOf(item) === index)
      .slice(0, 8);

    if (suggestCache.size >= SUGGEST_CACHE_LIMIT) {
      const oldest = suggestCache.keys().next().value;
      if (oldest !== undefined) suggestCache.delete(oldest);
    }
    suggestCache.set(key, normalized);
    return normalized;
  } catch (err) {
    console.warn('[WebSearch] 자동완성 조회 실패:', err);
    return [];
  }
}

/** 기본 브라우저로 고른 검색 엔진의 검색 결과 열기 */
export async function openWebSearch(query: string): Promise<void> {
  const trimmed = query.trim();
  if (!trimmed) return;

  const url = getWebSearchEngine().searchUrl(trimmed, currentLanguage());
  try {
    await invoke('open_url', { url });
  } catch (err) {
    console.warn('[WebSearch] 브라우저 열기 실패, window.open으로 폴백:', err);
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
