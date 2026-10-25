// src/features/settings/SettingsApp.tsx
import { useEffect, useState, type MouseEvent } from 'react';
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
import { StatusSection } from './components/StatusSection';
import { IndexingSection } from './components/IndexingSection';
import { ResetSection } from './components/ResetSection';
import { LanguageSection } from './components/LanguageSection';
import { ModelSection } from './components/ModelSection';
import { ThemeSection } from './components/ThemeSection';
import { AboutSection } from './components/AboutSection';
import { AppDataSection } from './components/AppDataSection';
import { WebSearchSection } from './components/WebSearchSection';
import { OnboardingWizard } from '../onboarding/OnboardingWizard';
import { getModelStatus } from '../../utils/tauriBridge';
import { useTheme } from '../../hooks/useTheme';
import styles from './SettingsApp.module.css';

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
      document.title = t('title');
    }
  }, [showOnboarding, t]);

  const close = () => {
    abortIndexing();
    const window = getCurrentWindow();
    // 동적으로 생성된 설정 창에서는 Webview API의 hide가 실패하는
    // 환경이 있어, Rust 명령을 우선 사용해 항상 네이티브 창을 숨긴다.
    void invoke('hide_settings_window').catch(() => window.hide().catch(() => window.close()));
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

  const actionDetailText = activePendingFiles > 0
    ? t('dynamic.action', { count: activePendingFiles })
    : t('dynamic.refreshHint');

  if (showOnboarding === true) {
    return (
      <OnboardingWizard
        initialStatus={status}
        onComplete={() => setShowOnboarding(false)}
        onAddFolder={addFolder}
        onClose={close}
        onHeaderMouseDown={handleHeaderMouseDown}
      />
    );
  }

  return (
    <main className={styles.page}>
      <SettingsHeader onClose={close} onHeaderMouseDown={handleHeaderMouseDown} />

      <div className={styles.content}>
        <ModelSection compact />
        <FolderSection
          roots={status?.roots ?? []}
          isBusy={isBusy}
          onAddFolder={() => void addFolder()}
          onRemoveFolder={(folder) => void removeFolder(folder)}
        />

        <WebSearchSection />

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

        <StatusSection
          status={status}
          isBusy={isBusy}
          indexStateLabel={indexStateLabel}
          indexDetailText={indexDetailText}
          pendingFiles={activePendingFiles}
        />

        <IndexingSection
          actionDetailText={actionDetailText}
          indexMessage={indexMessage}
          displayProgress={displayProgress}
          progressPercent={progressPercent}
          isProgressDetailsOpen={isProgressDetailsOpen}
          isBusy={isBusy}
          canStart={(status?.pending_paths.length ?? 0) > 0}
          onToggleDetails={() => setIsProgressDetailsOpen((open) => !open)}
          onRefresh={() => void refresh()}
          onStart={() => void startIndexing()}
          onAbort={abortIndexing}
        />

        <ResetSection
          resetMessage={resetMessage}
          isResetConfirming={isResetConfirming}
          isBusy={isBusy}
          onRequestReset={requestReset}
          onCancelReset={cancelReset}
          onConfirmReset={() => void confirmReset()}
        />

        <AppDataSection isBusy={isBusy} onDeleted={handleAppDataDeleted} />

        <AboutSection />
      </div>
    </main>
  );
}
