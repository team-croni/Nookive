// src/App.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { usePdfMatchScan } from './features/search/hooks/usePdfMatchScan';
import { openWebSearch } from './features/search/services/webSearchClient';
import { feedbackClient } from './features/search/services/feedbackClient';
import { cycleSearchMode } from './features/search/utils/searchModes';
import { pickInlineCompletion } from './features/search/utils/inlineCompletion';
import { calculate, copyTextForCalculation } from './features/search/utils/calculator';
import { CalculatorPreview, CalculatorRow } from './features/search/components/CalculatorResult';
import { WeatherPreview, WeatherRow } from './features/search/components/WeatherResult';
import { useWeather } from './features/search/hooks/useWeather';
import { WorldTimePreview, WorldTimeRow } from './features/search/components/WorldTimeResult';
import { useWorldTimeText, worldTimeCopyText } from './features/search/hooks/useWorldTimeText';
import { useWorldTime } from './features/search/hooks/useWorldTime';
import { DatePreview, DateRow } from './features/search/components/DateResult';
import { useDateAnswer, useDateText } from './features/search/hooks/useDateAnswer';
import { CurrencyPreview, CurrencyRow } from './features/search/components/CurrencyResult';
import { useCurrency } from './features/search/hooks/useCurrency';
import { useCurrencyText } from './features/search/hooks/useCurrencyText';
import { getInlineCompletionEnabled, subscribeInlineCompletionEnabled } from './utils/inlineCompletionPreference';
import { searchClient } from './features/search/services/searchClient';
import { rankQuery } from './features/search/services/rankQuery';
import { openCodeFile, openFileInOS, openSettingsWindow, revealFileInOS, hideDesktopWindow } from './utils/tauriBridge';
import { getCodeEditor } from './utils/codeSearchPreference';
import type { SearchResultItem } from './types/search';
import './App.css';
import { useTranslation } from 'react-i18next';
import { useTheme } from './hooks/useTheme';
import { useCodeEditor } from './hooks/useCodeEditor';

export function App() {
  useTheme();
  const { t, i18n } = useTranslation('search');
  const {
    query,
    setQuery,
    selectedIndex,
    setSelectedIndex,
    isLoading,
    hasQuery,
    isSettled,
    settledQuery,
    searchMode,
    settledSearchMode,
    setSearchMode,
    availableModes,
    hasCodeFiles,
    codeIndexBuilding,
    isWindowExpanded,
    orderedResults,
    deferredResults,
  } = useSearchResults();

  // 계산기·단위 변환: 결과가 있으면 목록 맨 위 줄(선택 번호 0)이 되고, 로컬 결과는 한 칸씩 밀린다.
  // 웹·코드 모드와 빈 검색어에서는 쓰지 않는다.
  const calculation = useMemo(() => (searchMode === 'all' ? calculate(query) : null), [searchMode, query]);
  // 환율 변환: "100 usd in krw", "50달러 원화로". 계산 결과가 없을 때만 본다. (계산기와 같은 줄 규칙)
  const currency = useCurrency(query, searchMode === 'all' && !calculation);
  const currencyText = useCurrencyText();
  // 날짜 계산: "100일 후", "크리스마스까지". 계산·환율 결과가 없을 때만 본다. 네트워크 없이 바로 답한다.
  const { answer: dateAnswer, today } = useDateAnswer(query, searchMode === 'all' && !calculation && !currency);
  const dateText = useDateText();
  // 날씨: "수원 날씨", "내일 날씨"처럼 물으면 계산 결과와 같은 자리에 보인다. 첫 답이 오기 전에는 줄을 두지 않고
  // 지금 화면(로컬 결과, 웹 폴백)을 그대로 둔다.
  const { result: weather, pending: isWeatherPending } = useWeather(query, searchMode === 'all' && !calculation && !currency && !dateAnswer);
  // 세계 시각: "뉴욕 시간", "3pm PST in KST". 계산·날씨 질문이 아닐 때만 본다. (날씨와 같은 자리, 같은 규칙)
  const { result: worldTime, pending: isWorldTimePending } = useWorldTime(
    query,
    searchMode === 'all' && !calculation && !currency && !dateAnswer && !weather && !isWeatherPending,
  );
  const worldTimeText = useWorldTimeText();
  const hasAnswerRow = calculation !== null || currency !== null || dateAnswer !== null || weather !== null || worldTime !== null;
  const listOffset = hasAnswerRow ? 1 : 0;
  const isCalculationSelected = calculation !== null && selectedIndex === 0;
  const isDateSelected = dateAnswer !== null && selectedIndex === 0;
  const isCurrencySelected = currency !== null && selectedIndex === 0;
  const isWeatherSelected = weather !== null && selectedIndex === 0;
  const isWorldTimeSelected = worldTime !== null && selectedIndex === 0;
  const resultIndex = selectedIndex - listOffset;
  const currentSelected = resultIndex >= 0 ? deferredResults[resultIndex] : undefined;
  const { previewQuery, previewSelected } = usePreviewSelection(query, currentSelected);
  // 결과 목록은 계산 줄을 모르므로 목록 안의 번호로 바꿔 넘긴다. (ResultItem memo를 위해 참조를 고정)
  const selectResultIndex = useCallback(
    (index: number) => setSelectedIndex(index + listOffset),
    [listOffset, setSelectedIndex],
  );

  // Enter·⌘C·더블클릭으로 계산 결과를 복사하고 잠깐 "복사됨"을 보여준다. (창은 닫지 않는다)
  const [copiedQuery, setCopiedQuery] = useState<string | null>(null);
  const copyCalculation = () => {
    if (!calculation) return;
    void navigator.clipboard.writeText(copyTextForCalculation(calculation, i18n.resolvedLanguage ?? i18n.language));
    setCopiedQuery(query);
  };
  useEffect(() => {
    if (copiedQuery === null) return;
    const timer = setTimeout(() => setCopiedQuery(null), 1500);
    return () => clearTimeout(timer);
  }, [copiedQuery]);
  const isCalculationCopied = copiedQuery !== null && copiedQuery === query;
  // 환율 변환의 Enter·⌘C·더블클릭은 계산기처럼 숫자만(통화 기호·천 단위 구분 없이) 복사한다.
  const copyCurrency = () => {
    if (currency?.status !== 'ready') return;
    void navigator.clipboard.writeText(currencyText.copyText(currency));
    setCopiedQuery(query);
  };
  // 날짜 계산의 Enter·⌘C·더블클릭은 보이는 답(날짜나 일수)을 복사한다.
  const copyDate = () => {
    if (!dateAnswer) return;
    void navigator.clipboard.writeText(dateText.describe(dateAnswer, today).title);
    setCopiedQuery(query);
  };
  // 세계 시각의 Enter·⌘C·더블클릭도 계산 결과처럼 시각을 복사한다.
  const copyWorldTime = () => {
    if (worldTime?.status !== 'ready') return;
    void navigator.clipboard.writeText(worldTimeCopyText(worldTime, worldTimeText, Date.now()));
    setCopiedQuery(query);
  };

  // 날씨 줄은 답이 온 뒤에 생기므로, 그사이 아래 결과를 고르고 있었다면 같은 결과가 계속 선택되게 한 칸 옮긴다.
  // (세계 시각 줄도 지명을 찾은 뒤에 생기므로 같이 본다)
  const hasLateAnswerRow = weather !== null || worldTime !== null;
  const hadWeatherRowRef = useRef(false);
  useEffect(() => {
    if (hasLateAnswerRow === hadWeatherRowRef.current) return;
    hadWeatherRowRef.current = hasLateAnswerRow;
    if (selectedIndex > 0) setSelectedIndex(selectedIndex + (hasLateAnswerRow ? 1 : -1));
    // 줄이 생기고 사라질 때만 맞춘다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLateAnswerRow]);

  // 날씨 줄의 Enter: 기본 지역이 없으면 설정을, 그 밖에는 웹 검색으로 자세한 예보를 연다.
  const openWeather = () => {
    void hideDesktopWindow();
    if (weather?.status === 'needsLocation') {
      void openSettingsWindow('searchOptions');
    } else {
      void openWebSearch(query);
    }
  };

  // PDF별로 "실제 매칭 페이지 + 검색어 발견 여부"를 기억한다.
  // 선택을 바꿔도 이미 확인된 PDF의 뱃지 상태(숨김/페이지)가 유지되도록
  // 활성 항목 하나가 아니라 파일 id별 맵으로 보관한다.
  //
  // 1) 검색 결과의 PDF들을 백그라운드에서 미리 스캔해 선택 전에도 뱃지를
  //    빠르게 표시하고, 2) 선택된 PDF는 미리보기 뷰어의 결과로 덮어쓴다.
  const scannedPdfPages = usePdfMatchScan(deferredResults, previewQuery);
  const [viewerResolvedPdfPages, setViewerResolvedPdfPages] = useState<
    Record<string, { query: string; page: number; matched: boolean }>
  >({});

  const handlePdfPageResolved = useCallback(
    (page: number, matched: boolean) => {
      if (!previewSelected) return;
      const itemId = previewSelected.id;
      const resolvedQuery = previewQuery;
      setViewerResolvedPdfPages((prev) => {
        const existing = prev[itemId];
        if (
          existing
          && existing.query === resolvedQuery
          && existing.page === page
          && existing.matched === matched
        ) {
          return prev;
        }
        return { ...prev, [itemId]: { query: resolvedQuery, page, matched } };
      });
    },
    [previewQuery, previewSelected],
  );

  // 백그라운드 스캔 결과와 뷰어 결과를 합친다. 단순 스프레드로 합치면
  // 이전 검색어에 대한 뷰어 결과가 최신 스캔 결과를 덮어써 새 검색어의
  // 뱃지가 사라지므로, 현재 검색어에 해당하는 항목을 우선한다.
  const resolvedPdfPages = useMemo(() => {
    const merged: Record<string, { query: string; page: number; matched: boolean }> = {};
    const ids = new Set([
      ...Object.keys(scannedPdfPages),
      ...Object.keys(viewerResolvedPdfPages),
    ]);
    for (const id of ids) {
      const scanned = scannedPdfPages[id];
      const viewer = viewerResolvedPdfPages[id];
      if (viewer && viewer.query === previewQuery) {
        merged[id] = viewer;
      } else if (scanned && scanned.query === previewQuery) {
        merged[id] = scanned;
      } else {
        merged[id] = viewer ?? scanned;
      }
    }
    return merged;
  }, [scannedPdfPages, viewerResolvedPdfPages, previewQuery]);

  // 로컬 검색이 "현재 쿼리에 대해 끝났고" 결과가 없을 때만 검색 엔진 자동완성 폴백을 노출한다.
  // (검색 중이거나 결과가 있는 동안에는 폴백을 마운트하지 않고 네트워크 요청도 보내지 않는다.
  //  입력 직후 첫 렌더에서 폴백이 먼저 마운트되면 네이티브 창 확장과 겹쳐 레이아웃이 흔들린다.)
  // 코드 검색 결과가 보이는 동안에는 웹 폴백 대신 빈 결과 안내를 보여준다.
  // 웹 검색 모드에서는 로컬 결과와 관계없이 검색 엔진 자동완성 목록을 보여준다.
  const isCodeMode = searchMode === 'code';
  // 화면에 보이는 결과를 만든 모드. 모드를 바꾼 직후에는 새 결과가 올 때까지 이전 모드의 화면을 유지한다.
  const displayedMode = isSettled ? searchMode : settledSearchMode;
  const showsCodeResults = displayedMode === 'code';
  const showsWebResults = displayedMode === 'web';
  const localWebMode = !isCodeMode && isSettled && !isLoading && orderedResults.length === 0;
  const {
    suggestions: webSuggestions,
    query: webQuery,
    displayQuery: webDisplayQuery,
    isLoading: isWebLoading,
    isEnabled: isWebSearchEnabled,
    engineName: webEngineName,
  } = useWebSuggestions(
    query,
    // 검색어가 바뀌는 동안에도 확장된 웹 폴백 화면을 유지한다.
    // 이 순간 localWebMode만 false로 바꾸면 훅이 기존 목록을 []로
    // 반환해 결과 영역이 매 입력마다 사라졌다가 다시 나타난다.
    localWebMode || searchMode === 'web' || showsWebResults || (!showsCodeResults && isWindowExpanded && !isSettled),
  );
  const webMode = localWebMode && isWebSearchEnabled;
  const [webFallbackWasVisible, setWebFallbackWasVisible] = useState(false);

  // 확장된 창에서 새 검색을 입력하는 동안에는 이전 웹 폴백을 유지한다.
  // 최초 축소 상태에서는 결과가 준비되기 전까지 검색 상태만 보여준다.
  // 앱 결과가 먼저 도착한 중간 렌더에서도 웹 폴백을 유지해 빈 화면을 방지한다.
  const keepWebFallbackDuringSearch =
    isWindowExpanded && isLoading && webFallbackWasVisible;
  const showWebFallback = !hasAnswerRow && (showsWebResults || (!showsCodeResults && (
    (orderedResults.length === 0 && (webMode || (isWindowExpanded && !isSettled)))
    || keepWebFallbackDuringSearch
  )));

  // 웹 폴백에서 새 로컬 검색으로 전환할 때, 앱 결과가 확정될 때까지
  // 웹 폴백을 유지할 수 있도록 마지막 표시 상태를 기억한다.
  useEffect(() => {
    if (!isWindowExpanded || !hasQuery) {
      if (webFallbackWasVisible) {
        // eslint-disable-next-line react/set-state-in-effect -- 축소된 검색창과 전환 상태를 동기화한다.
        setWebFallbackWasVisible(false);
      }
      return;
    }

    if (isSettled && orderedResults.length > 0) {
      if (webFallbackWasVisible) {
        // eslint-disable-next-line react/set-state-in-effect -- 로컬 결과 확정 시 웹 폴백 전환 상태를 종료한다.
        setWebFallbackWasVisible(false);
      }
      return;
    }

    if (showWebFallback && !webFallbackWasVisible) {
      // eslint-disable-next-line react/set-state-in-effect -- 마지막 웹 폴백 표시 상태를 검색 전환에 전달한다.
      setWebFallbackWasVisible(true);
    }
  }, [hasQuery, isSettled, isWindowExpanded, orderedResults.length, showWebFallback, webFallbackWasVisible]);
  const webItemCount = showWebFallback ? 1 + webSuggestions.length : 0;

  // 웹 폴백으로 전환되면 선택 인덱스를 첫 항목(검색 엔진에서 검색)으로 되돌린다.
  useEffect(() => {
    if (webMode) setSelectedIndex(0);
  }, [webMode, query, setSelectedIndex]);

  // 로컬 결과를 여는 모든 경로(Enter, 열기 버튼, 더블클릭, 미리보기 열기)가 여기를 지난다.
  // 화면 결과를 만든 검색어(settledQuery)로 개인화 기록을 남긴다. 웹 검색은 기록하지 않는다.
  // 검색어는 ref로 읽어 콜백 참조를 고정한다. (ResultItem memo 재렌더 방지)
  const settledQueryRef = useRef(settledQuery);
  useEffect(() => {
    settledQueryRef.current = settledQuery;
  }, [settledQuery]);
  // 코드 결과는 설정한 에디터에서 일치한 줄로 연다. (에디터가 없으면 Rust가 기본 앱으로 연다)
  // ResultItem(memo)에 전달되는 콜백이므로 참조가 안정적이어야 한다.
  const handleOpenItem = useCallback((item: SearchResultItem) => {
    const { path } = item.file;
    void feedbackClient.recordOpen(settledQueryRef.current, path);
    if (item.category === 'code') {
      const line = item.bestChunk.lineStart ?? item.chunks?.find((chunk) => chunk.lineStart)?.lineStart;
      void openCodeFile(path, line, getCodeEditor());
    } else {
      openFileInOS(path);
    }
  }, []);

  // 코드 결과의 열기 버튼·Enter 안내는 열릴 에디터 이름을 보여준다.
  const { editor: codeEditor } = useCodeEditor();
  const openLabelFor = (item: SearchResultItem | undefined) =>
    item?.category === 'code' && codeEditor
      ? t('common:actions.openIn', { app: codeEditor.name })
      : t('common:actions.open');

  // 인라인 자동완성: 첫 번째 결과 앱의 이름을 입력창에 이어 보여준다. 전체 검색에서만 쓴다.
  // 검색이 끝나기 전에는 메모리의 앱 목록으로 바로 계산해 첫 키 입력부터 보이게 한다.
  // 설정의 자동완성 스위치 (기본 켜짐). 설정 창에서 바꾸면 바로 따라간다.
  const [inlineCompletionEnabled, setInlineCompletionEnabledState] = useState(getInlineCompletionEnabled);
  useEffect(() => subscribeInlineCompletionEnabled(setInlineCompletionEnabledState), []);
  const completion = useMemo(
    () =>
      inlineCompletionEnabled && searchMode === 'all' && !calculation && !currency && !dateAnswer && !weather && !isWeatherPending && !worldTime && !isWorldTimePending
        ? pickInlineCompletion({
          query,
          settledQuery: settledSearchMode === 'all' ? settledQuery : '',
          settledResults: orderedResults,
          // 실제 검색과 같은 점수(이름 일치·개인화)로 앱을 정렬해, 검색이 끝난 뒤 첫 결과와 어긋나지 않게 한다.
          rankedApplications: query.trim()
            ? rankQuery(searchClient.applications(), query, null, feedbackClient.peekBoost(query))
            : [],
        })
        : null,
    [inlineCompletionEnabled, calculation, currency, dateAnswer, weather, isWeatherPending, worldTime, isWorldTimePending, query, searchMode, settledQuery, settledSearchMode, orderedResults],
  );

  // 선택 항목 열기 (Enter / 하단 열기 버튼)
  // 열린 앱이 포커스를 가져가 blur가 발생할 때까지 기다리지 않고 창을 바로 숨긴다.
  const openSelectedAt = (idx: number) => {
    // 계산 결과가 첫 줄이면 Enter는 결과를 복사한다.
    if (calculation && idx === 0) {
      copyCalculation();
      return;
    }
    if (currency && idx === 0) {
      copyCurrency();
      return;
    }
    if (dateAnswer && idx === 0) {
      copyDate();
      return;
    }
    if (weather && idx === 0) {
      openWeather();
      return;
    }
    if (worldTime && idx === 0) {
      copyWorldTime();
      return;
    }
    // 자동완성이 보이면 첫 줄은 그 앱이다. 검색이 끝나기 전에 Enter를 눌러도 보이는 앱을 연다.
    if (idx === 0 && completion) {
      void hideDesktopWindow();
      handleOpenItem(completion.item);
      return;
    }
    if (showWebFallback) {
      const target = idx === 0 ? webQuery : webSuggestions[idx - 1];
      if (!target) return;
      void hideDesktopWindow();
      void openWebSearch(target);
      return;
    }
    const selected = deferredResults[idx - listOffset];
    if (!selected) return;
    void hideDesktopWindow();
    handleOpenItem(selected);
  };

  // 키보드 네비게이션 등록
  useKeyboardNav({
    // 계산 줄은 한 칸으로 센다. 결과가 오기 전이라도 자동완성이 보이면 Enter가 동작하도록 한 칸은 둔다.
    itemCount: showWebFallback
      ? webItemCount
      : Math.max(deferredResults.length + listOffset, completion ? 1 : 0),
    selectedIndex,
    setSelectedIndex,
    onEnter: openSelectedAt,
    onEscape: () => {
      if (query) {
        setQuery('');
      } else if (searchMode !== 'all') {
        setSearchMode('all');
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

  const handleCopyPath = () => {
    if (isCalculationSelected) {
      copyCalculation();
      return;
    }
    if (isWorldTimeSelected) {
      copyWorldTime();
      return;
    }
    if (isDateSelected) {
      copyDate();
      return;
    }
    if (isCurrencySelected) {
      copyCurrency();
      return;
    }
    if (currentSelected) {
      navigator.clipboard.writeText(currentSelected.file.path);
    }
  };

  // 하단 Tab 안내: 다음 모드 이름을 보여준다. 들어갈 모드가 없으면 숨긴다.
  // (코드 파일이 없으면 코드 모드는 availableModes에서 이미 빠져 있다)
  const nextMode = cycleSearchMode(searchMode, availableModes);
  const modeHint =
    nextMode !== searchMode
      ? { label: t(`modes.${nextMode}.name`), onClick: () => setSearchMode(nextMode) }
      : undefined;

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
            searchMode={searchMode}
            availableModes={availableModes}
            hasCodeFiles={hasCodeFiles}
            onSearchModeChange={setSearchMode}
            // 자동완성은 첫 결과의 예측이라, 선택이 첫 줄을 떠나면 숨겨 Enter로 열릴 항목과 어긋나지 않게 한다.
            completion={selectedIndex === 0 ? completion : null}
          />

          {/* 2. 본문 영역: 결과가 있으면 항상 2열(로딩 중에도 유지),
                 표시할 결과가 없을 때는 검색 엔진 자동완성 폴백을 노출 */}
          {hasQuery && isWindowExpanded && (
            showsCodeResults && orderedResults.length === 0 ? (
              // 코드 검색 결과가 없으면 빈 미리보기 패널 없이 본문 전체에 안내를 보여준다.
              <div className="search-status code-search-empty">
                <span>{t(hasCodeFiles ? 'code.noResults' : 'code.noFiles')}</span>
                {hasCodeFiles && <small>{t(codeIndexBuilding ? 'code.indexing' : 'code.contentHint')}</small>}
              </div>
            ) : showWebFallback ? (
              <div className="web-fallback-pane">
                <WebFallbackList
                  query={webDisplayQuery}
                  engineName={webEngineName}
                  openQuery={webQuery}
                  suggestions={webSuggestions}
                  isLoading={isWebLoading}
                  selectedIndex={selectedIndex}
                  onSelectIndex={setSelectedIndex}
                  onOpen={(target) => void openWebSearch(target)}
                />
              </div>
            ) : (
              <div className="search-body-split">
                <div className={`results-pane${hasAnswerRow ? ' results-pane-stack' : ''}`}>
                  {calculation && (
                    <CalculatorRow
                      result={calculation}
                      isActive={isCalculationSelected}
                      copied={isCalculationCopied}
                      onSelect={() => setSelectedIndex(0)}
                      onCopy={copyCalculation}
                    />
                  )}
                  {currency && (
                    <CurrencyRow
                      result={currency}
                      isActive={isCurrencySelected}
                      copied={isCalculationCopied}
                      onSelect={() => setSelectedIndex(0)}
                      onCopy={copyCurrency}
                    />
                  )}
                  {dateAnswer && (
                    <DateRow
                      answer={dateAnswer}
                      today={today}
                      isActive={isDateSelected}
                      copied={isCalculationCopied}
                      onSelect={() => setSelectedIndex(0)}
                      onCopy={copyDate}
                    />
                  )}
                  {worldTime && (
                    <WorldTimeRow
                      result={worldTime}
                      isActive={isWorldTimeSelected}
                      copied={isCalculationCopied}
                      onSelect={() => setSelectedIndex(0)}
                      onCopy={copyWorldTime}
                    />
                  )}
                  {weather && (
                    <WeatherRow
                      result={weather}
                      isActive={isWeatherSelected}
                      onSelect={() => setSelectedIndex(0)}
                      onOpen={openWeather}
                    />
                  )}
                  {orderedResults.length > 0 ? (
                    <div className="results-pane-list">
                      <ResultList
                        results={deferredResults}
                        query={query}
                        selectedIndex={resultIndex}
                        onSelectIndex={selectResultIndex}
                        onItemOpen={handleOpenItem}
                        resolvedPdfPages={resolvedPdfPages}
                        resolvedQuery={settledQuery}
                      />
                    </div>
                  ) : !hasAnswerRow && (
                    <div className="search-status">{t('searching')}</div>
                  )}
                </div>

                <div className="preview-pane-wrapper">
                  {isCalculationSelected ? (
                    <CalculatorPreview result={calculation} copied={isCalculationCopied} onCopy={copyCalculation} />
                  ) : isCurrencySelected ? (
                    <CurrencyPreview
                      result={currency}
                      copied={isCalculationCopied}
                      onCopy={copyCurrency}
                      onOpenWeb={() => {
                        void hideDesktopWindow();
                        void openWebSearch(query);
                      }}
                    />
                  ) : isDateSelected ? (
                    <DatePreview answer={dateAnswer} today={today} copied={isCalculationCopied} onCopy={copyDate} />
                  ) : isWorldTimeSelected ? (
                    <WorldTimePreview result={worldTime} copied={isCalculationCopied} onCopy={copyWorldTime} />
                  ) : isWeatherSelected ? (
                    <WeatherPreview
                      result={weather}
                      onOpenWeb={openWeather}
                      onOpenSettings={openWeather}
                    />
                  ) : (
                  <PreviewPane
                    selectedItem={previewSelected}
                    query={previewQuery}
                    onOpenItem={handleOpenItem}
                    openLabel={openLabelFor(previewSelected)}
                    onRevealFile={revealFileInOS}
                    onPdfPageResolved={handlePdfPageResolved}
                  />
                  )}
                </div>
              </div>
            )
          )}

          {/* 3. 앱 전체 하단 액션 단축키 바 (확장된 검색 화면에서만 노출) */}
          {hasQuery && isWindowExpanded && (
            <AppFooter
              canOpen={showWebFallback ? webItemCount > 0 : isCalculationSelected || currency?.status === 'ready' && isCurrencySelected || isDateSelected || isWeatherSelected || worldTime?.status === 'ready' && isWorldTimeSelected || Boolean(currentSelected)}
              canCopyPath={!showWebFallback && Boolean(currentSelected)}
              openLabel={
                showWebFallback ? t('footer.webOpen')
                  : isCalculationSelected || isCurrencySelected || isDateSelected ? t('calculator.copy')
                    : isWorldTimeSelected ? t('time.copy')
                      : isWeatherSelected ? t(weather.status === 'needsLocation' ? 'weather.needsLocation.action' : 'footer.webOpen')
                        : openLabelFor(currentSelected)
              }
              onOpen={() => openSelectedAt(selectedIndex)}
              onCopyPath={handleCopyPath}
              modeHint={modeHint}
            />
          )}
        </FloatingWindow>
      </div>
    </main>
  );
}

export default App;
