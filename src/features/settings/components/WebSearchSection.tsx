import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';
import { createPortal } from 'react-dom';
import { getWebSearchEnabled, setWebSearchEnabled } from '../../../utils/webSearchPreference';
import styles from '../SettingsApp.module.css';

export function WebSearchSection() {
  const { t } = useTranslation('settings');
  const [enabled, setEnabled] = useState(getWebSearchEnabled);
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const infoButtonRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);

  const handleChange = (nextEnabled: boolean) => {
    setEnabled(nextEnabled);
    setWebSearchEnabled(nextEnabled);
  };

  useLayoutEffect(() => {
    if (!isTooltipVisible) return undefined;

    const updateTooltipPosition = () => {
      const trigger = infoButtonRef.current?.getBoundingClientRect();
      const tooltip = tooltipRef.current?.getBoundingClientRect();
      if (!trigger || !tooltip) return;

      const page = infoButtonRef.current?.closest(`.${styles.page}`)?.getBoundingClientRect();
      const bounds = page ?? {
        top: 0,
        right: window.innerWidth,
        bottom: window.innerHeight,
        left: 0,
      };
      const inset = 8;
      const gap = 8;
      const left = Math.min(
        Math.max(bounds.left + inset, trigger.right - tooltip.width),
        Math.max(bounds.left + inset, bounds.right - tooltip.width - inset),
      );
      const opensBelow = trigger.bottom + gap + tooltip.height <= bounds.bottom - inset;
      const preferredTop = opensBelow
        ? trigger.bottom + gap
        : trigger.top - tooltip.height - gap;
      const top = Math.min(
        Math.max(bounds.top + inset, preferredTop),
        Math.max(bounds.top + inset, bounds.bottom - tooltip.height - inset),
      );

      setTooltipPosition({ top, left });
    };

    updateTooltipPosition();
    window.addEventListener('resize', updateTooltipPosition);
    document.addEventListener('scroll', updateTooltipPosition, true);
    return () => {
      window.removeEventListener('resize', updateTooltipPosition);
      document.removeEventListener('scroll', updateTooltipPosition, true);
    };
  }, [isTooltipVisible, t]);

  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <h2>{t('webSearch.title')}</h2>
          <p>{t('webSearch.description')}</p>
        </div>
      </div>
      <div className={styles.webSearchRow}>
        <span className={styles.webSearchOptionLabel}>
          <span>{t('webSearch.option')}</span>
          <span className={styles.infoButtonWrap}>
            <button
              type="button"
              ref={infoButtonRef}
              className={styles.infoButton}
              aria-label={t('webSearch.privacyNotice')}
              aria-describedby="web-search-privacy-tooltip"
              onMouseEnter={() => setIsTooltipVisible(true)}
              onMouseLeave={() => setIsTooltipVisible(false)}
              onFocus={() => setIsTooltipVisible(true)}
              onBlur={() => setIsTooltipVisible(false)}
            >
              <Info size={14} aria-hidden="true" />
            </button>
            {isTooltipVisible && createPortal(
              <span
                id="web-search-privacy-tooltip"
                ref={tooltipRef}
                className={styles.infoTooltip}
                role="tooltip"
                style={{ top: tooltipPosition.top, left: tooltipPosition.left }}
              >
                {t('webSearch.privacyNotice')}
              </span>,
              document.body,
            )}
          </span>
        </span>
        <label className={styles.switch}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => handleChange(event.target.checked)}
            aria-label={t('webSearch.option')}
          />
          <span className={styles.switchTrack} aria-hidden="true" />
        </label>
      </div>
    </section>
  );
}
