// src/features/search/services/feedback.ts
// 검색 개인화: 같은 검색어로 실제로 연 결과를 기억해 다음 검색에서 조금 올린다. (I/O 없는 순수 함수)
//
// - 결과를 연 경우(Enter, 더블클릭, 열기 버튼)만 기록한다. 선택 이동·미리보기는 기록하지 않는다.
// - 오래된 기록은 반감기로 약해지고, 짧은 시간 안에 같은 결과를 다시 열어도 한 번으로 센다.
// - 게이트를 통과한 결과의 rankScore에만 곱하므로, 걸러진 결과를 다시 끌어올리지 않는다.
import { nfc } from './textUtils';

export interface FeedbackEntry {
  /** normalizeFeedbackQuery로 정규화한 검색어 */
  query: string;
  /** 파일·폴더·앱(.app) 경로. 파일을 옮기거나 이름을 바꾸면 기록이 이어지지 않는다. */
  path: string;
  /** 감쇠를 반영한 누적 열기 횟수 (lastOpenedAt 시점 기준) */
  strength: number;
  lastOpenedAt: number;
}

/** 경로별 rankScore 배율 (1 이상). 기록이 없으면 1. */
export type RankBoost = (path: string) => number;

const DAY_MS = 24 * 60 * 60 * 1000;
export const FEEDBACK_HALF_LIFE_MS = 30 * DAY_MS;
export const FEEDBACK_COOLDOWN_MS = 10 * 60 * 1000;
/** 최대 상승폭: rankScore의 15% */
export const MAX_FEEDBACK_BOOST = 0.15;
export const MAX_FEEDBACK_ENTRIES = 2000;

export function normalizeFeedbackQuery(query: string): string {
  return nfc(query).toLowerCase().trim().replace(/\s+/g, ' ');
}

function decayedStrength(entry: FeedbackEntry, now: number): number {
  const elapsed = Math.max(0, now - entry.lastOpenedAt);
  return entry.strength * 2 ** (-elapsed / FEEDBACK_HALF_LIFE_MS);
}

/**
 * 결과 열기를 기록한 새 목록을 돌려준다. 바뀐 것이 없으면(빈 검색어, 쿨다운 중) 같은 배열을 돌려준다.
 * 최근에 쓴 순서로 MAX_FEEDBACK_ENTRIES개까지만 남긴다.
 */
export function recordOpen(
  entries: FeedbackEntry[],
  query: string,
  path: string,
  now: number,
): FeedbackEntry[] {
  const normalized = normalizeFeedbackQuery(query);
  if (!normalized || !path) return entries;

  const existing = entries.find((entry) => entry.query === normalized && entry.path === path);
  if (existing && now - existing.lastOpenedAt < FEEDBACK_COOLDOWN_MS) return entries;

  const updated: FeedbackEntry = {
    query: normalized,
    path,
    strength: (existing ? decayedStrength(existing, now) : 0) + 1,
    lastOpenedAt: now,
  };
  const rest = entries.filter((entry) => entry !== existing);
  return [updated, ...rest]
    .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
    .slice(0, MAX_FEEDBACK_ENTRIES);
}

/**
 * 검색어에 해당하는 기록으로 배율 함수를 만든다. 기록이 없으면 undefined.
 * 강도 f = 1 - 2^(-s): 한 번 열면 0.5, 두 번 0.75, 세 번 0.875로 늘어나며 1을 넘지 않는다.
 */
export function createRankBoost(
  entries: FeedbackEntry[],
  query: string,
  now: number,
): RankBoost | undefined {
  const normalized = normalizeFeedbackQuery(query);
  const factors = new Map<string, number>();
  for (const entry of entries) {
    if (entry.query !== normalized) continue;
    const intensity = 1 - 2 ** -decayedStrength(entry, now);
    factors.set(entry.path, 1 + MAX_FEEDBACK_BOOST * intensity);
  }
  if (factors.size === 0) return undefined;
  return (path) => factors.get(path) ?? 1;
}

/** 저장 파일에서 읽은 값을 검증한다. 형식이 맞지 않는 항목은 버린다. */
export function parseFeedbackEntries(value: unknown): FeedbackEntry[] {
  const list = (value as { entries?: unknown } | null)?.entries;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (entry): entry is FeedbackEntry =>
      typeof entry?.query === 'string' &&
      typeof entry?.path === 'string' &&
      Number.isFinite(entry?.strength) &&
      Number.isFinite(entry?.lastOpenedAt),
  );
}
