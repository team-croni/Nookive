import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/Button/Button';
import { deleteAppData } from '../../../utils/tauriBridge';
import styles from '../SettingsApp.module.css';

interface AppDataSectionProps {
  isBusy: boolean;
  onDeleted: () => void;
}

export function AppDataSection({ isBusy, onDeleted }: AppDataSectionProps) {
  const { t } = useTranslation('settings');
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setError(null);
    try {
      await deleteAppData();
      localStorage.clear();
      onDeleted();
    } catch (deleteError) {
      console.error('[Settings] 앱 데이터 삭제 실패:', deleteError);
      setError(t('dataManagement.error'));
      setIsConfirming(false);
    }
  };

  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <h2>{t('dataManagement.title')}</h2>
          <p>{t('dataManagement.description')}</p>
          <p className={styles.cardHint}>{t('dataManagement.sourceFilesHint')}</p>
          {error && <p className={styles.errorMessage} role="alert">{error}</p>}
        </div>
      </div>
      <div className={isConfirming ? styles.confirmActions : styles.buttonGroup}>
        {isConfirming ? (
          <div className={styles.confirmActionsInner}>
            <Button variant="danger" onClick={() => void handleDelete()} disabled={isBusy}>
              <Trash2 size={15} /> {t('dataManagement.confirm')}
            </Button>
            <Button variant="secondary" onClick={() => setIsConfirming(false)} disabled={isBusy}>
              {t('common:actions.cancel')}
            </Button>
          </div>
        ) : (
          <Button
            variant="danger"
            onClick={() => setIsConfirming(true)}
            disabled={isBusy}
            title={t('dataManagement.hint')}
          >
            <Trash2 size={15} /> {t('dataManagement.button')}
          </Button>
        )}
      </div>
    </section>
  );
}
