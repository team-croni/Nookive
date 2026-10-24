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

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function extractTextItemRects(
  viewport: { transform: number[] },
  items: unknown[],
): TextItemRect[] {
  return items
    .map((raw) => {
      const it = raw as {
        str?: string;
        transform?: number[];
        width?: number;
        height?: number;
      };
      if (!it.str || !it.transform) return null;
      const tx = multiplyTransform(viewport.transform, it.transform);
      const fh = Math.hypot(tx[2], tx[3]) || (it.height ?? 0);
      if (fh <= 0 || (it.width ?? 0) <= 0) return null;
      return {
        text: it.str,
        left: tx[4],
        top: tx[5] - fh,
        width: it.width ?? 0,
        height: fh,
      };
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

/**
 * 키워드가 처음 등장하는 페이지와 좌표를 탐색한다.
 * 검색어가 없으면 1페이지를 반환한다.
 */
export async function findMatchRects(
  doc: PDFDocumentProxy,
  query: string,
  isCancelled: () => boolean,
): Promise<MatchScanResult> {
  const rawQuery = (query || '').trim().toLowerCase();
  let terms = rawQuery.split(/\s+/).filter((k) => k.length >= 2);
  if (terms.length === 0 && rawQuery.length > 0) terms = [rawQuery];

  let targetPage = 1;
  let rects: Rect[] = [];
  let textItems: TextItemRect[] = [];
  let matched = false;

  if (terms.length > 0) {
    const scanLimit = Math.min(doc.numPages, MAX_SCAN_PAGES);
    for (let n = 1; n <= scanLimit; n++) {
      const pg = await doc.getPage(n);
      if (isCancelled()) return { targetPage, rects, textItems, matched };
      const vp1 = pg.getViewport({ scale: 1 });
      const tc = await pg.getTextContent();
      if (isCancelled()) return { targetPage, rects, textItems, matched };

      const pageRects: Rect[] = [];
      for (const raw of tc.items) {
        const it = raw as {
          str?: string;
          transform?: number[];
          width?: number;
          height?: number;
        };
        if (!it.str || !it.transform) continue;

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
        const fh = Math.hypot(tx[2], tx[3]) || (it.height ?? 0);
        if (fh <= 0) continue;

        // 항목 전체 폭을 "문자별 폭 가중치(전각=2/반각=1) 비례"로 배분해
        // 매칭된 부분만, 실제 글자 폭에 가깝게 하이라이트한다.
        const len = it.str.length || 1;
        const itemWidth = it.width ?? 0;
        const prefix = new Array<number>(len + 1);
        prefix[0] = 0;
        for (let i = 0; i < len; i++) {
          prefix[i + 1] = prefix[i] + charWidthWeight(it.str.charCodeAt(i));
        }
        const totalWeight = prefix[len] || 1;
        const baseTop = tx[5] - fh;
        for (const [s, e] of ranges) {
          const startW = prefix[Math.min(s, len)];
          const endW = prefix[Math.min(e, len)];
          pageRects.push({
            left: tx[4] + itemWidth * (startW / totalWeight),
            top: baseTop,
            width: Math.max(1, itemWidth * ((endW - startW) / totalWeight)),
            height: fh,
          });
        }
      }

      if (pageRects.length > 0) {
        targetPage = n;
        rects = pageRects;
        textItems = extractTextItemRects(vp1, tc.items);
        matched = true;
        break;
      }
    }
  }

  // 검색어가 없거나 매칭되는 텍스트가 없는 경우에도 전체 페이지 미리보기의
  // 텍스트가 보이도록 대상 페이지(기본 1페이지)의 텍스트 레이어를 수집한다.
  if (textItems.length === 0 && !isCancelled()) {
    const page = await doc.getPage(targetPage);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    if (!isCancelled()) {
      textItems = extractTextItemRects(viewport, content.items);
    }
  }

  return { targetPage, rects, textItems, matched };
}
