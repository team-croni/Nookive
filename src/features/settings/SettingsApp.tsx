// src/features/settings/SettingsApp.tsx
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Database, HardDrive, Info, Settings2, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { isTextIndexablePath } from './indexingWorker';
import { useIndexingController } from './hooks/useIndexingController';
import { useShortcut } from './hooks/useShortcut';
import { SettingsHeader } from './components/SettingsHeader';
import { FolderSection } from './components/FolderSection';
import { ShortcutSection } from './components/ShortcutSection';
import { SearchStatusSection } from './components/SearchStatusSection';
import { SettingsSidebar, type SettingsSidebarItem } from './components/SettingsSidebar';
import { settingsPanelId, settingsTabId } from './settingsTabIds';
import { ResetSection } from './components/ResetSection';
import { SearchHistorySection } from './components/SearchHistorySection';
import { LanguageSection } from './components/LanguageSection';
import { ModelSection } from './components/ModelSection';
import { ThemeSection } from './components/ThemeSection';
import { AboutSection } from './components/AboutSection';
import { LoginItemSection } from './components/LoginItemSection';
import { AppDataSection } from './components/AppDataSection';
import { WebSearchSection } from './components/WebSearchSection';
import { CodeSearchSection } from './components/CodeSearchSection';
import { InlineCompletionSection } from './components/InlineCompletionSection';
import { OnboardingWizard } from '../onboarding/OnboardingWizard';
import { applyLaunchAtLoginDefault, getModelStatus } from '../../utils/tauriBridge';
import { useTheme } from '../../hooks/useTheme';
import styles from './SettingsApp.module.css';

type SettingsTab = 'searchData' | 'searchOptions' | 'general' | 'dataManagement' | 'about';

const isPdfPath = (filePath: string): boolean => /\.pdf$/i.test(filePath);

export default function SettingsApp() {
  useTheme();
  const { t } = useTranslation('settings');
  const isForceOnboarding =
    new URLSearchParams(window.location.search).get('onboarding') === 'true';
  const {
    status,
    isBusy,
    progress,
    indexMessage,
    resetMessage,
    isResetConfirming,
    refresh,
    startIndexing,
    addFolder,
    removeFolder,
    requestReset,
    cancelReset,
    confirmReset,
    abortIndexing,
  } = useIndexingController();
  const {
    shortcutLabel,
    shortcutMessage,
    isRecordingShortcut,
    setIsRecordingShortcut,
    handleShortcutKeyDown,
  } = useShortcut();
  const [isProgressDetailsOpen, setIsProgressDetailsOpen] = useState(false);
  // 최초 설치 경로에서는 첫 렌더부터 설치 화면을 선택한다.
  // null로 시작하면 effect가 실행되기 전 한 프레임 동안 일반 설정 화면이 flash될 수 있다.
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(isForceOnboarding ? true : null);

  useEffect(() => {
    if (isForceOnboarding) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- URL 진입 모드를 UI 상태와 동기화한다.
      setShowOnboarding(true);
      return;
    }

    const checkModel = async () => {
      const modelStatus = await getModelStatus();
      if (modelStatus && (!modelStatus.embedding_ready || !modelStatus.speech_ready)) {
        setShowOnboarding(true);
      } else {
        setShowOnboarding(false);
      }
    };

    void checkModel();

    let unlisten: (() => void) | undefined;
    void getCurrentWindow()
      .listen('tauri://focus', () => {
        void checkModel();
      })
      .then((stop) => {
        unlisten = stop;
      });

    const onWindowFocus = () => void checkModel();
    window.addEventListener('focus', onWindowFocus);

    return () => {
      unlisten?.();
      window.removeEventListener('focus', onWindowFocus);
    };
  }, [isForceOnboarding]);

  // 모델 폴더가 외부에서 삭제되거나 손상되면 Rust 감시기가 이벤트를 보낸다.
  // 이미 열려 있던 설정 창도 설치 화면으로 전환해 검색 모델 복구를 안내한다.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<{ embedding_ready: boolean; speech_ready: boolean }>(
      'model-status-changed',
      ({ payload }) => {
        if (!payload.embedding_ready || !payload.speech_ready) {
          setShowOnboarding(true);
        }
      },
    ).then((stop) => {
      unlisten = stop;
    });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    if (showOnboarding === false) {
      document.title = t('windowTitle');
    }
  }, [showOnboarding, t]);

  const close = () => {
    abortIndexing();
    const window = getCurrentWindow();
    // 동적으로 생성된 설정 창에서는 Webview API의 hide가 실패하는
    // 환경이 있어, Rust 명령을 우선 사용해 항상 네이티브 창을 숨긴다.
    void invoke('hide_settings_window').catch(() => window.hide().catch(() => window.close()));
  };

  // 설정 창은 닫아도 숨기기만 하므로, 다시 열면 마지막으로 보던 분류가 그대로 남는다.
  const [activeTab, setActiveTab] = useState<SettingsTab>('searchData');
  const contentRef = useRef<HTMLDivElement>(null);
  const tabs: SettingsSidebarItem<SettingsTab>[] = [
    { id: 'searchData', label: t('groups.searchData'), icon: Database },
    { id: 'searchOptions', label: t('groups.searchOptions'), icon: SlidersHorizontal },
    { id: 'general', label: t('groups.general'), icon: Settings2 },
    { id: 'dataManagement', label: t('groups.dataManagement'), icon: HardDrive },
    { id: 'about', label: t('groups.about'), icon: Info },
  ];
  const changeTab = (tab: SettingsTab) => {
    setActiveTab(tab);
    contentRef.current?.scrollTo({ top: 0 });
  };

  const handleAppDataDeleted = () => {
    // 로컬 설정을 비운 뒤 앱을 초기 설치 상태로 다시 시작한다.
    window.setTimeout(() => window.location.reload(), 200);
  };

  const handleHeaderMouseDown = (event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
    void getCurrentWindow().startDragging();
  };

  const displayProgress = progress;
  const progressPercent = displayProgress?.overallTotal
    ? Math.round(((displayProgress.overallCompleted ?? displayProgress.completed) / displayProgress.overallTotal) * 100)
    : 0;

  const isCurrentlyIndexing = isBusy && displayProgress !== null;
  const activePendingFiles = isCurrentlyIndexing && displayProgress?.overallTotal != null
    ? Math.max(displayProgress.overallTotal - (displayProgress.overallCompleted ?? displayProgress.completed ?? 0), 0)
    : (status?.pending_files ?? 0);

  const indexStateLabel = isBusy
    ? t('status.building')
    : status === null
      ? t('status.checking')
      : activePendingFiles > 0
        ? t('status.pending')
        : t('status.ready');

  const pendingTextCount = status?.pending_paths.filter(isTextIndexablePath).length ?? 0;
  const pendingMediaCount = status?.pending_paths.filter((filePath) => !isTextIndexablePath(filePath)).length ?? 0;
  const pendingPdfCount = status?.pending_paths.filter(isPdfPath).length ?? 0;
  const pendingDocumentCount = pendingTextCount + pendingPdfCount;
  const pendingVisualMediaCount = Math.max(pendingMediaCount - pendingPdfCount, 0);

  const indexDetailText = status === null
    ? t('status.detailChecking')
    : isCurrentlyIndexing
      ? activePendingFiles > 0
        ? t('dynamic.action', { count: activePendingFiles })
        : t('status.allReady')
      : pendingDocumentCount > 0 && pendingVisualMediaCount > 0
        ? t('dynamic.documentsAndMedia', { documents: pendingDocumentCount, media: pendingVisualMediaCount })
        : pendingDocumentCount > 0
          ? t('dynamic.documents', { count: pendingDocumentCount })
          : pendingVisualMediaCount > 0
            ? t('dynamic.media', { count: pendingVisualMediaCount })
            : t('status.allReady');

  if (showOnboarding === true) {
    return (
      <OnboardingWizard
        initialStatus={status}
        onComplete={() => {
          setShowOnboarding(false);
          // 로그인 시 열기는 기본으로 켠다. macOS가 "로그인 항목 추가됨" 알림을 직접 보여준다.
          void applyLaunchAtLoginDefault();
        }}
        onAddFolder={addFolder}
        onClose={close}
        onHeaderMouseDown={handleHeaderMouseDown}
      />
    );
  }

  return (
    <main className={styles.page}>
      <SettingsHeader onClose={close} onHeaderMouseDown={handleHeaderMouseDown} />

      <div className={styles.body}>
        <SettingsSidebar items={tabs} active={activeTab} onChange={changeTab} ariaLabel={t('title')} />

        <div
          ref={contentRef}
          className={styles.content}
          role="tabpanel"
          id={settingsPanelId(activeTab)}
          aria-labelledby={settingsTabId(activeTab)}
        >
          {/* 모델이 없을 때만 보이는 안내. 분류와 관계없이 맨 위에 둔다. */}
          <ModelSection compact />

          <h2 className={styles.contentTitle}>{tabs.find((tab) => tab.id === activeTab)?.label}</h2>

          {activeTab === 'searchData' && (
            <>
              <FolderSection
                roots={status?.roots ?? []}
                isBusy={isBusy}
                onAddFolder={() => void addFolder()}
                onRemoveFolder={(folder) => void removeFolder(folder)}
              />
              <SearchStatusSection
                status={status}
                isBusy={isBusy}
                indexStateLabel={indexStateLabel}
                indexDetailText={indexDetailText}
                pendingFiles={activePendingFiles}
                indexMessage={indexMessage}
                displayProgress={displayProgress}
                progressPercent={progressPercent}
                isProgressDetailsOpen={isProgressDetailsOpen}
                canStart={(status?.pending_paths.length ?? 0) > 0}
                onToggleDetails={() => setIsProgressDetailsOpen((open) => !open)}
                onRefresh={() => void refresh()}
                onStart={() => void startIndexing()}
                onAbort={abortIndexing}
              />
            </>
          )}
          {activeTab === 'searchOptions' && (
            <>
              <InlineCompletionSection />
              <CodeSearchSection />
              <WebSearchSection />
              <SearchHistorySection />
            </>
          )}
          {activeTab === 'general' && (
            <>
              <ShortcutSection
                shortcutLabel={shortcutLabel}
                shortcutMessage={shortcutMessage}
                isRecordingShortcut={isRecordingShortcut}
                onKeyDown={handleShortcutKeyDown}
                onFocus={(event) => {
                  setIsRecordingShortcut(true);
                  event.currentTarget.select();
                }}
                onBlur={() => setIsRecordingShortcut(false)}
              />
              <LanguageSection />
              <ThemeSection />
              <LoginItemSection />
            </>
          )}
          {activeTab === 'dataManagement' && (
            <>
              <ResetSection
                resetMessage={resetMessage}
                isResetConfirming={isResetConfirming}
                isBusy={isBusy}
                onRequestReset={requestReset}
                onCancelReset={cancelReset}
                onConfirmReset={() => void confirmReset()}
              />
              <AppDataSection isBusy={isBusy} onDeleted={handleAppDataDeleted} />
            </>
          )}
          {activeTab === 'about' && <AboutSection />}
        </div>
      </div>
    </main>
  );
}
