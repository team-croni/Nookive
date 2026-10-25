import { Monitor, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme, type ThemePreference } from '../../../hooks/useTheme';
import styles from '../SettingsApp.module.css';

const THEME_OPTIONS: { value: ThemePreference; icon: typeof Sun }[] = [
  { value: 'light', icon: Sun },
  { value: 'dark', icon: Moon },
  { value: 'system', icon: Monitor },
];

export function ThemeSection() {
  const { t } = useTranslation('settings');
  const { preference, setPreference } = useTheme();

  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <h2>{t('theme.title')}</h2>
          <p>{t('theme.description')}</p>
        </div>
        <div className={styles.themeOptions} role="radiogroup" aria-label={t('theme.title')}>
          {THEME_OPTIONS.map(({ value, icon: Icon }) => (
            <label key={value} className={styles.themeOption}>
              <input
                type="radio"
                name="theme"
                value={value}
                checked={preference === value}
                onChange={() => setPreference(value)}
              />
              <span className={styles.themeOptionLabel}>
                <Icon size={14} aria-hidden="true" />
                {t(`theme.options.${value}`)}
              </span>
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}
