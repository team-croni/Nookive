// 앱 인라인 자동완성 사용 여부. 기본은 켜짐이며 설정 창과 검색 창이 함께 읽는다.
const INLINE_COMPLETION_KEY = 'nookive.inlineCompletionEnabled';
const INLINE_COMPLETION_EVENT = 'nookive-inline-completion-preference-changed';

export function getInlineCompletionEnabled(): boolean {
  try {
    return localStorage.getItem(INLINE_COMPLETION_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setInlineCompletionEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(INLINE_COMPLETION_KEY, String(enabled));
  } catch {
    // localStorage를 사용할 수 없는 환경에서도 현재 세션의 UI는 동작한다.
  }
  window.dispatchEvent(new Event(INLINE_COMPLETION_EVENT));
}

/**
 * 설정이 바뀌면 콜백을 부른다. 같은 창은 커스텀 이벤트로, 다른 창(설정 창 → 검색 창)은
 * localStorage의 storage 이벤트로 알 수 있다. 해제 함수를 돌려준다.
 */
export function subscribeInlineCompletionEnabled(callback: (enabled: boolean) => void): () => void {
  const notify = () => callback(getInlineCompletionEnabled());
  const onStorage = (event: StorageEvent) => {
    if (event.key === INLINE_COMPLETION_KEY) notify();
  };
  window.addEventListener(INLINE_COMPLETION_EVENT, notify);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(INLINE_COMPLETION_EVENT, notify);
    window.removeEventListener('storage', onStorage);
  };
}
