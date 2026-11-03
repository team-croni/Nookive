// src/features/search/components/SearchHeader.tsx
import React, { useRef, useEffect, useState } from 'react';
import { CodeXml, Globe, Search, type LucideIcon } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import styles from './SearchHeader.module.css';
import { useTranslation } from 'react-i18next';
import {
  nextSearchModeForKey,
  parseModePrefix,
  type SearchMode,
  type SpecialSearchMode,
} from '../utils/searchModes';
import type { InlineCompletion } from '../utils/inlineCompletion';
import { ApplicationIcon } from '../../../components/ui/ApplicationIcon';

// 칩 아이콘: 라벨을 읽지 않아도 모드를 알아볼 수 있게 한다.
const MODE_ICONS: Record<SpecialSearchMode, LucideIcon> = { web: Globe, code: CodeXml };

interface SearchHeaderProps {
  query: string;
  onQueryChange: (val: string) => void;
  searchMode: SearchMode;
  /** Tab 순환과 접두어로 들어갈 수 있는 모드 (설정에서 꺼진 모드는 빠진다) */
  availableModes: readonly SpecialSearchMode[];
  /** 검색 폴더에 코드 파일이 있는지. 없으면 코드 모드에서 안내 문구를 보여준다. */
  hasCodeFiles: boolean;
  onSearchModeChange: (mode: SearchMode) => void;
  /** 첫 번째 결과 앱의 이름을 이어 보여주는 인라인 자동완성. 없으면 null */
  completion: InlineCompletion | null;
}

const SearchHeaderComponent: React.FC<SearchHeaderProps> = ({
  query,
  onQueryChange,
  searchMode,
  availableModes,
  hasCodeFiles,
  onSearchModeChange,
  completion,
}) => {
  const { t } = useTranslation('search');
  const inputRef = useRef<HTMLInputElement>(null);
  const inputValueRef = useRef(query);
  const [inputValue, setInputValue] = useState(query);
  // 자동완성을 숨길 때: IME 조합 중, 커서가 끝에 있지 않거나 글자를 선택했을 때, 입력이 칸을 넘쳐 가로로 밀렸을 때
  const [isComposing, setIsComposing] = useState(false);
  const [caretAtEnd, setCaretAtEnd] = useState(true);
  const [isOverflowing, setIsOverflowing] = useState(false);

  const updateCaret = () => {
    const input = inputRef.current;
    if (!input) return;
    setCaretAtEnd(input.selectionStart === input.value.length && input.selectionEnd === input.value.length);
    setIsOverflowing(input.scrollWidth > input.clientWidth);
  };

  const visibleCompletion =
    completion && searchMode === 'all' && inputValue === query && !isComposing && caretAtEnd && !isOverflowing
      ? completion
      : null;

  const setValue = (nextValue: string) => {
    inputValueRef.current = nextValue;
    setInputValue(nextValue);
    onQueryChange(nextValue);
  };

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

  const ModeIcon = searchMode === 'all' ? null : MODE_ICONS[searchMode];

  return (
    <div className={styles.header}>
      <div className={styles.iconWrapper}>
        <Search className={styles.icon} size={22} />
      </div>

      {ModeIcon && (
        <span className={styles.modeChip}>
          <ModeIcon size={14} strokeWidth={2.4} aria-hidden="true" />
          {t(`modes.${searchMode}.chip`)}
        </span>
      )}

      <div className={styles.inputWrap}>
      <input
        ref={inputRef}
        type="text"
        autoFocus
        className={styles.input}
        placeholder={
          searchMode === 'code'
            ? t(hasCodeFiles ? 'code.placeholder' : 'code.placeholderNoFiles')
            : searchMode === 'web'
              ? t('web.placeholder')
              : t('placeholder')
        }
        value={inputValue}
        onKeyDown={(e) => {
          // →로 자동완성을 받아들인다. (Tab은 모드 전환 키라 쓰지 않는다)
          if (
            e.key === 'ArrowRight'
            && visibleCompletion?.suffix
            && !e.shiftKey
            && !e.altKey
            && !e.ctrlKey
          ) {
            e.preventDefault();
            setValue(inputValue + visibleCompletion.suffix);
            return;
          }
          // Tab은 웹뷰 기본 동작(다음 버튼으로 포커스 이동)을 막고 모드 전환에만 쓴다.
          if (e.key === 'Tab') e.preventDefault();
          const next = nextSearchModeForKey(
            {
              key: e.key,
              shiftKey: e.shiftKey,
              metaKey: e.metaKey,
              ctrlKey: e.ctrlKey,
              altKey: e.altKey,
              isComposing: e.nativeEvent.isComposing || e.keyCode === 229,
            },
            searchMode,
            availableModes,
            inputValue,
          );
          if (next !== null) {
            e.preventDefault();
            onSearchModeChange(next);
          }
        }}
        onChange={(e) => {
          let nextValue = e.target.value;
          // "code:" 같은 접두어로 시작하면 접두어를 칩으로 바꾼다.
          const prefixed = searchMode === 'all' ? parseModePrefix(nextValue, availableModes) : null;
          if (prefixed) {
            nextValue = prefixed.rest;
            onSearchModeChange(prefixed.mode);
          }
          setValue(nextValue);
          updateCaret();
        }}
        onSelect={updateCaret}
        onCompositionStart={() => setIsComposing(true)}
        onCompositionEnd={() => setIsComposing(false)}
        spellCheck={false}
        autoComplete="off"
        aria-autocomplete="inline"
      />
      {visibleCompletion && (
        // 입력값은 바꾸지 않고 같은 글꼴로 겹쳐 그린다. (IME 입력·되돌리기·선택에 영향이 없다)
        // 입력한 글자는 투명하게 두어 이어질 글자의 위치만 맞춘다.
        <div className={styles.completion} aria-hidden="true">
          <span className={styles.completionTyped}>{inputValue}</span>
          <span className={styles.completionSuffix}>{visibleCompletion.suffix}</span>
          <span className={styles.completionHint}>
            {'— '}
            {visibleCompletion.matchedName === visibleCompletion.displayName
              ? t('completion.open')
              : t('completion.openApp', { app: visibleCompletion.displayName })}
          </span>
        </div>
      )}
      </div>
      {visibleCompletion && (
        <ApplicationIcon
          path={visibleCompletion.item.file.path}
          size={28}
          className={styles.completionIcon}
          fadeIn={false}
        />
      )}
    </div>
  );
};

// 방향키 탐색 등 query/isLoading이 변하지 않는 리렌더에서 검색바 재렌더를 방지
export const SearchHeader = React.memo(SearchHeaderComponent);
