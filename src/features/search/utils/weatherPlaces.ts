// src/features/search/utils/weatherPlaces.ts
// 지명 후보(Photon + Open-Meteo, Rust weather_places)에서 검색어에 맞는 곳을 고른다.
//
// 두 서비스는 잘 찾는 곳이 다르다.
// - Photon(OpenStreetMap): 구·군·시 같은 행정구역. "종로" → 종로구, "구로" → 구로구.
//   대신 다른 언어로 쓴 외국 도시는 못 찾고 같은 이름의 동네를 준다. ("파리" → 안산시 파리동)
// - Open-Meteo(GeoNames): 다른 언어로 쓴 큰 도시. "파리" → Paris. 대신 한국의 구·군은 없거나 작은 마을을 준다.
// 그래서 "이름이 맞는 행정구역 > 이름이 맞는 큰 도시 > 이름 뒤에 번호가 붙은 행정구역 > 별칭으로 찾은 큰 도시
// > 이름이 같은 동네" 순서로 고른다.
// 같은 단계에서는 우선 나라(기본 지역의 나라, 없으면 화면 언어의 나라)를 먼저 둔다.
//
// 이 파일의 한국어·중국어·일본어 접미사는 번역 문구가 아니라 지명을 비교하기 위한 단어다.

export interface WeatherPlace {
  source: 'photon' | 'openMeteo';
  name: string;
  region?: string | null;
  country?: string | null;
  countryCode?: string | null;
  latitude: number;
  longitude: number;
  kind: string;
  population?: number | null;
  /** IANA 시간대. Open-Meteo 결과에만 있고, 세계 시각이 Photon 결과에 따로 채운다. */
  timezone?: string | null;
}

/** 지명 뒤에 붙는 행정구역 단위. "수원" = "수원시" */
const ADMIN_SUFFIXES = [
  '특별자치시', '특별자치도', '특별시', '광역시', '시', '군', '구', '동', '읍', '면', '도',
  '市', '区', '區', '县', '縣', '都', '府', '県', '州',
  'gu', 'si', 'gun', 'city',
];
const PHOTON_ADMIN_KINDS = new Set(['city', 'district', 'county']);
/** GeoNames 수도·도청 소재지 등 */
const MAJOR_FEATURE_CODES = new Set(['PPLC', 'PPLA', 'PPLA2', 'PPLG']);
const MAJOR_POPULATION = 100_000;

/** 화면 언어로 짐작하는 나라. 영어는 나라를 정하지 않는다. */
const LANGUAGE_COUNTRIES: Record<string, string> = {
  ko: 'KR', ja: 'JP', 'zh-CN': 'CN', 'zh-TW': 'TW', de: 'DE', fr: 'FR', es: 'ES', 'pt-BR': 'BR',
};

export function countryForLanguage(language: string): string | undefined {
  return LANGUAGE_COUNTRIES[language] ?? LANGUAGE_COUNTRIES[language.split('-')[0]];
}

/** 비교용: 소문자, 악센트·공백·하이픈 제거, 번체 臺 → 台 */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .normalize('NFC')
    .toLocaleLowerCase()
    .replace(/[\s'’.-]+/g, '')
    .replace(/臺/g, '台');
}

type Match = 'exact' | 'prefix' | null;

function matchName(name: string, query: string): Match {
  const n = normalize(name);
  const q = normalize(query);
  if (!q) return null;
  if (n === q) return 'exact';
  if (n.startsWith(q) && ADMIN_SUFFIXES.includes(n.slice(q.length))) return 'exact';
  // 앞부분 일치는 뒤에 숫자가 이어질 때만 본다. ("성수" → 성수1가2동) 글자가 이어지면 다른 이름이다. ("seoul" ≠ Seoulasso)
  if (n.startsWith(q) && /^\d/.test(n.slice(q.length))) return 'prefix';
  return null;
}

/** "부산 해운대"의 "부산"처럼 앞의 단어가 상위 지역·나라 이름과 맞는지 */
function matchesQualifiers(place: WeatherPlace, qualifiers: string[]): boolean {
  if (qualifiers.length === 0) return true;
  const context = [place.region, place.country, place.countryCode]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => value.split(/[,\s]+/))
    .map(normalize);
  return qualifiers.every((word) => context.some((part) => part.startsWith(normalize(word))));
}

const isMajor = (place: WeatherPlace) =>
  place.source === 'openMeteo'
  && (MAJOR_FEATURE_CODES.has(place.kind) || (place.population ?? 0) >= MAJOR_POPULATION);

/** 낮을수록 좋은 단계. 맞지 않으면 null. */
function tier(place: WeatherPlace, name: string, qualifiers: string[], isFirstOpenMeteo: boolean): number | null {
  if (!matchesQualifiers(place, qualifiers)) return null;
  const match = matchName(place.name, name);
  const admin = place.source === 'photon' && PHOTON_ADMIN_KINDS.has(place.kind);
  if (match === 'exact' && admin) return 0;
  if (match === 'exact' && isMajor(place)) return 1;
  if (match === 'prefix' && admin) return 2;
  // 서비스가 다른 이름(별칭)으로 찾아 이름이 다르게 온 큰 도시. ("Seoul"을 스페인어로 찾으면 "Seúl")
  // 같은 이름의 작은 동네보다 먼저 둔다. (멕시코의 "Seoul" 마을보다 서울)
  if (isMajor(place) && isFirstOpenMeteo) return 3;
  if (match === 'exact' && place.source === 'photon') return 4;
  if (match === 'exact') return 5;
  return null;
}

/**
 * 검색어에 맞는 후보를 좋은 순서로 돌려준다. 맞는 후보가 없으면 빈 배열.
 * 이름은 검색어 전체로 먼저 비교하고("New York"), 맞는 곳이 없으면 마지막 단어를 이름으로,
 * 앞의 단어를 상위 지역으로 본다("부산 해운대", "대전 중구").
 */
export function rankWeatherPlaces(query: string, places: WeatherPlace[], preferredCountry?: string): WeatherPlace[] {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const attempts: Array<[string, string[]]> = [[words.join(' '), []]];
  if (words.length > 1) attempts.push([words[words.length - 1], words.slice(0, -1)]);

  const firstOpenMeteo = places.findIndex((place) => place.source === 'openMeteo');
  for (const [name, qualifiers] of attempts) {
    const ranked = places
      .map((place, index) => ({ place, index, tier: tier(place, name, qualifiers, index === firstOpenMeteo) }))
      .filter((entry): entry is { place: WeatherPlace; index: number; tier: number } => entry.tier !== null)
      .sort((a, b) =>
        a.tier - b.tier
        || Number(b.place.countryCode === preferredCountry) - Number(a.place.countryCode === preferredCountry)
        || (b.place.population ?? 0) - (a.place.population ?? 0)
        || a.index - b.index,
      )
      .map((entry) => entry.place);
    if (ranked.length > 0) return dedupe(ranked);
  }
  return [];
}

/** 두 서비스가 같은 곳(약 5km 안, 같은 이름)을 주면 앞의 것만 남긴다. */
function dedupe(places: WeatherPlace[]): WeatherPlace[] {
  const kept: WeatherPlace[] = [];
  for (const place of places) {
    const duplicate = kept.some((other) =>
      Math.abs(other.latitude - place.latitude) < 0.05
      && Math.abs(other.longitude - place.longitude) < 0.05
      && matchName(other.name, place.name) === 'exact',
    );
    if (!duplicate) kept.push(place);
  }
  return kept;
}

/** 화면에 보일 상위 지역 설명. 예: "서울특별시, 대한민국" */
export function weatherPlaceDetail(place: Pick<WeatherPlace, 'region' | 'country'>): string {
  return [place.region, place.country].filter(Boolean).join(', ');
}

/**
 * 느린 Photon을 기다리지 않고 Open-Meteo 답만으로 정해도 되는 곳인지.
 * 이름이 그대로 맞는 수도·도청 소재지(PPLC, PPLA)나 인구 100만 이상 도시만 그렇게 본다. ("파리", "도쿄", "런던")
 * 한국의 구·군처럼 같은 이름이 여러 곳인 지명은 여기에 들지 않아 Photon의 행정구역 답을 기다린다.
 */
export function isUnambiguousCity(query: string, place: WeatherPlace): boolean {
  return place.source === 'openMeteo'
    && matchName(place.name, query) === 'exact'
    && (place.kind === 'PPLC' || place.kind === 'PPLA' || (place.population ?? 0) >= 1_000_000);
}
