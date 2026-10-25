// src/components/ui/KeyHint/KeyHint.tsx
import React from 'react';
import styles from './KeyHint.module.css';

interface KeyHintProps {
  label: string;
  glyph?: string;
}

export const KeyHint: React.FC<KeyHintProps> = ({ label, glyph }) => {
  return (
    <span className={styles.keycap}>
      {glyph && <span className={styles.glyph}>{glyph}</span>}
      <span className={styles.label}>{label}</span>
    </span>
  );
};
