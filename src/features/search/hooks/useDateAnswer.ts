// src/features/search/hooks/useDateAnswer.ts
// 날짜 질문의 답과 화면 문구. 네트워크 없이 Mac의 오늘 날짜로 계산한다.
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSystemLocale } from '../../../utils/systemLocale';
import {
  answerDateQuery,
  differenceInDays,
  isDayFirst,
  parseDateQuery,
  type CalendarDate,
  type DateAnswer,
  type DateUnit,
} from '../utils/dateQuery';
import { regionOf } from '../utils/weatherForecast';

const todayOf = (): CalendarDate => {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
};

/** 오늘 날짜. 창이 다시 보일 때(포커스) 다시 읽어 자정을 넘겨도 맞게 한다. */
function useToday(): CalendarDate {
  const [today, setToday] = useState(todayOf);
  useEffect(() => {
    const refresh = () =>
      setToday((previous) => {
        const next = todayOf();
        return differenceInDays(previous, next) === 0 ? previous : next;
      });
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);
  return today;
}

/** 검색어가 날짜 질문이면 답을 돌려준다. "12/25"처럼 숫자만 쓴 날짜의 순서는 macOS 지역을 따른다. */
export function useDateAnswer(input: string, active: boolean): { answer: DateAnswer | null; today: CalendarDate } {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language ?? 'en';
  const system = useSystemLocale();
  const region = regionOf(system, typeof navigator === 'undefined' ? language : navigator.language);
  const dayFirst = isDayFirst(region ? `${language.split('-')[0]}-${region}` : language);
  const today = useToday();
  const answer = useMemo(() => {
    if (!active) return null;
    const query = parseDateQuery(input, { dayFirst });
    return query ? answerDateQuery(query, today) : null;
  }, [active, input, dayFirst, today]);
  return { answer, today };
}

/** 결과 줄·미리보기·복사가 함께 쓰는 문구 */
export function useDateText() {
  const { t, i18n } = useTranslation('search');
  const language = i18n.resolvedLanguage ?? i18n.language;
  const utc = (date: CalendarDate) => Date.UTC(date.year, date.month - 1, date.day);
  const full = new Intl.DateTimeFormat(language, { dateStyle: 'full', timeZone: 'UTC' });
  const medium = new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeZone: 'UTC' });
  const unit = (amount: number, name: DateUnit) => t(`date.units.${name}`, { count: amount });
  const iso = (date: CalendarDate) =>
    `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;

  /** "7주 2일" (7일 이상일 때) */
  const weeksAndDays = (days: number) => {
    const abs = Math.abs(days);
    const weeks = Math.floor(abs / 7);
    const rest = abs % 7;
    if (weeks === 0) return '';
    return rest ? `${unit(weeks, 'week')} ${unit(rest, 'day')}` : unit(weeks, 'week');
  };

  /** 오늘과의 거리: "51일 뒤", "3일 전", "오늘" */
  const relative = (days: number) =>
    days === 0 ? t('date.today') : t(days > 0 ? 'date.after' : 'date.before', { duration: unit(Math.abs(days), 'day') });

  /** 답의 제목과 설명 */
  const describe = (answer: DateAnswer, today: CalendarDate) => {
    if (answer.kind === 'date') {
      const { query } = answer;
      const title = full.format(utc(answer.date));
      if (query.kind === 'shift' && answer.base) {
        const base = differenceInDays(today, answer.base) === 0 ? t('date.today') : medium.format(utc(answer.base));
        const step = `${base} ${query.direction > 0 ? '+' : '−'} ${unit(query.amount, query.unit)}`;
        return { title, detail: query.countsStartDay ? `${step} · ${t('date.countsStartDay')}` : step };
      }
      return { title, detail: relative(differenceInDays(today, answer.date)) };
    }
    const { days, query } = answer;
    if (query.kind === 'until') {
      const title = days === 0 ? t('date.isToday') : t(days > 0 ? 'date.daysLeft' : 'date.daysAgo', { count: Math.abs(days) });
      return { title, detail: `${t('date.today')} → ${medium.format(utc(answer.to))}` };
    }
    return {
      title: unit(Math.abs(days), 'day'),
      detail: `${medium.format(utc(answer.from))} → ${medium.format(utc(answer.to))}`,
    };
  };

  return { t, full, medium, utc, iso, unit, weeksAndDays, relative, describe };
}
