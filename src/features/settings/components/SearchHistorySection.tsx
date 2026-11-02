// src/features/settings/components/SearchHistorySection.tsx
// 검색 개인화 기록 초기화. 검색 데이터(인덱스) 초기화와 따로 동작한다.
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/Button/Button';
import { resetSearchFeedback } from '../../../utils/tauriBridge';
import styles from '../SettingsApp.module.css';

export function SearchHistorySection() {
  const { t } = useTranslation('settings');
  const [isConfirming, setIsConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleReset = async () => {
    setError(null);
    try {
      await resetSearchFeedback();
      setMessage(t('searchHistory.done'));
    } catch (resetError) {
      console.error('[Settings] 검색 개인화 초기화 실패:', resetError);
      setError(t('searchHistory.error'));
    }
    setIsConfirming(false);
  };

  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <h2>{t('searchHistory.title')}</h2>
          <p>{t('searchHistory.description')}</p>
          <p className={styles.cardHint}>{t('searchHistory.privacyHint')}</p>
          {message && <p className={styles.actionMessage} role="status">{message}</p>}
          {error && <p className={styles.errorMessage} role="alert">{error}</p>}
        </div>
      </div>
      <div className={isConfirming ? styles.confirmActions : styles.buttonGroup}>
        {isConfirming ? (
          <div className={styles.confirmActionsInner}>
            <Button variant="danger" onClick={() => void handleReset()}>
              <Trash2 size={15} /> {t('searchHistory.confirm')}
            </Button>
            <Button variant="secondary" onClick={() => setIsConfirming(false)}>
              {t('common:actions.cancel')}
            </Button>
          </div>
        ) : (
          <Button
            variant="danger"
            onClick={() => {
              setMessage(null);
              setIsConfirming(true);
            }}
          >
            <Trash2 size={15} /> {t('searchHistory.button')}
          </Button>
        )}
      </div>
    </section>
  );
}
