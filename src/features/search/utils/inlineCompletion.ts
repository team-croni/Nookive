// src/features/search/utils/inlineCompletion.ts
// 입력창 인라인 자동완성: 첫 번째 결과가 앱이고 이름이 검색어로 시작하면 나머지 글자를 이어서 보여준다.
// 완성은 항상 Enter로 열리는 결과(첫 줄)와 같아야 한다. (I/O 없는 순수 함수)
import type { SearchResultItem } from '../../../types/search';
import { nfc } from '../services/textUtils';

export interface InlineCompletion {
  /** Enter로 열릴 앱 */
  item: SearchResultItem;
  /** 검색어와 앞부분이 일치한 이름 (현지화 이름, 원래 이름, 번들 이름 중 하나) */
  matchedName: string;
  /** 입력 뒤에 이어 보일 글자. 검색어가 이름 전체와 같으면 빈 문자열 */
  suffix: string;
  /** 안내에 보일 화면 이름. 다른 이름으로 일치했을 때 어떤 앱인지 알 수 있게 한다. */
  displayName: string;
}

const isApplication = (item: SearchResultItem) =>
  item.category === 'application' || item.file.kind === 'application';

/** 앱의 이름 중 검색어로 시작하는 것을 찾아 완성을 만든다. 없으면 null. */
export function completeFromItem(query: string, item: SearchResultItem | undefined): InlineCompletion | null {
  if (!item || !isApplication(item) || !query || /^\s/.test(query)) return null;
  const typed = nfc(query);
  const lowered = typed.toLowerCase();
  for (const name of [item.file.name, ...(item.file.alternateNames ?? [])]) {
    const normalized = nfc(name);
    if (!normalized.toLowerCase().startsWith(lowered)) continue;
    return {
      item,
      matchedName: normalized,
      // 입력한 글자는 입력한 대소문자 그대로 두고, 나머지만 이름에서 가져온다.
      suffix: normalized.slice(typed.length),
      displayName: item.file.name,
    };
  }
  return null;
}

interface PickOptions {
  query: string;
  /** 화면 결과를 만든 검색어 */
  settledQuery: string;
  /** settledQuery로 찾은 결과 (섹션 순서) */
  settledResults: readonly SearchResultItem[];
  /**
   * 메모리에 있는 앱 목록을 실제 검색과 같은 점수(rankQuery, 개인화 포함)로 정렬한 것.
   * 검색이 끝나기 전 첫 키 입력부터 완성을 보여주는 데 쓴다. 순서가 실제 첫 결과와 같아야 바뀜이 없다.
   */
  rankedApplications: readonly SearchResultItem[];
}

/**
 * 검색이 끝났으면 첫 번째 결과로만 완성한다. (Enter가 여는 것과 같게)
 * 검색 중에는 직전 검색의 첫 결과가 아직 맞으면 그것을(글자를 더 입력해도 같은 앱이 이어진다),
 * 아니면 순위가 가장 높은 앱 중 이름이 검색어로 시작하는 첫 앱을 쓴다.
 */
export function pickInlineCompletion({
  query,
  settledQuery,
  settledResults,
  rankedApplications,
}: PickOptions): InlineCompletion | null {
  if (!query.trim()) return null;
  const top = completeFromItem(query, settledResults[0]);
  if (settledQuery === query || top) return top;

  for (const app of rankedApplications) {
    const candidate = completeFromItem(query, app);
    if (candidate) return candidate;
  }
  return null;
}
