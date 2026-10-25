// src/features/search/components/ResultList.tsx
import React, { useEffect, useRef } from 'react';
import type { SearchResultItem } from '../../../types/search';
import { ResultItem } from './ResultItem';
import { getFileSection } from '../../../utils/fileType';
import { scrollChildIntoView, scrollRangeIntoView } from '../../../utils/scroll';
import styles from './ResultList.module.css';
import { useTranslation } from 'react-i18next';

interface ResultListProps {
  results: SearchResultItem[];
  query?: string;
  selectedIndex: number;
  onSelectIndex: (idx: number) => void;
  onItemOpen?: (item: SearchResultItem) => void;
  /** 타이핑이 멈춘 뒤에만 썸네일을 로드하도록 하는 게이트 */
  enableThumbnails?: boolean;
  /**
   * PDF별로 미리보기가 확인한 매칭 페이지/발견 여부.
   * 선택을 바꿔도 이미 확인된 PDF의 뱃지 상태가 유지된다.
   */
  resolvedPdfPages?: Record<string, { query: string; page: number; matched: boolean }>;
  /** 위 맵의 값이 어떤 검색어에 대한 것인지 판별하는 현재 미리보기 검색어 */
  resolvedQuery?: string;
}

export const ResultList: React.FC<ResultListProps> = ({
  results,
  query = '',
  selectedIndex,
  onSelectIndex,
  onItemOpen,
  enableThumbnails = true,
  resolvedPdfPages,
  resolvedQuery,
}) => {
  const { t } = useTranslation('common');
  const containerRef = useRef<HTMLDivElement>(null);

  // 선택된 항목이 화면 밖으로 나갈 때 자동 스크롤 (섹션 헤더 때문에 children 인덱스가 어긋나므로 data 속성으로 탐색)
  // scrollIntoView 대신 이 목록 컨테이너 안에서만 스크롤한다. (창 프레임까지 스크롤되어
  // 검색바가 위로 튀는 현상 방지 — src/utils/scroll.ts 참고)
  useEffect(() => {
    const container = containerRef.current;
    const item = container?.querySelector<HTMLElement>(
      `[data-item-index="${selectedIndex}"]`,
    );
    // 섹션의 첫 항목은 항목만 보이게 하면 헤더가 위로 잘릴 수 있으므로,
    // 헤더를 스크롤 기준으로 삼아 섹션 제목과 항목이 함께 보이게 한다.
    const sectionHeader = container?.querySelector<HTMLElement>(
      `[data-section-header-index="${selectedIndex}"]`,
    );
    if (container && item) {
      if (sectionHeader) {
        scrollRangeIntoView(container, sectionHeader, item, { margin: 12 });
      } else {
        scrollChildIntoView(container, item, { margin: 12 });
      }
    }
  }, [selectedIndex]);

  // 결과는 이미 섹션 순서(문서/이미지/비디오/오디오/코드)로 정렬되어 전달된다.
  return (
    <div className={styles.list} ref={containerRef}>
      {results.map((item, idx) => {
        const section = getFileSection(item.file.extension);
        const previousSection = idx > 0
          ? getFileSection(results[idx - 1].file.extension)
          : null;
        const showHeader = section !== previousSection;
        // 이 파일에 대해 미리보기가 확인한 값이 있고, 같은 검색어라면 사용한다.
        // (스캔 쪽은 검색어를 trim해 저장하므로 비교도 trim 기준으로 맞춘다.)
        const resolved = resolvedPdfPages?.[item.id];
        const resolvedForQuery =
          resolved && resolved.query === resolvedQuery?.trim() ? resolved : undefined;

        return (
          <React.Fragment key={item.id}>
            {showHeader && (
              <div
                className={styles.sectionHeader}
                data-section-header-index={idx}
              >
                <span className={styles.sectionLabel}>
                  {section === 'applications'
                    ? t('file.application')
                    : section === 'folders'
                      ? t('file.folder')
                      : t(`fileTypes.${section === 'documents' ? 'document' : section === 'images' ? 'image' : section}`)}
                </span>
                <span className={styles.sectionRule} />
              </div>
            )}
            <div data-item-index={idx}>
              <ResultItem
                item={item}
                query={query}
                isActive={idx === selectedIndex}
                idx={idx}
                onSelectIndex={onSelectIndex}
                onItemOpen={onItemOpen}
                enableThumbnail={enableThumbnails}
                resolvedPageNumber={resolvedForQuery?.page}
                resolvedMatched={resolvedForQuery?.matched}
              />
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};
