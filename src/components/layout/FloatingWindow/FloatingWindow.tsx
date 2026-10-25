// src/components/layout/FloatingWindow/FloatingWindow.tsx
import React from 'react';
import styles from './FloatingWindow.module.css';

interface FloatingWindowProps {
  children: React.ReactNode;
  /** 초기(검색어 없음) 상태: 검색바만 보이도록 높이를 내용에 맞춘다. */
  compact?: boolean;
}

export const FloatingWindow: React.FC<FloatingWindowProps> = ({
  children,
  compact = false,
}) => {
  return (
    // 등장 애니메이션을 걸지 않는다:
    // 창(또는 상위 요소)에 opacity/transform 애니메이션이 걸리면
    // backdrop-filter가 그 그룹 안에서만 샘플링되어 blur가 늦게(또는 안) 나타난다.
    <div className={styles.windowShell}>
      <div className={`${styles.windowFrame} ${compact ? styles.compact : ''}`}>
        <div
          className={`${styles.innerContent} ${compact ? styles.compactContent : ''}`}
        >
          {children}
        </div>
      </div>
    </div>
  );
};
