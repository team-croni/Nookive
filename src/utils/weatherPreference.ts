// 날씨 검색 설정: 켜고 끄기(기본 켜짐)와 기본 지역. 설정 창과 검색 창이 함께 읽는다.
// 기본 지역은 "오늘 날씨"처럼 지역 없이 물을 때 쓴다. 위치 권한이나 IP 위치는 쓰지 않는다.
import type { WeatherPlace } from '../features/search/utils/weatherPlaces';

const WEATHER_ENABLED_KEY = 'nookive.weatherEnabled';
const WEATHER_LOCATION_KEY = 'nookive.weatherLocation';
const WEATHER_PREFERENCE_EVENT = 'nookive-weather-preference-changed';

export type WeatherLocation = Pick<WeatherPlace, 'name' | 'region' | 'country' | 'countryCode' | 'latitude' | 'longitude'>;

export function getWeatherEnabled(): boolean {
  try {
    return localStorage.getItem(WEATHER_ENABLED_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setWeatherEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(WEATHER_ENABLED_KEY, String(enabled));
  } catch {
    // localStorage를 사용할 수 없는 환경에서도 현재 세션의 UI는 동작한다.
  }
  window.dispatchEvent(new Event(WEATHER_PREFERENCE_EVENT));
}

export function getWeatherLocation(): WeatherLocation | null {
  try {
    const raw = localStorage.getItem(WEATHER_LOCATION_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as WeatherLocation;
    return typeof value?.name === 'string' && Number.isFinite(value.latitude) && Number.isFinite(value.longitude)
      ? value
      : null;
  } catch {
    return null;
  }
}

export function setWeatherLocation(location: WeatherLocation | null): void {
  try {
    if (location) {
      const { name, region, country, countryCode, latitude, longitude } = location;
      localStorage.setItem(WEATHER_LOCATION_KEY, JSON.stringify({ name, region, country, countryCode, latitude, longitude }));
    } else {
      localStorage.removeItem(WEATHER_LOCATION_KEY);
    }
  } catch {
    // localStorage를 사용할 수 없는 환경에서도 현재 세션의 UI는 동작한다.
  }
  window.dispatchEvent(new Event(WEATHER_PREFERENCE_EVENT));
}

/**
 * 날씨 설정(켜기, 기본 지역)이 바뀌면 콜백을 부른다. 같은 창은 커스텀 이벤트로,
 * 다른 창(설정 창 → 검색 창)은 localStorage의 storage 이벤트로 알 수 있다. 해제 함수를 돌려준다.
 */
export function subscribeWeatherPreference(callback: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === WEATHER_ENABLED_KEY || event.key === WEATHER_LOCATION_KEY) callback();
  };
  window.addEventListener(WEATHER_PREFERENCE_EVENT, callback);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(WEATHER_PREFERENCE_EVENT, callback);
    window.removeEventListener('storage', onStorage);
  };
}
