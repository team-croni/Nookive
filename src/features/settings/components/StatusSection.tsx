// src/features/settings/components/StatusSection.tsx
import type { IndexSyncStatus } from '../../../utils/tauriBridge';
import styles from '../SettingsApp.module.css';
import { useTranslation } from 'react-i18next';

interface StatusSectionProps {
  status: IndexSyncStatus | null;
  isBusy: boolean;
  indexStateLabel: string;
  indexDetailText: string;
  pendingFiles?: number;
}

export function StatusSection({
  status,
  isBusy,
  indexStateLabel,
  indexDetailText,
  pendingFiles,
}: StatusSectionProps) {
  const { t } = useTranslation('settings');
  const displayPendingFiles = pendingFiles ?? status?.pending_files ?? 0;
  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <h2>{t('status.title')}</h2>
          <p>{indexDetailText}</p>
        </div>
        <span className={`${styles.statusBadge} ${isBusy ? styles.statusBadgeBusy : ''}`}>
          <span className={styles.statusDot} aria-hidden="true" />
          {indexStateLabel}
        </span>
      </div>
      <div className={styles.stats}>
        <div><strong>{status?.total_files ?? 0}</strong><span>{t('status.found')}</span></div>
        <div><strong>{displayPendingFiles}</strong><span>{t('status.toBuild')}</span></div>
        <div><strong>{status?.roots.length ?? 0}</strong><span>{t('status.roots')}</span></div>
      </div>
    </section>
  );
}
