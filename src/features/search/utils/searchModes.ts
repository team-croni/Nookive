// src/features/search/utils/searchModes.ts
// 검색 모드(Tab 순환과 접두어). 모드를 추가하려면 SEARCH_MODES에 한 줄을 더한다.
//
// - 칩 라벨은 화면 글자라 언어별로 번역하고, 접두어는 언어와 관계없이 같은 영어 단어로 둔다.
// - Tab은 전체 → 각 모드 → 전체 순으로 돌고, Shift+Tab은 반대로 돈다. 설정에서 꺼진 모드는 건너뛴다.

export type SearchMode = 'all' | 'code';
export type SpecialSearchMode = Exclude<SearchMode, 'all'>;

export interface SearchModeDefinition {
  id: SpecialSearchMode;
  /** 입력 맨 앞에 쓰면 이 모드로 들어간다. (예: "code: main") */
  prefix: string;
}

export const SEARCH_MODES: readonly SearchModeDefinition[] = [{ id: 'code', prefix: 'code:' }];

/**
 * 입력이 사용할 수 있는 모드의 접두어로 시작하면 모드와 나머지 입력을, 아니면 null을 돌려준다.
 * 접두어 뒤 공백은 지운다. 대소문자는 구분하지 않는다.
 */
export function parseModePrefix(
  value: string,
  available: readonly SpecialSearchMode[],
): { mode: SpecialSearchMode; rest: string } | null {
  const lower = value.toLowerCase();
  for (const definition of SEARCH_MODES) {
    if (!available.includes(definition.id) || !lower.startsWith(definition.prefix)) continue;
    return { mode: definition.id, rest: value.slice(definition.prefix.length).replace(/^\s+/, '') };
  }
  return null;
}

/** 전체 → 사용할 수 있는 모드들 → 전체 순서로 다음(또는 이전) 모드를 돌려준다. */
export function cycleSearchMode(
  current: SearchMode,
  available: readonly SpecialSearchMode[],
  backward = false,
): SearchMode {
  const order: SearchMode[] = ['all', ...SEARCH_MODES.map((mode) => mode.id).filter((id) => available.includes(id))];
  const index = Math.max(0, order.indexOf(current));
  const step = backward ? order.length - 1 : 1;
  return order[(index + step) % order.length];
}

interface ModeKey {
  key: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  /** IME 조합 중(일본어·중국어 변환 후보 등)에는 Tab을 IME에 양보한다. */
  isComposing: boolean;
}

/**
 * 키 입력으로 바뀔 모드를 돌려준다. 바뀌지 않으면 null.
 * - Tab / Shift+Tab: 다음 / 이전 모드
 * - Backspace: 특수 모드에서 입력이 비어 있으면 전체 검색으로
 * ⌘/⌃/⌥ 조합(⌘Tab 앱 전환 등)은 건드리지 않는다.
 */
export function nextSearchModeForKey(
  event: ModeKey,
  current: SearchMode,
  available: readonly SpecialSearchMode[],
  inputValue: string,
): SearchMode | null {
  if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return null;
  let next: SearchMode | null = null;
  if (event.key === 'Tab') next = cycleSearchMode(current, available, event.shiftKey);
  else if (event.key === 'Backspace' && current !== 'all' && inputValue === '') next = 'all';
  return next === current ? null : next;
}
