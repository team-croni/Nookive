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
