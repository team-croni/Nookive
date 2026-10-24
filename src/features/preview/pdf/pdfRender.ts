// src/features/preview/pdf/pdfRender.ts
// 대상 페이지를 캔버스에 렌더하고 화면 좌표(하이라이트)를 계산한다.
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { clamp, type Rect, type TextItemRect } from './pdfTextSearch';

// 하이라이트된 텍스트의 목표 화면 높이(px) → 확대 배율 산정 기준 (작을수록 덜 확대)
const DESIRED_FONT_PX = 7;
const MIN_SCALE = 0.4;
const MAX_SCALE = 24;
// 캔버스 백킹 스토어 최대 변(px) — WebKit 캔버스 한계(면적/변) 회피
const MAX_CANVAS_DIM = 3072;

export interface ViewState {
  page: number;
  matched: boolean;
  matchCount: number;
  canvasWidth: number;
  canvasHeight: number;
  offsetX: number;
  offsetY: number;
  rects: Rect[];
  textItems: TextItemRect[];
}

interface RenderParams {
  doc: PDFDocumentProxy;
  targetPage: number;
  rects: Rect[];
  textItems: TextItemRect[];
  matched: boolean;
  vpSize: { w: number; h: number };
  canvas: HTMLCanvasElement;
  renderTaskRef: { current: { cancel: () => void } | null };
  isCancelled: () => boolean;
}

export async function renderPdfPage({
  doc,
  targetPage,
  rects,
  textItems,
  matched,
  vpSize,
  canvas,
  renderTaskRef,
  isCancelled,
}: RenderParams): Promise<ViewState | null> {
  const page = await doc.getPage(targetPage);
  if (isCancelled()) return null;
  const base = page.getViewport({ scale: 1 });

  let scale = matched && rects.length > 0
    ? clamp(DESIRED_FONT_PX / rects[0].height, MIN_SCALE, MAX_SCALE)
    // 검색어 없음: 페이지 전체(가로·세로)가 뷰포트에 맞도록 contain 스케일.
    // (MIN_SCALE로 클램프하면 A4 같은 긴 페이지가 뷰포트보다 커져 위아래가 잘림)
    : Math.max(0.05, Math.min(vpSize.w / base.width, vpSize.h / base.height));

  // 화질 보호: 배율이 커져 백킹 스토어가 캔버스 한계(MAX_CANVAS_DIM)에 걸리면
  // 픽셀비(ratio)가 1 미만으로 떨어져 "확대한 것처럼" 뿌옇게 보인다.
  // 배율을 예산에 맞게 제한해 항상 ratio ≥ devicePixelRatio(또렷)를 유지한다.
  const dprBase = window.devicePixelRatio || 1;
  const maxScaleByBudget =
    MAX_CANVAS_DIM / (Math.max(base.width, base.height) * dprBase);
  scale = Math.min(scale, Math.max(MIN_SCALE, maxScaleByBudget));

  // 백킹 스토어가 WebKit 캔버스 한계(약 4096px)를 넘지 않도록 픽셀비를 제한
  const dpr = window.devicePixelRatio || 1;
  const maxPageDim = Math.max(base.width, base.height);
  const ratio = Math.min(dpr, MAX_CANVAS_DIM / (maxPageDim * scale));
  const rvp = page.getViewport({ scale: scale * ratio });
  // 오프셋 계산 (렌더 이전)
  const pageW = base.width * scale;
  const pageH = base.height * scale;

  let offX: number;
  let offY: number;
  if (matched && rects.length > 0) {
    const f = rects[0];
    offX = vpSize.w / 2 - (f.left + f.width / 2) * scale;
    offY = vpSize.h / 2 - (f.top + f.height / 2) * scale;
  } else {
    offX = (vpSize.w - pageW) / 2;
    offY = (vpSize.h - pageH) / 2;
  }

  offX = pageW <= vpSize.w
    ? (vpSize.w - pageW) / 2
    : clamp(offX, vpSize.w - pageW, 0);
  offY = pageH <= vpSize.h
    ? (vpSize.h - pageH) / 2
    : clamp(offY, vpSize.h - pageH, 0);

  // 최종 표시 캔버스에 직접 렌더한다. 임시 캔버스 → 표시 캔버스
  // drawImage 복사 경로는 WebKit에서 PDF 텍스트 글리프가 사라지는 문제가
  // 있어 사용하지 않는다.
  canvas.width = Math.floor(rvp.width);
  canvas.height = Math.floor(rvp.height);
  canvas.style.width = `${Math.floor(rvp.width / ratio)}px`;
  canvas.style.height = `${Math.floor(rvp.height / ratio)}px`;
  canvas.style.left = `${offX}px`;
  canvas.style.top = `${offY}px`;
  canvas.style.visibility = 'hidden';

  const displayCtx = canvas.getContext('2d');
  if (!displayCtx) return null;

  renderTaskRef.current?.cancel();
  const task = page.render({ canvasContext: displayCtx, viewport: rvp, canvas });
  renderTaskRef.current = task;
  await task.promise;
  if (isCancelled()) return null;
  canvas.style.visibility = 'visible';

  const screenRects = rects.map((r) => ({
    left: r.left * scale + offX,
    top: r.top * scale + offY,
    width: r.width * scale,
    height: r.height * 1.2 * scale,
  }));

  const screenTextItems = textItems.map((item) => ({
    text: item.text,
    left: item.left * scale + offX,
    top: item.top * scale + offY,
    width: item.width * scale,
    height: item.height * scale,
  }));

  return {
    page: targetPage,
    matched,
    matchCount: rects.length,
    canvasWidth: pageW,
    canvasHeight: pageH,
    offsetX: offX,
    offsetY: offY,
    rects: screenRects,
    textItems: screenTextItems,
  };
}
