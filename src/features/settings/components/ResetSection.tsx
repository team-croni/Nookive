// src/features/settings/components/ResetSection.tsx
import { Trash2 } from 'lucide-react';
import { Button } from '../../../components/ui/Button/Button';
import styles from '../SettingsApp.module.css';
import { useTranslation } from 'react-i18next';

interface ResetSectionProps {
  resetMessage: string | null;
  isResetConfirming: boolean;
  isBusy: boolean;
  onRequestReset: () => void;
  onCancelReset: () => void;
  onConfirmReset: () => void;
}

export function ResetSection({
  resetMessage,
  isResetConfirming,
  isBusy,
  onRequestReset,
  onCancelReset,
  onConfirmReset,
}: ResetSectionProps) {
  const { t } = useTranslation('settings');
  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <h2>{t('reset.title')}</h2>
          <p>{t('reset.description')}</p>
          {resetMessage && <p className={styles.actionMessage} role="status">{resetMessage}</p>}
        </div>
      </div>
      <div className={isResetConfirming ? styles.confirmActions : styles.buttonGroup}>
        {isResetConfirming ? (
          <div className={styles.confirmActionsInner}>
            <Button variant="danger" onClick={onConfirmReset} disabled={isBusy}>
              <Trash2 size={15} /> {t('reset.confirm')}
            </Button>
            <Button variant="secondary" onClick={onCancelReset} disabled={isBusy}>
              {t('common:actions.cancel')}
            </Button>
          </div>
        ) : (
          <Button
            variant="danger"
            onClick={onRequestReset}
            disabled={isBusy}
            title={t('reset.hint')}
          >
            <Trash2 size={15} /> {t('reset.button')}
          </Button>
        )}
      </div>
    </section>
  );
}
