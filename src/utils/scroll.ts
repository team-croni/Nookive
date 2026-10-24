// src/utils/scroll.ts
// 스크롤 컨테이너 "안에서만" 자식 요소가 보이도록 스크롤하는 유틸.
//
// ⚠️ Element.scrollIntoView()를 쓰지 않는 이유:
//   scrollIntoView는 overflow:hidden인 조상(예: 창 프레임)까지 모두 스크롤시킨다.
//   검색어 입력 직후에는 CSS 프레임은 이미 확장 상태지만 네이티브 창은 아직
//   compact 높이(64px)라서, 이때 호출되면 프레임이 위로 밀려 검색 아이콘/입력창이
//   위로 튀었다가 창이 커진 뒤 제자리로 돌아오는 flash가 발생한다.

interface ScrollChildOptions {
  /** nearest: 보이지 않을 때만 최소 이동 / center: 컨테이너 중앙에 배치 */
  block?: 'nearest' | 'center';
  /** nearest 모드에서 컨테이너 가장자리와 유지할 여백(px) */
  margin?: number;
  behavior?: ScrollBehavior;
}

function getChildTop(container: HTMLElement, child: HTMLElement): number {
  let top = 0;
  let offsetNode: HTMLElement | null = child;
  while (offsetNode && offsetNode !== container) {
    top += offsetNode.offsetTop;
    offsetNode = offsetNode.offsetParent as HTMLElement | null;
  }

  if (offsetNode === container) return top;

  const containerRect = container.getBoundingClientRect();
  return container.scrollTop + child.getBoundingClientRect().top - containerRect.top;
}

/** 헤더부터 항목 끝까지의 범위를 컨테이너 안에 함께 표시한다. */
export function scrollRangeIntoView(
  container: HTMLElement,
  start: HTMLElement,
  end: HTMLElement,
  { margin = 0, behavior = 'auto' }: ScrollChildOptions = {},
): void {
  if (container.clientHeight <= 0) return;

  const startTop = getChildTop(container, start);
  const endBottom = getChildTop(container, end) + end.offsetHeight;
  const minScrollTop = endBottom - container.clientHeight + margin;
  const maxScrollTop = startTop - margin;

  let targetScrollTop = container.scrollTop;
  if (targetScrollTop < minScrollTop) targetScrollTop = minScrollTop;
  if (targetScrollTop > maxScrollTop) targetScrollTop = maxScrollTop;
  targetScrollTop = Math.max(0, targetScrollTop);

  if (targetScrollTop !== container.scrollTop) {
    container.scrollTo({ top: targetScrollTop, behavior });
  }
}

export function scrollChildIntoView(
  container: HTMLElement,
  child: HTMLElement,
  { block = 'nearest', margin = 0, behavior = 'auto' }: ScrollChildOptions = {},
): void {
  // 화면 좌표 차이 대신 컨테이너의 콘텐츠 좌표를 사용한다.
  // 서로 다른 높이의 compact/일반 항목이 섞이면 레이아웃 중간의
  // getBoundingClientRect 값과 scrollTop을 조합할 때 보정 오차가 생길 수 있다.
  const childTop = getChildTop(container, child);

  const childBottom = childTop + child.offsetHeight;
  const visibleTop = container.scrollTop + margin;
  const visibleBottom = container.scrollTop + container.clientHeight - margin;

  let delta = 0;
  if (block === 'center') {
    const childCenter = childTop + child.offsetHeight / 2;
    const containerCenter = container.scrollTop + container.clientHeight / 2;
    delta = childCenter - containerCenter;
  } else if (childTop < visibleTop) {
    delta = childTop - visibleTop;
  } else if (childBottom > visibleBottom) {
    delta = childBottom - visibleBottom;
  }

  if (delta === 0) return;
  // Element.scrollTo는 해당 요소만 스크롤하며 조상에는 영향을 주지 않는다.
  container.scrollTo({ top: container.scrollTop + delta, behavior });
}
