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
}

export const PdfViewer: React.FC<PdfViewerProps> = ({ path, query }) => {
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
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  // 1. PDF 문서 로드 (경로 변경 시). 캐시된 문서는 즉시(로딩 텍스트 없이) 사용.
  useEffect(() => {
    let cancelled = false;
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
  }, [path]);

  // 2. 컨테이너 크기 추적 (뷰어가 렌더된 뒤 측정)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setVpSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [loading, error]);

  // 3. 문서에서 키워드 위치 탐색 → 해당 부분을 확대해 고정 뷰에 렌더
  useEffect(() => {
    if (!doc || vpSize.w === 0 || vpSize.h === 0) return;
    let cancelled = false;
    const isCancelled = () => cancelled;

    const run = async () => {
      try {
        const { targetPage, rects, textItems, matched } = await findMatchRects(doc, query || '', isCancelled);
        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const nextView = await renderPdfPage({
          doc,
          targetPage,
          rects,
          textItems,
          matched,
          vpSize,
          canvas,
          renderTaskRef,
          isCancelled,
        });
        if (cancelled || !nextView) return;
        setView(nextView);
      } catch (err) {
        if ((err as Error)?.name !== 'RenderingCancelledException') {
          console.warn('[PdfViewer] 렌더 실패:', err);
          if (!cancelled) {
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
  }, [doc, query, vpSize.w, vpSize.h]);

  // 표시할 문서/뷰가 아직 없을 때만 상태 박스를 노출한다.
  // (다른 PDF로 전환 중에는 이전 뷰가 남아 있으므로 상태 박스로 교체하지 않음)
  if (loading && !doc) {
    return (
      <div className={styles.stateBox}>
        <span>{t('pdfLoading')}</span>
      </div>
    );
  }

  if (error && !doc) {
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
        {view && view.textItems.length > 0 && (
          <div className={styles.textLayer} aria-hidden="true">
            {view.textItems.map((item, i) => (
              <span
                key={`${i}-${item.left}-${item.top}`}
                style={{
                  left: `${item.left}px`,
                  top: `${item.top}px`,
                  width: `${item.width}px`,
                  height: `${item.height}px`,
                  fontSize: `${item.height}px`,
                }}
              >
                {item.text}
              </span>
            ))}
          </div>
        )}
        {view && view.rects.length > 0 && (
          <div className={styles.highlightLayer}>
            {view.rects.map((r, i) => (
              <span
                key={i}
                className={styles.highlight}
                style={{
                  left: `${r.left}px`,
                  top: `${r.top}px`,
                  width: `${r.width}px`,
                  height: `${r.height}px`,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {(view && view.matched) && (
        <div className={styles.pageBadge}>
          p.{view.page}
        </div>
      )}
    </div>
  );
};
