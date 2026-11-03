import { describe, expect, it } from 'vitest';
import { addToDate, answerDateQuery, isDayFirst, parseDateQuery, weekdayOf, type DateAnswer } from './dateQuery';

const today = { year: 2026, month: 11, day: 4 }; // 수요일
const answer = (input: string, dayFirst = false): DateAnswer | null => {
  const query = parseDateQuery(input, { dayFirst });
  return query ? answerDateQuery(query, today) : null;
};
const dateOf = (input: string, dayFirst = false) => {
  const result = answer(input, dayFirst);
  return result?.kind === 'date' ? result.date : null;
};
const daysOf = (input: string) => {
  const result = answer(input);
  return result?.kind === 'days' ? result.days : null;
};

describe('date questions', () => {
  it('moves from today', () => {
    expect(dateOf('100일 후')).toEqual({ year: 2027, month: 2, day: 12 });
    expect(dateOf('100 days from today')).toEqual({ year: 2027, month: 2, day: 12 });
    expect(dateOf('in 2 months')).toEqual({ year: 2027, month: 1, day: 4 });
    expect(dateOf('3 weeks ago')).toEqual({ year: 2026, month: 10, day: 14 });
    expect(dateOf('2주 전')).toEqual({ year: 2026, month: 10, day: 21 });
    expect(dateOf('100日後')).toEqual({ year: 2027, month: 2, day: 12 });
    expect(dateOf('3天前')).toEqual({ year: 2026, month: 11, day: 1 });
    expect(dateOf('vor 10 Tagen')).toEqual({ year: 2026, month: 10, day: 25 });
    expect(dateOf('dans 2 semaines')).toEqual({ year: 2026, month: 11, day: 18 });
    expect(dateOf('hace 1 año')).toEqual({ year: 2025, month: 11, day: 4 });
    expect(dateOf('daqui a 5 dias')).toEqual({ year: 2026, month: 11, day: 9 });
  });

  it('moves from a date, including Korean anniversaries that count the start day', () => {
    expect(dateOf('2026-12-25 + 30 days')).toEqual({ year: 2027, month: 1, day: 24 });
    expect(dateOf('2026-03-01부터 100일')).toEqual({ year: 2026, month: 6, day: 8 });
    expect(answer('2026-03-01부터 100일')?.query).toMatchObject({ countsStartDay: true });
    expect(dateOf('2026-03-01부터 100일 후')).toEqual({ year: 2026, month: 6, day: 9 });
    expect(dateOf('2 weeks before Christmas')).toEqual({ year: 2026, month: 12, day: 11 });
    expect(dateOf('2028-02-29 + 1 year')).toEqual({ year: 2029, month: 2, day: 28 });
    expect(addToDate({ year: 2026, month: 1, day: 31 }, 1, 'month')).toEqual({ year: 2026, month: 2, day: 28 });
  });

  it('counts days until a date', () => {
    expect(daysOf('크리스마스까지')).toBe(51);
    expect(daysOf('days until 2026-12-25')).toBe(51);
    expect(daysOf('12월 25일까지 며칠')).toBe(51);
    expect(daysOf('クリスマスまで')).toBe(51);
    expect(daysOf('距离圣诞节还有几天')).toBe(51);
    // 연도 없는 날이 지났으면 내년으로 본다.
    expect(daysOf('10월 1일까지')).toBe(331);
    expect(daysOf('tage bis 24. Dezember')).toBe(50);
  });

  it('counts days between dates', () => {
    expect(daysOf('2026-12-25 - 2026-11-04')).toBe(-51);
    expect(daysOf('2026-01-01부터 오늘까지')).toBe(307);
    expect(daysOf('days between 2026-01-01 and 2026-12-31')).toBe(364);
  });

  it('finds the weekday', () => {
    const weekday = (input: string) => {
      const date = dateOf(input);
      return date ? weekdayOf(date) : null;
    };
    expect(weekday('2026-12-25 무슨 요일')).toBe(5);
    expect(weekday('what day is December 25, 2026')).toBe(5);
    expect(weekday('2026年12月25日は何曜日')).toBe(5);
    expect(weekday('2026年12月25日是星期几')).toBe(5);
    expect(weekday('quel jour est le 25 décembre 2026')).toBe(5);
    expect(weekday('qué día es el 25 de diciembre de 2026')).toBe(5);
  });

  it('reads numeric dates in the region order', () => {
    expect(dateOf('12/25 무슨 요일')).toEqual({ year: 2026, month: 12, day: 25 });
    expect(dateOf('25/12 what day is', true)).toBeNull();
    expect(dateOf('what day is 25/12', true)).toEqual({ year: 2026, month: 12, day: 25 });
    expect(isDayFirst('en-US')).toBe(false);
    expect(isDayFirst('en-GB')).toBe(true);
    expect(isDayFirst('ko-KR')).toBe(false);
  });

  it('does not treat other inputs as date questions', () => {
    for (const input of ['2026-11-03', '100일', '오늘', 'today', '0.1.4', '010-1234-5678', '12 - 3', '3 weeks', 'report 2026-11-03', '보고서 12월 25일까지', '1999 - 2000', '오늘까지']) {
      expect(answer(input), input).toBeNull();
    }
  });
});
