// src/features/settings/components/CurrencySection.tsx
// 환율 변환 켜고 끄기.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getCurrencyEnabled, setCurrencyEnabled } from '../../../utils/currencyPreference';
import { InfoTip } from './InfoTip';
import styles from '../SettingsApp.module.css';

export function CurrencySection() {
  const { t } = useTranslation('settings');
  const [enabled, setEnabled] = useState(getCurrencyEnabled);

  const handleChange = (next: boolean) => {
    setEnabled(next);
    setCurrencyEnabled(next);
  };

  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <h2>{t('currency.title')}</h2>
          <p>{t('currency.description')}</p>
        </div>
      </div>
      <div className={styles.optionGroup}>
        <div className={styles.webSearchRow}>
          <span className={styles.webSearchOptionLabel}>
            <span>{t('currency.option')}</span>
            <InfoTip id="currency-privacy-tooltip" text={t('currency.privacyNotice')} />
          </span>
          <label className={styles.switch}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => handleChange(event.target.checked)}
              aria-label={t('currency.option')}
            />
            <span className={styles.switchTrack} aria-hidden="true" />
          </label>
        </div>
      </div>
    </section>
  );
}
