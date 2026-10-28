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
    void getVersion().then(setVersion).catch(() => setVersion('0.1.2'));
  }, []);

  const openLink = (url: string) => {
    void invoke('open_url', { url });
  };

  // 앱에 동봉된 라이선스 문서를 연다 (개발 빌드는 GitHub 버전 태그 문서로 대체).
  const openLicense = (kind: 'license' | 'thirdPartyLicenses') => {
    void invoke('open_license_document', { kind });
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
          <button type="button" onClick={() => openLicense('license')}>
            {t('about.license')}
          </button>
          <button type="button" onClick={() => openLicense('thirdPartyLicenses')}>
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
