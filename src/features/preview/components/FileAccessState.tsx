import React from 'react';
import { FileWarning, RefreshCw } from 'lucide-react';
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
      <FileWarning size={26} style={{ color: 'var(--icon-muted)' }} />
      <strong>{t('fileAccessTitle')}</strong>
      <span>{t('fileAccessDescription')}</span>
      <small className={styles.accessHint}>{t('fileAccessHint')}</small>
      {onRetry && (
        <Button variant="secondary" size="xs" onClick={onRetry}>
          <RefreshCw size={12} />
          <span>{t('fileAccessRetry')}</span>
        </Button>
      )}
    </div>
  );
};
