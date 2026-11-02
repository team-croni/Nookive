// 코드 검색 설정. 설정 창과 검색 창이 localStorage로 함께 읽는다.

// 코드 검색(Tab / "code:") 사용 여부. 기본은 켜짐.
const CODE_SEARCH_PREFERENCE_KEY = 'nookive.codeSearchEnabled';
const CODE_SEARCH_PREFERENCE_EVENT = 'nookive-code-search-preference-changed';

export function getCodeSearchEnabled(): boolean {
  try {
    return localStorage.getItem(CODE_SEARCH_PREFERENCE_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setCodeSearchEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(CODE_SEARCH_PREFERENCE_KEY, String(enabled));
  } catch {
    // localStorage를 사용할 수 없는 환경에서도 현재 세션의 UI는 동작한다.
  }
  window.dispatchEvent(new Event(CODE_SEARCH_PREFERENCE_EVENT));
}

/**
 * 설정이 바뀌면 콜백을 부른다. 같은 창은 커스텀 이벤트로, 다른 창(설정 창 → 검색 창)은
 * localStorage의 storage 이벤트로 알 수 있다. 해제 함수를 돌려준다.
 */
export function subscribeCodeSearchEnabled(callback: (enabled: boolean) => void): () => void {
  const notify = () => callback(getCodeSearchEnabled());
  const onStorage = (event: StorageEvent) => {
    if (event.key === CODE_SEARCH_PREFERENCE_KEY) notify();
  };
  window.addEventListener(CODE_SEARCH_PREFERENCE_EVENT, notify);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CODE_SEARCH_PREFERENCE_EVENT, notify);
    window.removeEventListener('storage', onStorage);
  };
}

// 코드 파일을 열 에디터. 'auto'는 설치된 첫 에디터, 'default'는 기본 앱, 그 밖에는 에디터 id(Rust editors.rs)다.
const CODE_EDITOR_PREFERENCE_KEY = 'nookive.codeEditor';
const CODE_EDITOR_PREFERENCE_EVENT = 'nookive-code-editor-preference-changed';

export function getCodeEditor(): string {
  try {
    return localStorage.getItem(CODE_EDITOR_PREFERENCE_KEY) ?? 'auto';
  } catch {
    return 'auto';
  }
}

export function setCodeEditor(editor: string): void {
  try {
    localStorage.setItem(CODE_EDITOR_PREFERENCE_KEY, editor);
  } catch {
    // localStorage를 사용할 수 없는 환경에서도 현재 세션의 UI는 동작한다.
  }
  window.dispatchEvent(new Event(CODE_EDITOR_PREFERENCE_EVENT));
}

/** 에디터 설정이 바뀌면 콜백을 부른다. (subscribeCodeSearchEnabled와 같은 방식) */
export function subscribeCodeEditor(callback: (editor: string) => void): () => void {
  const notify = () => callback(getCodeEditor());
  const onStorage = (event: StorageEvent) => {
    if (event.key === CODE_EDITOR_PREFERENCE_KEY) notify();
  };
  window.addEventListener(CODE_EDITOR_PREFERENCE_EVENT, notify);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CODE_EDITOR_PREFERENCE_EVENT, notify);
    window.removeEventListener('storage', onStorage);
  };
}
