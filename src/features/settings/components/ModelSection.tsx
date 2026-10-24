import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, LoaderCircle } from 'lucide-react';
import { listen } from '@tauri-apps/api/event';
import { Button } from '../../../components/ui/Button/Button';
import {
  downloadModelBundle,
  getModelStatus,
  type ModelBundleStatus,
  type ModelDownloadProgress,
} from '../../../utils/tauriBridge';
import { useTranslation } from 'react-i18next';
import styles from '../SettingsApp.module.css';

type DownloadKind = 'embedding' | 'speech';

const formatBytes = (bytes: number) => {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
};

interface ModelSectionProps {
  compact?: boolean;
}

export function ModelSection({ compact = false }: ModelSectionProps) {
  const { t } = useTranslation('settings');
  const [status, setStatus] = useState<ModelBundleStatus | null>(null);
  const [downloadKind, setDownloadKind] = useState<DownloadKind | null>(null);
  const [progress, setProgress] = useState<ModelDownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const next = await getModelStatus();
    if (next) setStatus(next);
  }, []);

  useEffect(() => {
    void refresh();
    let unlisten: (() => void) | undefined;
    void listen<ModelDownloadProgress>('model-download-progress', ({ payload }) => {
      setProgress(payload);
    }).then((stop) => {
      unlisten = stop;
    });
    return () => unlisten?.();
  }, [refresh]);

  const download = async (kind: DownloadKind) => {
    setDownloadKind(kind);
    setProgress(null);
    setError(null);
    try {
      const next = await downloadModelBundle(kind);
      if (next) setStatus(next);
    } catch {
      setError(t('models.error'));
    } finally {
      setDownloadKind(null);
      setProgress(null);
    }
  };

  const progressPercent = useMemo(() => {
    if (!progress?.overall_total) return 0;
    return Math.min(100, Math.round((progress.overall_completed / progress.overall_total) * 100));
  }, [progress]);

  if (!status) return null;
  const embeddingMissing = !status.embedding_ready;
  const speechMissing = !status.speech_ready;
  if (!embeddingMissing && !speechMissing && compact) return null;

  return (
    <section className={`${styles.card} ${compact ? styles.modelCardCompact : ''}`}>
      <div className={styles.cardHeader}>
        <div>
          <h2>{t('models.title')}</h2>
          <p>{t(embeddingMissing ? 'models.embeddingDescription' : 'models.readyDescription')}</p>
        </div>
      </div>

      {embeddingMissing && (
        <div className={styles.modelRow}>
          <div>
            <strong>{t('models.embedding')}</strong>
            <p>{t('models.embeddingSize')}</p>
          </div>
          <Button
            variant="primary"
            onClick={() => void download('embedding')}
            disabled={downloadKind !== null}
          >
            {downloadKind === 'embedding' ? <LoaderCircle className={styles.progressSpinner} size={14} /> : <Download size={14} />}
            {t('models.download')}
          </Button>
        </div>
      )}

      {!compact && (
        <div className={styles.modelRow}>
          <div>
            <strong>{t('models.speech')}</strong>
            <p>{t('models.speechDescription')}</p>
          </div>
          <Button
            variant="secondary"
            onClick={() => void download('speech')}
            disabled={downloadKind !== null || !status.embedding_ready}
          >
            {downloadKind === 'speech' ? <LoaderCircle className={styles.progressSpinner} size={14} /> : <Download size={14} />}
            {speechMissing ? t('models.download') : t('models.installed')}
          </Button>
        </div>
      )}

      {progress && downloadKind && (
        <div className={styles.modelProgress} role="status" aria-live="polite">
          <div className={styles.progressLabel}>
            <span>{t('models.downloading')}</span>
            <span>{progressPercent}% · {formatBytes(progress.overall_completed)} / {formatBytes(progress.overall_total)}</span>
          </div>
          <div className={styles.progressTrack}>
            <div className={styles.progressValue} style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      )}
      {error && <p className={styles.errorMessage} role="alert">{error}</p>}
    </section>
  );
}
