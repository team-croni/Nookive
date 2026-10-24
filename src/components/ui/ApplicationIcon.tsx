import React, { useEffect, useState } from 'react';
import { AppWindow } from 'lucide-react';
import { getApplicationIcon } from '../../utils/tauriBridge';
import { useTranslation } from 'react-i18next';

interface ApplicationIconProps {
  path: string;
  size?: number;
  className?: string;
  fadeIn?: boolean;
}

/** 목록과 상세 패널에서 같은 macOS 앱 아이콘/폴백을 사용한다. */
export const ApplicationIcon = React.memo<ApplicationIconProps>(({ path, size = 34, className, fadeIn = true }) => {
  const { t } = useTranslation('common');
  const [icon, setIcon] = useState<string | null>(null);
  const [iconPath, setIconPath] = useState<string | null>(null);
  const [errorPath, setErrorPath] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getApplicationIcon(path).then((value) => {
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

  // 경로가 바뀐 첫 렌더에서는 이전 파일의 아이콘을 재사용하지 않는다.
  // 새 아이콘이 준비될 때까지 프레임 크기만 유지해 레이아웃을 고정한다.
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
      aria-label={hasError ? t('file.application') : undefined}
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
        <AppWindow size={size} strokeWidth={1.5} opacity={0.15} aria-hidden="true" />
      ) : null}
    </span>
  );
});

ApplicationIcon.displayName = 'ApplicationIcon';
