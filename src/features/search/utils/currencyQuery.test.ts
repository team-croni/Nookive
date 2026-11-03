import { describe, expect, it } from 'vitest';
import { fractionDigitsOf, parseCurrencyQuery, rateOf } from './currencyQuery';

const q = (input: string, region?: string) => parseCurrencyQuery(input, { region });

describe('parseCurrencyQuery', () => {
  it('reads codes, symbols, and names', () => {
    expect(q('100 usd in krw')).toEqual({ amount: 100, from: 'USD', to: 'KRW' });
    expect(q('100 USD to KRW')).toEqual({ amount: 100, from: 'USD', to: 'KRW' });
    expect(q('€20 to usd')).toEqual({ amount: 20, from: 'EUR', to: 'USD' });
    expect(q('20€ in dollars')).toEqual({ amount: 20, from: 'EUR', to: 'USD' });
    expect(q('1,500.50 GBP → JPY')).toEqual({ amount: 1500.5, from: 'GBP', to: 'JPY' });
    expect(q('usd 100 in eur')).toEqual({ amount: 100, from: 'USD', to: 'EUR' });
    expect(q('10 usd in twd')).toEqual({ amount: 10, from: 'USD', to: 'TWD' });
    expect(q('(12+8) usd in eur')).toEqual({ amount: 20, from: 'USD', to: 'EUR' });
  });

  it('reads Korean, Japanese, and Chinese forms', () => {
    expect(q('50달러 원화로')).toEqual({ amount: 50, from: 'USD', to: 'KRW' });
    expect(q('1000엔은 원으로')).toEqual({ amount: 1000, from: 'JPY', to: 'KRW' });
    expect(q('100달러를 원화로 환산')).toEqual({ amount: 100, from: 'USD', to: 'KRW' });
    expect(q('1만 원을 달러로')).toEqual({ amount: 10000, from: 'KRW', to: 'USD' });
    expect(q('3만5천원 엔화로')).toEqual({ amount: 35000, from: 'KRW', to: 'JPY' });
    expect(q('100ドルは円で')).toEqual({ amount: 100, from: 'USD', to: 'JPY' });
    expect(q('100美元等于多少人民币')).toEqual({ amount: 100, from: 'USD', to: 'CNY' });
    expect(q('100美元换成日元')).toEqual({ amount: 100, from: 'USD', to: 'JPY' });
  });

  it('uses the macOS region for shared names', () => {
    expect(q('$100 to eur', 'CA')).toMatchObject({ from: 'CAD' });
    expect(q('100 달러 원화로', 'KR')).toMatchObject({ from: 'USD' });
    expect(q('¥1000 in usd', 'CN')).toMatchObject({ from: 'CNY' });
    expect(q('¥1000 in usd', 'JP')).toMatchObject({ from: 'JPY' });
    expect(q('100元 in usd', 'TW')).toMatchObject({ from: 'TWD' });
  });

  it('does not treat other inputs as currency conversions', () => {
    for (const input of ['100 usd', 'usd', 'usd in krw', '100 krw in krw', '10 km in mi', 'all in one', '5 cups to ml', '100원', 'dollar store', '회원 가입으로']) {
      expect(q(input), input).toBeNull();
    }
  });
});

describe('rates', () => {
  const table = { base: 'USD', rates: { USD: 1, KRW: 1344, EUR: 0.9, JPY: 158 }, updatedAt: 0 };
  it('converts through the base currency', () => {
    expect(rateOf(table, 'USD', 'KRW')).toBe(1344);
    expect(rateOf(table, 'EUR', 'KRW')).toBeCloseTo(1493.33, 2);
    expect(rateOf(table, 'USD', 'XYZ')).toBeNull();
    expect(fractionDigitsOf('KRW')).toBe(0);
    expect(fractionDigitsOf('USD')).toBe(2);
  });
});
