// src/features/search/hooks/useWorldTime.ts
// 검색어가 다른 곳의 시각을 묻거나 시간대를 바꾸면 시간대를 정한다.
// - 약어(KST)·UTC 오프셋만 쓰면 네트워크 없이 바로 답한다.
// - 지명이 있으면 날씨와 같은 지명 검색으로 찾고, 그곳의 시간대를 얻는다. (한 번 찾은 곳은 Mac에 저장)
// - 날씨처럼, 답을 기다리는 동안에는 이전 답이나 "불러오는 중" 줄을 보이고, 지명을 찾지 못하면 줄을 없앤다.
import { useEffect, useMemo, useState } from 'react';
import i18n from '../../../i18n';
import { getSystemLocale, loadSystemLocale } from '../../../utils/systemLocale';
import { getWeatherLocation } from '../../../utils/weatherPreference';
import { getWorldTimeEnabled, subscribeWorldTimeEnabled } from '../../../utils/worldTimePreference';
import { resolvePlaceWithTimezone } from '../services/weatherClient';
import { countryForLanguage, weatherPlaceDetail } from '../utils/weatherPlaces';
import { parseTimeQuery, type TimeQuery, type ZoneRef } from '../utils/timeQuery';
import type { ResolvedZone } from '../utils/worldTime';

const DEBOUNCE_MS = 250;

/** 이 Mac의 시간대. label이 비어 있으면 화면에서 "내 시간"으로 보인다. */
export const localZone = (): ResolvedZone => ({
  label: '',
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
});

export type WorldTimeResult =
  /** from → to. 지금 시각 질문은 from이 이 Mac, to가 물어본 곳이다. */
  | { status: 'ready'; query: TimeQuery; from: ResolvedZone; to: ResolvedZone }
  | { status: 'loading'; query: TimeQuery; label: string }
  | { status: 'error'; query: TimeQuery; label: string };

type Loaded = { key: string; result: WorldTimeResult | null };

const placeOf = (ref: ZoneRef | null) => (ref?.kind === 'place' ? ref.place : null);

function zoneNow(ref: ZoneRef): ResolvedZone | null {
  if (ref.kind === 'zone') return { label: ref.label, timeZone: ref.timeZone };
  if (ref.kind === 'offset') return { label: ref.label, offsetMinutes: ref.offsetMinutes };
  return null;
}

/** 검색어의 두 시간대(출발, 도착) */
function endpoints(query: TimeQuery): [ZoneRef | null, ZoneRef | null] {
  return query.kind === 'now' ? [null, query.zone] : [query.from, query.to];
}

export function useWorldTime(input: string, active: boolean) {
  const [enabled, setEnabled] = useState(getWorldTimeEnabled);
  useEffect(() => subscribeWorldTimeEnabled(setEnabled), []);

  const request = useMemo(() => (active && enabled ? parseTimeQuery(input) : null), [active, enabled, input]);
  const language = i18n.resolvedLanguage ?? i18n.language ?? 'en';
  const key = request ? JSON.stringify([request, language]) : '';
  const needsLookup = request !== null && endpoints(request).some((ref) => ref?.kind === 'place');

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  useEffect(() => {
    if (!request || !needsLookup) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const label = endpoints(request).map(placeOf).find(Boolean) ?? '';
      try {
        await loadSystemLocale();
        const preferredCountry = getWeatherLocation()?.countryCode ?? getSystemLocale().region ?? countryForLanguage(language);
        const resolve = async (ref: ZoneRef | null): Promise<ResolvedZone | null | undefined> => {
          if (!ref) return localZone();
          if (ref.kind !== 'place') return zoneNow(ref);
          const place = await resolvePlaceWithTimezone(ref.place, language, preferredCountry);
          // undefined: 지명을 찾지 못함
          return place ? { label: place.name, detail: weatherPlaceDetail(place), timeZone: place.timezone } : undefined;
        };
        const [fromRef, toRef] = endpoints(request);
        const [from, to] = await Promise.all([resolve(fromRef), resolve(toRef)]);
        if (cancelled) return;
        setLoaded({ key, result: from && to ? { status: 'ready', query: request, from, to } : null });
      } catch (err) {
        console.warn('[WorldTime] 시간대를 정하지 못했습니다:', err);
        if (!cancelled) setLoaded({ key, result: { status: 'error', query: request, label } });
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // key가 request·language를 모두 담는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, needsLookup]);

  // 시간대 질문이 끝나면 이전 답을 버린다.
  if (!request && loaded) setLoaded(null);

  let result: WorldTimeResult | null = null;
  if (request && !needsLookup) {
    // 약어·오프셋만 쓴 질문은 바로 답한다.
    const [fromRef, toRef] = endpoints(request);
    result = {
      status: 'ready',
      query: request,
      from: (fromRef && zoneNow(fromRef)) || localZone(),
      to: (toRef && zoneNow(toRef)) || localZone(),
    };
  } else if (request) {
    const label = endpoints(request).map(placeOf).find(Boolean) ?? '';
    result = loaded?.key === key ? loaded.result : loaded?.result ?? { status: 'loading', query: request, label };
  }
  return { result, pending: request !== null && needsLookup && loaded?.key !== key };
}
