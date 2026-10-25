// src/features/search/components/ResultItem.tsx
import React from 'react';
import type { SearchResultItem } from '../../../types/search';
import { Badge } from '../../../components/ui/Badge/Badge';
import { HighlightText } from '../../../components/ui/HighlightText/HighlightText';
import { createSmartSnippet } from '../../../utils/snippet';
import {
  isImageFile,
  isVideoFile,
  isAudioFile,
  isPdfFile,
} from '../../../utils/fileType';
import { directoryPath } from '../../../utils/path';
import { formatTimestamp } from '../utils/formatTimestamp';
import { ResultItemIcon } from './ResultItemIcon';
import styles from './ResultItem.module.css';

interface ResultItemProps {
  item: SearchResultItem;
  query?: string;
  isActive: boolean;
  /** 목록 내 인덱스 (선택 콜백에 그대로 전달) */
  idx: number;
  /** 안정 참조 콜백 — memo 무력화 방지를 위해 인라인 클로저를 만들지 않는다 */
  onSelectIndex: (idx: number) => void;
  onItemOpen?: (item: SearchResultItem) => void;
  /** 타이핑이 멈춘 뒤에만 썸네일을 로드 (입력 중 디코딩 렉 방지) */
  enableThumbnail?: boolean;
  /**
   * 미리보기가 실제로 렌더한 PDF 페이지.
   * 지정되면 청크의 pageNumber 대신 이 값을 뱃지에 표시한다.
   */
  resolvedPageNumber?: number;
  /** false면 해당 PDF에서 검색어가 발견되지 않았으므로 페이지 뱃지를 숨긴다. */
  resolvedMatched?: boolean;
}

const ResultItemComponent: React.FC<ResultItemProps> = ({
  item,
  query = '',
  isActive,
  idx,
  onSelectIndex,
  onItemOpen,
  enableThumbnail = true,
  resolvedPageNumber,
  resolvedMatched,
}) => {
  const ext = item.file.extension.toLowerCase();
  const isImage = isImageFile(ext);
  const isVideo = isVideoFile(ext);
  const isAudio = isAudioFile(ext);
  const isPdf = isPdfFile(ext);
  const isApplication = item.file.kind === 'application' || item.category === 'application';
  const isFolder = item.file.kind === 'folder' || ext === 'folder';
  const isCompact = isApplication;

  // 청크에 담긴 위치 메타데이터로 파일 유형에 맞는 뱃지를 구성한다.
  // PDF는 미리보기가 실제로 이동한 매칭 페이지를 우선 사용해 뱃지와
  // 미리보기 페이지가 어긋나지 않게 한다.
  const { pageNumber: chunkPageNumber, lineStart, timestampSeconds } = item.bestChunk;
  const pageNumber = resolvedPageNumber ?? chunkPageNumber;

  // PDF는 매칭 페이지가 확정되기 전에는 뱃지를 숨긴다. 청크 페이지가
  // 문서 뒤쪽이면 마지막 페이지/전체 페이지 수가 잠깐 노출됐다가 바뀌어
  // 어색해 보이기 때문이다. (백그라운드 스캔이 빠르게 확정한다.)
  const pageBadgePending = isPdf && resolvedMatched === undefined;

  // PDF 본문에서 검색어가 발견되지 않았다면 페이지 뱃지를 노출하지 않는다.
  const showPageBadge =
    pageNumber !== undefined && resolvedMatched !== false && !pageBadgePending;

  // 텍스트/코드 파일은 2행에 매칭 본문 스니펫(하이라이트)을, 그 외에는 경로를 노출한다.
  const isTextLike = !isImage && !isVideo && !isAudio && !isPdf && !isApplication && !isFolder;
  const displaySnippet = item.bestChunk?.textSnippet
    ? createSmartSnippet(item.bestChunk.textSnippet, query)
    : '';
  // 파일명은 1행에 표시되므로 경로에서는 디렉터리 위치만 노출한다.
  const displayPath = directoryPath(item.file.path);

  return (
    <div
      className={`${styles.item} ${isActive ? styles.active : ''} ${isCompact ? styles.compact : ''} ${isApplication ? styles.application : ''}`}
      onClick={() => onSelectIndex(idx)}
      onDoubleClick={() => onItemOpen?.(item)}
    >
      <ResultItemIcon
        item={item}
        isCompact={isCompact}
        enableThumbnail={enableThumbnail}
      />

      <div className={styles.contentCol}>
        {/* 1행: 파일명 + 위치 뱃지 (PDF=페이지, 텍스트/코드=라인, 오디오/비디오=재생 위치) */}
        <div className={styles.fileNameRow}>
          <span className={styles.fileName} title={item.file.name}>
            {item.file.name}
          </span>
          <div className={styles.badgeGroup}>
            {showPageBadge && (
              <Badge variant="neutral" active={isActive} fadeIn>p.{pageNumber}</Badge>
            )}
            {lineStart !== undefined && (
              <Badge variant="neutral" active={isActive}>L{lineStart}</Badge>
            )}
            {timestampSeconds !== undefined && (
              <Badge variant="neutral" active={isActive}>
                {formatTimestamp(timestampSeconds)}
              </Badge>
            )}
          </div>
        </div>

        {/* 2행: 텍스트/코드 파일은 매칭 본문 스니펫, 그 외에는 파일 위치(경로) */}
        {isTextLike && displaySnippet ? (
          <p className={styles.snippet}>
            <HighlightText text={displaySnippet} query={query} />
          </p>
        ) : !isApplication && displayPath ? (
          <span className={styles.filePath} title={item.file.path}>
            {displayPath}
          </span>
        ) : null}
      </div>
    </div>
  );
};

// 선택 인덱스가 바뀔 때 실제로 변하는 아이템(활성/비활성 2개)만 재렌더되도록 memoize.
// (이미지 아이템이 많을 때 방향키 탐색 렉을 제거)
export const ResultItem = React.memo(ResultItemComponent);
