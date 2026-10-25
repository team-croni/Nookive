// src/components/ui/HighlightText/HighlightText.tsx
import React, { useMemo } from 'react';
import styles from './HighlightText.module.css';

interface HighlightTextProps {
  text: string;
  query: string;
  className?: string;
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const HighlightText: React.FC<HighlightTextProps> = ({ text, query, className }) => {
  const parts = useMemo(() => {
    if (!text) return [];
    const trimmed = query.trim();
    if (!trimmed) {
      return [{ text, isMatch: false }];
    }

    // 공백 기준 다중 키워드 분리 (2글자 이상 우선 또는 전체)
    const keywords = trimmed
      .split(/\s+/)
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    if (keywords.length === 0) {
      return [{ text, isMatch: false }];
    }

    const pattern = keywords.map(escapeRegExp).join('|');
    const regex = new RegExp(`(${pattern})`, 'gi');
    const splitParts = text.split(regex);

    return splitParts.map((part) => ({
      text: part,
      isMatch: regex.test(part),
    }));
  }, [text, query]);

  if (!query.trim()) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={className}>
      {parts.map((p, idx) =>
        p.isMatch ? (
          <mark key={idx} className={styles.mark}>
            {p.text}
          </mark>
        ) : (
          <React.Fragment key={idx}>{p.text}</React.Fragment>
        )
      )}
    </span>
  );
};
