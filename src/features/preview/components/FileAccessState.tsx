import React from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '../../../components/ui/Button/Button';
import styles from './PdfViewer.module.css';
import { useTranslation } from 'react-i18next';

interface FileAccessStateProps {
  checking?: boolean;
  onRetry?: () => void;
}

export const FileAccessState: React.FC<FileAccessStateProps> = ({ checking = false, onRetry }) => {
  const { t } = useTranslation('preview');

  if (checking) {
    return (
      <div className={styles.stateBox} role="status" aria-live="polite">
        <span>{t('fileAccessChecking')}</span>
      </div>
    );
  }

  return (
    <div className={styles.stateBox} role="alert">
      <span className={styles.fileAccessTitle}>{t('fileAccessTitle')}</span>
      <span className={styles.fileAccessDescription}>{t('fileAccessDescription')}</span>
      {onRetry && (
        <Button variant="ghost" size="xs" onClick={onRetry}>
          <RefreshCw size={12} />
          <span>{t('fileAccessRetry')}</span>
        </Button>
      )}
    </div>
  );
};
