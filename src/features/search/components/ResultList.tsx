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
}

export const ResultList: React.FC<ResultListProps> = ({
  results,
  query = '',
  selectedIndex,
  onSelectIndex,
  onItemOpen,
  enableThumbnails = true,
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
  let lastSection: string | null = null;

  return (
    <div className={styles.list} ref={containerRef}>
      {results.map((item, idx) => {
        const section = getFileSection(item.file.extension);
        const showHeader = section !== lastSection;
        lastSection = section;

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
              />
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};
