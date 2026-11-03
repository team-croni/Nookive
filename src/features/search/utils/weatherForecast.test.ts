import { describe, expect, it } from 'vitest';
import {
  conditionForCode,
  displayTemperature,
  parseForecast,
  selectPeriod,
  formatUtcOffset,
  regionOf,
  weatherUnits,
  weekdayOf,
} from './weatherForecast';

// 2026-11-03은 화요일이다.
const dates = Array.from({ length: 16 }, (_, i) => {
  const date = new Date(Date.UTC(2026, 10, 3 + i));
  return date.toISOString().slice(0, 10);
});
const hours = Array.from({ length: 48 }, (_, i) => {
  const date = new Date(Date.UTC(2026, 10, 3, 21 + i));
  return date.toISOString().slice(0, 13) + ':00';
});

const response = {
  utc_offset_seconds: 32400,
  current: { time: '2026-11-03T21:15', temperature_2m: 7.6, apparent_temperature: 5.1, relative_humidity_2m: 60, weather_code: 1, is_day: 0, wind_speed_10m: 8 },
  hourly: {
    time: hours,
    temperature_2m: hours.map((_, i) => 7 - i * 0.1),
    weather_code: hours.map(() => 3),
    precipitation_probability: hours.map(() => 10),
    is_day: hours.map(() => 0),
  },
  daily: {
    time: dates,
    weather_code: dates.map((_, i) => (i === 1 ? 61 : 0)),
    temperature_2m_max: dates.map(() => 15),
    temperature_2m_min: dates.map(() => 4),
    precipitation_probability_max: dates.map((_, i) => (i === 1 ? 80 : 0)),
  },
};

describe('weather forecast', () => {
  it('parses the Open-Meteo response', () => {
    const forecast = parseForecast(response)!;
    expect(forecast.current).toMatchObject({ temperature: 7.6, condition: 'partlyCloudy', isDay: false });
    expect(forecast.hourly).toHaveLength(48);
    expect(forecast.daily[1]).toMatchObject({ date: '2026-11-04', condition: 'rain', precipitationProbability: 80 });
    expect(parseForecast({})).toBeNull();
    expect(parseForecast(null)).toBeNull();
  });

  it('maps WMO codes to conditions', () => {
    expect([0, 2, 3, 45, 53, 63, 81, 73, 86, 95].map(conditionForCode)).toEqual([
      'clear', 'partlyCloudy', 'cloudy', 'fog', 'drizzle', 'rain', 'rain', 'snow', 'snow', 'thunderstorm',
    ]);
  });

  it('selects the asked period', () => {
    const forecast = parseForecast(response)!;
    const today = selectPeriod(forecast, null);
    expect(today.days.map((day) => day.date)).toEqual(['2026-11-03']);
    expect(today.hours[0].time).toBe('2026-11-03T21:00');
    expect(today.hours).toHaveLength(24);
    expect(today.showsCurrent).toBe(true);

    const tomorrow = selectPeriod(forecast, 'tomorrow');
    expect(tomorrow.days.map((day) => day.date)).toEqual(['2026-11-04']);
    expect(tomorrow.hours.every((hour) => hour.time.startsWith('2026-11-04'))).toBe(true);
    expect(tomorrow.hours).toHaveLength(24);

    expect(selectPeriod(forecast, 'week').days).toHaveLength(7);
    expect(selectPeriod(forecast, 'weekend').days.map((day) => day.date)).toEqual(['2026-11-07', '2026-11-08']);
  });

  it('knows weekdays and temperature units', () => {
    expect(weekdayOf('2026-11-03')).toBe(2);
    // macOS에서 고른 값이 먼저다.
    expect(weatherUnits({ temperatureUnit: 'fahrenheit' }, 'ko', 'KR').fahrenheit).toBe(true);
    expect(weatherUnits({ temperatureUnit: 'celsius' }, 'en', 'US').fahrenheit).toBe(false);
    expect(weatherUnits({ uses24Hour: true }, 'ko', 'KR').hourCycle).toBe('h23');
    expect(weatherUnits({ uses24Hour: false }, 'de', 'DE').hourCycle).toBe('h12');
    expect(weatherUnits({ metric: false }, 'ko', 'KR').mph).toBe(true);
    // 고르지 않았으면 사는 지역의 관례를 따른다. (언어가 영어여도 한국에 살면 섭씨)
    expect(weatherUnits({}, 'en', 'KR')).toMatchObject({ fahrenheit: false, mph: false });
    expect(weatherUnits({}, 'en', 'US')).toMatchObject({ fahrenheit: true, mph: true, hourCycle: 'h12' });
    expect(weatherUnits({}, 'de', 'DE')).toMatchObject({ fahrenheit: false, hourCycle: 'h23' });
    expect(weatherUnits({}, 'ko', 'KR').hourCycle).toBe('h12');
    expect(regionOf({ region: 'MX' }, 'es')).toBe('MX');
    expect(regionOf({}, 'en')).toBe('US');
    expect(regionOf({}, 'ko-KR')).toBe('KR');
    expect(formatUtcOffset(32400)).toBe('GMT+9');
    expect(formatUtcOffset(19800)).toBe('GMT+5:30');
    expect(formatUtcOffset(-18000)).toBe('GMT-5');
    expect(displayTemperature(-0.3, false)).toBe(0);
    expect(displayTemperature(0, true)).toBe(32);
  });
});
