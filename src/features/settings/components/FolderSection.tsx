// src/features/settings/components/FolderSection.tsx
import { FolderPlus } from 'lucide-react';
import { Button } from '../../../components/ui/Button/Button';
import styles from '../SettingsApp.module.css';
import { useTranslation } from 'react-i18next';

interface FolderSectionProps {
  roots: string[];
  isBusy: boolean;
  onAddFolder: () => void;
  onRemoveFolder: (folder: string) => void;
}

export function FolderSection({ roots, isBusy, onAddFolder, onRemoveFolder }: FolderSectionProps) {
  const { t } = useTranslation(['settings', 'common']);
  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <h2>{t('folders.title')}</h2>
          <p>{t('folders.description')}</p>
        </div>
        <Button variant="primary" onClick={onAddFolder} disabled={isBusy}>
          <FolderPlus size={16} /> {t('folders.add')}
        </Button>
      </div>

      <div className={styles.folderList}>
        {roots.length === 0 ? (
          <div className={styles.empty}>{t('folders.empty')}</div>
        ) : (
          roots.map((root) => (
            <div className={styles.folderRow} key={root}>
              <span title={root}>{root}</span>
              <Button
                variant="ghost"
                size="xs"
                className={styles.removeButton}
                onClick={() => onRemoveFolder(root)}
                disabled={isBusy}
              >
                {t('actions.remove', { ns: 'common' })}
              </Button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
