// src/features/search/utils/weatherForecast.ts
// Open-Meteo 예보 응답을 화면용 값으로 바꾸고, 물어본 기간(오늘·내일·이번 주…)에 맞게 고른다.
// 날짜와 시각은 그 지역의 현지 시각이다. (예보를 timezone=auto로 받는다)
import type { WeatherPeriod } from './weatherQuery';

/** WMO 날씨 코드를 묶은 상태. 번역 키와 아이콘에 쓴다. */
export type WeatherCondition =
  | 'clear'
  | 'partlyCloudy'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'thunderstorm';

export interface WeatherHour {
  /** 현지 시각 "2026-11-03T21:00" */
  time: string;
  temperature: number;
  condition: WeatherCondition;
  isDay: boolean;
  precipitationProbability: number | null;
}

export interface WeatherDay {
  /** 현지 날짜 "2026-11-03" */
  date: string;
  condition: WeatherCondition;
  max: number;
  min: number;
  precipitationProbability: number | null;
}

export interface WeatherForecast {
  /** 예보 지역의 UTC 오프셋(초). 표시한 시각이 그 지역 시각임을 알릴 때 쓴다. */
  utcOffsetSeconds: number | null;
  current: {
    time: string;
    temperature: number;
    apparentTemperature: number | null;
    humidity: number | null;
    windSpeed: number | null;
    condition: WeatherCondition;
    isDay: boolean;
  };
  hourly: WeatherHour[];
  daily: WeatherDay[];
}

export function conditionForCode(code: number): WeatherCondition {
  if (code === 0) return 'clear';
  if (code === 1 || code === 2) return 'partlyCloudy';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'thunderstorm';
  return 'cloudy';
}

type Json = Record<string, unknown>;
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** 응답 JSON을 해석한다. 필요한 값이 없으면 null. */
export function parseForecast(json: unknown): WeatherForecast | null {
  if (!json || typeof json !== 'object') return null;
  const data = json as Json;
  const current = (data.current ?? {}) as Json;
  const hourly = (data.hourly ?? {}) as Json;
  const daily = (data.daily ?? {}) as Json;
  const temperature = num(current.temperature_2m);
  const code = num(current.weather_code);
  if (typeof current.time !== 'string' || temperature === null || code === null) return null;

  const hours: WeatherHour[] = arr(hourly.time).flatMap((time, i) => {
    const temp = num(arr(hourly.temperature_2m)[i]);
    const hourCode = num(arr(hourly.weather_code)[i]);
    if (typeof time !== 'string' || temp === null || hourCode === null) return [];
    return [{
      time,
      temperature: temp,
      condition: conditionForCode(hourCode),
      isDay: num(arr(hourly.is_day)[i]) !== 0,
      precipitationProbability: num(arr(hourly.precipitation_probability)[i]),
    }];
  });
  const days: WeatherDay[] = arr(daily.time).flatMap((date, i) => {
    const max = num(arr(daily.temperature_2m_max)[i]);
    const min = num(arr(daily.temperature_2m_min)[i]);
    const dayCode = num(arr(daily.weather_code)[i]);
    if (typeof date !== 'string' || max === null || min === null || dayCode === null) return [];
    return [{
      date,
      condition: conditionForCode(dayCode),
      max,
      min,
      precipitationProbability: num(arr(daily.precipitation_probability_max)[i]),
    }];
  });
  if (days.length === 0) return null;

  return {
    utcOffsetSeconds: num(data.utc_offset_seconds),
    current: {
      time: current.time,
      temperature,
      apparentTemperature: num(current.apparent_temperature),
      humidity: num(current.relative_humidity_2m),
      windSpeed: num(current.wind_speed_10m),
      condition: conditionForCode(code),
      isDay: num(current.is_day) !== 0,
    },
    hourly: hours,
    daily: days,
  };
}

/** "2026-11-03"의 요일 (0 = 일요일). 날짜만 보므로 시간대와 관계없다. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export interface WeatherSelection {
  /** 물어본 날들. 미리보기에서 강조한다. */
  days: WeatherDay[];
  /** 시간별 줄에 보일 시간. 오늘은 지금부터 24시간, 내일·모레는 그날. */
  hours: WeatherHour[];
  /** 지금 날씨를 보여줄지 (기간이 없거나 오늘) */
  showsCurrent: boolean;
}

/** 물어본 기간에 맞는 날과 시간을 고른다. */
export function selectPeriod(forecast: WeatherForecast, period: WeatherPeriod | null): WeatherSelection {
  const { daily, hourly, current } = forecast;
  const hoursOn = (date: string | undefined) => (date ? hourly.filter((hour) => hour.time.startsWith(date)) : []);
  // 시간별 값은 정시 단위다. 지금이 21:15면 21:00부터 보인다.
  const currentHour = `${current.time.slice(0, 13)}:00`;
  const upcoming = hourly.filter((hour) => hour.time >= currentHour).slice(0, 24);

  switch (period) {
    case 'tomorrow':
      return { days: daily.slice(1, 2), hours: hoursOn(daily[1]?.date), showsCurrent: false };
    case 'dayAfter':
      return { days: daily.slice(2, 3), hours: hoursOn(daily[2]?.date), showsCurrent: false };
    case 'week':
      return { days: daily.slice(0, 7), hours: upcoming, showsCurrent: true };
    case 'weekend': {
      // 다가오는 토·일. 오늘이 일요일이면 오늘만.
      const index = daily.findIndex((day) => [0, 6].includes(weekdayOf(day.date)));
      if (index < 0) return { days: [], hours: [], showsCurrent: false };
      const days = weekdayOf(daily[index].date) === 6 ? daily.slice(index, index + 2) : daily.slice(index, index + 1);
      return { days, hours: [], showsCurrent: false };
    }
    case 'today':
    case null:
    default:
      return { days: daily.slice(0, 1), hours: upcoming, showsCurrent: true };
  }
}

/** 화씨를 쓰는 지역 (미국, 라이베리아, 미얀마 등) */
const FAHRENHEIT_REGIONS = new Set(['US', 'LR', 'MM', 'BS', 'BZ', 'KY', 'PW', 'FM', 'MH']);
/** 풍속을 mph로 쓰는 지역 */
const MPH_REGIONS = new Set(['US', 'LR', 'MM', 'GB']);

/** macOS 언어 및 지역 설정. 사용자가 고르지 않은 값은 없다. (src/utils/systemLocale.ts) */
export interface LocalePreferences {
  region?: string | null;
  temperatureUnit?: 'celsius' | 'fahrenheit' | null;
  metric?: boolean | null;
  uses24Hour?: boolean | null;
}

export interface WeatherUnits {
  fahrenheit: boolean;
  mph: boolean;
  hourCycle: 'h12' | 'h23';
}

/** 사는 지역. macOS 지역 설정이 있으면 그것을, 없으면 언어 태그로 짐작한다. ("en" → US) */
export function regionOf(preferences: LocalePreferences, languageTag: string): string | undefined {
  if (preferences.region) return preferences.region;
  try {
    return new Intl.Locale(languageTag).maximize().region;
  } catch {
    return undefined;
  }
}

/**
 * 표시 단위. macOS에서 직접 고른 값(온도 단위, 측정 단위, 24시간 표시)을 먼저 따르고,
 * 고르지 않았으면 그 지역의 관례를 쓴다. 시각 표시는 앱 언어와 사는 지역을 합친 로케일의 기본값이다.
 */
export function weatherUnits(preferences: LocalePreferences, language: string, region: string | undefined): WeatherUnits {
  const fahrenheit = preferences.temperatureUnit
    ? preferences.temperatureUnit === 'fahrenheit'
    : region !== undefined && FAHRENHEIT_REGIONS.has(region);
  const mph = preferences.metric === false || (preferences.metric == null && region !== undefined && MPH_REGIONS.has(region));
  let hourCycle: 'h12' | 'h23';
  if (preferences.uses24Hour != null) {
    hourCycle = preferences.uses24Hour ? 'h23' : 'h12';
  } else {
    let resolved: string | undefined;
    try {
      const base = language.split('-')[0];
      resolved = new Intl.DateTimeFormat(region ? `${base}-${region}` : language, { hour: 'numeric' }).resolvedOptions().hourCycle;
    } catch {
      resolved = undefined;
    }
    hourCycle = resolved === 'h11' || resolved === 'h12' ? 'h12' : 'h23';
  }
  return { fahrenheit, mph, hourCycle };
}

/** 예보 지역의 UTC 오프셋을 "GMT+9", "GMT+5:30"처럼 쓴다. */
export function formatUtcOffset(seconds: number): string {
  const sign = seconds < 0 ? '-' : '+';
  const minutes = Math.round(Math.abs(seconds) / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `GMT${sign}${hours}${rest ? `:${String(rest).padStart(2, '0')}` : ''}`;
}

/** 섭씨 값을 표시 단위의 반올림한 정수로 바꾼다. */
export function displayTemperature(celsius: number, fahrenheit: boolean): number {
  const value = fahrenheit ? (celsius * 9) / 5 + 32 : celsius;
  // -0을 0으로 보이게 한다.
  return Math.round(value) || 0;
}
