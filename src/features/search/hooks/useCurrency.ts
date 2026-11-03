// src/features/search/hooks/useCurrency.ts
// 검색어가 환율 변환이면 환율표로 답한다.
// - 환율표는 검색어와 관계없이 하나(미국 달러 기준)만 받으므로 검색어나 금액은 밖으로 나가지 않는다.
// - 저장해 둔 표가 새것이면 바로 답하고, 처음 받을 때만 "불러오는 중" 줄을 보인다.
import { useEffect, useMemo, useState } from 'react';
import i18n from '../../../i18n';
import { getCurrencyEnabled, subscribeCurrencyEnabled } from '../../../utils/currencyPreference';
import { useSystemLocale } from '../../../utils/systemLocale';
import { freshCachedRates, loadRates, type RatesResult } from '../services/currencyClient';
import { parseCurrencyQuery, rateOf, type CurrencyQuery, type RateTable } from '../utils/currencyQuery';
import { regionOf } from '../utils/weatherForecast';

export type CurrencyResult =
  | { status: 'ready'; query: CurrencyQuery; rate: number; value: number; table: RateTable; stale: boolean }
  | { status: 'loading'; query: CurrencyQuery }
  | { status: 'error'; query: CurrencyQuery };

function answer(query: CurrencyQuery, rates: RatesResult): CurrencyResult | null {
  const rate = rateOf(rates.table, query.from, query.to);
  // 표에 없는 통화면 답하지 않는다.
  return rate === null ? null : { status: 'ready', query, rate, value: query.amount * rate, table: rates.table, stale: rates.stale };
}

export function useCurrency(input: string, active: boolean): CurrencyResult | null {
  const [enabled, setEnabled] = useState(getCurrencyEnabled);
  useEffect(() => subscribeCurrencyEnabled(setEnabled), []);
  const system = useSystemLocale();
  const language = i18n.resolvedLanguage ?? i18n.language ?? 'en';
  const region = regionOf(system, typeof navigator === 'undefined' ? language : navigator.language);

  const query = useMemo(
    () => (active && enabled ? parseCurrencyQuery(input, { region }) : null),
    [active, enabled, input, region],
  );

  // 받은 환율표 (없으면 null, 받지 못했으면 'error')
  const [loaded, setLoaded] = useState<RatesResult | 'error' | null>(() => {
    const table = freshCachedRates();
    return table ? { table, stale: false } : null;
  });
  // 환율 질문이 시작될 때마다 확인한다. 저장한 표가 새것이면 요청 없이 끝나고, 다음 갱신 시각이 지났으면 새로 받는다.
  // (앱을 며칠 켜 두어도 오래된 표를 계속 쓰지 않게) 새로 받는 동안에는 이전 표로 계속 답한다.
  const asking = query !== null;
  useEffect(() => {
    if (!asking) return;
    let cancelled = false;
    loadRates()
      .then((rates) => {
        if (!cancelled) setLoaded(rates);
      })
      .catch((err) => {
        console.warn('[Currency] 환율을 받지 못했습니다:', err);
        // 이미 표가 있으면 그 표로 계속 답한다.
        if (!cancelled) setLoaded((previous) => (previous && previous !== 'error' ? { ...previous, stale: true } : 'error'));
      });
    return () => {
      cancelled = true;
    };
    // 질문 내용이 바뀌어도 환율표는 같으므로 질문이 시작될 때만 확인한다.
  }, [asking]);

  if (!query) return null;
  if (loaded === null) return { status: 'loading', query };
  if (loaded === 'error') return { status: 'error', query };
  return answer(query, loaded);
}
