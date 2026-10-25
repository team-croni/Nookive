// src/features/settings/components/SettingsHeader.tsx
import type { MouseEvent } from 'react';
import { X } from 'lucide-react';
import { Button } from '../../../components/ui/Button/Button';
import styles from '../SettingsApp.module.css';
import { useTranslation } from 'react-i18next';

interface SettingsHeaderProps {
  onClose: () => void;
  onHeaderMouseDown: (event: MouseEvent<HTMLElement>) => void;
}

export function SettingsHeader({ onClose, onHeaderMouseDown }: SettingsHeaderProps) {
  const { t } = useTranslation('settings');
  return (
    <header
      className={styles.header}
      data-tauri-drag-region
      onMouseDown={onHeaderMouseDown}
    >
      <div>
        <p className={styles.eyebrow}>NOOKIVE</p>
        <h1>{t('title')}</h1>
        <p className={styles.subtitle}>{t('subtitle')}</p>
      </div>
      <Button variant="close" size="icon" onClick={onClose} aria-label={t('close')} title={t('close')}>
        <X size={18} />
      </Button>
    </header>
  );
}
