// src/features/search/evaluation/metrics.ts
// 검색 평가 지표: Recall@K, MRR, 정답 없는 쿼리의 오탐률, 위치(페이지/라인/시점) 정확도.
import type { SearchResultItem } from '../../../types/search';

export interface LocationExpectation {
  pageNumber?: number;
  lineStart?: number;
  timestampSeconds?: number;
  /** lineStart / timestampSeconds 허용 오차 */
  tolerance?: number;
}

export interface LabeledQuery {
  query: string;
  tags: string[];
  /** 기대 경로 목록. 비어 있으면 결과가 없어야 하는 쿼리다. */
  relevant: string[];
  location?: LocationExpectation;
}

export interface QueryOutcome {
  query: string;
  /** 첫 정답의 1-based 순위. 없으면 null */
  firstRelevantRank: number | null;
  recallAt5: number;
  recallAt10: number;
  resultCount: number;
  /** location 기대값이 없으면 null */
  locationMatched: boolean | null;
  topPaths: string[];
}

export interface EvaluationMetrics {
  recallAt5: number;
  recallAt10: number;
  mrr: number;
  noAnswerFalsePositiveRate: number;
  locationAccuracy: number;
}

function recallAt(paths: string[], relevant: string[], k: number): number {
  const top = new Set(paths.slice(0, k));
  return relevant.filter((path) => top.has(path)).length / relevant.length;
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
  const firstIndex = paths.findIndex((path) => relevantSet.has(path));
  const answerable = labeled.relevant.length > 0;
  return {
    query: labeled.query,
    firstRelevantRank: firstIndex >= 0 ? firstIndex + 1 : null,
    recallAt5: answerable ? recallAt(paths, relevant, 5) : 0,
    recallAt10: answerable ? recallAt(paths, relevant, 10) : 0,
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
    noAnswerFalsePositiveRate: mean(noAnswer.map((outcome) => (outcome.resultCount > 0 ? 1 : 0))),
    locationAccuracy: mean(located.map((outcome) => (outcome.locationMatched ? 1 : 0))),
  };
}
