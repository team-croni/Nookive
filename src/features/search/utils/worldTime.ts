// src/features/search/utils/worldTime.ts
// 시간대 계산. IANA 시간대는 Intl이 일광 절약 시간까지 처리하고, "UTC+9" 같은 고정 오프셋은 그대로 더한다.
// 네트워크 없이 동작한다.
import type { ClockTime } from './timeQuery';

/** 시간대가 정해진 곳. timeZone(IANA)이나 offsetMinutes(고정 오프셋) 중 하나가 있다. */
export interface ResolvedZone {
  /** 화면에 보일 이름 (지명, 약어, "내 시간") */
  label: string;
  /** 상위 지역 설명 (예: "뉴욕주, 미국") */
  detail?: string;
  timeZone?: string;
  offsetMinutes?: number;
}

export interface WallTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function wallTimeIn(timeZone: string, instant: number): WallTime {
  let format = partsFormatters.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    });
    partsFormatters.set(timeZone, format);
  }
  const value = (type: string) => Number(format.formatToParts(instant).find((part) => part.type === type)?.value);
  return { year: value('year'), month: value('month'), day: value('day'), hour: value('hour') % 24, minute: value('minute') };
}

/** 그 시각에 그곳의 UTC 오프셋(분) */
export function offsetAt(zone: ResolvedZone, instant: number): number {
  if (zone.offsetMinutes !== undefined) return zone.offsetMinutes;
  const wall = wallTimeIn(zone.timeZone ?? 'UTC', instant);
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  return Math.round((asUtc - Math.floor(instant / 60000) * 60000) / 60000);
}

/** 그 시각에 그곳의 벽시계 시각 */
export function wallTimeAt(zone: ResolvedZone, instant: number): WallTime {
  if (zone.offsetMinutes === undefined) return wallTimeIn(zone.timeZone ?? 'UTC', instant);
  const shifted = new Date(instant + zone.offsetMinutes * 60000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

/** 그곳의 벽시계 시각이 가리키는 순간. 일광 절약 시간이 바뀌는 날도 맞도록 오프셋을 한 번 더 확인한다. */
export function instantOf(zone: ResolvedZone, wall: WallTime): number {
  const guess = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  const first = guess - offsetAt(zone, guess) * 60000;
  const second = guess - offsetAt(zone, first) * 60000;
  return second;
}

/** 두 날짜(벽시계)의 날짜 차이. 1이면 다음 날, -1이면 전날 */
export function dayDifference(a: WallTime, b: WallTime): number {
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86400000);
}

export interface Conversion {
  instant: number;
  from: WallTime;
  to: WallTime;
  /** 도착 날짜가 출발 날짜보다 며칠 뒤인지 */
  dayShift: number;
}

/** 출발지의 오늘 그 시각을 도착지 시각으로 바꾼다. */
export function convertTime(time: ClockTime, from: ResolvedZone, to: ResolvedZone, now: number): Conversion {
  const today = wallTimeAt(from, now);
  const fromWall = { ...today, hour: time.hour, minute: time.minute };
  const instant = instantOf(from, fromWall);
  const toWall = wallTimeAt(to, instant);
  return { instant, from: fromWall, to: toWall, dayShift: dayDifference(fromWall, toWall) };
}

/** UTC 오프셋 표시: "GMT+9", "GMT+5:30", "GMT-3:30" */
export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  const rest = abs % 60;
  return `GMT${sign}${Math.floor(abs / 60)}${rest ? `:${String(rest).padStart(2, '0')}` : ''}`;
}
