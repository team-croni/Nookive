// src/features/search/services/webSearchClient.ts
// 로컬 결과가 없을 때 사용하는 Google 자동완성/웹 검색 브리지.
import { invoke } from '@tauri-apps/api/core';
import i18n from '../../../i18n';

/** Google의 hl 값으로 쓸 현재 앱 언어 (예: en, ko, zh-TW) */
const currentLanguage = (): string => i18n.resolvedLanguage ?? i18n.language ?? 'en';

const SUGGEST_CACHE_LIMIT = 50;
const suggestCache = new Map<string, string[]>();

/** Google 자동완성 제안 조회 (Rust 커맨드로 CORS 우회) */
export async function fetchGoogleSuggestions(query: string): Promise<string[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  // 같은 검색어라도 언어마다 제안이 다르므로 언어를 캐시 키에 포함한다.
  const language = currentLanguage();
  const key = `${language}\n${trimmed}`;
  const cached = suggestCache.get(key);
  if (cached) return cached;

  try {
    const suggestions = await invoke<string[]>('google_suggest', { query: trimmed, language });
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
    console.warn('[WebSearch] Google 자동완성 조회 실패:', err);
    return [];
  }
}

/** 기본 브라우저로 Google 검색 결과 열기 */
export async function openGoogleSearch(query: string): Promise<void> {
  const trimmed = query.trim();
  if (!trimmed) return;

  const url = `https://www.google.com/search?q=${encodeURIComponent(trimmed)}&hl=${encodeURIComponent(currentLanguage())}`;
  try {
    await invoke('open_url', { url });
  } catch (err) {
    console.warn('[WebSearch] 브라우저 열기 실패, window.open으로 폴백:', err);
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
