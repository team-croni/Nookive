// src/components/ui/Badge/Badge.tsx
import React from 'react';
import styles from './Badge.module.css';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'score' | 'neutral' | 'model' | 'file';
  score?: number;
  /** 활성 결과 항목의 색상 위에서도 읽기 쉽도록 강조한다. */
  active?: boolean;
  /** 늦게 나타나는 뱃지(예: PDF 매칭 페이지)를 부드럽게 노출한다. */
  fadeIn?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  score,
  active = false,
  fadeIn = false,
}) => {
  let scoreClass = '';
  if (variant === 'score' && score !== undefined) {
    if (score >= 0.85) scoreClass = styles.scoreHigh;
    else if (score >= 0.70) scoreClass = styles.scoreMedium;
    else scoreClass = styles.scoreLow;
  }

  return (
    <span
      className={`${styles.badge} ${styles[variant]} ${scoreClass} ${active ? styles.active : ''} ${fadeIn ? styles.fadeIn : ''}`}
    >
      {children}
    </span>
  );
};
