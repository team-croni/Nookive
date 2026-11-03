import { describe, expect, it } from 'vitest';
import { calculate, copyTextForCalculation, formatCalculation } from './calculator';

const value = (input: string) => calculate(input)?.value;

describe('calculate: arithmetic', () => {
  it('follows precedence, parentheses, powers, and unary minus', () => {
    expect(value('12*7')).toBe(84);
    expect(value('1+2*3')).toBe(7);
    expect(value('(1+2)^3')).toBe(27);
    expect(value('2^3^2')).toBe(512);
    expect(value('-2^2')).toBe(-4);
    expect(value('10 / 4')).toBe(2.5);
    expect(value('3 × 4 ÷ 2')).toBe(6);
    expect(value('-(3+2)')).toBe(-5);
  });

  it('handles percent, "of", decimals, and thousands separators', () => {
    expect(value('15% of 80')).toBe(12);
    expect(value('50%*200')).toBe(100);
    expect(value('1,200*3')).toBe(3600);
    expect(value('.5+.25')).toBe(0.75);
  });

  it('shows nothing for inputs that are not calculations', () => {
    // 날짜가 들어간 식은 날짜 계산(dateQuery.ts)이 답한다.
    for (const input of ['2024', '2026-11-03', '11/3/2026', '010-1234-5678', '0.1.4', 'report-final', '(5)', '1/0', '2+', 'claude', '2026-12-25 - 2026-11-04', '2026-12-25 + 30']) {
      expect(calculate(input), input).toBeNull();
    }
  });
});

describe('calculate: units', () => {
  it('converts lengths, masses, data sizes, time, area, and speed', () => {
    expect(value('10 km in mi')).toBeCloseTo(6.2137, 4);
    expect(value('10km to mi')).toBeCloseTo(6.2137, 4);
    expect(value('5 lb in kg')).toBeCloseTo(2.268, 3);
    expect(value('5 GB in MB')).toBe(5000);
    expect(value('1 GiB in MiB')).toBe(1024);
    expect(value('90 min in h')).toBe(1.5);
    expect(value('33 평 in m2')).toBeCloseTo(109.09, 2);
    expect(value('100 km/h in mph')).toBeCloseTo(62.137, 3);
    expect(calculate('10 km in mi')).toMatchObject({ kind: 'unit', unit: 'mi', interpretation: '10 km → mi' });
  });

  it('converts temperatures', () => {
    expect(value('100f in c')).toBeCloseTo(37.778, 3);
    expect(value('0 c to f')).toBe(32);
    expect(value('0 K → c')).toBeCloseTo(-273.15, 2);
  });

  it('accepts Korean unit names and particles', () => {
    expect(value('10킬로미터를 마일로')).toBeCloseTo(6.2137, 4);
    expect(value('100f를 c로')).toBeCloseTo(37.778, 3);
  });

  it('rejects mismatched or unknown units', () => {
    expect(calculate('10 km in kg')).toBeNull();
    expect(calculate('10 km in km')).toBeNull();
    expect(calculate('10 parsecs in km')).toBeNull();
  });
});

describe('formatting', () => {
  it('formats in the app language and copies without grouping or unit', () => {
    const result = calculate('1234567*1')!;
    expect(formatCalculation(result, 'en')).toBe('1,234,567');
    expect(formatCalculation(result, 'de')).toBe('1.234.567');
    expect(copyTextForCalculation(result, 'en')).toBe('1234567');
    const unit = calculate('10 km in mi')!;
    expect(formatCalculation(unit, 'en')).toBe('6.213711922 mi');
    expect(copyTextForCalculation(unit, 'de')).toBe('6,213711922');
  });
});
