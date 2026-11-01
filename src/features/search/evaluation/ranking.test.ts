// 검색 순위 회귀 테스트. 고정 fixture(사전 계산 벡터)로 실제 순위 파이프라인을 실행해
// baseline.json의 지표보다 나빠지면 실패한다.
//
// - 쿼리 추가/코퍼스 변경 후: `npm run eval:fixture` (임베딩 서버 필요, macOS)
// - 순위 로직을 의도적으로 바꾼 뒤: `npm run eval:baseline`으로 기준선을 갱신하고 PR에 포함한다.
// - 순위 로직은 dev 쿼리를 보며 조정하고, test 쿼리로 과적합 여부를 확인한다.
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SearchResultItem } from '../../../types/search';
import { isLowSignalQuery, rankQuery } from '../services/rankQuery';
import { orderResultsBySection } from '../utils/orderResults';
import {
  aggregateWhere,
  evaluateQuery,
  HIGHER_IS_BETTER,
  LOWER_IS_BETTER,
  type EvaluationMetrics,
  type LabeledQuery,
  type QueryOutcome,
} from './metrics';

interface Fixture {
  modelVersion: string;
  records: SearchResultItem[];
  queryVectors: Record<string, number[]>;
}

type Baseline = Record<'overall' | 'dev' | 'test', EvaluationMetrics>;

// 지표별 허용 하락폭. 분할당 정답 쿼리가 30개 이상일 때 한 쿼리의 정답이
// 1위→2위로 밀리는 정도(MRR 약 -0.015)는 통과하고, 정답이 사라지면(Recall 약 -0.03) 실패한다.
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

const round = (value: number): number => Number(value.toFixed(4));

function roundMetrics(metrics: EvaluationMetrics): EvaluationMetrics {
  return Object.fromEntries(
    Object.entries(metrics).map(([key, value]) => [key, round(value)]),
  ) as unknown as EvaluationMetrics;
}

function computeBaseline(outcomes: QueryOutcome[]): Baseline {
  const by = (predicate: (query: LabeledQuery) => boolean) =>
    roundMetrics(aggregateWhere(queries, outcomes, predicate).metrics);
  return {
    overall: by(() => true),
    dev: by((query) => query.split === 'dev'),
    test: by((query) => query.split === 'test'),
  };
}

function formatQueries(outcomes: QueryOutcome[]): string {
  return outcomes
    .map((outcome, index) => {
      const labeled = queries[index];
      const expected = labeled.relevant.length === 0
        ? 'no answer'
        : `rank ${outcome.firstRelevantRank ?? '-'} p@5=${round(outcome.precisionAt5)}`;
      const location = outcome.locationMatched === null ? '' : ` location=${outcome.locationMatched}`;
      return `[${labeled.split}] ${labeled.query} → ${expected} (${outcome.resultCount} results)${location}\n    ${outcome.topPaths.join(', ')}`;
    })
    .join('\n');
}

/** 태그별 지표 표. 전체 평균에 약점이 가려지지 않도록 영역별로 따로 본다. */
function formatTags(outcomes: QueryOutcome[]): string {
  const tags = [...new Set(queries.flatMap((query) => query.tags))].sort();
  const rows = tags.map((tag) => {
    const inTag = (query: LabeledQuery) => query.tags.includes(tag);
    const { count, metrics } = aggregateWhere(queries, outcomes, inTag);
    const noAnswerOnly = queries.filter(inTag).every((query) => query.relevant.length === 0);
    const values = noAnswerOnly
      ? `fp=${round(metrics.noAnswerFalsePositiveRate)}`
      : `recall@5=${round(metrics.recallAt5)} mrr=${round(metrics.mrr)} ndcg@10=${round(metrics.ndcgAt10)} p@5=${round(metrics.precisionAt5)} noise=${round(metrics.noiseRate)}`;
    return `${tag.padEnd(12)} n=${String(count).padStart(2)}  ${values}`;
  });
  return rows.join('\n');
}

function findRegressions(current: Baseline, baseline: Baseline): string[] {
  const regressions: string[] = [];
  for (const scope of ['overall', 'dev', 'test'] as const) {
    for (const key of HIGHER_IS_BETTER) {
      if (current[scope][key] < baseline[scope][key] - TOLERANCE) {
        regressions.push(`${scope}.${key}: ${current[scope][key]} < baseline ${baseline[scope][key]}`);
      }
    }
    for (const key of LOWER_IS_BETTER) {
      // 정답 없는 쿼리의 오탐은 하나라도 늘면 실패한다.
      const tolerance = key === 'noAnswerFalsePositiveRate' ? 1e-9 : TOLERANCE;
      if (current[scope][key] > baseline[scope][key] + tolerance) {
        regressions.push(`${scope}.${key}: ${current[scope][key]} > baseline ${baseline[scope][key]}`);
      }
    }
  }
  return regressions;
}

describe('search ranking evaluation', () => {
  it('has a precomputed vector for every query', () => {
    const missing = queries
      .map(({ query }) => query)
      .filter((query) => !isLowSignalQuery(query) && !fixture.queryVectors[query]);
    expect(missing, 'run `npm run eval:fixture` to embed new queries').toEqual([]);
  });

  it('labels every query with a split', () => {
    expect(queries.filter((query) => query.split !== 'dev' && query.split !== 'test')).toEqual([]);
  });

  it('does not regress against the baseline', () => {
    const outcomes = queries.map((labeled) => evaluateQuery(labeled, search(labeled.query)));
    const current = computeBaseline(outcomes);
    const report = `${formatQueries(outcomes)}\n\n${formatTags(outcomes)}`;

    if (process.env.NOOKIVE_UPDATE_BASELINE) {
      writeFileSync(baselineUrl, `${JSON.stringify(current, null, 2)}\n`);
      console.log(`${report}\n\nbaseline updated:\n${JSON.stringify(current, null, 2)}`);
      return;
    }

    const baseline = JSON.parse(readFileSync(baselineUrl, 'utf-8')) as Baseline;
    expect(findRegressions(current, baseline), `\n${report}\n`).toEqual([]);
  });
});
