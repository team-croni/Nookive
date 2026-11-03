// src/features/search/utils/timeQuery.ts
// 검색어가 다른 곳의 시각을 묻거나 시간대를 바꾸는지 판단한다. 네트워크 없이 동작한다.
// 예: "뉴욕 시간", "time in London", "東京 今何時", "3pm PST in KST", "뉴욕 오후 3시는 서울 몇 시"
//
// - 지금 시각: 지명 + 시각 단어. 한국어·중국어·일본어는 시각 단어가 끝에 오고, 라틴 문자 언어는 앞("time in X")이나
//   끝("X time")에 온다. 시각 단어만 입력하면("시간", "time") 결과를 내지 않는다.
// - 시간대 바꾸기: 시각(3pm, 15:00, 오후 3시, 午後3時, 下午3点) + 출발 시간대 + 도착 시간대.
//   시간대는 약어(KST, PST, UTC+9) 또는 지명이다. 출발이나 도착이 없으면 이 Mac의 시간대로 본다.
//
// 이 파일의 한국어·중국어·일본어 단어는 번역 문구가 아니라 검색어를 알아보기 위한 입력 단어다.

export interface ClockTime {
  hour: number;
  minute: number;
}

/** 시간대를 가리키는 말. 약어·UTC 오프셋은 바로 시간대가 되고, 그 밖에는 지명으로 찾는다. */
export type ZoneRef =
  | { kind: 'zone'; label: string; timeZone: string }
  | { kind: 'offset'; label: string; offsetMinutes: number }
  | { kind: 'place'; place: string };

export type TimeQuery =
  | { kind: 'now'; zone: ZoneRef }
  | { kind: 'convert'; time: ClockTime; from: ZoneRef | null; to: ZoneRef | null };

/** 흔한 시간대 약어 → IANA 시간대. 일광 절약 시간은 IANA 시간대가 처리하므로 PST·PDT는 같은 곳이다. */
const ZONE_ABBREVIATIONS: Record<string, string> = {
  UTC: 'UTC', GMT: 'UTC', Z: 'UTC',
  KST: 'Asia/Seoul', JST: 'Asia/Tokyo', HKT: 'Asia/Hong_Kong', SGT: 'Asia/Singapore',
  IST: 'Asia/Kolkata', ICT: 'Asia/Bangkok', WIB: 'Asia/Jakarta', PHT: 'Asia/Manila',
  AEST: 'Australia/Sydney', AEDT: 'Australia/Sydney', ACST: 'Australia/Adelaide', AWST: 'Australia/Perth',
  NZST: 'Pacific/Auckland', NZDT: 'Pacific/Auckland',
  CET: 'Europe/Paris', CEST: 'Europe/Paris', EET: 'Europe/Athens', EEST: 'Europe/Athens',
  WET: 'Europe/Lisbon', WEST: 'Europe/Lisbon', BST: 'Europe/London', MSK: 'Europe/Moscow',
  ET: 'America/New_York', EST: 'America/New_York', EDT: 'America/New_York',
  CT: 'America/Chicago', CST: 'America/Chicago', CDT: 'America/Chicago',
  MT: 'America/Denver', MST: 'America/Denver', MDT: 'America/Denver',
  PT: 'America/Los_Angeles', PST: 'America/Los_Angeles', PDT: 'America/Los_Angeles',
  AKST: 'America/Anchorage', AKDT: 'America/Anchorage', HST: 'Pacific/Honolulu',
  BRT: 'America/Sao_Paulo', ART: 'America/Argentina/Buenos_Aires',
};

/** 지금 시각을 묻는 말. 한국어·중국어·일본어는 끝에, 라틴 문자 언어는 앞이나 끝에 온다. */
const CJK_NOW_SUFFIXES = [
  '지금 몇 시야', '지금 몇시야', '지금 몇 시', '지금 몇시', '현재 시간', '현재 시각', '몇 시야', '몇시야', '몇 시', '몇시', '시간', '시각',
  '今何時', '現在時刻', 'の時刻', 'の時間', '時刻', '時間',
  '现在几点', '現在幾點', '几点了', '幾點了', '几点', '幾點', '时间', '時間',
];
const LATIN_NOW_PREFIXES = [
  'what time is it in', 'current time in', 'local time in', 'time in', 'time at',
  'wie spät ist es in', 'uhrzeit in', 'uhrzeit',
  "quelle heure est-il à", "quelle heure est-il a", 'heure locale à', 'heure à', 'heure a',
  'qué hora es en', 'que hora es en', 'hora en',
  'que horas são em', 'que horas sao em', 'horário em', 'horario em', 'horário de', 'hora em',
];
const LATIN_NOW_SUFFIXES = ['local time', 'time now', 'current time', 'time', 'uhrzeit'];

/**
 * "X 시간", "X time"에서 X가 지명이 아닌 흔한 말. 지명 검색을 보내지 않고 바로 거른다.
 * ("근무 시간", "screen time" 같은 파일 이름이나 메모가 날씨처럼 잠깐 불러오는 줄을 띄우지 않게)
 */
const NOT_PLACES = new Set([
  '지금', '현재', '오늘', '내일', '어제', '이번', '남은', '근무', '업무', '작업', '공부', '회의', '수업', '점심', '저녁', '출근', '퇴근',
  '운동', '여행', '비행', '이동', '대기', '소요', '처리', '실행', '응답', '로딩', '사용', '재생', '수면', '휴식', '마감', '예약', '영업',
  'screen', 'lunch', 'dinner', 'break', 'work', 'working', 'run', 'running', 'free', 'spare', 'real', 'up', 'down', 'load',
  'loading', 'build', 'compile', 'response', 'travel', 'flight', 'play', 'sleep', 'bed', 'show', 'game', 'tea', 'party',
  'story', 'prime', 'quality', 'family', 'me', 'my', 'next', 'last', 'this', 'what', 'local', 'current',
]);

/** 시간대 바꾸기에서 출발과 도착을 나누는 말 */
const SEPARATORS = /\s*(?:→|->|=>)\s*|\s+(?:in|to|into|as|nach|en|em|à|a|=)\s+/;

/** 숫자·기호가 섞이면 파일 이름에 가깝다. (지명에 쓰는 하이픈·점·아포스트로피는 허용) */
const looksLikePlace = (text: string) =>
  text.length <= 40 && text.split(' ').length <= 4 && /^[\p{L}\p{M}][\p{L}\p{M} '’.-]*$/u.test(text);

/** 약어(KST), UTC 오프셋(UTC+9, GMT-5:30), 또는 지명 */
function parseZone(raw: string): ZoneRef | null {
  const text = raw.trim().replace(/\s*(?:시간|기준|time|zone)$/i, '').trim();
  if (!text) return null;
  const offset = /^(?:utc|gmt)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/i.exec(text);
  if (offset) {
    const minutes = Number(offset[2]) * 60 + Number(offset[3] ?? 0);
    if (minutes > 14 * 60) return null;
    return { kind: 'offset', label: text.toUpperCase().replace(/\s+/g, ''), offsetMinutes: offset[1] === '-' ? -minutes : minutes };
  }
  const abbreviation = ZONE_ABBREVIATIONS[text.toUpperCase()];
  // 약어는 대문자로 쓴 경우만 받는다. (소문자 "et", "ct"는 다른 단어일 수 있다) UTC·GMT는 소문자도 받는다.
  if (abbreviation && (text === text.toUpperCase() || /^(utc|gmt)$/i.test(text))) {
    return { kind: 'zone', label: text.toUpperCase(), timeZone: abbreviation };
  }
  if (NOT_PLACES.has(text.toLocaleLowerCase())) return null;
  return looksLikePlace(text) ? { kind: 'place', place: text } : null;
}

const PM_WORDS = /^(?:pm|p\.m\.|오후|저녁|밤|午後|下午|晚上)$/i;
const AM_WORDS = /^(?:am|a\.m\.|오전|아침|새벽|午前|上午|早上)$/i;

function clock(hourText: string, minuteText: string | undefined, half: boolean, period: string | undefined): ClockTime | null {
  let hour = Number(hourText);
  const minute = half ? 30 : Number(minuteText ?? 0);
  if (!Number.isInteger(hour) || minute > 59) return null;
  if (period) {
    if (hour < 1 || hour > 12) return null;
    if (PM_WORDS.test(period) && hour < 12) hour += 12;
    if (AM_WORDS.test(period) && hour === 12) hour = 0;
  } else if (hour > 24) {
    return null;
  }
  if (hour === 24) hour = 0;
  return { hour, minute };
}

/** 검색어 안의 시각 한 곳을 찾는다. 숫자만 있으면 시각으로 보지 않는다. ("3"은 시각이 아님) */
function findTime(text: string): { time: ClockTime; start: number; end: number } | null {
  const patterns: Array<[RegExp, (m: RegExpExecArray) => ClockTime | null]> = [
    // 오후 3시 30분, 3시 반, 15시
    [/(?:(오전|오후|아침|저녁|밤|새벽)\s*)?(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분|\s*(반))?/, (m) => clock(m[2], m[3], Boolean(m[4]), m[1])],
    // 午後3時30分, 15時
    [/(?:(午前|午後)\s*)?(\d{1,2})\s*時(?:\s*(\d{1,2})\s*分|(半))?/, (m) => clock(m[2], m[3], Boolean(m[4]), m[1])],
    // 下午3点, 15點30分
    [/(?:(上午|下午|早上|晚上|中午)\s*)?(\d{1,2})\s*[点點](?:\s*(\d{1,2})\s*分|(半))?/, (m) => clock(m[2], m[3], Boolean(m[4]), m[1] === '中午' ? '下午' : m[1])],
    // 3pm, 3:30 p.m., 15:00
    [/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)(?=\s|$)/i, (m) => clock(m[1], m[2], false, m[3])],
    [/\b(\d{1,2}):(\d{2})\b/, (m) => clock(m[1], m[2], false, undefined)],
    // 15h30 (프랑스어), 15 Uhr (독일어)
    [/\b(\d{1,2})h(\d{2})?\b/i, (m) => clock(m[1], m[2], false, undefined)],
    [/\b(\d{1,2})\s*uhr(?:\s*(\d{2}))?\b/i, (m) => clock(m[1], m[2], false, undefined)],
  ];
  for (const [pattern, toClock] of patterns) {
    const match = pattern.exec(text);
    if (!match) continue;
    const time = toClock(match);
    if (time) return { time, start: match.index, end: match.index + match[0].length };
  }
  return null;
}

/** "뉴욕 오후 3시는 서울 몇 시", "뉴욕 오후 3시를 서울로"의 뒤쪽(도착)에서 붙은 말을 뗀다. */
const stripTargetWords = (text: string) =>
  text
    .replace(/\s*(?:몇\s*시야?|몇시야?|시간으로|시각으로|시간|시각)\s*$/, '')
    .replace(/(?:으로|로)$/, '')
    .trim();

function parseConversion(text: string): TimeQuery | null {
  const found = findTime(text);
  if (!found) return null;
  const before = text.slice(0, found.start).trim().replace(/(?:의|에서|기준)$/, '').trim();
  let after = text.slice(found.end).trim();

  // 시각 바로 뒤의 한국어 조사: "오후 3시는 서울 몇 시", "오후 3시를 서울로"
  let target = '';
  const particle = /^(?:은|는|이|가|을|를)\s+/.exec(after);
  if (particle) {
    target = stripTargetWords(after.slice(particle[0].length));
    after = '';
  } else {
    // 앞에 공백을 붙여 "in Tokyo"처럼 구분어로 시작해도 나눈다.
    const parts = ` ${after}`.split(SEPARATORS);
    if (parts.length > 2) return null;
    if (parts.length === 2) {
      target = stripTargetWords(parts[1]);
      after = parts[0].trim();
    } else if (before && SEPARATORS.test(` ${before} `)) {
      return null;
    }
  }

  // 출발: 시각 앞이나 뒤 (둘 다 있으면 시각으로 보지 않는다)
  if (before && after) return null;
  const sourceText = before || after;
  const from = sourceText ? parseZone(sourceText) : null;
  const to = target ? parseZone(target) : null;
  if (sourceText && !from) return null;
  if (target && !to) return null;
  // 시간대가 하나도 없으면 시간대 바꾸기가 아니다. ("오후 3시"만으로는 결과를 내지 않는다)
  if (!from && !to) return null;
  // 출발만 지명이고 도착이 없으면 "뉴욕 오후 3시" 같은 일정 메모일 수 있어, 약어일 때만 받는다. ("3pm PST")
  if (from?.kind === 'place' && !to) return null;
  return { kind: 'convert', time: found.time, from, to };
}

function parseNow(text: string): TimeQuery | null {
  for (const suffix of CJK_NOW_SUFFIXES) {
    if (!text.endsWith(suffix)) continue;
    const place = text.slice(0, -suffix.length).trim().replace(/(?:의|の|的)$/, '').trim();
    // "3시간"처럼 숫자 뒤에 붙은 "시간"은 지명 질문이 아니다.
    if (!place || /\d$/.test(place)) return null;
    const zone = parseZone(place);
    return zone ? { kind: 'now', zone } : null;
  }
  for (const prefix of LATIN_NOW_PREFIXES) {
    if (!text.startsWith(`${prefix} `)) continue;
    const zone = parseZone(text.slice(prefix.length));
    return zone ? { kind: 'now', zone } : null;
  }
  for (const suffix of LATIN_NOW_SUFFIXES) {
    if (!text.endsWith(` ${suffix}`)) continue;
    const zone = parseZone(text.slice(0, -suffix.length));
    return zone ? { kind: 'now', zone } : null;
  }
  return null;
}

/** 다른 곳의 시각을 묻거나 시간대를 바꾸는 검색어면 해석 결과를, 아니면 null을 돌려준다. */
export function parseTimeQuery(input: string): TimeQuery | null {
  const original = input.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!original || original.length > 80) return null;
  // 약어는 대소문자를 보고 지명은 원래 모양을 지켜야 하므로, 단어 비교에만 소문자를 쓴다.
  const lower = original.toLocaleLowerCase();
  const conversion = parseConversion(original);
  if (conversion) return conversion;
  const now = parseNow(lower);
  return now ? withOriginalCase(now, original) : null;
}

/** 소문자로 찾은 지명·약어를 원래 입력의 대소문자로 되돌린다. */
function withOriginalCase(query: TimeQuery, original: string): TimeQuery | null {
  if (query.kind !== 'now') return query;
  const { zone } = query;
  if (zone.kind === 'place') {
    const start = original.toLocaleLowerCase().indexOf(zone.place);
    const place = start >= 0 ? original.slice(start, start + zone.place.length) : zone.place;
    // 원래 입력에서 약어로 썼다면 약어로 본다. ("KST 시간")
    return { kind: 'now', zone: parseZone(place) ?? zone };
  }
  return query;
}
