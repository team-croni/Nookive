// src/features/search/utils/weatherQuery.ts
// 검색어가 날씨를 묻는지 판단하고 지명과 기간을 꺼낸다. 네트워크 없이 동작한다.
// 예: "수원 날씨", "구로 내일 날씨", "오늘날씨", "weather in Paris", "東京の天気", "北京明天天气"
//
// - 날씨 단어는 9개 화면 언어의 단어를 모두 받는다. (화면 언어와 다른 언어로 입력해도 된다)
//   tempo·tiempo·clima는 다른 뜻으로도 흔해서 날씨 단어로 보지 않는다. (스페인어·포르투갈어는 previsão, el tiempo 등)
// - 한국어·중국어·일본어는 날씨 단어가 끝에 와야 한다. ("날씨 메모" 같은 파일 이름을 날씨로 보지 않는다)
//   라틴 문자 언어는 앞에 와도 된다. ("weather london")
// - 날씨 단어만 입력하면 날씨로 보지 않는다. macOS 날씨 앱("날씨", "Weather")을 열려는 입력이기 때문이다.
//   지역 없이 물으려면 기간을 붙인다. ("오늘 날씨")
//
// 이 파일의 한국어·중국어·일본어 단어는 번역 문구가 아니라 검색어를 알아보기 위한 입력 단어다.

export type WeatherPeriod = 'today' | 'tomorrow' | 'dayAfter' | 'week' | 'weekend';

export interface WeatherQuery {
  /** 지명. 없으면 설정의 기본 지역을 쓴다. */
  place: string | null;
  /** 기간. 없으면 지금 날씨를 보여준다. */
  period: WeatherPeriod | null;
}

/** 공백 없이 붙여 쓰는 문자(한글·한자·가나)로 된 날씨 단어. 끝에 와야 한다. */
const CJK_WEATHER_WORDS = ['일기예보', '날씨', '天気予報', '天気', '天气预报', '天气', '天氣預報', '天氣'];
/** 라틴 문자 날씨 단어(여러 단어 가능). 앞이나 끝에 단어 단위로 온다. */
const LATIN_WEATHER_WORDS = [
  'weather forecast',
  'weather',
  'wetter',
  'météo',
  'meteo',
  'el tiempo',
  'pronóstico del tiempo',
  'previsão do tempo',
  'previsao do tempo',
];

/** 기간 단어. 긴 것부터 찾는다. */
const PERIOD_WORDS: ReadonlyArray<[string, WeatherPeriod]> = [
  // 한국어
  ['이번 주말', 'weekend'], ['이번주말', 'weekend'], ['주말', 'weekend'],
  ['이번 주', 'week'], ['이번주', 'week'], ['금주', 'week'], ['일주일', 'week'], ['주간', 'week'],
  ['오늘', 'today'], ['내일', 'tomorrow'], ['모레', 'dayAfter'],
  // 일본어
  ['今週末', 'weekend'], ['週末', 'weekend'], ['今週', 'week'], ['明後日', 'dayAfter'], ['明日', 'tomorrow'], ['今日', 'today'],
  // 중국어 (간체·번체)
  ['这周末', 'weekend'], ['這週末', 'weekend'], ['周末', 'weekend'], ['週末', 'weekend'],
  ['本周', 'week'], ['这周', 'week'], ['本週', 'week'], ['這週', 'week'],
  ['后天', 'dayAfter'], ['後天', 'dayAfter'], ['明天', 'tomorrow'], ['今天', 'today'],
  // 영어
  ['this weekend', 'weekend'], ['weekend', 'weekend'], ['this week', 'week'], ['next 7 days', 'week'],
  ['day after tomorrow', 'dayAfter'], ['tomorrow', 'tomorrow'], ['today', 'today'], ['now', 'today'],
  // 독일어
  ['übermorgen', 'dayAfter'], ['am wochenende', 'weekend'], ['wochenende', 'weekend'], ['diese woche', 'week'],
  ['morgen', 'tomorrow'], ['heute', 'today'],
  // 프랑스어
  ['après-demain', 'dayAfter'], ['ce week-end', 'weekend'], ['week-end', 'weekend'], ['cette semaine', 'week'],
  ['demain', 'tomorrow'], ["aujourd'hui", 'today'],
  // 스페인어
  ['pasado mañana', 'dayAfter'], ['fin de semana', 'weekend'], ['esta semana', 'week'], ['mañana', 'tomorrow'], ['hoy', 'today'],
  // 포르투갈어
  ['depois de amanhã', 'dayAfter'], ['fim de semana', 'weekend'], ['esta semana', 'week'], ['amanhã', 'tomorrow'], ['hoje', 'today'],
];

/** 지명과 날씨·기간 단어 사이에 오는 말. 남은 지명의 앞뒤에서 뗀다. */
const LATIN_CONNECTORS = ['in', 'for', 'at', 'of', 'für', 'à', 'a', 'de', 'du', 'en', 'em', 'do', 'da', 'no', 'na', 'para', 'pour', 'el', 'la'];
const CJK_CONNECTORS = ['의', 'の', '的'];

/** 날씨 단어 뒤에 붙어 다른 뜻이 되는 라틴 단어. ("weather app"은 지명이 아니다) */
const NOT_PLACES = new Set([
  'app', 'apps', 'api', 'icon', 'icons', 'widget', 'report', 'radar', 'map', 'maps', 'data', 'station', 'chart',
  'forecast', 'channel', 'news', 'kit', 'weatherkit', 'json', 'demo', 'test', 'code', 'project', 'service',
]);

const isCjk = (char: string) => /[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(char);

/** 라틴 단어 경계: 앞뒤가 문자·숫자가 아니어야 한다. */
function findLatinWord(text: string, word: string): number {
  let from = 0;
  while (from <= text.length) {
    const index = text.indexOf(word, from);
    if (index < 0) return -1;
    const before = text[index - 1];
    const after = text[index + word.length];
    const bounded = (char: string | undefined) => char === undefined || !/[\p{L}\p{N}]/u.test(char);
    if (bounded(before) && bounded(after)) return index;
    from = index + 1;
  }
  return -1;
}

/** text에서 [start, end)를 빼고 앞뒤 공백을 정리한다. */
function cut(text: string, start: number, end: number): string {
  return `${text.slice(0, start)} ${text.slice(end)}`.replace(/\s+/g, ' ').trim();
}

/** 날씨 단어를 떼고 나머지를 돌려준다. 날씨 단어가 없거나 자리가 맞지 않으면 null. */
function stripWeatherWord(text: string): string | null {
  for (const word of CJK_WEATHER_WORDS) {
    if (text.endsWith(word)) return text.slice(0, -word.length).trim();
    // CJK 날씨 단어 뒤에는 기간 단어만 올 수 있다. ("날씨 내일"은 드물지만 받는다)
    const index = text.lastIndexOf(word);
    if (index >= 0) {
      const rest = text.slice(index + word.length).trim();
      if (rest && PERIOD_WORDS.some(([period]) => period === rest)) return cut(text, index, index + word.length);
    }
  }
  for (const word of LATIN_WEATHER_WORDS) {
    const index = findLatinWord(text, word);
    if (index < 0) continue;
    const before = text.slice(0, index).trim();
    const after = text.slice(index + word.length).trim();
    // 앞이나 끝에 와야 한다. 가운데에 오면 문장의 일부다.
    if (before && after && !isPeriodOnly(after) && !isPeriodOnly(before)) return null;
    return cut(text, index, index + word.length);
  }
  return null;
}

function isPeriodOnly(text: string): boolean {
  return PERIOD_WORDS.some(([word]) => word === text);
}

/** 기간 단어를 떼고 [나머지, 기간]을 돌려준다. */
function stripPeriod(text: string): [string, WeatherPeriod | null] {
  for (const [word, period] of PERIOD_WORDS) {
    if (isCjk(word[0])) {
      // 한국어·중국어·일본어는 붙여 쓰므로 앞이나 끝에서만 뗀다. ("모레"가 지명 가운데 들어간 경우를 피한다)
      if (text.startsWith(word)) return [text.slice(word.length).trim(), period];
      if (text.endsWith(word)) return [text.slice(0, -word.length).trim(), period];
      continue;
    }
    const index = findLatinWord(text, word);
    if (index >= 0) return [cut(text, index, index + word.length), period];
  }
  return [text, null];
}

function stripConnectors(text: string): string {
  let result = text;
  for (let changed = true; changed;) {
    changed = false;
    for (const connector of CJK_CONNECTORS) {
      if (result.endsWith(connector) && result.length > connector.length) {
        result = result.slice(0, -connector.length).trim();
        changed = true;
      }
    }
    const words = result.split(' ');
    if (words.length > 1 && LATIN_CONNECTORS.includes(words[0])) {
      result = words.slice(1).join(' ');
      changed = true;
    }
    const last = words[words.length - 1];
    if (words.length > 1 && LATIN_CONNECTORS.includes(last)) {
      result = words.slice(0, -1).join(' ');
      changed = true;
    }
  }
  return result.replace(/[,?!.]+$/u, '').trim();
}

function looksLikePlace(place: string): boolean {
  if (place.length > 40 || place.split(' ').length > 4) return false;
  if (NOT_PLACES.has(place)) return false;
  // 숫자·기호가 섞이면 파일 이름이나 코드에 가깝다. (지명에 쓰는 하이픈·점·아포스트로피는 허용)
  return /^[\p{L}\p{M}][\p{L}\p{M} '’.-]*$/u.test(place);
}

/** 날씨 검색어면 지명과 기간을, 아니면 null을 돌려준다. */
export function parseWeatherQuery(input: string): WeatherQuery | null {
  const text = input.normalize('NFC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
  if (!text || text.length > 80) return null;

  const withoutWeather = stripWeatherWord(text);
  if (withoutWeather === null) return null;
  // "明日の天気"처럼 기간과 날씨 단어 사이에도 연결어가 오므로 앞뒤로 한 번씩 뗀다.
  const [withoutPeriod, period] = stripPeriod(stripConnectors(withoutWeather));
  const place = stripConnectors(withoutPeriod);

  if (!place) {
    // 날씨 단어만 입력하면 날씨 앱을 여는 입력으로 본다.
    return period ? { place: null, period } : null;
  }
  if (!looksLikePlace(place)) return null;
  // 지명은 원래 입력의 대소문자로 돌려준다. (화면에 보이는 값은 지명 검색 결과를 쓴다)
  const original = input.normalize('NFC').replace(/\s+/g, ' ').trim();
  const start = original.toLocaleLowerCase().indexOf(place);
  return { place: start >= 0 ? original.slice(start, start + place.length) : place, period };
}
