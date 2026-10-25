// src/utils/imageFade.ts

/**
 * 전역 이미지 페이드인.
 * 모든 <img>는 CSS에서 초기 opacity:0 + transition 상태로 시작한다.
 * - 처음 보는 이미지(고유 src): 로드 완료 시 부드럽게 페이드인.
 * - 이미 한 번 표시된 이미지(동일 src): 리마운트되어도 페이드 재생 없이 즉시 표시(깜빡임 방지).
 *   (선택 변경 등으로 같은 이미지가 다시 나타날 때 깜빡이지 않도록)
 * - 로드/에러가 이미 끝난(캐시된) 이미지와, 이후 동적으로 추가되는 이미지도 처리.
 */
const LOADED_CLASS = 'img-loaded';
const NO_FADE_CLASS = 'no-fade';

// 이미 한 번 페이드로 노출한 이미지 src 집합 (동일 이미지 재페이드 방지)
const revealedSrcs = new Set<string>();

function currentSrc(img: HTMLImageElement): string {
  return img.currentSrc || img.src || '';
}

function instantReveal(img: HTMLImageElement) {
  // 페이드 없이 즉시 노출 (transition 비활성화 + 표시)
  img.classList.add(NO_FADE_CLASS, LOADED_CLASS);
}

function fadeReveal(img: HTMLImageElement) {
  const src = currentSrc(img);
  if (src) revealedSrcs.add(src);
  // 한 프레임 뒤에 클래스를 붙여 opacity:0 → 1 전환이 적용되도록 한다.
  requestAnimationFrame(() => img.classList.add(LOADED_CLASS));
}

function reveal(img: HTMLImageElement) {
  const src = currentSrc(img);
  if (src && revealedSrcs.has(src)) {
    instantReveal(img);
  } else {
    fadeReveal(img);
  }
}

function markLoaded(img: HTMLImageElement) {
  if (img.classList.contains(NO_FADE_CLASS) && img.classList.contains(LOADED_CLASS)) return;

  if (img.complete && img.naturalWidth > 0) {
    reveal(img);
  } else {
    img.addEventListener('load', () => reveal(img), { once: true });
    // 깨진 이미지도 표시(깨진 아이콘)되도록 처리해 영구히 숨겨지지 않게 한다.
    img.addEventListener('error', () => instantReveal(img), { once: true });
  }
}

export function initGlobalImageFade(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  // 1) 현재 문서의 이미지
  document.querySelectorAll('img').forEach((img) => markLoaded(img as HTMLImageElement));

  // 2) 이후 동적으로 추가되는 이미지
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLImageElement) {
          markLoaded(node);
        } else if (node instanceof HTMLElement) {
          node.querySelectorAll('img').forEach((img) => markLoaded(img as HTMLImageElement));
        }
      });
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
}
