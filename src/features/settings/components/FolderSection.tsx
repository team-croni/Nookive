// src/features/settings/components/FolderSection.tsx
// 검색될 폴더 목록. 폴더가 많아져도 카드가 끝없이 길어지지 않게 목록 안에서 스크롤하고,
// 긴 경로에서도 폴더 이름이 잘리지 않도록 이름과 상위 경로를 두 줄로 나눠 보여준다.
import { Folder, FolderPlus } from 'lucide-react';
import { Button } from '../../../components/ui/Button/Button';
import { directoryPath } from '../../../utils/path';
import styles from '../SettingsApp.module.css';
import { useTranslation } from 'react-i18next';

interface FolderSectionProps {
  roots: string[];
  isBusy: boolean;
  onAddFolder: () => void;
  onRemoveFolder: (folder: string) => void;
}

/** 홈 폴더는 ~로 줄여 상위 경로를 짧게 보여준다. */
function shortenHome(path: string): string {
  return path.replace(/^\/Users\/[^/]+(?=\/|$)/, '~');
}

function folderName(path: string): string {
  return path.replace(/\/+$/, '').split('/').pop() || path;
}

export function FolderSection({ roots, isBusy, onAddFolder, onRemoveFolder }: FolderSectionProps) {
  const { t, i18n } = useTranslation(['settings', 'common']);
  // 폴더 이름순으로 정렬해 많아져도 찾기 쉽게 한다. (이름이 같으면 경로순)
  const sortedRoots = [...roots].sort((a, b) =>
    folderName(a).localeCompare(folderName(b), i18n.language) || a.localeCompare(b),
  );

  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <h2 className={styles.titleWithCount}>
            {t('folders.title')}
            {roots.length > 0 && <span className={styles.titleCount}>{roots.length}</span>}
          </h2>
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
          sortedRoots.map((root) => (
            <div className={styles.folderRow} key={root} title={root}>
              <Folder className={styles.folderIcon} size={16} aria-hidden="true" />
              <div className={styles.folderText}>
                <span className={styles.folderName}>{folderName(root)}</span>
                <span className={styles.folderParent}>{shortenHome(directoryPath(root)) || '/'}</span>
              </div>
              <Button
                variant="ghost"
                size="xs"
                className={styles.removeButton}
                onClick={() => onRemoveFolder(root)}
                disabled={isBusy}
                aria-label={`${t('actions.remove', { ns: 'common' })} ${root}`}
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
