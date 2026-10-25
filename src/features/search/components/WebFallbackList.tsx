// src/features/search/components/WebFallbackList.tsx
// 로컬 검색 결과가 없을 때 보여주는 Google 자동완성/웹 검색 폴백 목록.
import React, { useEffect, useRef } from 'react';
import { Globe, Loader2, Search } from 'lucide-react';
import { scrollChildIntoView } from '../../../utils/scroll';
import styles from './WebFallbackList.module.css';
import { useTranslation } from 'react-i18next';

interface WebFallbackListProps {
  query: string;
  openQuery?: string;
  suggestions: string[];
  isLoading: boolean;
  selectedIndex: number;
  onSelectIndex: (idx: number) => void;
  onOpen: (query: string) => void;
}

export const WebFallbackList: React.FC<WebFallbackListProps> = ({
  query,
  openQuery = query,
  suggestions,
  isLoading,
  selectedIndex,
  onSelectIndex,
  onOpen,
}) => {
  const { t } = useTranslation('search');
  const containerRef = useRef<HTMLDivElement>(null);

  // scrollIntoView 대신 이 목록 컨테이너 안에서만 스크롤한다. (창 프레임까지 스크롤되어
  // 검색바가 위로 튀는 현상 방지 — src/utils/scroll.ts 참고)
  useEffect(() => {
    const container = containerRef.current;
    const el = container?.querySelector<HTMLElement>(
      `[data-item-index="${selectedIndex}"]`,
    );
    if (container && el) scrollChildIntoView(container, el, { margin: 12 });
  }, [selectedIndex]);

  return (
    <div className={styles.list} ref={containerRef}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionLabel}>{t('webSearch')}</span>
        <span className={styles.sectionRule} />
        {isLoading && <Loader2 className={styles.spinner} size={12} />}
      </div>

      <div data-item-index={0}>
        <button
          type="button"
          className={`${styles.item} ${selectedIndex === 0 ? styles.active : ''}`}
          onClick={() => {
            onSelectIndex(0);
            onOpen(openQuery);
          }}
        >
          <span className={styles.iconCol}>
            <Globe size={16} />
          </span>
          <span className={styles.contentCol}>
            <span className={styles.label}>
            {t('googleSearch', { query })}
            </span>
          </span>
          <span className={styles.enterHint}>Enter</span>
        </button>
      </div>

      {suggestions.map((suggestion, idx) => {
        const itemIndex = idx + 1;
        return (
          <div key={`${suggestion}-${itemIndex}`} data-item-index={itemIndex}>
            <button
              type="button"
              className={`${styles.item} ${selectedIndex === itemIndex ? styles.active : ''}`}
              onClick={() => {
                onSelectIndex(itemIndex);
                onOpen(suggestion);
              }}
            >
              <span className={styles.iconCol}>
                <Search size={15} />
              </span>
              <span className={styles.contentCol}>
                <span className={styles.label}>{suggestion}</span>
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
};
