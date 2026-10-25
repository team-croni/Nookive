// src/features/preview/pdf/pdfDocumentCache.ts
// pdf.js 워커 설정 및 문서 로드 캐시.
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import PdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { readFileBytes } from '../../../utils/tauriBridge';

pdfjsLib.GlobalWorkerOptions.workerSrc = PdfWorker;

// 로드한 PDF 문서 캐시(경로 → Promise). 선택을 오가도 재읽기/재파싱하지 않도록 함.
// 간단 LRU(상한 초과 시 가장 오래된 항목 제거).
const PDF_DOC_CACHE = new Map<string, Promise<PDFDocumentProxy>>();
const PDF_DOC_CACHE_LIMIT = 6;

export const isTauriEnv = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export const hasCachedPdf = (path: string): boolean => PDF_DOC_CACHE.has(path);

export function loadPdfDoc(path: string): Promise<PDFDocumentProxy> {
  const cached = PDF_DOC_CACHE.get(path);
  if (cached) return cached;

  const promise = readFileBytes(path)
    // 검색/미리보기는 canvas/text API만 사용하고 AnnotationLayer 및
    // PDFScriptingManager를 초기화하지 않으므로 PDF 내 JavaScript를 실행하지 않는다.
    .then((data) =>
      pdfjsLib.getDocument({
        data,
        // Tauri WebKit에서 PDF 내부 폰트를 @font-face로 로드하면
        // 텍스트 레이어/하이라이트 좌표는 나오지만 캔버스 글리프가
        // 비어 보이는 경우가 있다. PDF.js의 폰트 path 렌더러를 사용해
        // 임베디드 한글 폰트도 캔버스에 직접 그리도록 한다.
        disableFontFace: true,
        useSystemFonts: true,
      }).promise,
    )
    .catch((err) => {
      PDF_DOC_CACHE.delete(path);
      throw err;
    });

  PDF_DOC_CACHE.set(path, promise);
  if (PDF_DOC_CACHE.size > PDF_DOC_CACHE_LIMIT) {
    const oldest = PDF_DOC_CACHE.keys().next().value;
    if (oldest !== undefined) PDF_DOC_CACHE.delete(oldest);
  }
  return promise;
}
