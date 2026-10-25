// src/features/preview/components/ImagePreview.tsx
import React, { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { getFileSrc } from '../../../utils/tauriBridge';
import styles from './PreviewPane.module.css';
import { useTranslation } from 'react-i18next';

interface ImagePreviewProps {
  path: string;
  name: string;
}

export const ImagePreview: React.FC<ImagePreviewProps> = ({ path, name }) => {
  const { t } = useTranslation('preview');
  const [hasError, setHasError] = useState(false);
  const src = getFileSrc(path);

  if (hasError) {
    return (
      <div className={styles.fallbackBox}>
        <ImageOff size={28} color="#94a3b8" />
        <span>{t('unsupportedImage')}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      className={styles.previewImage}
      onError={() => setHasError(true)}
    />
  );
};
