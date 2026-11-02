import i18n from '../i18n';
import { findWebSearchEngine, type WebSearchEngine } from './webSearchEngines';

const WEB_SEARCH_PREFERENCE_KEY = 'nookive.webSearchEnabled';
export const WEB_SEARCH_PREFERENCE_EVENT = 'nookive-web-search-preference-changed';

export function getWebSearchEnabled(): boolean {
  try {
    return localStorage.getItem(WEB_SEARCH_PREFERENCE_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setWebSearchEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(WEB_SEARCH_PREFERENCE_KEY, String(enabled));
  } catch {
    // localStorage를 사용할 수 없는 환경에서도 현재 세션의 UI는 동작한다.
  }
  window.dispatchEvent(new Event(WEB_SEARCH_PREFERENCE_EVENT));
}

/**
 * 설정이 바뀌면 콜백을 부른다. 같은 창은 커스텀 이벤트로, 다른 창(설정 창 → 검색 창)은
 * localStorage의 storage 이벤트로 알 수 있다. 해제 함수를 돌려준다.
 */
export function subscribeWebSearchEnabled(callback: (enabled: boolean) => void): () => void {
  const notify = () => callback(getWebSearchEnabled());
  const onStorage = (event: StorageEvent) => {
    if (event.key === WEB_SEARCH_PREFERENCE_KEY) notify();
  };
  window.addEventListener(WEB_SEARCH_PREFERENCE_EVENT, notify);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(WEB_SEARCH_PREFERENCE_EVENT, notify);
    window.removeEventListener('storage', onStorage);
  };
}

// 웹 검색에 쓸 검색 엔진. 고르지 않았으면 화면 언어의 기본 엔진(대부분 Google, 간체 중국어는 Baidu)을 쓴다.
const appLanguage = (): string => i18n.resolvedLanguage ?? i18n.language ?? 'en';
const WEB_SEARCH_ENGINE_KEY = 'nookive.webSearchEngine';
const WEB_SEARCH_ENGINE_EVENT = 'nookive-web-search-engine-changed';

export function getWebSearchEngine(): WebSearchEngine {
  try {
    return findWebSearchEngine(localStorage.getItem(WEB_SEARCH_ENGINE_KEY), appLanguage());
  } catch {
    return findWebSearchEngine(null, appLanguage());
  }
}

export function setWebSearchEngine(id: string): void {
  try {
    localStorage.setItem(WEB_SEARCH_ENGINE_KEY, id);
  } catch {
    // localStorage를 사용할 수 없는 환경에서도 현재 세션의 UI는 동작한다.
  }
  window.dispatchEvent(new Event(WEB_SEARCH_ENGINE_EVENT));
}

/**
 * 검색 엔진이 바뀌면 콜백을 부른다. (subscribeWebSearchEnabled와 같은 방식)
 * 고르지 않았으면 언어에 따라 기본 엔진이 달라지므로 언어가 바뀔 때도 부른다.
 */
export function subscribeWebSearchEngine(callback: (engine: WebSearchEngine) => void): () => void {
  const notify = () => callback(getWebSearchEngine());
  const onStorage = (event: StorageEvent) => {
    if (event.key === WEB_SEARCH_ENGINE_KEY) notify();
  };
  window.addEventListener(WEB_SEARCH_ENGINE_EVENT, notify);
  window.addEventListener('storage', onStorage);
  i18n.on('languageChanged', notify);
  return () => {
    window.removeEventListener(WEB_SEARCH_ENGINE_EVENT, notify);
    window.removeEventListener('storage', onStorage);
    i18n.off('languageChanged', notify);
  };
}
