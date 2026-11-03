// src/features/settings/components/WorldTimeSection.tsx
// 세계 시각(다른 곳의 지금 시각, 시간대 바꾸기) 켜고 끄기.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getWorldTimeEnabled, setWorldTimeEnabled } from '../../../utils/worldTimePreference';
import { InfoTip } from './InfoTip';
import styles from '../SettingsApp.module.css';

export function WorldTimeSection() {
  const { t } = useTranslation('settings');
  const [enabled, setEnabled] = useState(getWorldTimeEnabled);

  const handleChange = (next: boolean) => {
    setEnabled(next);
    setWorldTimeEnabled(next);
  };

  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <h2>{t('worldTime.title')}</h2>
          <p>{t('worldTime.description')}</p>
        </div>
      </div>
      <div className={styles.optionGroup}>
        <div className={styles.webSearchRow}>
          <span className={styles.webSearchOptionLabel}>
            <span>{t('worldTime.option')}</span>
            <InfoTip id="world-time-privacy-tooltip" text={t('worldTime.privacyNotice')} />
          </span>
          <label className={styles.switch}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => handleChange(event.target.checked)}
              aria-label={t('worldTime.option')}
            />
            <span className={styles.switchTrack} aria-hidden="true" />
          </label>
        </div>
      </div>
    </section>
  );
}
