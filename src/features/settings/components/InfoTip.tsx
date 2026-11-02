// src/features/settings/components/InfoTip.tsx
// ⓘ 버튼에 마우스를 올리거나 포커스하면 설명을 보여준다. 툴팁은 설정 페이지 안에 들어오도록 위치를 잡는다.
import { useLayoutEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { createPortal } from 'react-dom';
import styles from '../SettingsApp.module.css';

interface InfoTipProps {
  id: string;
  text: string;
}

export function InfoTip({ id, text }: InfoTipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    if (!isVisible) return undefined;

    const updatePosition = () => {
      const trigger = buttonRef.current?.getBoundingClientRect();
      const tooltip = tooltipRef.current?.getBoundingClientRect();
      if (!trigger || !tooltip) return;

      const page = buttonRef.current?.closest(`.${styles.page}`)?.getBoundingClientRect();
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

      setPosition({ top, left });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    document.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      document.removeEventListener('scroll', updatePosition, true);
    };
  }, [isVisible, text]);

  return (
    <span className={styles.infoButtonWrap}>
      <button
        type="button"
        ref={buttonRef}
        className={styles.infoButton}
        aria-label={text}
        aria-describedby={id}
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onFocus={() => setIsVisible(true)}
        onBlur={() => setIsVisible(false)}
      >
        <Info size={14} aria-hidden="true" />
      </button>
      {isVisible && createPortal(
        <span
          id={id}
          ref={tooltipRef}
          className={styles.infoTooltip}
          role="tooltip"
          style={{ top: position.top, left: position.left }}
        >
          {text}
        </span>,
        document.body,
      )}
    </span>
  );
}
