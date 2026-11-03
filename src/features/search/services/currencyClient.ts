// src/features/search/services/currencyClient.ts
// 환율표 브리지 (Rust currency_rates). 미국 달러 기준 환율표 하나를 받아 Mac에 저장해 둔다.
// - 환율표는 하루에 한 번 갱신되므로, 다음 갱신 예정 시각 전에는 다시 받지 않는다.
// - 받지 못하면(오프라인 등) 저장해 둔 표를 쓰고, 오래된 표라고 알린다.
import { invoke } from '@tauri-apps/api/core';
import type { RateTable } from '../utils/currencyQuery';

const CACHE_KEY = 'nookive.currencyRates';
/** 서버가 다음 갱신 시각을 주지 않으면 12시간 동안 다시 받지 않는다. */
const FALLBACK_TTL_MS = 12 * 60 * 60 * 1000;

interface CachedRates {
  table: RateTable;
  /** 이 시각(ms)이 지나면 새로 받는다. */
  refreshAfter: number;
}

interface RatesResponse {
  base: string;
  rates: Record<string, number>;
  updatedAt: number;
  nextUpdateAt?: number | null;
}

export interface RatesResult {
  table: RateTable;
  /** 새로 받지 못해 저장해 둔 표를 쓰는 중 */
  stale: boolean;
}

function readCache(): CachedRates | null {
  try {
    const value = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as CachedRates | null;
    return value?.table?.rates ? value : null;
  } catch {
    return null;
  }
}

/** 저장해 둔 표가 아직 새것이면 바로 돌려준다. (요청 없이 첫 화면에서 답할 수 있게) */
export function freshCachedRates(): RateTable | null {
  const cached = readCache();
  return cached && Date.now() < cached.refreshAfter ? cached.table : null;
}

let inFlight: Promise<RatesResult> | null = null;

export function loadRates(): Promise<RatesResult> {
  const cached = readCache();
  if (cached && Date.now() < cached.refreshAfter) return Promise.resolve({ table: cached.table, stale: false });
  inFlight ??= invoke<RatesResponse>('currency_rates')
    .then((response) => {
      const table: RateTable = { base: response.base, rates: response.rates, updatedAt: response.updatedAt };
      // 다음 갱신 시각 뒤 몇 분 여유를 둔다. 이미 지난 시각이면 12시간 뒤.
      const next = response.nextUpdateAt ? response.nextUpdateAt * 1000 + 5 * 60 * 1000 : 0;
      const refreshAfter = next > Date.now() ? next : Date.now() + FALLBACK_TTL_MS;
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ table, refreshAfter } satisfies CachedRates));
      } catch {
        // 저장하지 못해도 이번 답은 그대로 쓴다.
      }
      return { table, stale: false };
    })
    .catch((err) => {
      if (cached) return { table: cached.table, stale: true };
      throw err;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
