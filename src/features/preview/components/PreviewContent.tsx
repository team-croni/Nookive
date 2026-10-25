// src/features/preview/components/PreviewContent.tsx
// 파일별 내부 콘텐츠 뷰어 (파일 변경 시 상태 초기화).
import React from 'react';
import type { SearchResultItem } from '../../../types/search';
import { Badge } from '../../../components/ui/Badge/Badge';
import { Button } from '../../../components/ui/Button/Button';
import { HighlightText } from '../../../components/ui/HighlightText/HighlightText';
import { Clock, HardDrive } from 'lucide-react';
import {
  isImageFile,
  isVideoFile,
  isAudioFile,
  isPdfFile,
} from '../../../utils/fileType';
import { ApplicationIcon } from '../../../components/ui/ApplicationIcon';
import { FolderIcon } from '../../../components/ui/FolderIcon';
import { checkFileAccess, getFileSrc } from '../../../utils/tauriBridge';
import { scrollChildIntoView } from '../../../utils/scroll';
import { PdfViewer } from './PdfViewer';
import { ImagePreview } from './ImagePreview';
import { FileAccessState } from './FileAccessState';
import { formatBytes } from '../utils/formatBytes';
import styles from './PreviewPane.module.css';
import { useTranslation } from 'react-i18next';

interface PreviewContentProps {
  selectedItem: SearchResultItem;
  query: string;
  onOpenFile?: (path: string) => void;
  onRevealFile?: (path: string) => void;
  /** PDF 뷰어가 실제로 렌더한 페이지와 매칭 여부를 상위로 알린다. */
  onPdfPageResolved?: (page: number, matched: boolean) => void;
  showPaneShell?: boolean;
}

export const PreviewContent: React.FC<PreviewContentProps> = ({
  selectedItem,
  query,
  onOpenFile,
  onRevealFile,
  onPdfPageResolved,
  showPaneShell = true,
}) => {
  const { t } = useTranslation(['preview', 'common']);
  const { file, bestChunk } = selectedItem;

  // 최고 일치 청크(bestChunk)를 대표 단락으로 사용
  const currentChunk = bestChunk;
  const [pdfPageCount, setPdfPageCount] = React.useState<number | null>(null);
  // 뷰어가 실제로 렌더한 페이지가 확인되기 전에는 페이지 표시를 비워 둔다.
  // (청크 페이지로 초기화하면 마지막 페이지가 잠깐 노출됐다가 바뀌어 깜빡인다.)
  const [pdfCurrentPage, setPdfCurrentPage] = React.useState<number | undefined>(undefined);
  const textContentRef = React.useRef<HTMLDivElement>(null);
  const mediaRef = React.useRef<HTMLMediaElement>(null);

  // 검색된 재생 위치(오디오/비디오)로 이동한다.
  // 같은 파일의 다른 청크를 선택하면 <audio>/<video>가 리마운트되지 않아
  // onLoadedMetadata가 다시 발생하지 않으므로, timestamp 변경을 직접 감시한다.
  React.useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;
    const t = currentChunk.timestampSeconds;
    if (t === undefined || t <= 0) return;

    const seek = () => {
      try {
        el.currentTime = t;
      } catch {
        // ignore
      }
    };

    if (el.readyState >= 1) {
      seek();
      return;
    }
    el.addEventListener('loadedmetadata', seek, { once: true });
    return () => el.removeEventListener('loadedmetadata', seek);
  }, [currentChunk.timestampSeconds, file.path]);

  // 해당 단락 내 하이라이트 위치로 부드럽게 자동 스크롤
  // scrollIntoView는 창 프레임까지 스크롤시켜 검색바가 위로 튀므로,
  // 텍스트 컨테이너 안에서만 스크롤한다. (src/utils/scroll.ts 참고)
  React.useEffect(() => {
    const container = textContentRef.current;
    if (!container) return;
    const markEl = container.querySelector<HTMLElement>('mark');
    if (markEl) {
      scrollChildIntoView(container, markEl, { block: 'center', behavior: 'smooth' });
    } else {
      container.scrollTop = 0;
    }
  }, [currentChunk.chunkIndex, query]);

  const isImage = isImageFile(file.extension);
  const isVideo = isVideoFile(file.extension);
  const isAudio = isAudioFile(file.extension);
  const isPdf = isPdfFile(file.extension);
  const isApplication = file.kind === 'application' || selectedItem.category === 'application';
  const isFolder = file.kind === 'folder' || file.extension.toLowerCase() === 'folder';
  const needsFileAccess = isImage || isVideo || isAudio || isPdf;
  const [fileAccess, setFileAccess] = React.useState<'checking' | 'allowed' | 'denied'>('allowed');
  const [accessAttempt, setAccessAttempt] = React.useState(0);

  React.useEffect(() => {
    if (!needsFileAccess || !(typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 파일 선택 변경에 맞춰 외부 파일 접근 상태를 초기화한다.
      setFileAccess('allowed');
      return;
    }

    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 파일 선택 변경에 맞춰 외부 파일 접근 상태를 초기화한다.
    setFileAccess('checking');
    void checkFileAccess(file.path)
      .then(() => {
        if (active) setFileAccess('allowed');
      })
      .catch((error) => {
        console.warn('[Preview] 파일 접근 권한 확인 실패:', error);
        if (active) setFileAccess('denied');
      });

    return () => {
      active = false;
    };
  }, [file.path, needsFileAccess, accessAttempt]);
  // 실물 뷰포트가 있는 파일은 텍스트 스니펫을 덧붙이지 않아
  // 모든 미리보기가 PDF 뷰어와 동일한 단일 뷰포트 크기가 된다.
  const hasVisualPreview = isImage || isVideo || isAudio || isPdf || isApplication || isFolder;
  const fileAssetUrl = getFileSrc(file.path);

  React.useEffect(() => {
    // PDF를 바꿀 때 이전 파일의 페이지 수/페이지가 잠시 남지 않도록 초기화한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPdfPageCount(null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPdfCurrentPage(undefined);
  }, [file.path, currentChunk.chunkIndex, currentChunk.pageNumber]);

  // PdfViewer의 onPageChange는 effect 의존성이라 참조가 안정적이어야 한다.
  // (매 렌더마다 새 함수를 넘기면 PDF 렌더 effect가 무한히 재실행된다.)
  const handlePdfPageChange = React.useCallback(
    (page: number, matched: boolean) => {
      setPdfCurrentPage(page);
      onPdfPageResolved?.(page, matched);
    },
    [onPdfPageResolved],
  );

  return (
    <div className={showPaneShell ? styles.pane : styles.paneContent}>
      {/* 1. 본문 미리보기 영역 (이미지/미디어/PDF/텍스트 — 모두 동일한 뷰포트 사용) */}
      <div className={styles.body}>
        {needsFileAccess && fileAccess !== 'allowed' && (
          <div className={styles.previewFrame}>
            <FileAccessState
              checking={fileAccess === 'checking'}
              onRetry={fileAccess === 'denied' ? () => setAccessAttempt((value) => value + 1) : undefined}
            />
          </div>
        )}
        {/* Case A: 이미지 파일 프리뷰 */}
        {isImage && fileAccess === 'allowed' && (
          <div className={styles.previewFrame}>
            {/* 미리보기는 인덱싱 시 생성한 중간 해상도(720px)를 우선 사용.
                원본(수 MB, 12MP)을 쓰면 방향키 탐색 시 매번 대용량 디코딩으로 렉 발생 */}
            <ImagePreview
              key={file.path}
              path={file.preview ?? file.path}
              name={file.name}
            />
          </div>
        )}

        {/* Case B: 비디오 파일 프리뷰 */}
        {isVideo && fileAccess === 'allowed' && (
          <div className={styles.previewFrame}>
            <video
              key={file.path}
              ref={mediaRef as React.RefObject<HTMLVideoElement>}
              src={fileAssetUrl}
              controls
              className={styles.mediaPlayer}
            />
          </div>
        )}

        {/* Case C: 오디오 파일 프리뷰 */}
        {isAudio && fileAccess === 'allowed' && (
          <div className={styles.previewFrame}>
            <audio
              key={file.path}
              ref={mediaRef as React.RefObject<HTMLAudioElement>}
              src={fileAssetUrl}
              controls
              className={styles.mediaPlayer}
            />
          </div>
        )}

        {/* Case D: PDF 실물 미리보기 (커스텀 뷰어, pdf.js) */}
        {isPdf && fileAccess === 'allowed' && (
          <div className={styles.previewFrame}>
            <PdfViewer
              path={file.path}
              query={query}
              pageNumber={currentChunk.pageNumber}
              onPageCountChange={setPdfPageCount}
              onPageChange={handlePdfPageChange}
            />
          </div>
        )}

        {isApplication && (
          <div className={styles.applicationPreview}>
            <ApplicationIcon path={file.path} size={120} className={styles.applicationPreviewIcon} fadeIn={false} />
            <span className={styles.applicationPreviewName} title={file.name}>
              {file.name}
            </span>
            <span className={styles.applicationPreviewType}>
              macOS {t('file.application', { ns: 'common' })}
            </span>
          </div>
        )}

        {isFolder && (
          <div className={styles.applicationPreview}>
            <FolderIcon path={file.path} size={120} className={styles.applicationPreviewIcon} fadeIn={false} />
            <span>{t('file.folder', { ns: 'common' })}</span>
            <small>{t('folderHint')}</small>
          </div>
        )}

        {/* Case E: 텍스트 스니펫 프리뷰 (실물 뷰포트가 없는 파일만) */}
        {!hasVisualPreview && (
          <div className={styles.previewFrame}>
            <div className={styles.textContent} ref={textContentRef}>
              <HighlightText text={currentChunk.textSnippet} query={query} />
            </div>
          </div>
        )}
      </div>

      {/* 2. 하단 파일 메타 정보 */}
      <div className={styles.meta}>
        <div className={styles.headerTitleRow}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            <h3 className={styles.fileName} title={file.name}>
              {file.name}
            </h3>
          </div>
          <Badge variant="file">
            {isApplication ? 'APP' : isFolder ? 'FOLDER' : file.extension.toUpperCase()}
          </Badge>
        </div>
        <p className={styles.filePath} title={file.path}>{file.path}</p>

        <div className={styles.metaRow}>
          <span className={styles.metaItem}>
            <HardDrive size={12} />
            {formatBytes(file.sizeBytes)}
          </span>
          <span className={styles.metaItem}>
            <Clock size={12} />
            {file.modifiedAt}
          </span>
          {isPdf && pdfCurrentPage !== undefined && (
            <span className={styles.metaItem}>
              {t('file.pageOf', {
                ns: 'common',
                page: pdfCurrentPage,
                total: pdfPageCount ?? pdfCurrentPage,
              })}
            </span>
          )}
          {currentChunk.timestampSeconds !== undefined && (
            <span className={styles.metaItem}>
              {t('file.timestamp', { ns: 'common', value: `${Math.floor(currentChunk.timestampSeconds / 60)}:${String(Math.floor(currentChunk.timestampSeconds % 60)).padStart(2, '0')}` })}
            </span>
          )}
        </div>
        <div className={styles.actionRow}>
          <Button variant="primary" size="xs" onClick={() => onOpenFile?.(file.path)}>
            <span>{t('actions.open', { ns: 'common' })}</span>
          </Button>
          <Button variant="secondary" size="xs" onClick={() => onRevealFile?.(file.path)}>
            <span>{t('file.finder', { ns: 'common' })}</span>
          </Button>
        </div>
      </div>
    </div>
  );
};
