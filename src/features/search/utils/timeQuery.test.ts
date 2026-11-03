import { describe, expect, it } from 'vitest';
import { parseTimeQuery } from './timeQuery';
import { convertTime, dayDifference, formatOffset, offsetAt, wallTimeAt, type ResolvedZone } from './worldTime';

const place = (name: string) => ({ kind: 'place', place: name });

describe('parseTimeQuery: current time', () => {
  it('reads place + time words in every language', () => {
    expect(parseTimeQuery('뉴욕 시간')).toEqual({ kind: 'now', zone: place('뉴욕') });
    expect(parseTimeQuery('시드니 지금 몇 시')).toEqual({ kind: 'now', zone: place('시드니') });
    expect(parseTimeQuery('런던 현재 시간')).toEqual({ kind: 'now', zone: place('런던') });
    expect(parseTimeQuery('time in London')).toEqual({ kind: 'now', zone: place('London') });
    expect(parseTimeQuery('what time is it in New York')).toEqual({ kind: 'now', zone: place('New York') });
    expect(parseTimeQuery('Tokyo time')).toEqual({ kind: 'now', zone: place('Tokyo') });
    expect(parseTimeQuery('東京 今何時')).toEqual({ kind: 'now', zone: place('東京') });
    expect(parseTimeQuery('東京の時間')).toEqual({ kind: 'now', zone: place('東京') });
    expect(parseTimeQuery('纽约现在几点')).toEqual({ kind: 'now', zone: place('纽约') });
    expect(parseTimeQuery('紐約時間')).toEqual({ kind: 'now', zone: place('紐約') });
    expect(parseTimeQuery('Uhrzeit Berlin')).toEqual({ kind: 'now', zone: place('Berlin') });
    expect(parseTimeQuery('heure à Paris')).toEqual({ kind: 'now', zone: place('Paris') });
    expect(parseTimeQuery('hora en Madrid')).toEqual({ kind: 'now', zone: place('Madrid') });
    expect(parseTimeQuery('que horas são em Lisboa')).toEqual({ kind: 'now', zone: place('Lisboa') });
    expect(parseTimeQuery('KST 시간')).toEqual({ kind: 'now', zone: { kind: 'zone', label: 'KST', timeZone: 'Asia/Seoul' } });
    expect(parseTimeQuery('utc time')).toEqual({ kind: 'now', zone: { kind: 'zone', label: 'UTC', timeZone: 'UTC' } });
  });

  it('does not treat other inputs as time questions', () => {
    for (const input of ['시간', 'time', '3시간', '90 min in h', '근무 시간표', 'time-log.txt', '2026-11-04', '오후 3시', '15:00', 'meeting 3pm', '근무 시간', '지금 시간', 'screen time', '오후 3시 회의']) {
      expect(parseTimeQuery(input), input).toBeNull();
    }
  });
});

describe('parseTimeQuery: conversion', () => {
  it('reads times, zones, and separators', () => {
    expect(parseTimeQuery('3pm PST in KST')).toEqual({
      kind: 'convert',
      time: { hour: 15, minute: 0 },
      from: { kind: 'zone', label: 'PST', timeZone: 'America/Los_Angeles' },
      to: { kind: 'zone', label: 'KST', timeZone: 'Asia/Seoul' },
    });
    expect(parseTimeQuery('15:30 Berlin in Tokyo')).toMatchObject({ time: { hour: 15, minute: 30 }, from: place('Berlin'), to: place('Tokyo') });
    expect(parseTimeQuery('오후 3시 뉴욕 → 서울')).toMatchObject({ time: { hour: 15, minute: 0 }, from: place('뉴욕'), to: place('서울') });
    expect(parseTimeQuery('뉴욕 오후 3시는 서울 몇 시')).toMatchObject({ time: { hour: 15, minute: 0 }, from: place('뉴욕'), to: place('서울') });
    expect(parseTimeQuery('뉴욕 오전 9시 30분을 서울 시간으로')).toMatchObject({ time: { hour: 9, minute: 30 }, from: place('뉴욕'), to: place('서울') });
    expect(parseTimeQuery('12am UTC')).toMatchObject({ time: { hour: 0, minute: 0 }, from: { label: 'UTC' }, to: null });
    expect(parseTimeQuery('3pm in Tokyo')).toMatchObject({ from: null, to: place('Tokyo') });
    expect(parseTimeQuery('午後3時 東京 → ロンドン')).toMatchObject({ time: { hour: 15, minute: 0 } });
    expect(parseTimeQuery('下午3点 北京 → 纽约')).toMatchObject({ time: { hour: 15, minute: 0 } });
    expect(parseTimeQuery('15h30 Paris à Montréal')).toMatchObject({ time: { hour: 15, minute: 30 } });
    expect(parseTimeQuery('9am UTC+5:30 in UTC')).toMatchObject({ from: { kind: 'offset', offsetMinutes: 330 } });
  });
});

describe('worldTime', () => {
  const pst: ResolvedZone = { label: 'PST', timeZone: 'America/Los_Angeles' };
  const kst: ResolvedZone = { label: 'KST', timeZone: 'Asia/Seoul' };

  it('converts across the date line and daylight saving time', () => {
    // 2026-11-04 03:00 UTC = 11월 3일 19:00 (LA, PST)
    const now = Date.UTC(2026, 10, 4, 3, 0);
    const winter = convertTime({ hour: 15, minute: 0 }, pst, kst, now);
    expect(winter.to).toMatchObject({ day: 4, hour: 8, minute: 0 });
    expect(winter.dayShift).toBe(1);
    // 7월은 PDT(UTC-7)
    const summer = convertTime({ hour: 15, minute: 0 }, pst, kst, Date.UTC(2026, 6, 1, 20, 0));
    expect(summer.to).toMatchObject({ hour: 7 });
    expect(offsetAt(kst, now)).toBe(540);
    expect(offsetAt({ label: 'IST', offsetMinutes: 330 }, now)).toBe(330);
    expect(wallTimeAt({ label: 'UTC+5:30', offsetMinutes: 330 }, Date.UTC(2026, 0, 1, 20, 0))).toMatchObject({ day: 2, hour: 1, minute: 30 });
  });

  it('formats offsets and day differences', () => {
    expect(formatOffset(540)).toBe('GMT+9');
    expect(formatOffset(-210)).toBe('GMT-3:30');
    expect(dayDifference({ year: 2026, month: 12, day: 31, hour: 0, minute: 0 }, { year: 2027, month: 1, day: 1, hour: 0, minute: 0 })).toBe(1);
  });
});
