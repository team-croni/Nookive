// src/features/preview/pdf/pdfRender.ts
// 대상 페이지를 캔버스에 렌더하고 화면 좌표(하이라이트)를 계산한다.
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { clamp, type Rect, type TextItemRect } from './pdfTextSearch';
import { renderNativePdfPage, type NativePdfPage } from '../../../utils/tauriBridge';

// 검색어가 있는 경우 해당 위치를 읽기 쉽게 확대하되, 페이지가 지나치게
// 확대되어 빈 화면처럼 보이지 않도록 최대 배율을 제한한다.
const DESIRED_FONT_PX = 7;
const MIN_SCALE = 0.4;
// 최대 확대 배율. 캔버스 예산(MAX_CANVAS_DIM)과 함께 적용된다.
const MAX_FOCUS_SCALE = 4.0;
// 캔버스 백킹 스토어 최대 변(px) — WebKit 캔버스 한계(면적/변) 회피.
// 값을 키우면 더 확대할 수 있지만 전송/디코딩 비용도 커진다.
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
  /** 네이티브 렌더 결과를 캐시에서 재사용했는지 (첫 로딩 페이드인 판단용) */
  fromCache: boolean;
}

// 같은 PDF/페이지/배율의 네이티브 렌더 결과를 재사용해 재선택 시 즉시 표시한다.
// (RGBA 원시 바이트는 용량이 크므로 소량만 보관)
const RENDER_CACHE = new Map<string, NativePdfPage>();
const RENDER_CACHE_LIMIT = 2;

export function clearPdfRenderCache(): void {
  RENDER_CACHE.clear();
}

interface RenderParams {
  path: string;
  doc: PDFDocumentProxy;
  targetPage: number;
  rects: Rect[];
  textItems: TextItemRect[];
  matched: boolean;
  vpSize: { w: number; h: number };
  canvas: HTMLCanvasElement;
  isCancelled: () => boolean;
}

export async function renderPdfPage({
  path,
  doc,
  targetPage,
  rects,
  textItems,
  matched,
  vpSize,
  canvas,
  isCancelled,
}: RenderParams): Promise<ViewState | null> {
  const page = await doc.getPage(targetPage);
  if (isCancelled()) return null;
  const base = page.getViewport({ scale: 1 });

  const fitScale = Math.max(0.05, Math.min(vpSize.w / base.width, vpSize.h / base.height));
  // 검색 결과의 페이지를 먼저 고른 뒤 해당 페이지 안의 키워드를 중심으로
  // 확대한다. 기존 기능은 유지하되, 최대 배율을 제한해 과도한 확대와
  // 렌더링 실패 가능성을 줄인다.
  let scale = matched && rects.length > 0
    ? clamp(DESIRED_FONT_PX / rects[0].height, fitScale, MAX_FOCUS_SCALE)
    : fitScale;

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

  // 최종 표시 캔버스에 직접 렌더한다. 임시 캔버스 → 표시 캔버스
  // drawImage 복사 경로는 WebKit에서 PDF 텍스트 글리프가 사라지는 문제가
  // 있어 사용하지 않는다.
  const nativeScale = scale * ratio;
  const renderKey = `${path}|${targetPage}|${nativeScale.toFixed(3)}`;
  let nativePage = RENDER_CACHE.get(renderKey);
  const fromCache = nativePage !== undefined;
  if (!nativePage) {
    nativePage = await renderNativePdfPage(path, targetPage, nativeScale);
    if (isCancelled()) return null;
    RENDER_CACHE.set(renderKey, nativePage);
    if (RENDER_CACHE.size > RENDER_CACHE_LIMIT) {
      const oldest = RENDER_CACHE.keys().next().value;
      if (oldest !== undefined) RENDER_CACHE.delete(oldest);
    }
  }
  if (isCancelled()) return null;

  // 요청한 배율(scale)이 아니라 실제 네이티브 렌더 결과의 크기로
  // 화면 표시 크기를 역산한다. 백엔드가 배율을 제한/반올림하더라도
  // 본문과 하이라이트 좌표가 항상 정확히 일치하도록 하기 위함이다.
  const displayWidth = nativePage.width / ratio;
  const displayHeight = nativePage.height / ratio;
  const displayScaleX = displayWidth / base.width;
  const displayScaleY = displayHeight / base.height;

  // 하이라이트/텍스트는 실제 표시 배율을 사용한다.
  const screenRects = rects.map((r) => ({
    // 하이라이트는 페이지 전용 레이어 안에 배치하므로 offset을 제외한다.
    left: r.left * displayScaleX,
    top: r.top * displayScaleY,
    width: r.width * displayScaleX,
    height: r.height * displayScaleY,
  }));

  const screenTextItems = textItems.map((item) => ({
    text: item.text,
    // 텍스트 레이어는 페이지 캔버스 자체를 기준으로 배치한다.
    // stage 좌표(offset)를 포함하면 페이지 밖으로 글씨가 새어 나간다.
    left: item.left * displayScaleX,
    top: item.top * displayScaleY,
    width: item.width * displayScaleX,
    height: item.height * displayScaleY,
  }));

  // 오프셋은 실제 표시 크기/좌표를 기준으로 계산한다.
  let offX: number;
  let offY: number;
  if (matched && screenRects.length > 0) {
    const f = screenRects[0];
    offX = vpSize.w / 2 - (f.left + f.width / 2);
    offY = vpSize.h / 2 - (f.top + f.height / 2);
  } else {
    offX = (vpSize.w - displayWidth) / 2;
    offY = (vpSize.h - displayHeight) / 2;
  }

  offX = displayWidth <= vpSize.w
    ? (vpSize.w - displayWidth) / 2
    : clamp(offX, vpSize.w - displayWidth, 0);
  offY = displayHeight <= vpSize.h
    ? (vpSize.h - displayHeight) / 2
    : clamp(offY, vpSize.h - displayHeight, 0);

  canvas.width = nativePage.width;
  canvas.height = nativePage.height;
  canvas.style.width = `${displayWidth}px`;
  canvas.style.height = `${displayHeight}px`;
  canvas.style.left = `${offX}px`;
  canvas.style.top = `${offY}px`;
  // CoreGraphics가 만든 비트맵은 WebKit 캔버스에 표시될 때 세로축이
  // 반대로 해석된다. PDF 본문은 기존 동작과 동일하게 Y축만 보정한다.
  // 하이라이트도 같은 페이지 레이어에서 같은 보정을 적용한다.
  canvas.style.transform = 'scaleY(-1)';
  canvas.style.transformOrigin = 'center center';
  const displayCtx = canvas.getContext('2d');
  if (!displayCtx) {
    throw new Error('PDF 미리보기용 캔버스를 초기화하지 못했습니다.');
  }

  // Rust가 원시 RGBA 바이트를 그대로 반환하므로 base64 디코딩 없이 바로 그린다.
  const rgba = new Uint8ClampedArray(
    nativePage.rgba.buffer as ArrayBuffer,
    nativePage.rgba.byteOffset,
    nativePage.rgba.byteLength,
  );
  displayCtx.putImageData(new ImageData(rgba, nativePage.width, nativePage.height), 0, 0);

  // 하이라이트를 HTML 오버레이가 아니라 페이지 래스터에 직접 합성한다.
  // WKWebView에서는 캔버스가 별도 합성 레이어로 처리되어 CSS
  // mix-blend-mode가 캔버스를 백드롭으로 인식하지 못하는 경우가 있다.
  // 캔버스 2D의 multiply는 항상 보장되며, 검은 글자 픽셀은
  // (0 × 색 = 0)이라 그대로 남아 글자가 하이라이트보다 앞에 보인다.
  if (rects.length > 0 && typeof document !== 'undefined') {
    const highlightColor =
      getComputedStyle(document.documentElement)
        .getPropertyValue('--highlight-bg')
        .trim() || 'rgba(255, 214, 0, 0.5)';
    // 백킹 스토어 픽셀 좌표는 CSS 플립(scaleY(-1)) 이전 상태이므로
    // 세로 위치를 페이지 높이 기준으로 뒤집어 그린다.
    const rasterScaleX = nativePage.width / base.width;
    const rasterScaleY = nativePage.height / base.height;
    displayCtx.save();
    displayCtx.globalCompositeOperation = 'multiply';
    displayCtx.fillStyle = highlightColor;
    for (const r of rects) {
      displayCtx.fillRect(
        r.left * rasterScaleX,
        nativePage.height - (r.top + r.height) * rasterScaleY,
        r.width * rasterScaleX,
        r.height * rasterScaleY,
      );
    }
    displayCtx.restore();
  }

  canvas.style.visibility = 'visible';

  return {
    page: targetPage,
    matched,
    matchCount: rects.length,
    canvasWidth: displayWidth,
    canvasHeight: displayHeight,
    offsetX: offX,
    offsetY: offY,
    rects: screenRects,
    textItems: screenTextItems,
    fromCache,
  };
}
