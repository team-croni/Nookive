// src/features/search/evaluation/metrics.ts
// 검색 평가 지표: Recall@K, MRR, nDCG@10, Precision@5, 잡음 비율,
// 정답 없는 쿼리의 오탐률, 위치(페이지/라인/시점) 정확도.
import type { SearchResultItem } from '../../../types/search';

export interface LocationExpectation {
  pageNumber?: number;
  lineStart?: number;
  timestampSeconds?: number;
  /** lineStart / timestampSeconds 허용 오차 */
  tolerance?: number;
}

export type QuerySplit = 'dev' | 'test';

export interface LabeledQuery {
  query: string;
  tags: string[];
  /** 조정용(dev)과 확인용(test) 쿼리를 나눈다. */
  split: QuerySplit;
  /** 반드시 나와야 하는 경로. 비어 있으면 결과가 없어야 하는 쿼리다. */
  relevant: string[];
  /** 나와도 잡음으로 세지 않는 경로 (예: 같은 주제의 다른 문서). */
  acceptable?: string[];
  location?: LocationExpectation;
}

export interface QueryOutcome {
  query: string;
  /** 첫 정답의 1-based 순위. 없으면 null */
  firstRelevantRank: number | null;
  recallAt5: number;
  recallAt10: number;
  ndcgAt10: number;
  /** 반환된 상위 5개 중 relevant/acceptable 비율. 결과가 없으면 0 */
  precisionAt5: number;
  /** 반환된 상위 10개 중 relevant/acceptable이 아닌 결과 비율. 결과가 없으면 0 */
  noiseRate: number;
  resultCount: number;
  /** location 기대값이 없으면 null */
  locationMatched: boolean | null;
  topPaths: string[];
}

export interface EvaluationMetrics {
  recallAt5: number;
  recallAt10: number;
  mrr: number;
  ndcgAt10: number;
  precisionAt5: number;
  noiseRate: number;
  noAnswerFalsePositiveRate: number;
  locationAccuracy: number;
}

/** 높을수록 좋은 지표와 낮을수록 좋은 지표. 기준선 비교 방향에 쓴다. */
export const HIGHER_IS_BETTER = [
  'recallAt5',
  'recallAt10',
  'mrr',
  'ndcgAt10',
  'precisionAt5',
  'locationAccuracy',
] as const;
export const LOWER_IS_BETTER = ['noiseRate', 'noAnswerFalsePositiveRate'] as const;

function recallAt(paths: string[], relevant: string[], k: number): number {
  const top = new Set(paths.slice(0, k));
  return relevant.filter((path) => top.has(path)).length / relevant.length;
}

const RELEVANT_GAIN = 2;
const ACCEPTABLE_GAIN = 1;

function dcg(gains: number[]): number {
  return gains.reduce((sum, gain, index) => sum + gain / Math.log2(index + 2), 0);
}

function ndcgAt(paths: string[], relevant: Set<string>, acceptable: Set<string>, k: number): number {
  const gainOf = (path: string) =>
    relevant.has(path) ? RELEVANT_GAIN : acceptable.has(path) ? ACCEPTABLE_GAIN : 0;
  const ideal = [
    ...Array<number>(relevant.size).fill(RELEVANT_GAIN),
    ...Array<number>(acceptable.size).fill(ACCEPTABLE_GAIN),
  ].slice(0, k);
  const idealDcg = dcg(ideal);
  return idealDcg > 0 ? dcg(paths.slice(0, k).map(gainOf)) / idealDcg : 0;
}

function matchesLocation(item: SearchResultItem, expected: LocationExpectation): boolean {
  const chunk = item.bestChunk;
  const tolerance = expected.tolerance ?? 0;
  if (expected.pageNumber !== undefined && chunk.pageNumber !== expected.pageNumber) return false;
  if (
    expected.lineStart !== undefined
    && (chunk.lineStart === undefined || Math.abs(chunk.lineStart - expected.lineStart) > tolerance)
  ) {
    return false;
  }
  if (
    expected.timestampSeconds !== undefined
    && (
      chunk.timestampSeconds === undefined
      || Math.abs(chunk.timestampSeconds - expected.timestampSeconds) > tolerance
    )
  ) {
    return false;
  }
  return true;
}

// macOS 파일 경로는 NFD(분해형)로 저장될 수 있으므로 NFC로 맞춰 비교한다.
const normalizePath = (path: string): string => path.normalize('NFC');

/** 화면에 표시되는 순서의 결과 목록으로 한 쿼리를 평가한다. */
export function evaluateQuery(labeled: LabeledQuery, results: SearchResultItem[]): QueryOutcome {
  const paths = results.map((item) => normalizePath(item.file.path));
  const relevant = labeled.relevant.map(normalizePath);
  const relevantSet = new Set(relevant);
  const acceptableSet = new Set((labeled.acceptable ?? []).map(normalizePath));
  const isExpected = (path: string) => relevantSet.has(path) || acceptableSet.has(path);
  const firstIndex = paths.findIndex((path) => relevantSet.has(path));
  const answerable = labeled.relevant.length > 0;
  const top5 = paths.slice(0, 5);
  const top10 = paths.slice(0, 10);
  return {
    query: labeled.query,
    firstRelevantRank: firstIndex >= 0 ? firstIndex + 1 : null,
    recallAt5: answerable ? recallAt(paths, relevant, 5) : 0,
    recallAt10: answerable ? recallAt(paths, relevant, 10) : 0,
    ndcgAt10: answerable ? ndcgAt(paths, relevantSet, acceptableSet, 10) : 0,
    precisionAt5: top5.length > 0 ? top5.filter(isExpected).length / top5.length : 0,
    noiseRate: top10.length > 0 ? top10.filter((path) => !isExpected(path)).length / top10.length : 0,
    resultCount: results.length,
    locationMatched: labeled.location
      ? firstIndex >= 0 && matchesLocation(results[firstIndex], labeled.location)
      : null,
    topPaths: paths.slice(0, 5),
  };
}

const mean = (values: number[]): number =>
  values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

export function aggregate(labeled: LabeledQuery[], outcomes: QueryOutcome[]): EvaluationMetrics {
  const answerable = outcomes.filter((_, index) => labeled[index].relevant.length > 0);
  const noAnswer = outcomes.filter((_, index) => labeled[index].relevant.length === 0);
  const located = outcomes.filter((outcome) => outcome.locationMatched !== null);
  return {
    recallAt5: mean(answerable.map((outcome) => outcome.recallAt5)),
    recallAt10: mean(answerable.map((outcome) => outcome.recallAt10)),
    mrr: mean(answerable.map((outcome) => (
      outcome.firstRelevantRank ? 1 / outcome.firstRelevantRank : 0
    ))),
    ndcgAt10: mean(answerable.map((outcome) => outcome.ndcgAt10)),
    precisionAt5: mean(answerable.map((outcome) => outcome.precisionAt5)),
    noiseRate: mean(answerable.map((outcome) => outcome.noiseRate)),
    noAnswerFalsePositiveRate: mean(noAnswer.map((outcome) => (outcome.resultCount > 0 ? 1 : 0))),
    locationAccuracy: mean(located.map((outcome) => (outcome.locationMatched ? 1 : 0))),
  };
}

/** 조건에 맞는 쿼리만 골라 지표를 계산한다. (태그별/분할별 보고서용) */
export function aggregateWhere(
  labeled: LabeledQuery[],
  outcomes: QueryOutcome[],
  predicate: (query: LabeledQuery) => boolean,
): { count: number; metrics: EvaluationMetrics } {
  const indexes = labeled.flatMap((query, index) => (predicate(query) ? [index] : []));
  return {
    count: indexes.length,
    metrics: aggregate(indexes.map((index) => labeled[index]), indexes.map((index) => outcomes[index])),
  };
}
