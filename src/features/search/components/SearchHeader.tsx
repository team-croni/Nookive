// src/features/search/components/SearchHeader.tsx
import React, { useRef, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import styles from './SearchHeader.module.css';
import { useTranslation } from 'react-i18next';

interface SearchHeaderProps {
  query: string;
  onQueryChange: (val: string) => void;
}

const SearchHeaderComponent: React.FC<SearchHeaderProps> = ({
  query,
  onQueryChange,
}) => {
  const { t } = useTranslation('search');
  const inputRef = useRef<HTMLInputElement>(null);
  const inputValueRef = useRef(query);
  const [inputValue, setInputValue] = useState(query);

  // Escape 등 외부에서 검색어가 초기화된 경우에만 입력 필드를 동기화한다.
  // 부모가 검색 결과와 함께 리렌더되어도 타이핑 중인 로컬 입력값을 유지한다.
  useEffect(() => {
    if (query !== inputValueRef.current) {
      inputValueRef.current = query;
      setInputValue(query);
    }
  }, [query]);

  useEffect(() => {
    // 1. 컴포넌트 마운트 시 즉각 포커스
    const focusTimer = setTimeout(() => {
      inputRef.current?.focus();
    }, 50);

    // 2. 웹뷰 윈도우 포커스 이벤트 시 자동 포커스
    const handleWindowFocus = () => {
      inputRef.current?.focus();
    };
    window.addEventListener('focus', handleWindowFocus);

    // 3. Tauri 데스크톱 창 활성화(tauri://focus) 이벤트 감지
    let unlistenTauri: (() => void) | undefined;
    try {
      getCurrentWindow()
        .listen('tauri://focus', () => {
          inputRef.current?.focus();
        })
        .then((unlisten) => {
          unlistenTauri = unlisten;
        })
        .catch(() => { });
    } catch {
      // 일반 브라우저 환경 폴백
    }

    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener('focus', handleWindowFocus);
      unlistenTauri?.();
    };
  }, []);

  return (
    <div className={styles.header}>
      <div className={styles.iconWrapper}>
        <Search className={styles.icon} size={22} />
      </div>

      <input
        ref={inputRef}
        type="text"
        autoFocus
        className={styles.input}
        placeholder={t('placeholder')}
        value={inputValue}
        onChange={(e) => {
          const nextValue = e.target.value;
          inputValueRef.current = nextValue;
          setInputValue(nextValue);
          onQueryChange(nextValue);
        }}
        spellCheck={false}
        autoComplete="off"
      />
    </div>
  );
};

// 방향키 탐색 등 query/isLoading이 변하지 않는 리렌더에서 검색바 재렌더를 방지
export const SearchHeader = React.memo(SearchHeaderComponent);
