// src/features/search/services/weatherClient.ts
// 날씨·세계 시각 검색 브리지 (Rust weather_places, weather_forecast, place_timezone).
// - 고른 지명은 Mac에 저장해 같은 지명은 다시 묻지 않는다. (지명이 밖으로 나가는 일을 줄인다)
// - 예보는 좌표별로 15분 동안 메모리에 둔다.
import { invoke } from '@tauri-apps/api/core';
import { parseForecast, type WeatherForecast } from '../utils/weatherForecast';
import { isUnambiguousCity, rankWeatherPlaces, type WeatherPlace } from '../utils/weatherPlaces';

const PLACE_CACHE_KEY = 'nookive.weatherPlaceCache';
const PLACE_CACHE_LIMIT = 100;
const FORECAST_TTL_MS = 15 * 60 * 1000;
const FORECAST_CACHE_LIMIT = 30;

type PlaceCache = Record<string, WeatherPlace>;

const placeCacheKey = (query: string, language: string) => `${language}\n${query.normalize('NFC').toLocaleLowerCase().trim()}`;

function readPlaceCache(): PlaceCache {
  try {
    return JSON.parse(localStorage.getItem(PLACE_CACHE_KEY) ?? '{}') as PlaceCache;
  } catch {
    return {};
  }
}

function writePlaceCache(key: string, place: WeatherPlace): void {
  try {
    const cache = readPlaceCache();
    delete cache[key];
    cache[key] = place;
    const keys = Object.keys(cache);
    for (const old of keys.slice(0, Math.max(0, keys.length - PLACE_CACHE_LIMIT))) delete cache[old];
    localStorage.setItem(PLACE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // 저장하지 못해도 이번 검색 결과는 그대로 쓴다.
  }
}

type PlaceSource = 'photon' | 'openMeteo';

/**
 * 지명 후보를 좋은 순서로 돌려준다.
 * quick이면 먼저 오는 Open-Meteo 답이 이름이 맞는 큰 도시일 때 Photon(2~3초)을 기다리지 않는다.
 * (설정의 지역 고르기는 후보를 모두 보여야 하므로 quick을 쓰지 않는다)
 */
export async function searchWeatherPlaces(
  query: string,
  language: string,
  preferredCountry?: string,
  { quick = false }: { quick?: boolean } = {},
): Promise<WeatherPlace[]> {
  const ask = (text: string, source: PlaceSource) =>
    invoke<WeatherPlace[]>('weather_places', { query: text, language, source });
  const askBoth = async (text: string): Promise<WeatherPlace[]> => {
    const photon = ask(text, 'photon');
    const openMeteo = ask(text, 'openMeteo');
    // 기다리지 않는 쪽의 실패가 처리되지 않은 오류로 남지 않게 한다.
    photon.catch(() => undefined);
    const fromOpenMeteo = await openMeteo.catch(() => null);
    if (quick && fromOpenMeteo) {
      const [best] = rankWeatherPlaces(text, fromOpenMeteo, preferredCountry);
      if (best && isUnambiguousCity(text, best)) return [best];
    }
    const fromPhoton = await photon.catch(() => null);
    if (!fromPhoton && !fromOpenMeteo) throw new Error('Both place lookups failed.');
    // 같은 단계에서는 Photon(행정구역) 결과를 앞에 둔다.
    return [...(fromPhoton ?? []), ...(fromOpenMeteo ?? [])];
  };

  let ranked = rankWeatherPlaces(query, await askBoth(query), preferredCountry);
  // "부산 해운대"처럼 상위 지역을 붙이면 Photon이 아파트·가게를 주므로 마지막 단어만 다시 묻는다.
  const words = query.trim().split(/\s+/);
  if (ranked.length === 0 && words.length > 1) {
    ranked = rankWeatherPlaces(query, await askBoth(words[words.length - 1]), preferredCountry);
  }
  return ranked;
}

/** 검색어의 지명을 좌표로 바꾼다. 찾지 못하면 null. 네트워크 오류는 그대로 던진다. */
export async function resolveWeatherPlace(query: string, language: string, preferredCountry?: string): Promise<WeatherPlace | null> {
  const key = placeCacheKey(query, language);
  const cached = readPlaceCache()[key];
  if (cached) return cached;
  const [place] = await searchWeatherPlaces(query, language, preferredCountry, { quick: true });
  if (place) writePlaceCache(key, place);
  return place ?? null;
}

/**
 * 세계 시각용: 지명과 그곳의 IANA 시간대. 시간대가 없는 결과(Photon)는 좌표로 한 번 물어 저장해 둔다.
 * 날씨와 같은 지명 캐시를 쓰므로 "뉴욕 날씨"로 찾은 곳은 "뉴욕 시간"에서 다시 묻지 않는다.
 */
export async function resolvePlaceWithTimezone(
  query: string,
  language: string,
  preferredCountry?: string,
): Promise<(WeatherPlace & { timezone: string }) | null> {
  const place = await resolveWeatherPlace(query, language, preferredCountry);
  if (!place) return null;
  if (place.timezone) return { ...place, timezone: place.timezone };
  const timezone = await invoke<string>('place_timezone', { latitude: place.latitude, longitude: place.longitude });
  writePlaceCache(placeCacheKey(query, language), { ...place, timezone });
  return { ...place, timezone };
}

const forecastCache = new Map<string, { at: number; forecast: WeatherForecast }>();

/** 좌표의 예보. 15분 안에 받은 예보가 있으면 그것을 쓴다. */
export async function fetchWeatherForecast(latitude: number, longitude: number): Promise<WeatherForecast> {
  const key = `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
  const cached = forecastCache.get(key);
  if (cached && Date.now() - cached.at < FORECAST_TTL_MS) return cached.forecast;

  const forecast = parseForecast(await invoke<unknown>('weather_forecast', { latitude, longitude }));
  if (!forecast) throw new Error('Unexpected forecast response.');
  forecastCache.delete(key);
  if (forecastCache.size >= FORECAST_CACHE_LIMIT) {
    const oldest = forecastCache.keys().next().value;
    if (oldest !== undefined) forecastCache.delete(oldest);
  }
  forecastCache.set(key, { at: Date.now(), forecast });
  return forecast;
}
