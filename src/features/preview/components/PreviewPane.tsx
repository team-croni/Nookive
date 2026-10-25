// src/features/preview/components/PreviewPane.tsx
import React from 'react';
import type { SearchResultItem } from '../../../types/search';
import { PreviewContent } from './PreviewContent';
import styles from './PreviewPane.module.css';

interface PreviewPaneProps {
  selectedItem?: SearchResultItem;
  query?: string;
  onOpenFile?: (path: string) => void;
  onRevealFile?: (path: string) => void;
  /** PDF 뷰어가 실제로 렌더한 페이지와 매칭 여부를 상위로 알린다. */
  onPdfPageResolved?: (page: number, matched: boolean) => void;
}

const PreviewPaneComponent: React.FC<PreviewPaneProps> = ({
  selectedItem,
  query = '',
  onOpenFile,
  onRevealFile,
  onPdfPageResolved,
}) => {
  if (!selectedItem) {
    return (
      <div className={styles.pane} aria-hidden="true">
        <div className={styles.emptyPreview} />
      </div>
    );
  }

  return (
    // key로 리마운트하지 않는다: PDF→PDF 전환 시 PdfViewer가 유지되어
    // 이전 페이지를 보여주다가 새 페이지로 자연스럽게 교체(flash 방지).
    <div className={styles.pane}>
      <PreviewContent
        selectedItem={selectedItem}
        query={query}
        onOpenFile={onOpenFile}
        onRevealFile={onRevealFile}
        onPdfPageResolved={onPdfPageResolved}
        showPaneShell={false}
      />
    </div>
  );
};

// 메모이제이션: 상위 상태 변화(로딩/선택 등)로 매 입력마다 프리뷰가 다시 렌더되지 않도록 한다.
export const PreviewPane = React.memo(PreviewPaneComponent);
