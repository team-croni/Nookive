import { describe, expect, it } from 'vitest';
import { parseWeatherQuery } from './weatherQuery';

describe('parseWeatherQuery', () => {
  it('reads Korean place and period queries', () => {
    expect(parseWeatherQuery('수원 날씨')).toEqual({ place: '수원', period: null });
    expect(parseWeatherQuery('종로날씨')).toEqual({ place: '종로', period: null });
    expect(parseWeatherQuery('구로 내일 날씨')).toEqual({ place: '구로', period: 'tomorrow' });
    expect(parseWeatherQuery('여수의 날씨')).toEqual({ place: '여수', period: null });
    expect(parseWeatherQuery('부산 해운대 날씨')).toEqual({ place: '부산 해운대', period: null });
    expect(parseWeatherQuery('오늘 날씨')).toEqual({ place: null, period: 'today' });
    expect(parseWeatherQuery('내일날씨')).toEqual({ place: null, period: 'tomorrow' });
    expect(parseWeatherQuery('이번주 날씨')).toEqual({ place: null, period: 'week' });
    expect(parseWeatherQuery('이번 주 날씨')).toEqual({ place: null, period: 'week' });
    expect(parseWeatherQuery('주말 날씨')).toEqual({ place: null, period: 'weekend' });
    expect(parseWeatherQuery('제주 모레 일기예보')).toEqual({ place: '제주', period: 'dayAfter' });
    expect(parseWeatherQuery('날씨 내일')).toEqual({ place: null, period: 'tomorrow' });
  });

  it('reads other languages', () => {
    expect(parseWeatherQuery('Paris weather')).toEqual({ place: 'Paris', period: null });
    expect(parseWeatherQuery('weather in New York tomorrow')).toEqual({ place: 'New York', period: 'tomorrow' });
    expect(parseWeatherQuery('weather london')).toEqual({ place: 'london', period: null });
    expect(parseWeatherQuery('weather this weekend')).toEqual({ place: null, period: 'weekend' });
    expect(parseWeatherQuery('Wetter Berlin morgen')).toEqual({ place: 'Berlin', period: 'tomorrow' });
    expect(parseWeatherQuery('météo à Lyon')).toEqual({ place: 'Lyon', period: null });
    expect(parseWeatherQuery('el tiempo en Madrid mañana')).toEqual({ place: 'Madrid', period: 'tomorrow' });
    expect(parseWeatherQuery('previsão do tempo em São Paulo')).toEqual({ place: 'São Paulo', period: null });
    expect(parseWeatherQuery('東京の天気')).toEqual({ place: '東京', period: null });
    expect(parseWeatherQuery('大阪 明日の天気')).toEqual({ place: '大阪', period: 'tomorrow' });
    expect(parseWeatherQuery('北京明天天气')).toEqual({ place: '北京', period: 'tomorrow' });
    expect(parseWeatherQuery('台北天氣')).toEqual({ place: '台北', period: null });
  });

  it('does not treat other inputs as weather', () => {
    for (const input of [
      '날씨',
      'weather',
      'Wetter',
      '날씨 메모',
      '날씨 앱 디자인',
      'weather app',
      'weather report 2024',
      'weather-icons.svg',
      'my weather notes for work',
      'tempo',
      'clima',
      '수원',
      'weather 2026-11-03',
    ]) {
      expect(parseWeatherQuery(input), input).toBeNull();
    }
  });
});
