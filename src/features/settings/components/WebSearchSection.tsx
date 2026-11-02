import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getWebSearchEnabled, setWebSearchEnabled } from '../../../utils/webSearchPreference';
import { InfoTip } from './InfoTip';
import styles from '../SettingsApp.module.css';

export function WebSearchSection() {
  const { t } = useTranslation('settings');
  const [enabled, setEnabled] = useState(getWebSearchEnabled);

  const handleChange = (nextEnabled: boolean) => {
    setEnabled(nextEnabled);
    setWebSearchEnabled(nextEnabled);
  };

  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <h2>{t('webSearch.title')}</h2>
          <p>{t('webSearch.description')}</p>
        </div>
      </div>
      <div className={styles.optionGroup}>
        <div className={styles.webSearchRow}>
          <span className={styles.webSearchOptionLabel}>
            <span>{t('webSearch.option')}</span>
            <InfoTip id="web-search-privacy-tooltip" text={t('webSearch.privacyNotice')} />
          </span>
          <label className={styles.switch}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => handleChange(event.target.checked)}
              aria-label={t('webSearch.option')}
            />
            <span className={styles.switchTrack} aria-hidden="true" />
          </label>
        </div>
      </div>
    </section>
  );
}
