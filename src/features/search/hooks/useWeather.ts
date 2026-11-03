// src/features/search/hooks/useWeather.ts
// 검색어가 날씨를 물으면 지명을 찾고 예보를 불러온다.
// - 요청은 검색어 전체가 날씨 형태와 맞을 때만, 입력이 멈춘 뒤에 보낸다.
// - 지명을 찾지 못하면 결과를 내지 않는다. ("weather notes"처럼 지명이 아닌 말이 붙은 경우)
// - 지역 없이 물었는데 기본 지역이 없으면 설정을 안내한다. 이때는 요청을 보내지 않는다.
import { useEffect, useMemo, useState } from 'react';
import i18n from '../../../i18n';
import {
  getWeatherEnabled,
  getWeatherLocation,
  subscribeWeatherPreference,
  type WeatherLocation,
} from '../../../utils/weatherPreference';
import { fetchWeatherForecast, resolveWeatherPlace } from '../services/weatherClient';
import type { WeatherForecast } from '../utils/weatherForecast';
import { countryForLanguage } from '../utils/weatherPlaces';
import { getSystemLocale, loadSystemLocale } from '../../../utils/systemLocale';
import { parseWeatherQuery, type WeatherQuery } from '../utils/weatherQuery';

const DEBOUNCE_MS = 250;

export type WeatherResult =
  | { status: 'ready'; query: WeatherQuery; place: WeatherLocation; forecast: WeatherForecast }
  /** 첫 답을 기다리는 중. 웹 폴백이 떴다가 날씨로 바뀌지 않게 날씨 줄 자리를 바로 잡는다. */
  | { status: 'loading'; query: WeatherQuery; placeName: string }
  | { status: 'needsLocation'; query: WeatherQuery }
  | { status: 'error'; query: WeatherQuery; place: WeatherLocation | null };

type Loaded = { key: string; result: WeatherResult | null };

export function useWeather(input: string, active: boolean) {
  const [enabled, setEnabled] = useState(getWeatherEnabled);
  const [location, setLocation] = useState(getWeatherLocation);
  useEffect(
    () =>
      subscribeWeatherPreference(() => {
        setEnabled(getWeatherEnabled());
        setLocation(getWeatherLocation());
      }),
    [],
  );

  const request = useMemo(() => (active && enabled ? parseWeatherQuery(input) : null), [active, enabled, input]);
  const language = i18n.resolvedLanguage ?? i18n.language ?? 'en';
  // 같은 질문인지 가르는 키. 기본 지역이 바뀌면 지역 없는 질문의 답도 바뀐다.
  const key = request
    ? JSON.stringify([request.place?.toLocaleLowerCase() ?? null, request.period, request.place ? null : location?.name, language])
    : '';
  const needsLocation = request !== null && request.place === null && location === null;

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  useEffect(() => {
    if (!request || needsLocation) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      let place: WeatherLocation | null = request.place ? null : location;
      try {
        if (request.place) {
          // 같은 이름이 여러 나라에 있으면 기본 지역의 나라, macOS에서 고른 지역, 화면 언어의 나라 순서로 먼저 고른다.
          await loadSystemLocale();
          place = await resolveWeatherPlace(request.place, language, location?.countryCode ?? getSystemLocale().region ?? countryForLanguage(language));
          if (!place) {
            if (!cancelled) setLoaded({ key, result: null });
            return;
          }
        }
        const forecast = await fetchWeatherForecast(place!.latitude, place!.longitude);
        if (!cancelled) setLoaded({ key, result: { status: 'ready', query: request, place: place!, forecast } });
      } catch (err) {
        console.warn('[Weather] 날씨를 불러오지 못했습니다:', err);
        if (!cancelled) setLoaded({ key, result: { status: 'error', query: request, place } });
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // key가 request·location·language를 모두 담는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, needsLocation]);

  // 날씨 질문이 끝나면(다른 검색어) 이전 답을 버린다. 다음 날씨 질문에서 엉뚱한 지역이 잠깐 보이지 않게 한다.
  if (!request && loaded) setLoaded(null);

  // 새 답을 기다리는 동안에는 이전 답을 그대로 보인다. ("수원 내일 날씨"를 "서울 내일 날씨"로 고치는 동안
  // 날씨 줄이 사라졌다가 다시 생기지 않게 한다) 이전 답이 없으면 불러오는 중인 날씨 줄을 바로 보인다.
  // 지명을 찾지 못한 답(null)이 오면 그때 줄을 없앤다.
  let result: WeatherResult | null = null;
  if (needsLocation) {
    result = { status: 'needsLocation', query: request };
  } else if (request) {
    result = loaded?.key === key
      ? loaded.result
      : loaded?.result ?? { status: 'loading', query: request, placeName: request.place ?? location?.name ?? '' };
  }
  return {
    result,
    /** 날씨 질문이고 아직 이 질문의 답을 기다리는 중 (이전 답이 보이고 있을 수 있다) */
    pending: request !== null && !needsLocation && loaded?.key !== key,
  };
}
