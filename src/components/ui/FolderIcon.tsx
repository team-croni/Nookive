import React, { useEffect, useState } from 'react';
import { Folder } from 'lucide-react';
import { getFolderIcon } from '../../utils/tauriBridge';
import { useTranslation } from 'react-i18next';

interface FolderIconProps {
  path: string;
  size?: number;
  className?: string;
  fadeIn?: boolean;
}

/** 목록과 상세 패널에서 동일한 macOS Finder 폴더 아이콘을 사용한다. */
export const FolderIcon = React.memo<FolderIconProps>(({ path, size = 34, className, fadeIn = true }) => {
  const { t } = useTranslation('common');
  const [icon, setIcon] = useState<string | null>(null);
  const [iconPath, setIconPath] = useState<string | null>(null);
  const [errorPath, setErrorPath] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getFolderIcon(path).then((value) => {
      if (active) {
        setIcon(value);
        setIconPath(path);
        setErrorPath(value ? null : path);
      }
    });
    return () => {
      active = false;
    };
  }, [path]);

  const visibleIcon = iconPath === path ? icon : null;
  const hasError = errorPath === path;

  return (
    <span
      style={{
        position: 'relative',
        display: 'inline-flex',
        width: size,
        height: size,
        flex: `0 0 ${size}px`,
        alignItems: 'center',
        justifyContent: 'center',
      }}
      className={className}
      aria-label={hasError ? t('file.folder') : undefined}
    >
      {visibleIcon ? (
        <img
          src={visibleIcon}
          alt=""
          className={fadeIn ? 'icon-fade-in' : 'no-fade'}
          width={size}
          height={size}
          style={{ objectFit: 'contain', display: 'block' }}
          onError={() => {
            setIcon(null);
            setIconPath(path);
            setErrorPath(path);
          }}
        />
      ) : hasError ? (
        <Folder size={size} strokeWidth={1.7} aria-hidden="true" />
      ) : null}
    </span>
  );
});

FolderIcon.displayName = 'FolderIcon';
