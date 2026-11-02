// src/features/settings/components/CodeSearchSection.tsx
// 코드 검색(검색창의 Tab / "code:") 켜고 끄기. 모든 검색 폴더가 대상이며 파일 내용은 색인하지 않는다.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getCodeSearchEnabled, setCodeSearchEnabled } from '../../../utils/codeSearchPreference';
import styles from '../SettingsApp.module.css';

export function CodeSearchSection() {
  const { t } = useTranslation('settings');
  const [enabled, setEnabled] = useState(getCodeSearchEnabled);

  const handleChange = (nextEnabled: boolean) => {
    setEnabled(nextEnabled);
    setCodeSearchEnabled(nextEnabled);
  };

  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <h2>{t('codeSearch.title')}</h2>
          <p>{t('codeSearch.description')}</p>
        </div>
      </div>
      <div className={styles.webSearchRow}>
        <span className={styles.webSearchOptionLabel}>{t('codeSearch.option')}</span>
        <label className={styles.switch}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => handleChange(event.target.checked)}
            aria-label={t('codeSearch.option')}
          />
          <span className={styles.switchTrack} aria-hidden="true" />
        </label>
      </div>
    </section>
  );
}
