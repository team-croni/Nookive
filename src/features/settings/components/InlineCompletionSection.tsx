// src/features/settings/components/InlineCompletionSection.tsx
// 앱 인라인 자동완성(검색창에 첫 번째 앱 이름을 이어 보여주기) 켜고 끄기.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getInlineCompletionEnabled, setInlineCompletionEnabled } from '../../../utils/inlineCompletionPreference';
import styles from '../SettingsApp.module.css';

export function InlineCompletionSection() {
  const { t } = useTranslation('settings');
  const [enabled, setEnabled] = useState(getInlineCompletionEnabled);

  const handleChange = (nextEnabled: boolean) => {
    setEnabled(nextEnabled);
    setInlineCompletionEnabled(nextEnabled);
  };

  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <h2>{t('inlineCompletion.title')}</h2>
          <p>{t('inlineCompletion.description')}</p>
        </div>
      </div>
      <div className={styles.optionGroup}>
        <div className={styles.webSearchRow}>
          <span className={styles.webSearchOptionLabel}>{t('inlineCompletion.option')}</span>
          <label className={styles.switch}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => handleChange(event.target.checked)}
              aria-label={t('inlineCompletion.option')}
            />
            <span className={styles.switchTrack} aria-hidden="true" />
          </label>
        </div>
      </div>
    </section>
  );
}
