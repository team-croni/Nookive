// src/features/settings/components/SearchStatusSection.tsx
// 검색 상태와 검색 데이터 생성을 한 카드에 둔다. 문서·미디어와 코드 파일을 함께 보여주고,
// 마지막 갱신 시각은 둘 중 더 최근 것 하나만 보여준다.
import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { ChevronDown, LoaderCircle, Play, RefreshCw, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/Button/Button';
import { getCodeIndexStatus, type CodeIndexStatus, type IndexSyncStatus } from '../../../utils/tauriBridge';
import { getCodeSearchEnabled, subscribeCodeSearchEnabled } from '../../../utils/codeSearchPreference';
import type { IndexProgress } from '../indexingWorker';
import { InfoTip } from './InfoTip';
import styles from '../SettingsApp.module.css';

interface SearchStatusSectionProps {
  status: IndexSyncStatus | null;
  isBusy: boolean;
  indexStateLabel: string;
  indexDetailText: string;
  pendingFiles?: number;
  indexMessage: string | null;
  displayProgress: IndexProgress | null;
  progressPercent: number;
  isProgressDetailsOpen: boolean;
  canStart: boolean;
  onToggleDetails: () => void;
  onRefresh: () => void;
  onStart: () => void;
  onAbort: () => void;
}

/** 코드 검색 데이터 상태. 만들거나 갱신이 끝날 때(code-index-state)와 스위치가 바뀔 때 다시 읽는다. */
function useCodeSearchData() {
  const [enabled, setEnabled] = useState(getCodeSearchEnabled);
  const [codeStatus, setCodeStatus] = useState<CodeIndexStatus | null>(null);

  useEffect(() => {
    const load = () => void getCodeIndexStatus().then(setCodeStatus);
    load();
    let unlisten: (() => void) | undefined;
    void listen('code-index-state', load)
      .then((stop) => {
        unlisten = stop;
      })
      .catch(() => { });
    const unsubscribe = subscribeCodeSearchEnabled((next) => {
      setEnabled(next);
      load();
    });
    return () => {
      unlisten?.();
      unsubscribe();
    };
  }, []);

  return enabled ? codeStatus : null;
}

export function SearchStatusSection({
  status,
  isBusy,
  indexStateLabel,
  indexDetailText,
  pendingFiles,
  indexMessage,
  displayProgress,
  progressPercent,
  isProgressDetailsOpen,
  canStart,
  onToggleDetails,
  onRefresh,
  onStart,
  onAbort,
}: SearchStatusSectionProps) {
  const { t, i18n } = useTranslation('settings');
  const codeStatus = useCodeSearchData();
  const displayPendingFiles = pendingFiles ?? status?.pending_files ?? 0;
  const formatCount = (value: number) => value.toLocaleString(i18n.language);

  // 문서 폴더 동기화와 코드 검색 데이터 갱신 중 더 최근 시각.
  const updatedAt = Math.max(status?.last_sync_at_ms ?? 0, codeStatus?.updatedAtMs ?? 0);
  const updatedText = updatedAt > 0
    ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(updatedAt)
    : null;

  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <h2>{t('status.title')}</h2>
          <p>{indexDetailText}</p>
          {indexMessage && (
            <p
              className={`${styles.actionMessage} ${indexMessage === t('messages.storageFull') ? styles.errorMessage : ''}`}
              role="status"
            >
              {indexMessage}
            </p>
          )}
        </div>
        <span className={`${styles.statusBadge} ${isBusy ? styles.statusBadgeBusy : ''}`}>
          <span className={styles.statusDot} aria-hidden="true" />
          {indexStateLabel}
        </span>
      </div>
      <div className={styles.stats}>
        <div><strong>{formatCount(status?.total_files ?? 0)}</strong><span>{t('status.found')}</span></div>
        <div><strong>{formatCount(displayPendingFiles)}</strong><span>{t('status.toBuild')}</span></div>
        {codeStatus?.exists && (
          <div>
            <strong>{formatCount(codeStatus.files)}</strong>
            <span className={styles.statLabel}>
              {t('status.codeFiles')}
              {codeStatus.skipped > 0 && (
                <InfoTip
                  id="code-files-skipped-tooltip"
                  text={t('status.codeSkippedHint', { count: codeStatus.skipped })}
                />
              )}
            </span>
          </div>
        )}
      </div>
      {updatedText && <p className={styles.statusUpdated}>{t('status.lastUpdated', { time: updatedText })}</p>}
      {displayProgress && (
        <div className={styles.progressPanel} role="status" aria-live="polite">
          <div className={styles.progressSummary}>
            <LoaderCircle className={styles.progressSpinner} size={12} aria-hidden="true" />
            <strong className={styles.progressPercent}>{progressPercent}%</strong>
            <span className={styles.progressSummaryLabel}>{t('indexing.building')}</span>
            <Button
              variant="ghost"
              size="xs"
              className={styles.progressDetailsButton}
              onClick={onToggleDetails}
              aria-expanded={isProgressDetailsOpen}
            >
              {t('common:actions.details')} <ChevronDown className={isProgressDetailsOpen ? styles.progressChevronOpen : ''} size={13} />
            </Button>
          </div>
          {isProgressDetailsOpen && (
            <div className={styles.progressDetails}>
              <div className={styles.progressLabel}>
                <span title={displayProgress.currentPath}>
                  {displayProgress.currentPath ? displayProgress.currentPath.split(/[\\/]/).pop() : t('indexing.creating')}
                </span>
                <span>{displayProgress.overallCompleted ?? displayProgress.completed}/{displayProgress.overallTotal ?? displayProgress.total}</span>
              </div>
              <div className={styles.progressTrack}>
                <div className={styles.progressValue} style={{ width: `${progressPercent}%` }} />
              </div>
              <p className={styles.progressHint}>
                {t('indexing.done', { count: displayProgress.indexed })} · {t('indexing.skipped', { count: displayProgress.skipped })}
              </p>
            </div>
          )}
        </div>
      )}
      <div className={styles.buttonGroup}>
        <Button variant="secondary" onClick={onRefresh} disabled={isBusy}>
          <RefreshCw size={15} /> {t('indexing.refresh')}
        </Button>
        {isBusy ? (
          <Button variant="secondary" onClick={onAbort}>
            <Square className={styles.stopIcon} size={14} fill="currentColor" /> {t('indexing.stop')}
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={onStart}
            disabled={isBusy || !canStart}
            title={!canStart ? t('indexing.noFiles') : t('indexing.start')}
          >
            <Play size={15} /> {t('indexing.start')}
          </Button>
        )}
      </div>
    </section>
  );
}
