// src/features/search/hooks/useWorldTimeText.ts
// 세계 시각의 화면 문구와 답(보일 시각, 날짜 표시, 시간 차이). 결과 줄·미리보기·복사가 함께 쓴다.
import { useTranslation } from 'react-i18next';
import { useSystemLocale } from '../../../utils/systemLocale';
import type { WorldTimeResult } from './useWorldTime';
import { regionOf, weatherUnits } from '../utils/weatherForecast';
import { convertTime, dayDifference, offsetAt, wallTimeAt, type ResolvedZone } from '../utils/worldTime';

/** 화면 문구. 시각 형식은 macOS 언어 및 지역 설정(24시간 표시)을 따른다. */
export function useWorldTimeText() {
  const { t, i18n } = useTranslation('search');
  const language = i18n.resolvedLanguage ?? i18n.language;
  const system = useSystemLocale();
  const region = regionOf(system, typeof navigator === 'undefined' ? language : navigator.language);
  const { hourCycle } = weatherUnits(system, language, region);

  /** 고정 오프셋 시간대는 Intl이 모르므로 그만큼 옮긴 시각을 UTC로 쓴다. */
  const format = (zone: ResolvedZone, instant: number, options: Intl.DateTimeFormatOptions) =>
    zone.timeZone
      ? new Intl.DateTimeFormat(language, { ...options, timeZone: zone.timeZone }).format(instant)
      : new Intl.DateTimeFormat(language, { ...options, timeZone: 'UTC' }).format(instant + (zone.offsetMinutes ?? 0) * 60000);

  const duration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours && rest) return t('time.hoursMinutes', { hours, minutes: rest });
    return hours ? t('time.hours', { count: hours }) : t('time.minutes', { count: rest });
  };

  return {
    t,
    name: (zone: ResolvedZone) => zone.label || t('time.here'),
    time: (zone: ResolvedZone, instant: number) => format(zone, instant, { hour: 'numeric', minute: '2-digit', hourCycle }),
    date: (zone: ResolvedZone, instant: number) => format(zone, instant, { weekday: 'short', month: 'short', day: 'numeric' }),
    /** 기준 시간대와의 차이: "14시간 느림", "5시간 30분 빠름", "같은 시각" */
    difference: (zone: ResolvedZone, base: ResolvedZone, instant: number) => {
      const diff = offsetAt(zone, instant) - offsetAt(base, instant);
      if (diff === 0) return t('time.same');
      return t(diff > 0 ? 'time.ahead' : 'time.behind', { duration: duration(Math.abs(diff)) });
    },
    /** 날짜가 다르면 "내일", "어제", "다음 날"처럼 알린다. relativeToToday면 오늘 기준, 아니면 출발 날짜 기준. */
    dayLabel: (shift: number, relativeToToday: boolean) => {
      if (shift === 0) return '';
      if (relativeToToday) return t(shift > 0 ? 'time.tomorrow' : 'time.yesterday');
      return t(shift > 0 ? 'time.nextDay' : 'time.previousDay');
    },
  };
}

type Ready = Extract<WorldTimeResult, { status: 'ready' }>;

/** 결과 줄·미리보기·복사가 함께 쓰는 답: 보일 시각과 그 순간 */
export function describeWorldTime(result: Ready, text: ReturnType<typeof useWorldTimeText>, now: number) {
  const { query, from, to } = result;
  if (query.kind === 'now') {
    const shift = dayDifference(wallTimeAt(from, now), wallTimeAt(to, now));
    return {
      instant: now,
      value: text.time(to, now),
      day: text.dayLabel(shift, true),
      detail: [text.name(to), to.detail, text.difference(to, from, now)].filter(Boolean).join(' · '),
    };
  }
  const conversion = convertTime(query.time, from, to, now);
  return {
    instant: conversion.instant,
    value: text.time(to, conversion.instant),
    day: text.dayLabel(conversion.dayShift, false),
    detail: `${text.name(from)} ${text.time(from, conversion.instant)} → ${text.name(to)}`,
  };
}

/** Enter·복사 버튼이 클립보드에 넣는 글자: 시각과, 날짜가 다르면 그 표시 */
export function worldTimeCopyText(result: Ready, text: ReturnType<typeof useWorldTimeText>, now: number): string {
  const { value, day } = describeWorldTime(result, text, now);
  return day ? `${value} (${day})` : value;
}
