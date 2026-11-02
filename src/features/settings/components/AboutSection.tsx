// src/features/settings/components/AboutSection.tsx
// 정보: 앱 이름·버전과, 다른 카드의 옵션 상자와 같은 모양의 링크 목록.
import { useTranslation } from 'react-i18next';
import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
import { ChevronRight, ExternalLink } from 'lucide-react';
import styles from '../SettingsApp.module.css';

export function AboutSection() {
  const { t } = useTranslation('settings');
  const [version, setVersion] = useState<string>('');

  useEffect(() => {
    void getVersion().then(setVersion).catch(() => setVersion('0.1.3'));
  }, []);

  const openLink = (url: string) => {
    void invoke('open_url', { url });
  };

  // 앱에 동봉된 라이선스 문서를 연다 (개발 빌드는 GitHub 버전 태그 문서로 대체).
  const openLicense = (kind: 'license' | 'thirdPartyLicenses') => {
    void invoke('open_license_document', { kind });
  };

  // 웹 페이지로 나가는 링크는 바깥 화살표, 앱이 여는 문서는 오른쪽 화살표로 구분한다.
  const links = [
    { label: t('about.github'), external: true, open: () => openLink('https://github.com/team-croni/Nookive') },
    { label: t('about.issues'), external: true, open: () => openLink('https://github.com/team-croni/Nookive/issues') },
    { label: t('about.license'), external: false, open: () => openLicense('license') },
    { label: t('about.thirdParty'), external: false, open: () => openLicense('thirdPartyLicenses') },
  ];

  return (
    <section className={styles.card}>
      <div className={styles.aboutHeader}>
        <img src="/nookive-mark.svg" alt="" className={styles.aboutLogo} />
        <div className={styles.aboutInfo}>
          <span className={styles.aboutName}>Nookive</span>
          <span className={styles.aboutVersion}>{t('about.version', { version: version || '…' })}</span>
          <span className={styles.aboutMaintainer}>{t('about.maintainer')}</span>
        </div>
      </div>
      <div className={styles.optionGroup}>
        {links.map(({ label, external, open }) => (
          <button key={label} type="button" className={`${styles.webSearchRow} ${styles.linkRow}`} onClick={open}>
            <span className={styles.webSearchOptionLabel}>{label}</span>
            {external
              ? <ExternalLink size={14} aria-hidden="true" />
              : <ChevronRight size={15} aria-hidden="true" />}
          </button>
        ))}
      </div>
    </section>
  );
}
