// src/features/search/components/DateResult.tsx
// 날짜 계산 결과. 결과 목록 맨 위의 줄과, 선택했을 때 미리보기 자리에 보이는 날짜 정보.
import React from 'react';
import { CalendarDays, Check, Copy } from 'lucide-react';
import { Button } from '../../../components/ui/Button/Button';
import { useDateText } from '../hooks/useDateAnswer';
import { differenceInDays, type CalendarDate, type DateAnswer } from '../utils/dateQuery';
import rowStyles from './AnswerRow.module.css';
import styles from './DateResult.module.css';

interface DateRowProps {
  answer: DateAnswer;
  today: CalendarDate;
  isActive: boolean;
  copied: boolean;
  onSelect: () => void;
  onCopy: () => void;
}

export const DateRow: React.FC<DateRowProps> = ({ answer, today, isActive, copied, onSelect, onCopy }) => {
  const text = useDateText();
  const { title, detail } = text.describe(answer, today);
  return (
    <div className={`${rowStyles.row} ${isActive ? rowStyles.active : ''}`} onClick={onSelect} onDoubleClick={onCopy}>
      <span className={rowStyles.icon} aria-hidden="true">
        <CalendarDays size={18} />
      </span>
      <div className={rowStyles.text}>
        <span className={rowStyles.value}>{title}</span>
        <span className={rowStyles.interpretation}>{detail}</span>
      </div>
      <span className={rowStyles.hint}>
        {copied ? (
          <>
            <Check size={13} aria-hidden="true" /> {text.t('calculator.copied')}
          </>
        ) : (
          text.t('calculator.copyHint')
        )}
      </span>
    </div>
  );
};

interface DatePreviewProps {
  answer: DateAnswer;
  today: CalendarDate;
  copied: boolean;
  onCopy: () => void;
}

export const DatePreview: React.FC<DatePreviewProps> = ({ answer, today, copied, onCopy }) => {
  const text = useDateText();
  const { t } = text;
  const { title, detail } = text.describe(answer, today);

  // 날짜 답: 전체 날짜, ISO, 오늘과의 거리 / 일수 답: 주·일, 시작·끝 날짜
  const facts: Array<[string, string]> = [];
  if (answer.kind === 'date') {
    const distance = differenceInDays(today, answer.date);
    facts.push([t('date.labels.date'), text.full.format(text.utc(answer.date))]);
    facts.push([t('date.labels.iso'), text.iso(answer.date)]);
    facts.push([t('date.labels.fromToday'), [text.relative(distance), text.weeksAndDays(distance)].filter(Boolean).join(' · ')]);
  } else {
    const weeks = text.weeksAndDays(answer.days);
    if (weeks) facts.push([t('date.labels.weeks'), weeks]);
    facts.push([t('date.labels.from'), text.full.format(text.utc(answer.from))]);
    facts.push([t('date.labels.to'), text.full.format(text.utc(answer.to))]);
  }

  return (
    <div className={styles.preview}>
      <section className={styles.answer}>
        <span className={styles.title}>{title}</span>
        <span className={styles.detail}>{detail}</span>
      </section>
      <dl className={styles.facts}>
        {facts.map(([label, value]) => (
          <div key={label} className={styles.fact}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {answer.query.kind === 'shift' && answer.query.countsStartDay && (
        <p className={styles.note}>{t('date.countsStartDayNote')}</p>
      )}
      {/* 파일 미리보기처럼 동작 버튼은 아래 왼쪽에 둔다. */}
      <footer className={styles.footer}>
        <Button variant="primary" size="xs" onClick={onCopy}>
          {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          <span>{t('calculator.copy')}</span>
        </Button>
      </footer>
    </div>
  );
};
