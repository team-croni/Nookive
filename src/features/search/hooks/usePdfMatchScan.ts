// src/features/search/hooks/usePdfMatchScan.ts
// 검색 결과에 포함된 PDF들을 백그라운드에서 미리 스캔해,
// 목록 뱃지가 선택 전에도 실제 매칭 페이지/발견 여부를 알 수 있게 한다.
import { useEffect, useRef, useState } from 'react';
import type { SearchResultItem } from '../../../types/search';
import { isPdfFile } from '../../../utils/fileType';
import { loadPdfDoc } from '../../preview/pdf/pdfDocumentCache';
import { findMatchRects } from '../../preview/pdf/pdfTextSearch';

export interface PdfMatchInfo {
  query: string;
  page: number;
  matched: boolean;
}

// 한 번에 너무 많은 PDF를 동시에 읽지 않도록 제한한다.
const SCAN_CONCURRENCY = 3;

export function usePdfMatchScan(
  results: SearchResultItem[],
  query: string,
): Record<string, PdfMatchInfo> {
  const [map, setMap] = useState<Record<string, PdfMatchInfo>>({});
  const generationRef = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) return;

    const pdfItems = results.filter((item) => isPdfFile(item.file.extension));
    if (pdfItems.length === 0) return;

    const generation = ++generationRef.current;
    let cancelled = false;
    const isCancelled = () => cancelled || generation !== generationRef.current;

    const scanOne = async (item: SearchResultItem) => {
      try {
        const doc = await loadPdfDoc(item.file.path);
        if (isCancelled()) return;
        const result = await findMatchRects(item.file.path, doc, trimmed);
        if (isCancelled()) return;
        setMap((prev) => {
          const existing = prev[item.id];
          if (
            existing
            && existing.query === trimmed
            && existing.page === result.targetPage
            && existing.matched === result.matched
          ) {
            return prev;
          }
          return {
            ...prev,
            [item.id]: {
              query: trimmed,
              page: result.targetPage,
              matched: result.matched,
            },
          };
        });
      } catch (err) {
        // 스캔 실패 시 뱃지는 숨김 상태로 남긴다. (미리보기 선택 시 재시도)
        console.warn('[PdfMatchScan] PDF 스캔 실패:', item.file.path, err);
      }
    };

    const run = async () => {
      let nextIndex = 0;
      const workerCount = Math.min(SCAN_CONCURRENCY, pdfItems.length);
      const workers = Array.from({ length: workerCount }, async () => {
        while (!isCancelled()) {
          const index = nextIndex++;
          if (index >= pdfItems.length) return;
          await scanOne(pdfItems[index]);
        }
      });
      await Promise.all(workers);
    };
    void run();

    return () => {
      cancelled = true;
    };
  }, [results, query]);

  return map;
}
