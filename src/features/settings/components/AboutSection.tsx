// src/features/settings/components/AboutSection.tsx
import { useTranslation } from 'react-i18next';
import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
import styles from '../SettingsApp.module.css';

export function AboutSection() {
  const { t } = useTranslation('settings');
  const [version, setVersion] = useState<string>('');

  useEffect(() => {
    void getVersion().then(setVersion).catch(() => setVersion('0.1.0'));
  }, []);

  const openLink = (url: string) => {
    void invoke('open_url', { url });
  };

  return (
    <section className={styles.aboutSection}>
      <img
        src="/nookive-mark.svg"
        alt="Nookive"
        className={styles.aboutLogo}
      />
      <div className={styles.aboutInfo}>
        <span className={styles.aboutName}>Nookive</span>
        <span className={styles.aboutVersion}>
          {t('about.version', { version: version || '…' })}
        </span>
        <span className={styles.aboutMaintainer}>{t('about.maintainer')}</span>
        <div className={styles.aboutLinks}>
          <button type="button" onClick={() => openLink('https://github.com/team-croni/Nookive')}>
            {t('about.github')}
          </button>
          <button type="button" onClick={() => openLink('https://github.com/team-croni/Nookive/blob/main/LICENSE')}>
            {t('about.license')}
          </button>
          <button type="button" onClick={() => openLink('https://github.com/team-croni/Nookive/blob/main/THIRD_PARTY_NOTICES.md')}>
            {t('about.thirdParty')}
          </button>
          <button type="button" onClick={() => openLink('https://github.com/team-croni/Nookive/issues')}>
            {t('about.issues')}
          </button>
        </div>
      </div>
    </section>
  );
}
