// src/features/settings/components/LoginItemSection.tsx
// 로그인 시 열기. 설정 창이 보일 때마다 macOS의 실제 상태를 다시 읽어, 시스템 설정에서 바꾼 값을 그대로 보여준다.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/Button/Button';
import {
  getLaunchAtLogin,
  openLoginItemsSettings,
  setLaunchAtLogin,
  type LoginItemStatus,
} from '../../../utils/tauriBridge';
import styles from '../SettingsApp.module.css';

export function LoginItemSection() {
  const { t } = useTranslation('settings');
  const [status, setStatus] = useState<LoginItemStatus | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const load = () => void getLaunchAtLogin().then(setStatus);
    load();
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, []);

  // macOS 13 미만이거나 상태를 아직 모르면 카드를 숨긴다.
  if (status === null || status === 'unsupported') return null;

  const handleChange = async (enabled: boolean) => {
    setIsSaving(true);
    const result = await setLaunchAtLogin(enabled);
    setStatus(result.status);
    setFailed(result.failed);
    setIsSaving(false);
  };

  const enabled = status === 'enabled' || status === 'requiresApproval';
  const hint = failed
    ? t('loginItem.failed')
    : status === 'requiresApproval'
      ? t('loginItem.requiresApproval')
      : null;

  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <h2>{t('loginItem.title')}</h2>
          <p>{t('loginItem.description')}</p>
        </div>
      </div>
      <div className={styles.optionGroup}>
        <div className={styles.webSearchRow}>
          <span className={styles.webSearchOptionLabel}>{t('loginItem.option')}</span>
          <label className={styles.switch}>
            <input
              type="checkbox"
              checked={enabled}
              disabled={isSaving}
              onChange={(event) => void handleChange(event.target.checked)}
              aria-label={t('loginItem.option')}
            />
            <span className={styles.switchTrack} aria-hidden="true" />
          </label>
        </div>
        {hint && (
          <div className={styles.webSearchRow}>
            <span className={styles.loginItemHint}>{hint}</span>
            {(failed || status === 'requiresApproval') && (
              <Button variant="secondary" size="xs" onClick={() => void openLoginItemsSettings()}>
                {t('loginItem.openSettings')}
              </Button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
