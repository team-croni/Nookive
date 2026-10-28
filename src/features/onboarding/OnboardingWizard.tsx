// src/features/onboarding/OnboardingWizard.tsx
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Pause, Play, RefreshCw, Square, X, XCircle } from 'lucide-react';
import { Button } from '../../components/ui/Button/Button';
import {
  downloadModelBundle,
  getModelStatus,
  hideInstallerWindow,
  showSearchWindow,
  setTrayInstalling,
  setTrayInstallRequired,
  restoreTrayMenu,
  pauseModelDownload,
  resetModelDownload,
  resumeModelDownload,
  type IndexSyncStatus,
  type ModelBundleStatus,
  type ModelDownloadProgress,
} from '../../utils/tauriBridge';
import { getWebSearchEnabled, setWebSearchEnabled } from '../../utils/webSearchPreference';
import settingsStyles from '../settings/SettingsApp.module.css';
import { LanguagePicker } from '../settings/components/LanguagePicker';
import wizardStyles from './OnboardingWizard.module.css';

/// 센 레엘 플래그: 설치 요청이 이미 진행 중인지 추적.
/// 창이 닫혀 있는 동안 재열려도 중복 다운로드를 일으키지 않는다.
let isDownloadRunning = false;

interface OnboardingWizardProps {
  initialStatus: IndexSyncStatus | null;
  onAddFolder?: () => Promise<string | null>;
  onComplete?: () => void;
  onClose?: () => void;
  onHeaderMouseDown?: (event: MouseEvent<HTMLElement>) => void;
}

const formatBytes = (bytes: number) => {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
};

const formatModelFilename = (filePath?: string): string => {
  if (!filePath) return '모델 다운로드 중…';
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.substring(normalized.lastIndexOf('/') + 1);
};

export function OnboardingWizard({
  initialStatus,
  onAddFolder,
  onComplete,
  onHeaderMouseDown,
}: OnboardingWizardProps) {
  const { t, i18n } = useTranslation('settings');
  const [modelStatus, setModelStatus] = useState<ModelBundleStatus | null>(null);
  const [progress, setProgress] = useState<ModelDownloadProgress | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isDownloadCancelled, setIsDownloadCancelled] = useState(false);
  const [hasDownloadStarted, setHasDownloadStarted] = useState(isDownloadRunning);
  const [webSearchEnabled, setWebSearchEnabledState] = useState(getWebSearchEnabled);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(initialStatus?.roots[0] ?? null);
  const [isFolderSelecting, setIsFolderSelecting] = useState(false);

  // 모델 상태 새로고침
  const refreshModelStatus = useCallback(async () => {
    const next = await getModelStatus();
    if (next) setModelStatus(next);
    return next;
  }, []);

  // 모델 다운로드 실행 (검색 모델 + 음성 모델 전체 설치)
  const runDownload = useCallback(async () => {
    isDownloadRunning = true;
    setHasDownloadStarted(true);
    setIsPaused(false);
    setIsDownloadCancelled(false);
    void setTrayInstalling(i18n.language, 0);
    setDownloadError(null);
    try {
      const next = await downloadModelBundle('all');
      if (next) {
        setModelStatus(next);
      }
      // 성공: 트레이를 일반 모드로 복원한다 (사용자가 창을 닫아뒤더라도)
      await restoreTrayMenu(i18n.language);
    } catch (err: unknown) {
      const errStr = String(err);
      if (!errStr.includes('취소')) {
        console.error('[Installer] 모델 자동 다운로드 실패:', err);
        setDownloadError(t('installer.error'));
        // 실패 시에도 트레이를 복원한다
        await restoreTrayMenu(i18n.language);
      }
    } finally {
      isDownloadRunning = false;
      setProgress(null);
    }
  }, [t, i18n.language]);

  const handleTogglePause = async () => {
    if (isPaused) {
      await resumeModelDownload();
      setIsPaused(false);
    } else {
      await pauseModelDownload();
      setIsPaused(true);
    }
  };

  const handleCancelDownload = async () => {
    await resetModelDownload();
    setHasDownloadStarted(false);
    setIsPaused(false);
    setProgress(null);
    setDownloadError(null);
    setIsDownloadCancelled(true);
    await setTrayInstallRequired(i18n.language);
  };

  const handleSelectFolder = async () => {
    if (!onAddFolder) return;
    setIsFolderSelecting(true);
    try {
      const folder = await onAddFolder();
      if (folder) setSelectedFolder(folder);
    } finally {
      setIsFolderSelecting(false);
    }
  };

  const handleWebSearchChange = (enabled: boolean) => {
    setWebSearchEnabledState(enabled);
    setWebSearchEnabled(enabled);
  };

  // 검색 모델과 음성 모델이 모두 준비되어야 설치 완료
  const isModelReady = Boolean(modelStatus?.embedding_ready && modelStatus?.speech_ready);

  const progressPercent = useMemo(() => {
    if (!progress?.overall_total) return 0;
    return Math.min(100, Math.round((progress.overall_completed / progress.overall_total) * 100));
  }, [progress]);

  // 트레이 메뉴를 설치 진행률에 맞게 갱신 (throttle: 5% 단위)
  const lastTrayPercentRef = useRef(-1);

  // 최초 마운트 + 다운로드 시작
  useEffect(() => {
    // 이미 백그라운드에서 다운로드 중인 경우에만 설치 진행 메뉴를 유지한다.
    if (isDownloadRunning) {
      void setTrayInstalling(i18n.language, 0);
      lastTrayPercentRef.current = 0;
    }

    let unlisten: (() => void) | undefined;
    let unlistenCancelled: (() => void) | undefined;

    void listen<ModelDownloadProgress>('model-download-progress', ({ payload }) => {
      setProgress(payload);
      // 진행률 변화마다 트레이 라벨 갱신 (set_text — 메뉴 닫힘 없음)
      const pct = payload.overall_total
        ? Math.min(100, Math.round((payload.overall_completed / payload.overall_total) * 100))
        : 0;
      if (pct !== lastTrayPercentRef.current) {
        lastTrayPercentRef.current = pct;
        void setTrayInstalling(i18n.language, pct);
      }
    }).then((stop) => {
      unlisten = stop;
    });
    void listen<'paused' | 'running' | 'cancelled'>('model-download-state', ({ payload }) => {
      if (payload === 'paused') {
        setIsPaused(true);
      } else if (payload === 'running') {
        setIsPaused(false);
      } else {
        setHasDownloadStarted(false);
        setIsPaused(false);
        setProgress(null);
        setDownloadError(null);
        setIsDownloadCancelled(true);
      }
    }).then((stop) => {
      unlistenCancelled = stop;
    });

    void refreshModelStatus().then(() => {
      // 이미 실행 중인 다운로드만 이어서 표시한다. 최초 진입에서는
      // 사용자가 설치 시작 버튼을 눌러야 다운로드를 시작한다.
      if (isDownloadRunning) {
        setHasDownloadStarted(true);
      }
    });

    return () => {
      // 다운로드는 취소하지 않는다 — 백그라운드에서 계속 진행
      unlisten?.();
      unlistenCancelled?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 설치 창 닫기: 다운로드는 취소하지 않고 백그라운드에서 계속 진행
  const handleSafeClose = () => {
    if (isModelReady) {
      onComplete?.();
    }
    void hideInstallerWindow();
  };

  // 설치 완료 후 검색 시작하기
  const handleStartSearching = async () => {
    onComplete?.();
    await restoreTrayMenu(i18n.language);
    await hideInstallerWindow();
    await showSearchWindow();
  };


  useEffect(() => {
    document.title = isModelReady ? 'Nookive 설치 완료' : 'Nookive 설치';
  }, [isModelReady]);

  const progressText = useMemo(() => {
    if (!progress) return '';
    const completed = formatBytes(progress.overall_completed);
    const total = formatBytes(progress.overall_total || 864676480);
    return `${completed} / ${total} (${progressPercent}%)`;
  }, [progress, progressPercent]);

  return (
    <main className={settingsStyles.page}>
      <header
        className={wizardStyles.installerTitlebar}
        data-tauri-drag-region
        onMouseDown={onHeaderMouseDown}
      >
        <Button
          variant="close"
          size="icon"
          onClick={handleSafeClose}
          aria-label={t('close')}
          title={t('close')}
        >
          <X size={18} />
        </Button>
      </header>

      <div className={wizardStyles.installerWindow}>
        <div className={`${wizardStyles.setupHeader} ${!isModelReady ? wizardStyles.installHeader : ''}`}>
          {/* Nookive 공식 로고 */}
          <div className={wizardStyles.logoWrapper}>
            <img
              src="/nookive-mark.svg"
              alt="Nookive"
              className={wizardStyles.appLogo}
            />
          </div>

          {/* 타이틀 */}
          <h1 className={wizardStyles.title}>
            {isModelReady ? t('installer.setupTitle') : t('installer.title')}
          </h1>

          {isModelReady && (
            <p className={wizardStyles.setupDescription}>{t('installer.setupDescription')}</p>
          )}
        </div>

        {isModelReady ? (
          <div className={wizardStyles.setupSection}>
            <div className={wizardStyles.setupCard}>
              <div className={wizardStyles.setupLanguage}>
                <div>
                  <strong>{t('installer.languageTitle')}</strong>
                  <small>{t('installer.languageDescription')}</small>
                </div>
                <LanguagePicker />
              </div>
              <label className={wizardStyles.setupOption}>
                <span>
                  <strong>{t('installer.webSearchTitle')}</strong>
                  <small>{t('installer.webSearchDescription')}</small>
                </span>
                <span className={settingsStyles.switch}>
                  <input
                    type="checkbox"
                    checked={webSearchEnabled}
                    onChange={(event) => handleWebSearchChange(event.target.checked)}
                    aria-label={t('installer.webSearchTitle')}
                  />
                  <span className={settingsStyles.switchTrack} aria-hidden="true" />
                </span>
              </label>
              <div className={wizardStyles.folderSetup}>
                <div>
                  <strong>{t('installer.folderTitle')}</strong>
                  <small>{t('installer.folderDescription')}</small>
                  {selectedFolder && (
                    <small title={selectedFolder}>{selectedFolder}</small>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={() => void handleSelectFolder()} disabled={isFolderSelecting}>
                  {t('installer.folderSelect')}
                </Button>
              </div>
            </div>
            <div className={wizardStyles.setupActions}>
              <Button
                variant="primary"
                className={wizardStyles.actionButton}
                onClick={() => void handleStartSearching()}
                disabled={isFolderSelecting}
              >
                {t('installer.finishAction')}
              </Button>
            </div>
          </div>
        ) : (
          <>
        {/* 설치 진행 프로그레스 바 (카드 없이 네이티브 스타일) */}
        {!downloadError && (
          <div
            className={`${wizardStyles.progressSection} ${
              hasDownloadStarted && !isDownloadCancelled ? wizardStyles.activeProgressSection : ''
            }`}
          >
            {!hasDownloadStarted && !isDownloadCancelled ? (
              <>
                <div className={`${wizardStyles.installActions} ${wizardStyles.initialStartActions}`}>
                  <Button variant="primary" size="sm" onClick={() => void runDownload()}>
                    <Play size={14} fill="currentColor" />
                    {t('installer.start')}
                  </Button>
                </div>
                {/* 다운로드 전 모델 출처와 라이선스 고지 */}
                <p className={wizardStyles.modelLicenseNotice}>
                  {t('installer.modelLicenseNotice')}{' '}
                  <button
                    type="button"
                    className={wizardStyles.modelLicenseLink}
                    onClick={() => void invoke('open_license_document', { kind: 'thirdPartyNotices' })}
                  >
                    {t('installer.modelLicenseLink')}
                  </button>
                </p>
              </>
            ) : isDownloadCancelled ? (
              <div className={wizardStyles.installActions}>
                <Button variant="ghost" size="sm" onClick={() => void runDownload()}>
                  <Play size={14} fill="currentColor" />
                  {t('installer.start')}
                </Button>
              </div>
            ) : (
              <>
                <div className={wizardStyles.progressInfo}>
                  <span
                    className={wizardStyles.progressFilename}
                    title={progress?.file || undefined}
                  >
                    {formatModelFilename(progress?.file)}
                  </span>
                  <span className={wizardStyles.progressPercent}>
                    {progressText || '준비 중…'}
                  </span>
                </div>

                <div className={wizardStyles.nativeProgressTrack}>
                  <div
                    className={wizardStyles.nativeProgressFill}
                    style={{ width: `${Math.max(4, progressPercent)}%` }}
                  />
                </div>
                <div className={wizardStyles.installActions}>
                  <Button variant="ghost" size="sm" onClick={() => void handleTogglePause()}>
                    {isPaused ? <Play size={14} fill="currentColor" /> : <Pause size={14} fill="currentColor" />}
                    {isPaused ? t('installer.resume') : t('installer.pause')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void handleCancelDownload()}>
                    <Square size={13} fill="currentColor" />
                    {t('installer.cancel')}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* 에러 처리 */}
        {downloadError && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 20,
              color: 'var(--error-text)',
              fontSize: 12,
            }}
          >
            <XCircle size={15} />
            <span>{downloadError}</span>
            <Button variant="ghost" size="xs" onClick={() => void runDownload()}>
              <RefreshCw size={12} />
              {t('installer.retry')}
            </Button>
          </div>
        )}

          </>
        )}
      </div>
    </main>
  );
}
