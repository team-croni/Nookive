// src/features/settings/components/WebSearchSection.tsx
// 웹 검색 켜고 끄기와 검색 엔진 선택. 웹 폴백(로컬 결과 없음)과 웹 검색 모드에 함께 적용된다.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { sortedWebSearchEngines, webSearchEngineName } from '../../../utils/webSearchEngines';
import {
  getWebSearchEnabled,
  getWebSearchEngine,
  setWebSearchEnabled,
  setWebSearchEngine,
  subscribeWebSearchEngine,
} from '../../../utils/webSearchPreference';
import { InfoTip } from './InfoTip';
import { OptionPicker } from './OptionPicker';
import styles from '../SettingsApp.module.css';

export function WebSearchSection() {
  const { t, i18n } = useTranslation('settings');
  const language = i18n.resolvedLanguage ?? i18n.language;
  const [enabled, setEnabled] = useState(getWebSearchEnabled);
  const [engine, setEngine] = useState(getWebSearchEngine);

  useEffect(() => subscribeWebSearchEngine(setEngine), []);

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
            <InfoTip id="web-search-privacy-tooltip" text={t('webSearch.privacyNotice', { engine: webSearchEngineName(engine, language) })} />
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
        {enabled && (
          <div className={styles.webSearchRow}>
            <span className={styles.webSearchOptionLabel}>{t('webSearch.engine')}</span>
            <OptionPicker
              options={sortedWebSearchEngines(language).map((item) => ({ value: item.id, label: webSearchEngineName(item, language) }))}
              value={engine.id}
              onChange={setWebSearchEngine}
              ariaLabel={t('webSearch.engine')}
            />
          </div>
        )}
      </div>
    </section>
  );
}
