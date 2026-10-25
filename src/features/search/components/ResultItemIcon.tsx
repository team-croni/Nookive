// src/features/search/components/ResultItemIcon.tsx
// 결과 항목의 좌측 아이콘/썸네일 영역.
import React, { useState } from 'react';
import type { SearchResultItem } from '../../../types/search';
import { ApplicationIcon } from '../../../components/ui/ApplicationIcon';
import { FolderIcon } from '../../../components/ui/FolderIcon';
import { FileIcon } from '../../../components/ui/FileIcon';
import { isImageFile, isVideoFile } from '../../../utils/fileType';
import { getFileSrc } from '../../../utils/tauriBridge';
import { LazyThumbnail, LazyVideoThumbnail } from './LazyThumbnail';
import styles from './ResultItem.module.css';

interface ResultItemIconProps {
  item: SearchResultItem;
  isCompact: boolean;
  enableThumbnail: boolean;
}

export const ResultItemIcon: React.FC<ResultItemIconProps> = ({
  item,
  isCompact,
  enableThumbnail,
}) => {
  const [imgError, setImgError] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const ext = item.file.extension.toLowerCase();
  const isImage = isImageFile(ext);
  const isVideo = isVideoFile(ext);
  const isApplication = item.file.kind === 'application' || item.category === 'application';
  const isFolder = item.file.kind === 'folder' || ext === 'folder';
  // 목록 썸네일은 인덱싱 시 생성한 소형 이미지(OS 캐시)를 우선 사용한다.
  // (원본 풀해상도를 쓰면 스크롤 시 대용량 디코딩으로 렉 발생)
  const hasVideoThumbnail = isVideo && Boolean(item.file.thumbnail);
  const imgSrc = (isImage || hasVideoThumbnail)
    ? getFileSrc(item.file.thumbnail ?? item.file.path)
    : null;
  const iconSize = isCompact ? 24 : 34;

  return (
    <div className={styles.iconCol}>
      {isApplication ? (
        <ApplicationIcon path={item.file.path} size={iconSize} className={styles.applicationIcon} />
      ) : isFolder ? (
        <FolderIcon path={item.file.path} size={34} className={styles.folderIcon} />
      ) : isImage || hasVideoThumbnail ? (
        enableThumbnail && !imgError && imgSrc ? (
          <LazyThumbnail
            src={imgSrc}
            alt={item.file.name}
            onError={() => setImgError(true)}
          />
        ) : imgError ? (
          <FileIcon ext={item.file.extension} className={styles.fileIcon} size={iconSize} />
        ) : null
      ) : isVideo ? (
        enableThumbnail && !videoError ? (
          <LazyVideoThumbnail
            src={getFileSrc(item.file.path)}
            alt={item.file.name}
            onError={() => setVideoError(true)}
          />
        ) : (
          <FileIcon ext={item.file.extension} className={styles.fileIcon} size={iconSize} />
        )
      ) : (
        <FileIcon ext={item.file.extension} className={styles.fileIcon} size={iconSize} />
      )}
    </div>
  );
};
