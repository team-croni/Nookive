// src/features/preview/components/PdfViewer.tsx
import React, { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { FileWarning } from 'lucide-react';
import { hasCachedPdf, isTauriEnv, loadPdfDoc } from '../pdf/pdfDocumentCache';
import { findMatchRects } from '../pdf/pdfTextSearch';
import { renderPdfPage, type ViewState } from '../pdf/pdfRender';
import styles from './PdfViewer.module.css';
import { useTranslation } from 'react-i18next';

interface PdfViewerProps {
  path: string;
  query?: string;
  pageNumber?: number;
  onPageCountChange?: (pageCount: number) => void;
  /** 렌더한 페이지와, 그 페이지에서 검색어가 실제로 발견됐는지 알린다. */
  onPageChange?: (page: number, matched: boolean) => void;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({
  path,
  query,
  pageNumber,
  onPageCountChange,
  onPageChange,
}) => {
  const { t } = useTranslation('preview');
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  // 캐시된 문서면 처음부터 로딩 텍스트를 띄우지 않는다.
  const [loading, setLoading] = useState(() => !hasCachedPdf(path));
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string>('');
  const [view, setView] = useState<ViewState | null>(null);
  const [vpSize, setVpSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 1. PDF 문서 로드 (경로 변경 시). 캐시된 문서는 즉시(로딩 텍스트 없이) 사용.
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 새 PDF 로드 시작 시 이전 오류 상태를 초기화한다.
    setError(null);
    setErrorDetail('');
    // 주의: setDoc(null)/setView(null)을 하지 않는다.
    // 다른 PDF로 전환할 때 이전 페이지를 계속 보여주다가, 새 문서 로드·렌더가 끝나면
    // 자연스럽게 교체되도록 하여 로딩 중 공백/깜빡임(flash)을 막는다.

    if (!isTauriEnv()) {
      setError('web');
      setLoading(false);
      return;
    }

    // 캐시에 있으면 로딩 텍스트를 띄우지 않고 곧바로 렌더 준비(깜빡임 방지)
    setLoading(!hasCachedPdf(path));

    loadPdfDoc(path)
      .then((loaded) => {
        if (cancelled) return;
        setDoc(loaded);
        onPageCountChange?.(loaded.numPages);
        setLoading(false);
      })
      .catch((err) => {
        const detail = err instanceof Error ? err.message : String(err);
        console.error('[PdfViewer] 문서 로드 실패:', err);
        if (!cancelled) {
          setError('load');
          setErrorDetail(detail);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [onPageCountChange, path]);

  // 2. 컨테이너 크기 추적 (뷰어가 렌더된 뒤 측정)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // 크기가 실제로 바뀐 경우에만 상태를 갱신한다. 매번 새 객체를 넣으면
    // 렌더 effect가 불필요하게 재실행되어 페이지가 연속으로 다시 그려진다.
    const update = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setVpSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    // 초기 측정은 즉시 반영해 첫 렌더 지연을 막는다.
    update();
    if (typeof ResizeObserver === 'undefined') return;

    // 창 확장 애니메이션처럼 크기가 연속으로 바뀌는 동안에는 렌더 effect가
    // 매 프레임 재실행되어 스캔/렌더가 계속 취소된다. 크기가 잠잠해진 뒤
    // 한 번만 반영해 최종 페이지가 한 번에 그려지도록 한다.
    let timer: number | undefined;
    const observer = new ResizeObserver(() => {
      if (timer !== undefined) window.clearTimeout(timer);
      // macOS 창 확장 애니메이션(약 0.2s)이 끝난 뒤 한 번만 반영한다.
      timer = window.setTimeout(update, 300);
    });
    observer.observe(el);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [loading, error]);

  // 3. 문서에서 키워드 위치 탐색 → 해당 부분을 확대해 고정 뷰에 렌더
  useEffect(() => {
    if (!doc || vpSize.w === 0 || vpSize.h === 0) return;
    let cancelled = false;
    const isCancelled = () => cancelled;

    const run = async () => {
      try {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // 기본값: 검색어가 있으면 첫 페이지(매칭을 찾지 못했을 때의 폴백),
        // 검색어가 없으면 검색 결과 청크의 페이지(있으면) 또는 1페이지.
        const hasSelectedResultPage = Number.isInteger(pageNumber)
          && (pageNumber as number) >= 1
          && (pageNumber as number) <= doc.numPages;
        const hasQuery = (query || '').trim().length > 0;
        let targetPage = hasQuery
          ? 1
          : hasSelectedResultPage
            ? (pageNumber as number)
            : 1;
        let rects: ViewState['rects'] = [];
        let textItems: ViewState['textItems'] = [];
        let matched = false;
        try {
          if ((query || '').trim()) {
            // 기준은 "선택된 결과의 인덱스 페이지"가 아니라 "검색어가 실제로
            // 발견된 페이지"다. findMatchRects는 문서 첫 페이지부터 훑어
            // 첫 매칭 페이지를 찾는다. 따라서 미리보기와 목록 뱃지가 항상
            // 같은 매칭 페이지를 가리킨다.
            const matchResult = await findMatchRects(path, doc, query || '');
            if (cancelled) return;
            targetPage = matchResult.targetPage;
            rects = matchResult.rects;
            textItems = matchResult.textItems;
            matched = matchResult.matched;
            // 스캔이 끝난 즉시 확정 페이지/매칭 여부를 알린다. 렌더가
            // 취소되더라도 목록 뱃지가 청크 페이지로 되돌아가지 않는다.
            onPageChange?.(targetPage, matched);
          }
        } catch (searchError) {
          // 검색용 텍스트 추출 실패 시에도 1페이지 전체 미리보기는 표시한다.
          console.warn('[PdfViewer] 검색 텍스트 추출 실패, 일반 미리보기를 유지합니다:', searchError);
        }
        if (cancelled) return;

        // 검색 결과가 확정된 뒤 한 번만 네이티브 렌더링한다. 중간의 1페이지
        // 렌더를 제거해 검색 페이지가 확대되기 전 전체 페이지가 번쩍이는
        // 현상을 막는다.
        canvas.style.visibility = 'hidden';
        // 이전 페이드인 애니메이션을 제거하고, 새로 그리는 동안에는
        // 투명하게 두었다가 완료 후 페이드인한다.
        canvas.classList.remove(styles.canvasFadeIn);
        canvas.style.opacity = '0';
        const nextView = await renderPdfPage({
          path,
          doc,
          targetPage,
          rects,
          textItems,
          matched,
          vpSize,
          canvas,
          isCancelled,
        });
        if (cancelled || !nextView) return;
        setView(nextView);
        onPageChange?.(nextView.page, nextView.matched);
        // 캐시에서 복원한 뷰는 즉시 표시하고, 처음 로딩한 뷰만 이미지
        // 미리보기처럼 부드럽게 페이드인한다.
        if (nextView.fromCache) {
          canvas.style.opacity = '1';
        } else {
          // 이미지 미리보기 페이드인과 동일한 속성(280ms ease, opacity만)을 쓴다.
          // 클래스를 다시 붙이기 전에 reflow를 강제해 애니메이션을 재시작한다.
          canvas.style.opacity = '';
          void canvas.offsetWidth;
          canvas.classList.add(styles.canvasFadeIn);
        }
      } catch (err) {
        if ((err as Error)?.name !== 'RenderingCancelledException') {
          console.warn('[PdfViewer] 렌더 실패:', err);
          if (!cancelled) {
            if (canvasRef.current) canvasRef.current.style.visibility = 'visible';
            setError('load');
            const e = err as Error;
            setErrorDetail(
              e?.stack ? e.stack.split('\n').slice(0, 4).join('\n') : String(err),
            );
          }
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [doc, onPageChange, pageNumber, path, query, vpSize]);

  // 표시할 문서/뷰가 아직 없을 때만 상태 박스를 노출한다.
  // (다른 PDF로 전환 중에는 이전 뷰가 남아 있으므로 상태 박스로 교체하지 않음)
  if (loading && !doc) {
    return (
      <div className={styles.stateBox}>
        <span>{t('pdfLoading')}</span>
      </div>
    );
  }

  // PDF 문서는 열렸지만 특정 페이지 렌더링에 실패할 수 있다.
  // doc만 확인하면 캔버스가 아직 비어 있는 상태에서 오류가 숨겨져
  // 검은 빈 미리보기처럼 보이므로, 실제 뷰가 없는 경우에도 오류를 표시한다.
  if (error && !view) {
    return (
      <div className={styles.stateBox}>
        <FileWarning size={26} style={{ color: 'var(--icon-muted)' }} />
        <span>
          {error === 'web'
            ? t('pdfBrowserUnsupported')
            : t('pdfFailed')}
        </span>
        {errorDetail && <code className={styles.errorDetail}>{errorDetail}</code>}
      </div>
    );
  }

  return (
    <div className={styles.viewer} ref={containerRef}>
      <div className={styles.stage}>
        {view && (
          <div
            className={styles.pageBackground}
            aria-hidden="true"
            style={{
              left: `${view.offsetX}px`,
              top: `${view.offsetY}px`,
              width: `${view.canvasWidth}px`,
              height: `${view.canvasHeight}px`,
              transform: 'scaleY(-1)',
              transformOrigin: 'center center',
            }}
          />
        )}
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          style={{
            left: `${view?.offsetX ?? 0}px`,
            top: `${view?.offsetY ?? 0}px`,
            width: `${view?.canvasWidth ?? 0}px`,
            height: `${view?.canvasHeight ?? 0}px`,
            // 뷰(위치/크기)가 확정되기 전에는 숨겨, 첫 프레임이 좌상단에 노출되는 flash 방지
            visibility: view ? 'visible' : 'hidden',
          }}
        />
        {view && (
          <div className={styles.pageBadge}>
            p.{view.page}
          </div>
        )}
      </div>
    </div>
  );
};
