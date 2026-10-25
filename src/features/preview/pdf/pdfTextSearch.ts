// src/features/preview/pdf/pdfTextSearch.ts
// PDF 텍스트에서 검색어 위치(사각형)를 찾는다.
import type { PDFDocumentProxy } from 'pdfjs-dist';

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface TextItemRect extends Rect {
  text: string;
}

const MAX_SCAN_PAGES = 60;
// 페이지 텍스트 추출을 청크 단위로 병렬 처리해 텍스트가 많은 PDF의 스캔을 단축한다.
const SCAN_CHUNK = 8;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

interface TextStyleInfo {
  /** 기준선 위쪽(어센더) 비율. 폰트 크기 대비 값 */
  ascent: number;
  /** 기준선 아래쪽(디센더) 비율. 음수 */
  descent: number;
}

type TextStyleMap = Record<
  string,
  { ascent?: number; descent?: number; fontFamily?: string }
> | undefined;

// 폰트 메타데이터가 없을 때 쓰는 일반적인 비율값.
const DEFAULT_ASCENT = 0.8;
const DEFAULT_DESCENT = -0.2;

/**
 * pdf.js가 제공하는 폰트 스타일에서 기준선 위/아래 비율을 구한다.
 * ascent/descent는 폰트 크기 대비 비율이며, 비정상 값은 기본값으로 대체한다.
 */
function resolveTextMetrics(
  styles: TextStyleMap,
  fontName?: string,
): TextStyleInfo {
  const style = fontName ? styles?.[fontName] : undefined;
  const rawAscent = style?.ascent;
  const rawDescent = style?.descent;
  const ascent =
    typeof rawAscent === 'number' && Number.isFinite(rawAscent) && rawAscent > 0
      ? clamp(rawAscent, 0.5, 1.4)
      : DEFAULT_ASCENT;
  const descent =
    typeof rawDescent === 'number' && Number.isFinite(rawDescent) && rawDescent < 0
      ? clamp(rawDescent, -0.6, -0.05)
      : DEFAULT_DESCENT;
  return { ascent, descent };
}

/**
 * 텍스트 항목의 transform으로 부분 문자열(run)이 차지하는 화면 좌표
 * 사각형을 계산한다. 회전/세로쓰기 텍스트도 축 정렬 bbox로 변환한다.
 * 기존처럼 기준선에서 폰트 높이만큼 위로 잡지 않고, 실제 ascent/descent
 * 비율을 사용해 글자 영역에 맞춘다.
 */
function textRunRect(
  tx: number[],
  startRatio: number,
  endRatio: number,
  itemWidth: number,
  metrics: TextStyleInfo,
): Rect | null {
  const advLen = Math.hypot(tx[0], tx[1]);
  const upLen = Math.hypot(tx[2], tx[3]);
  if (!(advLen > 0) || !(upLen > 0)) return null;

  // 글자 진행 방향(단위 벡터)과 글리프 위쪽 방향(단위 벡터)
  const ax = tx[0] / advLen;
  const ay = tx[1] / advLen;
  const ux = tx[2] / upLen;
  const uy = tx[3] / upLen;

  const start = clamp(startRatio, 0, 1);
  const end = clamp(endRatio, start, 1);
  const startOffset = itemWidth * start;
  const runWidth = itemWidth * (end - start);

  // 매칭 구간의 기준선 시작/끝점
  const sx = tx[4] + ax * startOffset;
  const sy = tx[5] + ay * startOffset;
  const ex = sx + ax * runWidth;
  const ey = sy + ay * runWidth;

  // up 벡터 방향이 글리프 위쪽이다. (일반 텍스트는 (0,-1))
  const ascent = metrics.ascent * upLen;
  const descent = Math.abs(metrics.descent) * upLen;

  const xs = [
    sx + ux * ascent,
    ex + ux * ascent,
    sx - ux * descent,
    ex - ux * descent,
  ];
  const ys = [
    sy + uy * ascent,
    ey + uy * ascent,
    sy - uy * descent,
    ey - uy * descent,
  ];
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const width = Math.max(...xs) - left;
  const height = Math.max(...ys) - top;
  if (!(width > 0) || !(height > 0)) return null;
  return { left, top, width, height };
}

function extractTextItemRects(
  viewport: { transform: number[] },
  items: unknown[],
  styles: TextStyleMap,
): TextItemRect[] {
  return items
    .map((raw) => {
      const it = raw as {
        str?: string;
        transform?: number[];
        width?: number;
        height?: number;
        fontName?: string;
      };
      if (!it.str || !it.transform) return null;
      const tx = multiplyTransform(viewport.transform, it.transform);
      const rect = textRunRect(
        tx,
        0,
        1,
        it.width ?? 0,
        resolveTextMetrics(styles, it.fontName),
      );
      if (!rect) return null;
      return { text: it.str, ...rect };
    })
    .filter((item): item is TextItemRect => item !== null);
}

// 전각(한글/CJK) 문자는 반각의 약 2배 폭으로 근사 (하이라이트 폭 보정용)
const charWidthWeight = (code: number): number => {
  if (
    (code >= 0x1100 && code <= 0x115f) || // 한글 자모
    (code >= 0x2e80 && code <= 0x303e) || // CJK 부수/기호
    (code >= 0x3041 && code <= 0x33ff) || // 히라가나/가타카나/기호
    (code >= 0x3400 && code <= 0x4dbf) || // CJK 확장 A
    (code >= 0x4e00 && code <= 0x9fff) || // CJK 통합 한자
    (code >= 0xa000 && code <= 0xa4cf) || // 이문/한글 자모 확장
    (code >= 0xac00 && code <= 0xd7a3) || // 한글 음절
    (code >= 0xf900 && code <= 0xfaff) || // CJK 호환
    (code >= 0xfe30 && code <= 0xfe4f) || // CJK 호환 괘선
    (code >= 0xff00 && code <= 0xff60) || // 전각 영숫자/기호
    (code >= 0xffe0 && code <= 0xffe6)
  ) {
    return 2;
  }
  return 1;
};

// 비례폭 폰트에서도 매칭 구간 좌우 경계를 실제 글자 위치에 맞추기 위해
// 캔버스 measureText로 글자별 진행 폭 비율을 구한다. 항목 전체 폭은
// pdf.js가 준 it.width로 정규화하므로 총 폭은 항상 일치한다.
const MEASURE_FONT_PX = 100;
const MIN_MEASURED_ADVANCE = 0.01;
let measureCtx: CanvasRenderingContext2D | null | undefined;
const charAdvanceCache = new Map<string, Map<number, number>>();

function getMeasureContext(): CanvasRenderingContext2D | null {
  if (measureCtx !== undefined) return measureCtx;
  if (typeof document === 'undefined') {
    measureCtx = null;
    return null;
  }
  try {
    measureCtx = document.createElement('canvas').getContext('2d');
  } catch {
    measureCtx = null;
  }
  return measureCtx;
}

/**
 * 항목 텍스트의 문자별 누적 폭(prefix sum)을 만든다.
 * 폰트별 글자 진행 폭은 캐시하고, 측정이 불가능하면 전각/반각 가중치로 대체한다.
 */
function buildCharPrefix(str: string, fontFamily: string): number[] {
  const len = str.length;
  const prefix = new Array<number>(len + 1);
  prefix[0] = 0;

  const ctx = getMeasureContext();
  if (ctx) ctx.font = `${MEASURE_FONT_PX}px ${fontFamily}`;

  let cache = charAdvanceCache.get(fontFamily);
  if (!cache) {
    cache = new Map();
    charAdvanceCache.set(fontFamily, cache);
  }

  let measured = 0;
  for (let i = 0; i < len; i++) {
    const code = str.charCodeAt(i);
    let advance = cache.get(code);
    if (advance === undefined) {
      advance = ctx ? ctx.measureText(str[i]).width : 0;
      // 캔버스가 없을 때 0을 캐시하면 이후에도 폴백만 쓰이므로 측정값만 캐시한다.
      if (ctx) cache.set(code, advance);
    }
    prefix[i + 1] = prefix[i] + advance;
    measured += advance;
  }
  if (!(measured > MIN_MEASURED_ADVANCE)) {
    for (let i = 0; i < len; i++) {
      prefix[i + 1] = prefix[i] + charWidthWeight(str.charCodeAt(i));
    }
  }
  return prefix;
}

// pdf.js Util.transform 과 동일한 2D 행렬 곱 (외부 의존 제거)
const multiplyTransform = (m1: number[], m2: number[]): number[] => [
  m1[0] * m2[0] + m1[2] * m2[1],
  m1[1] * m2[0] + m1[3] * m2[1],
  m1[0] * m2[2] + m1[2] * m2[3],
  m1[1] * m2[2] + m1[3] * m2[3],
  m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
  m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
];

export interface MatchScanResult {
  targetPage: number;
  rects: Rect[];
  textItems: TextItemRect[];
  matched: boolean;
}

// 같은 PDF/검색어에 대한 스캔 결과를 재사용해, 선택을 오가도 다시 스캔하지 않는다.
const MATCH_CACHE = new Map<string, MatchScanResult>();
const MATCH_CACHE_LIMIT = 16;
// 같은 PDF/검색어를 백그라운드 스캔과 미리보기가 동시에 스캔하지 않도록
// 진행 중인 스캔을 공유한다.
const MATCH_INFLIGHT = new Map<string, Promise<MatchScanResult>>();

export function clearPdfMatchCache(): void {
  MATCH_CACHE.clear();
  MATCH_INFLIGHT.clear();
}

interface PageScan {
  page: number;
  rects: Rect[];
  textItems: TextItemRect[];
  textMatched: boolean;
}

/** 페이지 하나의 텍스트를 스캔해 하이라이트 사각형/텍스트 매칭 여부를 계산한다. */
async function scanPage(
  doc: PDFDocumentProxy,
  pageNumber: number,
  terms: string[],
): Promise<PageScan> {
  const pg = await doc.getPage(pageNumber);
  const vp1 = pg.getViewport({ scale: 1 });
  const tc = await pg.getTextContent();
  const styles = tc.styles as TextStyleMap;

  const pageRects: Rect[] = [];
  // 항목 단위 매칭은 폰트/스타일 변경으로 키워드가 여러 항목에 쪼개진
  // 경우 놓칠 수 있다. 페이지 전체 텍스트(공백 유무 모두)로도 확인해
  // "키워드가 있는 페이지"를 정확히 찾는다.
  const pageTextParts: string[] = [];
  for (const raw of tc.items) {
    const it = raw as {
      str?: string;
      transform?: number[];
      width?: number;
      height?: number;
      fontName?: string;
    };
    if (!it.str) continue;
    pageTextParts.push(it.str);
    if (!it.transform) continue;

    const lower = it.str.toLowerCase();
    // 항목(줄) 내에서 키워드가 등장하는 모든 문자 구간을 수집한다.
    const ranges: Array<[number, number]> = [];
    for (const t of terms) {
      let from = 0;
      while (from <= lower.length - t.length) {
        const idx = lower.indexOf(t, from);
        if (idx === -1) break;
        ranges.push([idx, idx + t.length]);
        from = idx + t.length;
      }
    }
    if (ranges.length === 0) continue;

    const tx = multiplyTransform(vp1.transform, it.transform);
    const itemWidth = it.width ?? 0;
    if (!(itemWidth > 0)) continue;
    const metrics = resolveTextMetrics(styles, it.fontName);
    const fontFamily = it.fontName
      ? styles?.[it.fontName]?.fontFamily || 'sans-serif'
      : 'sans-serif';

    // 항목 전체 폭을 실제 글자 진행 폭 비례로 배분해, 매칭된 부분만
    // 실제 글자 위치에 가깝게 하이라이트한다.
    const len = it.str.length || 1;
    const prefix = buildCharPrefix(it.str, fontFamily);
    const totalWeight = prefix[len] || 1;
    for (const [s, e] of ranges) {
      const startRatio = prefix[Math.min(s, len)] / totalWeight;
      const endRatio = prefix[Math.min(e, len)] / totalWeight;
      const rect = textRunRect(tx, startRatio, endRatio, itemWidth, metrics);
      if (rect) pageRects.push(rect);
    }
  }

  let textMatched = false;
  // 항목 단위 매칭이 없는 페이지에서만 전체 텍스트를 조인해 확인한다.
  if (pageRects.length === 0) {
    const pageText = pageTextParts.join('').toLowerCase();
    const pageTextSpaced = pageTextParts.join(' ').toLowerCase();
    textMatched = terms.some(
      (t) => pageText.includes(t) || pageTextSpaced.includes(t),
    );
  }

  // 매칭된 페이지에서만 텍스트 레이어를 만든다. (비매칭 페이지 비용 절감)
  const textItems = pageRects.length > 0 || textMatched
    ? extractTextItemRects(vp1, tc.items, styles)
    : [];

  return { page: pageNumber, rects: pageRects, textItems, textMatched };
}

/**
 * 키워드가 처음 등장하는 페이지와 좌표를 탐색한다.
 * 검색어가 없거나 매칭이 없으면 1페이지를 반환한다.
 */
async function scanMatchRects(
  doc: PDFDocumentProxy,
  query: string,
  isCancelled: () => boolean,
): Promise<MatchScanResult> {
  const rawQuery = (query || '').trim().toLowerCase();
  let terms = rawQuery.split(/\s+/).filter((k) => k.length >= 2);
  if (terms.length === 0 && rawQuery.length > 0) terms = [rawQuery];

  if (terms.length > 0) {
    // 항상 문서 첫 페이지부터 훑어 "검색어가 처음 발견된 페이지"를 기준으로
    // 삼는다. 페이지를 청크 단위로 병렬 스캔하되, 청크 안에서는 페이지
    // 순서를 유지해 가장 먼저 발견된 페이지를 그대로 보장한다.
    const scanLimit = Math.min(doc.numPages, MAX_SCAN_PAGES);
    let firstTextMatch: PageScan | null = null;

    for (let start = 1; start <= scanLimit; start += SCAN_CHUNK) {
      if (isCancelled()) break;
      const end = Math.min(start + SCAN_CHUNK - 1, scanLimit);
      const pageNumbers = Array.from(
        { length: end - start + 1 },
        (_, index) => start + index,
      );
      const scans = await Promise.all(
        pageNumbers.map((n) => scanPage(doc, n, terms)),
      );
      if (isCancelled()) break;

      // 하이라이트 가능한(항목 단위 매칭) 첫 페이지에서 즉시 멈춘다.
      const rectMatch = scans.find((scan) => scan.rects.length > 0);
      if (rectMatch) {
        return {
          targetPage: rectMatch.page,
          rects: rectMatch.rects,
          textItems: rectMatch.textItems,
          matched: true,
        };
      }
      // 키워드가 여러 항목에 쪼개진 경우: 첫 매칭 페이지만 기억해 두고
      // 뒤 페이지에서 실제 하이라이트 가능한 매칭이 있는지 계속 확인한다.
      if (!firstTextMatch) {
        firstTextMatch = scans.find((scan) => scan.textMatched) ?? null;
      }
    }

    if (firstTextMatch) {
      return {
        targetPage: firstTextMatch.page,
        rects: [],
        textItems: firstTextMatch.textItems,
        matched: true,
      };
    }
  }

  // 검색어가 없거나 매칭되는 텍스트가 없는 경우 1페이지 텍스트 레이어를 수집한다.
  let textItems: TextItemRect[] = [];
  if (!isCancelled()) {
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    if (!isCancelled()) {
      textItems = extractTextItemRects(
        viewport,
        content.items,
        content.styles as TextStyleMap,
      );
    }
  }
  return { targetPage: 1, rects: [], textItems, matched: false };
}

/**
 * 캐시/진행 중인 스캔을 재사용해 매칭 페이지를 반환한다.
 * 스캔 자체는 완료까지 진행하고, 각 호출자는 결과를 받은 뒤 자신의
 * 취소 여부를 확인한다. (백그라운드 스캔과 미리보기의 중복 스캔 방지)
 */
export function findMatchRects(
  path: string,
  doc: PDFDocumentProxy,
  query: string,
): Promise<MatchScanResult> {
  const rawQuery = (query || '').trim().toLowerCase();
  const cacheKey = `${path}|${rawQuery}`;
  const cached = MATCH_CACHE.get(cacheKey);
  if (cached) return Promise.resolve(cached);

  let inflight = MATCH_INFLIGHT.get(cacheKey);
  if (!inflight) {
    inflight = scanMatchRects(doc, rawQuery, () => false)
      .then((result) => {
        MATCH_CACHE.set(cacheKey, result);
        if (MATCH_CACHE.size > MATCH_CACHE_LIMIT) {
          const oldest = MATCH_CACHE.keys().next().value;
          if (oldest !== undefined) MATCH_CACHE.delete(oldest);
        }
        return result;
      })
      .finally(() => {
        MATCH_INFLIGHT.delete(cacheKey);
      });
    MATCH_INFLIGHT.set(cacheKey, inflight);
  }
  return inflight;
}
