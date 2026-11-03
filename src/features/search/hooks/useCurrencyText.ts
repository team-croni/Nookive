// src/features/search/hooks/useCurrencyText.ts
// 환율 변환의 화면 문구와 숫자 형식. 결과 줄·미리보기·복사가 함께 쓴다.
import { useTranslation } from 'react-i18next';
import { fractionDigitsOf } from '../utils/currencyQuery';
import type { CurrencyResult } from './useCurrency';

type Ready = Extract<CurrencyResult, { status: 'ready' }>;

export function useCurrencyText() {
  const { t, i18n } = useTranslation('search');
  const language = i18n.resolvedLanguage ?? i18n.language;
  /** "₩134,412", "$20.00" (통화의 소수 자리를 따른다) */
  const money = (value: number, currency: string) => {
    try {
      return new Intl.NumberFormat(language, { style: 'currency', currency }).format(value);
    } catch {
      return `${value} ${currency}`;
    }
  };
  /** 환율은 작은 값도 보이게 유효 숫자 6자리까지: "1 USD = 1,344.13 KRW" */
  const rate = (value: number) => new Intl.NumberFormat(language, { maximumSignificantDigits: 6 }).format(value);
  const updated = (unixSeconds: number) =>
    new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(unixSeconds * 1000);

  return {
    t,
    money,
    rate,
    updated,
    title: (result: Ready) => `= ${money(result.value, result.query.to)}`,
    detail: (result: Ready) =>
      `${money(result.query.amount, result.query.from)} → ${result.query.to} · 1 ${result.query.from} = ${rate(result.rate)} ${result.query.to}`,
    /** 복사: 통화 기호와 천 단위 구분 없이, 그 통화의 소수 자리까지 */
    copyText: (result: Ready) =>
      new Intl.NumberFormat(language, { useGrouping: false, maximumFractionDigits: fractionDigitsOf(result.query.to) }).format(result.value),
  };
}
