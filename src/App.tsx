// src/App.tsx
import { useCallback, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { FloatingWindow } from './components/layout/FloatingWindow/FloatingWindow';
import { AppFooter } from './components/layout/AppFooter';
import { SearchHeader } from './features/search/components/SearchHeader';
import { ResultList } from './features/search/components/ResultList';
import { WebFallbackList } from './features/search/components/WebFallbackList';
import { PreviewPane } from './features/preview/components/PreviewPane';
import { useKeyboardNav } from './features/search/hooks/useKeyboardNav';
import { useSearchResults } from './features/search/hooks/useSearchResults';
import { useWebSuggestions } from './features/search/hooks/useWebSuggestions';
import { usePreviewSelection } from './features/search/hooks/usePreviewSelection';
import { openGoogleSearch } from './features/search/services/webSearchClient';
import { openFileInOS, revealFileInOS, hideDesktopWindow } from './utils/tauriBridge';
import type { SearchResultItem } from './types/search';
import './App.css';
import { useTranslation } from 'react-i18next';
import { useTheme } from './hooks/useTheme';

export function App() {
  useTheme();
  const { t } = useTranslation('search');
  const {
    query,
    setQuery,
    selectedIndex,
    setSelectedIndex,
    isLoading,
    hasQuery,
    isSettled,
    isWindowExpanded,
    orderedResults,
    deferredResults,
  } = useSearchResults();

  const currentSelected = deferredResults[selectedIndex];
  const { previewQuery, previewSelected } = usePreviewSelection(query, currentSelected);

  // 로컬 검색이 "현재 쿼리에 대해 끝났고" 결과가 없을 때만 Google 자동완성 폴백을 노출한다.
  // (검색 중이거나 결과가 있는 동안에는 폴백을 마운트하지 않고 네트워크 요청도 보내지 않는다.
  //  입력 직후 첫 렌더에서 폴백이 먼저 마운트되면 네이티브 창 확장과 겹쳐 레이아웃이 흔들린다.)
  const localWebMode = isSettled && !isLoading && orderedResults.length === 0;
  const {
    suggestions: webSuggestions,
    query: webQuery,
    displayQuery: webDisplayQuery,
    isLoading: isWebLoading,
    isEnabled: isWebSearchEnabled,
  } = useWebSuggestions(
    query,
    // 검색어가 바뀌는 동안에도 확장된 웹 폴백 화면을 유지한다.
    // 이 순간 localWebMode만 false로 바꾸면 훅이 기존 목록을 []로
    // 반환해 결과 영역이 매 입력마다 사라졌다가 다시 나타난다.
    localWebMode || (isWindowExpanded && !isSettled && orderedResults.length === 0),
  );
  const webMode = localWebMode && isWebSearchEnabled;

  // 확장된 창에서 새 검색을 입력하는 동안에는 이전 웹 폴백을 유지한다.
  // 최초 축소 상태에서는 결과가 준비되기 전까지 검색 상태만 보여준다.
  const showWebFallback =
    orderedResults.length === 0 &&
    (webMode || (isWindowExpanded && !isSettled));
  const webItemCount = showWebFallback ? 1 + webSuggestions.length : 0;

  // 웹 폴백으로 전환되면 선택 인덱스를 첫 항목(Google 검색)으로 되돌린다.
  useEffect(() => {
    if (webMode) setSelectedIndex(0);
  }, [webMode, query, setSelectedIndex]);

  // 키보드 네비게이션 등록
  useKeyboardNav({
    itemCount: showWebFallback ? webItemCount : deferredResults.length,
    selectedIndex,
    setSelectedIndex,
    onEnter: (idx) => {
      if (showWebFallback) {
        const target = idx === 0 ? webQuery : webSuggestions[idx - 1];
        if (target) void openGoogleSearch(target);
        return;
      }
      const selected = deferredResults[idx];
      if (selected) {
        openFileInOS(selected.file.path);
      }
    },
    onEscape: () => {
      if (query) {
        setQuery('');
      } else {
        hideDesktopWindow();
      }
    },
  });

  // 윈도우 포커스 분실(Blur) 시 자동 닫기 (Spotlight / Raycast 표준 동작)
  // 창은 숨겨질 뿐 언마운트되지 않으므로, 검색어/결과 상태는 그대로 유지한다.
  useEffect(() => {
    const handleBlur = () => {
      hideDesktopWindow();
    };
    window.addEventListener('blur', handleBlur);

    // Tauri 네이티브 blur 이벤트도 동일 처리 (DOM blur 누락 대비)
    let unlisten: (() => void) | undefined;
    try {
      getCurrentWindow()
        .listen('tauri://blur', handleBlur)
        .then((un) => {
          unlisten = un;
        })
        .catch(() => { });
    } catch {
      // 일반 브라우저 환경 폴백
    }

    return () => {
      window.removeEventListener('blur', handleBlur);
      unlisten?.();
    };
  }, []);

  const handleOpenFile = useCallback((path: string) => {
    openFileInOS(path);
  }, []);

  // ResultItem(memo)에 전달되는 콜백은 참조가 안정적이어야 재렌더가 최소화된다.
  const handleOpenItem = useCallback(
    (item: SearchResultItem) => handleOpenFile(item.file.path),
    [handleOpenFile],
  );

  const handleCopyPath = () => {
    if (currentSelected) {
      navigator.clipboard.writeText(currentSelected.file.path);
    }
  };

  const handleBackdropClick = () => {
    hideDesktopWindow();
  };

  return (
    <main
      className="app-main"
      onClick={handleBackdropClick}
    >
      <div className="window-wrapper" onClick={(e) => e.stopPropagation()}>
        <FloatingWindow compact={!isWindowExpanded}>
          {/* 1. 상단 스포트라이트 검색바 */}
          <SearchHeader
            query={query}
            onQueryChange={setQuery}
          />

          {/* 2. 본문 영역: 결과가 있으면 항상 2열(로딩 중에도 유지),
                 표시할 결과가 없을 때는 Google 자동완성 폴백을 노출 */}
          {hasQuery && (
            showWebFallback ? (
              <div className="web-fallback-pane">
                <WebFallbackList
                  query={webDisplayQuery}
                  openQuery={webQuery}
                  suggestions={webSuggestions}
                  isLoading={isWebLoading}
                  selectedIndex={selectedIndex}
                  onSelectIndex={setSelectedIndex}
                  onOpen={(target) => void openGoogleSearch(target)}
                />
              </div>
            ) : (
              <div className="search-body-split">
                <div className="results-pane">
                  {orderedResults.length > 0 ? (
                    <ResultList
                      results={deferredResults}
                      query={query}
                      selectedIndex={selectedIndex}
                      onSelectIndex={setSelectedIndex}
                      onItemOpen={handleOpenItem}
                    />
                  ) : (
                    <div className="search-status">{t('searching')}</div>
                  )}
                </div>

                <div className="preview-pane-wrapper">
                  <PreviewPane
                    selectedItem={previewSelected}
                    query={previewQuery}
                    onOpenFile={handleOpenFile}
                    onRevealFile={revealFileInOS}
                  />
                </div>
              </div>
            )
          )}

          {/* 3. 앱 전체 하단 액션 단축키 바 (검색 중에도 항상 노출) */}
          {hasQuery && (
            <AppFooter
              canOpen={showWebFallback ? webItemCount > 0 : Boolean(currentSelected)}
              canCopyPath={!showWebFallback && Boolean(currentSelected)}
              openLabel={showWebFallback ? t('footer.webOpen') : t('common:actions.open')}
              onOpen={() => {
                if (showWebFallback) {
                  const target = selectedIndex === 0 ? webQuery : webSuggestions[selectedIndex - 1];
                  if (target) void openGoogleSearch(target);
                  return;
                }
                if (currentSelected) handleOpenFile(currentSelected.file.path);
              }}
              onCopyPath={handleCopyPath}
            />
          )}
        </FloatingWindow>
      </div>
    </main>
  );
}

export default App;
