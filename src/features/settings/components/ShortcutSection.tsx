// src/features/settings/components/ShortcutSection.tsx
import type { KeyboardEvent } from 'react';
import styles from '../SettingsApp.module.css';
import { useTranslation } from 'react-i18next';

interface ShortcutSectionProps {
  shortcutLabel: string;
  shortcutMessage: string | null;
  isRecordingShortcut: boolean;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onFocus: (event: React.FocusEvent<HTMLInputElement>) => void;
  onBlur: () => void;
}

export function ShortcutSection({
  shortcutLabel,
  shortcutMessage,
  isRecordingShortcut,
  onKeyDown,
  onFocus,
  onBlur,
}: ShortcutSectionProps) {
  const { t } = useTranslation('settings');
  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <h2>{t('shortcut.title')}</h2>
          <p>{t('shortcut.description')}</p>
        </div>
      </div>
      <div className={styles.shortcutList}>
        <label className={`${styles.shortcutRow} ${isRecordingShortcut ? styles.shortcutSelectRowActive : ''}`}>
          <span>{isRecordingShortcut ? t('shortcut.recording') : t('shortcut.open')}</span>
          <input
            className={`${styles.shortcutInput} ${isRecordingShortcut ? styles.shortcutInputActive : ''}`}
            value={shortcutLabel}
            onChange={() => undefined}
            onKeyDown={onKeyDown}
            onFocus={onFocus}
            onBlur={onBlur}
            aria-label={t('shortcut.aria')}
            title={t('shortcut.hint')}
            readOnly
          />
        </label>
      </div>
      {shortcutMessage && <p className={styles.shortcutMessage} role="status">{shortcutMessage}</p>}
    </section>
  );
}
