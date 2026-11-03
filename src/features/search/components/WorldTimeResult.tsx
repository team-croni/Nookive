// src/features/search/components/WorldTimeResult.tsx
// 세계 시각 결과. 결과 목록 맨 위의 줄과, 선택했을 때 미리보기 자리에 보이는 시각·시간대 비교.
import React, { useEffect, useState } from 'react';
import { Check, Clock, CloudOff, Copy, LoaderCircle } from 'lucide-react';
import { Button } from '../../../components/ui/Button/Button';
import type { WorldTimeResult } from '../hooks/useWorldTime';
import { describeWorldTime, useWorldTimeText } from '../hooks/useWorldTimeText';
import { formatOffset, offsetAt, wallTimeAt } from '../utils/worldTime';
import rowStyles from './AnswerRow.module.css';
import styles from './WorldTimeResult.module.css';

/** 지금 시각 질문은 화면을 열어 둔 동안 시각이 흐르도록 15초마다 다시 그린다. */
function useNow(live: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [live]);
  return now;
}

interface WorldTimeRowProps {
  result: WorldTimeResult;
  isActive: boolean;
  copied: boolean;
  onSelect: () => void;
  onCopy: () => void;
}

export const WorldTimeRow: React.FC<WorldTimeRowProps> = ({ result, isActive, copied, onSelect, onCopy }) => {
  const text = useWorldTimeText();
  const { t } = text;
  const now = useNow(result.status === 'ready' && result.query.kind === 'now');
  let icon: React.ReactNode = <Clock size={18} aria-hidden="true" />;
  let title: string;
  let detail: string;
  if (result.status === 'ready') {
    const answer = describeWorldTime(result, text, now);
    title = answer.day ? `${answer.value} · ${answer.day}` : answer.value;
    detail = answer.detail;
  } else if (result.status === 'loading') {
    icon = <LoaderCircle size={18} className={styles.spinner} aria-hidden="true" />;
    title = t('time.loading', { place: result.label });
    detail = '';
  } else {
    icon = <CloudOff size={18} aria-hidden="true" />;
    title = t('time.error.title');
    detail = [result.label, t('time.error.description')].filter(Boolean).join(' · ');
  }
  return (
    <div className={`${rowStyles.row} ${isActive ? rowStyles.active : ''}`} onClick={onSelect} onDoubleClick={onCopy}>
      <span className={rowStyles.icon}>{icon}</span>
      <div className={rowStyles.text}>
        <span className={`${rowStyles.value} ${result.status === 'loading' ? styles.loadingText : ''}`}>{title}</span>
        {detail && <span className={rowStyles.interpretation}>{detail}</span>}
      </div>
      {result.status === 'ready' && (
        <span className={rowStyles.hint}>
          {copied ? (
            <>
              <Check size={13} aria-hidden="true" /> {t('calculator.copied')}
            </>
          ) : (
            t('calculator.copyHint')
          )}
        </span>
      )}
    </div>
  );
};

/** 비교표 줄 수: 회의 시간을 고를 수 있게 몇 시간을 나란히 보인다. */
const COMPARE_HOURS = 6;
const isWorkingHour = (hour: number) => hour >= 9 && hour < 18;

interface WorldTimePreviewProps {
  result: WorldTimeResult;
  copied: boolean;
  onCopy: () => void;
}

export const WorldTimePreview: React.FC<WorldTimePreviewProps> = ({ result, copied, onCopy }) => {
  const text = useWorldTimeText();
  const { t } = text;
  const now = useNow(result.status === 'ready' && result.query.kind === 'now');

  if (result.status !== 'ready') {
    return (
      <div className={styles.message}>
        {result.status === 'loading' ? (
          <LoaderCircle size={28} className={styles.spinner} aria-hidden="true" />
        ) : (
          <CloudOff size={28} aria-hidden="true" />
        )}
        <span>{result.status === 'loading' ? t('time.loading', { place: result.label }) : t('time.error.title')}</span>
      </div>
    );
  }

  const { from, to } = result;
  const answer = describeWorldTime(result, text, now);
  // 비교표는 지금 시각이면 이번 정시부터, 시간대 바꾸기면 물어본 시각부터 한 시간씩
  const start = Math.floor(answer.instant / 3_600_000) * 3_600_000;
  const first = result.query.kind === 'now' ? start : answer.instant;
  const rows = Array.from({ length: COMPARE_HOURS }, (_, index) => first + index * 3_600_000);

  return (
    <div className={styles.preview}>
      <header className={styles.header}>
        <div className={styles.place}>
          <strong>{text.name(to)}</strong>
          {to.detail && <span>{to.detail}</span>}
        </div>
        <span className={styles.offset}>{formatOffset(offsetAt(to, answer.instant))}</span>
      </header>

      <section className={styles.now}>
        <span className={styles.time}>{answer.value}</span>
        <span className={styles.date}>
          {[text.date(to, answer.instant), answer.day].filter(Boolean).join(' · ')}
        </span>
        <span className={styles.facts}>
          {result.query.kind === 'now'
            ? text.difference(to, from, answer.instant)
            : `${text.name(from)} ${text.time(from, answer.instant)} · ${text.date(from, answer.instant)}`}
        </span>
      </section>

      <section className={styles.compare} aria-label={t('time.compare')}>
        <div className={`${styles.compareRow} ${styles.compareHead}`}>
          <span>{text.name(from)}</span>
          <span>{text.name(to)}</span>
        </div>
        {rows.map((instant) => {
          const working = isWorkingHour(wallTimeAt(from, instant).hour) && isWorkingHour(wallTimeAt(to, instant).hour);
          return (
            <div key={instant} className={`${styles.compareRow} ${working ? styles.working : ''}`}>
              <span>{text.time(from, instant)}</span>
              <span>{text.time(to, instant)}</span>
            </div>
          );
        })}
        <p className={styles.legend}>{t('time.workingHours')}</p>
      </section>

      {/* 파일 미리보기처럼 동작 버튼은 아래 왼쪽에 둔다. */}
      <footer className={styles.footer}>
        <Button variant="primary" size="xs" onClick={onCopy}>
          {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          <span>{t('time.copy')}</span>
        </Button>
      </footer>
    </div>
  );
};
