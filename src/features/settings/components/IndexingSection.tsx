// src/features/settings/components/IndexingSection.tsx
import { ChevronDown, LoaderCircle, Play, RefreshCw, Square } from 'lucide-react';
import { Button } from '../../../components/ui/Button/Button';
import type { IndexProgress } from '../indexingWorker';
import styles from '../SettingsApp.module.css';
import { useTranslation } from 'react-i18next';

interface IndexingSectionProps {
  actionDetailText: string;
  indexMessage: string | null;
  displayProgress: IndexProgress | null;
  progressPercent: number;
  isProgressDetailsOpen: boolean;
  isBusy: boolean;
  canStart: boolean;
  onToggleDetails: () => void;
  onRefresh: () => void;
  onStart: () => void;
  onAbort: () => void;
}

export function IndexingSection({
  actionDetailText,
  indexMessage,
  displayProgress,
  progressPercent,
  isProgressDetailsOpen,
  isBusy,
  canStart,
  onToggleDetails,
  onRefresh,
  onStart,
  onAbort,
}: IndexingSectionProps) {
  const { t } = useTranslation('settings');
  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <h2>{t('indexing.title')}</h2>
          <p>{actionDetailText}</p>
          {indexMessage && (
            <p
              className={`${styles.actionMessage} ${indexMessage === t('messages.storageFull') ? styles.errorMessage : ''}`}
              role="status"
            >
              {indexMessage}
            </p>
          )}
        </div>
      </div>
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
            title={!canStart ? t('indexing.noFiles') : t('indexing.title')}
          >
            <Play size={15} /> {t('indexing.start')}
          </Button>
        )}
      </div>
    </section>
  );
}
