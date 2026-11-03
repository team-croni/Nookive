import { describe, expect, it } from 'vitest';
import { isUnambiguousCity, rankWeatherPlaces, type WeatherPlace } from './weatherPlaces';

const photon = (name: string, kind: string, region: string | null, countryCode = 'KR'): WeatherPlace => ({
  source: 'photon', name, kind, region, countryCode, latitude: 37, longitude: 127,
});
const meteo = (name: string, kind: string, population: number | null, countryCode: string, region: string | null = null): WeatherPlace => ({
  source: 'openMeteo', name, kind, population, countryCode, region, latitude: 10, longitude: 10,
});

const top = (query: string, places: WeatherPlace[], country?: string) => rankWeatherPlaces(query, places, country)[0];

describe('rankWeatherPlaces', () => {
  it('prefers districts and cities whose name matches', () => {
    // 실제 응답을 줄인 예: Open-Meteo는 "수원"에 고창군의 마을을, Photon은 수원시를 준다.
    expect(top('수원', [photon('수원시', 'city', '경기도'), meteo('수원', 'PPL', null, 'KR', '전라북도')])?.name).toBe('수원시');
    expect(top('종로', [photon('종로구', 'district', '서울특별시'), photon('종로1·2·3·4가동', 'district', '서울특별시')])?.name).toBe('종로구');
    expect(top('부산', [photon('부산', 'locality', '부산광역시'), photon('부산광역시', 'city', null)])?.name).toBe('부산광역시');
    expect(top('성수', [photon('성수1가2동', 'district', '서울특별시')])?.name).toBe('성수1가2동');
  });

  it('uses Open-Meteo for big foreign cities written in another language', () => {
    const places = [photon('파리동', 'locality', '안산시, 경기도'), meteo('파리', 'PPLC', 2138551, 'FR', '일드프랑스')];
    expect(top('파리', places)?.countryCode).toBe('FR');
    expect(top('오사카', [meteo('오사카 시', 'PPLA', 2753862, 'JP')])?.name).toBe('오사카 시');
    expect(top('Seoul', [meteo('Seúl', 'PPLC', 10349312, 'KR')])?.name).toBe('Seúl');
    expect(top('台北', [photon('臺北市', 'city', null, 'TW')])?.name).toBe('臺北市');
  });

  it('reads a leading region word', () => {
    const places = [photon('중구', 'district', '서울특별시'), photon('중구', 'district', '대전광역시')];
    expect(top('대전 중구', places)?.region).toBe('대전광역시');
    expect(top('부산 해운대', [photon('해운대구', 'district', '부산광역시')])?.name).toBe('해운대구');
    expect(top('New York', [photon('New York', 'city', 'New York', 'US')])?.name).toBe('New York');
  });

  it('puts the preferred country first within a tier', () => {
    const places = [photon('Springfield', 'city', 'MA', 'US'), photon('Springfield', 'city', 'Ontario', 'CA')];
    expect(top('Springfield', places, 'CA')?.countryCode).toBe('CA');
  });

  it('returns nothing when no name matches', () => {
    expect(rankWeatherPlaces('메모', [photon('메모리아파트', 'locality', '서울특별시')])).toEqual([]);
    expect(rankWeatherPlaces('', [photon('수원시', 'city', null)])).toEqual([]);
    expect(rankWeatherPlaces('notes', [photon('Nötesjö', 'district', 'Svedala kommun', 'SE')])).toEqual([]);
    expect(top('Seoul', [photon('Seoulasso', 'city', 'San', 'ML'), photon('Seoul', 'locality', 'Chiapas', 'MX'), meteo('Seúl', 'PPLC', 10349312, 'KR')])?.countryCode).toBe('KR');
  });

  it('knows when Open-Meteo alone is enough', () => {
    expect(isUnambiguousCity('파리', meteo('파리', 'PPLC', 2138551, 'FR'))).toBe(true);
    expect(isUnambiguousCity('뉴욕', meteo('뉴욕', 'PPL', 8804190, 'US'))).toBe(true);
    expect(isUnambiguousCity('수원', meteo('수원', 'PPL', null, 'KR'))).toBe(false);
    expect(isUnambiguousCity('중구', meteo('중구', 'PPLA2', 120000, 'KR'))).toBe(false);
    expect(isUnambiguousCity('Seoul', meteo('Seúl', 'PPLC', 10349312, 'KR'))).toBe(false);
  });
});
