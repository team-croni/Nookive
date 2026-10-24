import { useTranslation } from 'react-i18next';
import { LanguagePicker } from './LanguagePicker';
import styles from '../SettingsApp.module.css';

export function LanguageSection() {
  const { t } = useTranslation(['settings', 'common']);
  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <h2>{t('language.title', { ns: 'settings' })}</h2>
          <p>{t('language.description', { ns: 'settings' })}</p>
        </div>
        <LanguagePicker />
      </div>
    </section>
  );
}
