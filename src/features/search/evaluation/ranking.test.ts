// 검색 순위 회귀 테스트. 고정 fixture(사전 계산 벡터)로 실제 순위 파이프라인을 실행해
// baseline.json의 지표보다 나빠지면 실패한다.
//
// - 쿼리 추가/코퍼스 변경 후: `npm run eval:fixture` (임베딩 서버 필요, macOS)
// - 순위 로직을 의도적으로 바꾼 뒤: `npm run eval:baseline`으로 기준선을 갱신하고 PR에 포함한다.
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SearchResultItem } from '../../../types/search';
import { isLowSignalQuery, rankQuery } from '../services/rankQuery';
import { orderResultsBySection } from '../utils/orderResults';
import {
  aggregate,
  evaluateQuery,
  type EvaluationMetrics,
  type LabeledQuery,
} from './metrics';

interface Fixture {
  modelVersion: string;
  records: SearchResultItem[];
  queryVectors: Record<string, number[]>;
}

// 높을수록 좋은 지표는 이만큼까지 하락을 허용한다. 정답 쿼리가 33개일 때
// 한 쿼리의 정답이 1위→2위로 밀리는 정도(MRR -0.015)는 통과하고,
// 한 쿼리의 정답이 사라지는 경우(Recall -0.03)는 실패한다.
const TOLERANCE = 0.02;

const readJson = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf-8')) as T;

const fixture = readJson<Fixture>('./fixture.json');
const { queries } = readJson<{ queries: LabeledQuery[] }>('./queries.json');
const baselineUrl = new URL('./baseline.json', import.meta.url);

/** 앱과 같은 경로: 저신호 쿼리는 임베딩 없이 키워드로만 검색하고, 결과는 섹션 순서로 표시한다. */
function search(query: string): SearchResultItem[] {
  const vector = isLowSignalQuery(query) ? null : fixture.queryVectors[query];
  return orderResultsBySection(rankQuery(fixture.records, query, vector));
}

const formatReport = (outcomes: ReturnType<typeof evaluateQuery>[]): string =>
  outcomes
    .map((outcome, index) => {
      const labeled = queries[index];
      const expected = labeled.relevant.length === 0 ? 'no answer' : `rank ${outcome.firstRelevantRank ?? '-'}`;
      const location = outcome.locationMatched === null ? '' : ` location=${outcome.locationMatched}`;
      return `${labeled.query} → ${expected} (${outcome.resultCount} results)${location}\n    ${outcome.topPaths.join(', ')}`;
    })
    .join('\n');

describe('search ranking evaluation', () => {
  it('has a precomputed vector for every query', () => {
    const missing = queries
      .map(({ query }) => query)
      .filter((query) => !isLowSignalQuery(query) && !fixture.queryVectors[query]);
    expect(missing, 'run `npm run eval:fixture` to embed new queries').toEqual([]);
  });

  it('does not regress against the baseline', () => {
    const outcomes = queries.map((labeled) => evaluateQuery(labeled, search(labeled.query)));
    const metrics = aggregate(queries, outcomes);

    if (process.env.NOOKIVE_UPDATE_BASELINE) {
      writeFileSync(baselineUrl, `${JSON.stringify(roundMetrics(metrics), null, 2)}\n`);
      console.log(`${formatReport(outcomes)}\n\nbaseline updated: ${JSON.stringify(roundMetrics(metrics))}`);
      return;
    }

    const baseline = JSON.parse(readFileSync(baselineUrl, 'utf-8')) as EvaluationMetrics;
    const regressions: string[] = [];
    for (const key of ['recallAt5', 'recallAt10', 'mrr', 'locationAccuracy'] as const) {
      if (metrics[key] < baseline[key] - TOLERANCE) {
        regressions.push(`${key}: ${metrics[key].toFixed(4)} < baseline ${baseline[key]}`);
      }
    }
    if (metrics.noAnswerFalsePositiveRate > baseline.noAnswerFalsePositiveRate + 1e-9) {
      regressions.push(
        `noAnswerFalsePositiveRate: ${metrics.noAnswerFalsePositiveRate.toFixed(4)} > baseline ${baseline.noAnswerFalsePositiveRate}`,
      );
    }
    expect(regressions, `\n${formatReport(outcomes)}\n`).toEqual([]);
  });
});

function roundMetrics(metrics: EvaluationMetrics): EvaluationMetrics {
  return Object.fromEntries(
    Object.entries(metrics).map(([key, value]) => [key, Number(value.toFixed(4))]),
  ) as unknown as EvaluationMetrics;
}
