// src/features/search/utils/dateQuery.ts
// 날짜 질문을 알아보고 Mac에서 계산한다. 네트워크를 쓰지 않는다.
// 예: "100일 후", "3 weeks ago", "크리스마스까지", "2026-12-25 - 2026-11-04", "2026-12-25 무슨 요일",
//     "2026-03-01부터 100일"(시작일을 1일로 세는 기념일)
//
// - 날짜만, 숫자만, 기간만("100일") 입력하면 결과를 내지 않는다. ("2026-11-03" 같은 파일 이름을 날짜 질문으로 보지 않는다)
// - 달 이름은 9개 언어 모두 Intl에서 만든다. "12/25"처럼 숫자만 쓴 날짜의 순서는 macOS 지역을 따른다.
//
// 이 파일의 한국어·중국어·일본어 단어는 번역 문구가 아니라 검색어를 알아보기 위한 입력 단어다.
import { supportedLocales } from '../../../i18n/supportedLocales';

export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

export type DateUnit = 'day' | 'week' | 'month' | 'year';

/** 검색어 속 날짜. 연도가 없으면 계산할 때 정한다. */
export type DateRef =
  | { kind: 'relative'; days: number }
  | { kind: 'date'; year?: number; month: number; day: number };

export type DateQuery =
  | { kind: 'shift'; base: DateRef; amount: number; unit: DateUnit; direction: 1 | -1; countsStartDay: boolean }
  | { kind: 'until'; target: DateRef }
  | { kind: 'between'; from: DateRef; to: DateRef }
  | { kind: 'weekday'; date: DateRef };

export interface DateParseOptions {
  /** "12/25"처럼 숫자만 쓴 날짜에서 일이 먼저인지 (macOS 지역으로 정한다) */
  dayFirst?: boolean;
}

// ── 단어 ──────────────────────────────────────────────────────────────

const RELATIVE_DAYS: Record<string, number> = {
  오늘: 0, 내일: 1, 모레: 2, 글피: 3, 어제: -1, 그제: -2, 그저께: -2,
  today: 0, now: 0, tomorrow: 1, yesterday: -1,
  heute: 0, morgen: 1, übermorgen: 2, gestern: -1,
  "aujourd'hui": 0, demain: 1, 'après-demain': 2, hier: -1,
  hoy: 0, mañana: 1, 'pasado mañana': 2, ayer: -1,
  hoje: 0, amanhã: 1, 'depois de amanhã': 2, ontem: -1,
  今日: 0, 明日: 1, 明後日: 2, 昨日: -1,
  今天: 0, 明天: 1, 后天: 2, 後天: 2, 昨天: -1,
};

/** 해마다 같은 날인 기념일 */
const NAMED_DAYS: Record<string, [number, number]> = {
  크리스마스: [12, 25], 성탄절: [12, 25], christmas: [12, 25], weihnachten: [12, 25], noël: [12, 25], noel: [12, 25],
  navidad: [12, 25], natal: [12, 25], クリスマス: [12, 25], 圣诞节: [12, 25], 聖誕節: [12, 25],
  새해: [1, 1], 신정: [1, 1], "new year's day": [1, 1], 'new year': [1, 1], neujahr: [1, 1], "jour de l'an": [1, 1],
  'año nuevo': [1, 1], 'ano novo': [1, 1], 元日: [1, 1], 元旦: [1, 1], 新年: [1, 1],
  'christmas eve': [12, 24], 'new year’s eve': [12, 31], "new year's eve": [12, 31], 'silvester': [12, 31],
};

const UNIT_WORDS: Array<[RegExp, DateUnit]> = [
  [/^(?:일|days?|tage?n?|jours?|días?|dias?|日|天)$/u, 'day'],
  [/^(?:주|주일|weeks?|wochen?|semaines?|semanas?|週間?|周|週)$/u, 'week'],
  [/^(?:개월|달|months?|monate?n?|mois|mes(?:es)?|mês|meses|か月|ヶ月|ヵ月|个月|個月|月)$/u, 'month'],
  [/^(?:년|해|years?|jahre?n?|ans?|années?|años?|anos?|年)$/u, 'year'],
];
const unitOf = (word: string): DateUnit | null => UNIT_WORDS.find(([pattern]) => pattern.test(word))?.[1] ?? null;

/** 9개 언어의 달 이름(긴 이름, 줄임)을 Intl에서 만든다. "déc." → "déc" */
const MONTH_NAMES: Map<string, number> = (() => {
  const names = new Map<string, number>();
  for (const locale of supportedLocales) {
    for (const style of ['long', 'short'] as const) {
      const format = new Intl.DateTimeFormat(locale, { month: style, timeZone: 'UTC' });
      for (let month = 1; month <= 12; month += 1) {
        const name = format.format(Date.UTC(2026, month - 1, 15)).toLocaleLowerCase().replace(/\.$/, '');
        // 숫자가 들어간 이름("12월", "12月")은 숫자 날짜 규칙이 처리한다.
        if (!/\d/.test(name)) names.set(name, month);
      }
    }
  }
  return names;
})();

// ── 날짜 하나 읽기 ────────────────────────────────────────────────────

const isValidDate = (year: number, month: number, day: number) =>
  month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);

function dateRef(year: number | undefined, month: number, day: number): DateRef | null {
  if (year !== undefined && (year < 1000 || year > 9999)) return null;
  // 연도가 없으면 윤년(2028)으로 확인해 2월 29일도 받는다.
  return isValidDate(year ?? 2028, month, day) ? { kind: 'date', year, month, day } : null;
}

function parseDateRef(raw: string, options: DateParseOptions): DateRef | null {
  const text = raw.trim().replace(/[,]/g, ' ').replace(/\s+/g, ' ').replace(/^(?:the|le|el|o|der|am)\s+/, '');
  if (!text) return null;
  if (text in RELATIVE_DAYS) return { kind: 'relative', days: RELATIVE_DAYS[text] };
  if (text in NAMED_DAYS) {
    const [month, day] = NAMED_DAYS[text];
    return { kind: 'date', month, day };
  }
  let m = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})\.?$/.exec(text);
  if (m) return dateRef(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(?:(\d{4})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일$/.exec(text);
  if (m) return dateRef(m[1] ? Number(m[1]) : undefined, Number(m[2]), Number(m[3]));
  m = /^(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*[日号號]$/.exec(text);
  if (m) return dateRef(m[1] ? Number(m[1]) : undefined, Number(m[2]), Number(m[3]));
  // "december 25 2026", "dec 25th"
  m = /^([\p{L}]+)\.? (\d{1,2})(?:st|nd|rd|th)?(?: (\d{4}))?$/u.exec(text);
  if (m && MONTH_NAMES.has(m[1])) return dateRef(m[3] ? Number(m[3]) : undefined, MONTH_NAMES.get(m[1])!, Number(m[2]));
  // "25 december 2026", "25. dezember", "25 de diciembre de 2026"
  m = /^(\d{1,2})\.?(?: de)? ([\p{L}]+)\.?(?: de)?(?: (\d{4}))?$/u.exec(text);
  if (m && MONTH_NAMES.has(m[2])) return dateRef(m[3] ? Number(m[3]) : undefined, MONTH_NAMES.get(m[2])!, Number(m[1]));
  // "12/25", "25/12/2026": 순서는 지역을 따른다.
  m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(text);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    return options.dayFirst ? dateRef(m[3] ? Number(m[3]) : undefined, b, a) : dateRef(m[3] ? Number(m[3]) : undefined, a, b);
  }
  return null;
}

// ── 질문 읽기 ────────────────────────────────────────────────────────

/** "100일 후", "3 weeks ago", "in 2 months", "100日後", "3天前" → 오늘 기준 이동 */
function parseShiftFromToday(text: string): DateQuery | null {
  const patterns: Array<[RegExp, 1 | -1]> = [
    [/^(\d+)\s*([\p{L}]+?)\s*(?:후|뒤|이후|later|after|from (?:today|now)|später|plus tard|después|depois|後|后|以后|以後)$/u, 1],
    [/^(\d+)\s*([\p{L}]+?)\s*(?:전|이전|ago|before|früher|avant|antes|前|以前)$/u, -1],
    [/^(?:in|dans|en|dentro de|em|daqui a|nach)\s+(\d+)\s+([\p{L}]+)$/u, 1],
    [/^(?:vor|il y a|hace|há)\s+(\d+)\s+([\p{L}]+)$/u, -1],
  ];
  for (const [pattern, direction] of patterns) {
    const m = pattern.exec(text);
    const unit = m ? unitOf(m[2]) : null;
    if (m && unit) return { kind: 'shift', base: { kind: 'relative', days: 0 }, amount: Number(m[1]), unit, direction, countsStartDay: false };
  }
  return null;
}

/** "2026-12-25 + 30 days", "2026-03-01부터 100일 후", "2026-03-01부터 100일"(기념일), "30 days after 2026-12-25" */
function parseShiftFromDate(text: string, options: DateParseOptions): DateQuery | null {
  let m = /^(.+?)\s*([+-])\s*(\d+)\s*([\p{L}]+)$/u.exec(text);
  if (m) {
    const base = parseDateRef(m[1], options);
    const unit = unitOf(m[4]);
    if (base && unit) return { kind: 'shift', base, amount: Number(m[3]), unit, direction: m[2] === '-' ? -1 : 1, countsStartDay: false };
  }
  m = /^(.+?)(?:부터|에서|から|起)\s*(\d+)\s*([\p{L}]+?)\s*(후|뒤|전|째|後|后|前)?$/u.exec(text);
  if (m) {
    const base = parseDateRef(m[1], options);
    const unit = unitOf(m[3]);
    if (base && unit) {
      // "~부터 100일"은 한국식 기념일: 시작일을 1일로 센다. ("~부터 100일 후"는 그냥 100일 뒤)
      const countsStartDay = unit === 'day' && (!m[4] || m[4] === '째');
      return { kind: 'shift', base, amount: Number(m[2]), unit, direction: m[4] === '전' || m[4] === '前' ? -1 : 1, countsStartDay };
    }
  }
  m = /^(\d+)\s+([\p{L}]+)\s+(after|before|nach|vor|après|avant|después de|antes de|depois de)\s+(.+)$/u.exec(text);
  if (m) {
    const base = parseDateRef(m[4], options);
    const unit = unitOf(m[2]);
    if (base && unit) {
      const direction = /^(?:before|vor|avant|antes de)$/.test(m[3]) ? -1 : 1;
      return { kind: 'shift', base, amount: Number(m[1]), unit, direction, countsStartDay: false };
    }
  }
  return null;
}

function parseUntil(text: string, options: DateParseOptions): DateQuery | null {
  const patterns = [
    /^(.+?)\s*까지(?:\s*(?:며칠|몇\s*일|남은\s*날(?:짜)?|디데이|d-day))?$/u,
    /^(?:how many )?days (?:until|till|to|left until) (.+)$/,
    /^(?:wie viele )?tage bis (.+)$/,
    /^(?:combien de )?jours (?:avant|jusqu'à|jusqu’à) (.+)$/,
    /^(?:cuántos |cuantos )?días (?:hasta|para) (.+)$/,
    /^(?:quantos )?dias (?:até|para) (.+)$/,
    /^(.+?)まで(?:あと)?(?:何日)?$/,
    /^(?:距离|距離|到)?(.+?)还有(?:几天|多少天)?$/,
    /^(?:距离|距離|到)?(.+?)還有(?:幾天|多少天)?$/,
  ];
  for (const pattern of patterns) {
    const m = pattern.exec(text);
    if (!m) continue;
    const target = parseDateRef(m[1], options);
    // "오늘까지"는 묻는 날이 없다.
    if (target && !(target.kind === 'relative' && target.days === 0)) return { kind: 'until', target };
  }
  return null;
}

function parseBetween(text: string, options: DateParseOptions): DateQuery | null {
  const patterns = [
    /^(.+?)\s+-\s+(.+)$/,
    /^(.+?)\s*부터\s*(.+?)\s*까지(?:\s*(?:며칠|몇\s*일))?$/u,
    /^(?:days )?(?:between|from) (.+?) (?:and|to|until) (.+)$/,
    /^(.+?)から(.+?)まで(?:何日)?$/,
    /^从(.+?)到(.+?)(?:有几天|多少天)?$/,
    /^從(.+?)到(.+?)(?:有幾天|多少天)?$/,
  ];
  for (const pattern of patterns) {
    const m = pattern.exec(text);
    if (!m) continue;
    const from = parseDateRef(m[1], options);
    const to = parseDateRef(m[2], options);
    if (!from || !to) continue;
    // 빼기는 "2026-12-25 - 2026-11-04"처럼 연도까지 쓴 두 날짜만 받는다. (계산식과 헷갈리지 않게)
    if (pattern === patterns[0] && !(isExplicit(from) && isExplicit(to))) continue;
    return { kind: 'between', from, to };
  }
  return null;
}

const isExplicit = (ref: DateRef) => ref.kind === 'date' && ref.year !== undefined;

function parseWeekday(text: string, options: DateParseOptions): DateQuery | null {
  const patterns = [
    /^(.+?)\s*(?:은|는)?\s*무슨\s*요일(?:이야|이에요)?$/u,
    /^(.+?)\s*요일$/u,
    /^what day (?:of the week )?is (.+)$/,
    /^(.+?) day of (?:the )?week$/,
    /^welcher wochentag ist (.+)$/,
    /^quel jour (?:de la semaine )?(?:est|sera|était) (.+)$/,
    /^qué día (?:de la semana )?(?:es|será|fue) (.+)$/,
    /^que dia (?:da semana )?(?:é|será|foi) (.+)$/,
    /^(.+?)は?何曜日$/,
    /^(.+?)是?星期[几幾]$/,
  ];
  for (const pattern of patterns) {
    const m = pattern.exec(text);
    if (!m) continue;
    const date = parseDateRef(m[1], options);
    if (date) return { kind: 'weekday', date };
  }
  return null;
}

/** 날짜 질문이면 해석 결과를, 아니면 null을 돌려준다. */
export function parseDateQuery(input: string, options: DateParseOptions = {}): DateQuery | null {
  const text = input.normalize('NFC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
  if (!text || text.length > 80) return null;
  return (
    parseShiftFromToday(text)
    ?? parseShiftFromDate(text, options)
    ?? parseUntil(text, options)
    ?? parseWeekday(text, options)
    ?? parseBetween(text, options)
  );
}

// ── 계산 ────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const toDayNumber = (date: CalendarDate) => Date.UTC(date.year, date.month - 1, date.day) / DAY_MS;
function fromDayNumber(days: number): CalendarDate {
  const value = new Date(days * DAY_MS);
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() };
}

export const differenceInDays = (from: CalendarDate, to: CalendarDate) => toDayNumber(to) - toDayNumber(from);

/** 달·해를 더할 때 없는 날은 그 달의 마지막 날로 맞춘다. (1월 31일 + 1개월 = 2월 28일, 2월 29일 + 1년 = 2월 28일) */
export function addToDate(date: CalendarDate, amount: number, unit: DateUnit): CalendarDate {
  if (unit === 'day' || unit === 'week') return fromDayNumber(toDayNumber(date) + amount * (unit === 'week' ? 7 : 1));
  const months = date.year * 12 + (date.month - 1) + amount * (unit === 'year' ? 12 : 1);
  const year = Math.floor(months / 12);
  const month = (months % 12) + 1;
  return { year, month, day: Math.min(date.day, daysInMonth(year, month)) };
}

/** 0 = 일요일 */
export const weekdayOf = (date: CalendarDate) => new Date(toDayNumber(date) * DAY_MS).getUTCDay();

/**
 * 날짜를 정한다. 연도가 없으면 올해로 보되, nextOccurrence면 오늘 이후 가장 가까운 그날로 본다.
 * (크리스마스까지 → 지났으면 내년 크리스마스)
 */
export function resolveDate(ref: DateRef, today: CalendarDate, nextOccurrence = false): CalendarDate | null {
  if (ref.kind === 'relative') return fromDayNumber(toDayNumber(today) + ref.days);
  if (ref.year !== undefined) return { year: ref.year, month: ref.month, day: ref.day };
  let year = today.year;
  if (nextOccurrence && differenceInDays(today, { year, month: ref.month, day: Math.min(ref.day, daysInMonth(year, ref.month)) }) < 0) {
    year += 1;
  }
  // 연도 없이 쓴 2월 29일은 그해가 윤년일 때만 있다.
  return isValidDate(year, ref.month, ref.day) ? { year, month: ref.month, day: ref.day } : null;
}

export type DateAnswer =
  | { kind: 'date'; date: CalendarDate; base?: CalendarDate; query: DateQuery }
  | { kind: 'days'; days: number; from: CalendarDate; to: CalendarDate; query: DateQuery };

/** 질문에 답한다. 날짜가 없는 날(연도 없는 2월 29일 등)이면 null. */
export function answerDateQuery(query: DateQuery, today: CalendarDate): DateAnswer | null {
  switch (query.kind) {
    case 'shift': {
      const base = resolveDate(query.base, today);
      if (!base) return null;
      // 시작일을 1일로 세면 100일째는 99일 뒤다.
      const amount = query.amount * query.direction - (query.countsStartDay ? 1 : 0);
      return { kind: 'date', date: addToDate(base, amount, query.unit), base, query };
    }
    case 'until': {
      const target = resolveDate(query.target, today, true);
      return target ? { kind: 'days', days: differenceInDays(today, target), from: today, to: target, query } : null;
    }
    case 'between': {
      const from = resolveDate(query.from, today);
      const to = resolveDate(query.to, today);
      return from && to ? { kind: 'days', days: differenceInDays(from, to), from, to, query } : null;
    }
    case 'weekday': {
      const date = resolveDate(query.date, today);
      return date ? { kind: 'date', date, query } : null;
    }
  }
}

/** "12/25"의 순서: 지역 형식에서 일이 달보다 먼저 오는지 */
export function isDayFirst(locale: string): boolean {
  try {
    const parts = new Intl.DateTimeFormat(locale, { month: 'numeric', day: 'numeric' }).formatToParts(Date.UTC(2026, 11, 25));
    return parts.findIndex((part) => part.type === 'day') < parts.findIndex((part) => part.type === 'month');
  } catch {
    return false;
  }
}
