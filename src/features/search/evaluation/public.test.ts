// 공개 데이터셋 벤치마크 (로컬 전용, CI에서는 건너뛴다).
// `npm run eval:public:prepare -- <dataset>`으로 준비한 데이터에서 세 가지 방식을 비교한다.
//
// - nookive: 앱과 같은 전체 파이프라인 (게이트, 키워드 가산점, 파일 단위 그룹화, 섹션 정렬)
// - cosine: 게이트 없이 파일별 최고 코사인 유사도 순 상위 20개
// - keyword: 임베딩 없이 키워드 검색만
//
// 실행: npm run eval:public -- <miracl|xm3600|mixed>
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SearchResultItem } from '../../../types/search';
import { rankQuery } from '../services/rankQuery';
import { computeCosineSimilarity } from '../services/scoring';
import { orderResultsBySection } from '../utils/orderResults';
import {
  aggregateWhere,
  evaluateQuery,
  type EvaluationMetrics,
  type LabeledQuery,
  type QueryOutcome,
} from './metrics';

const dataset = process.env.NOOKIVE_PUBLIC_EVAL ?? '';
const datasetDir = join(homedir(), 'Library/Caches/nookive-eval/datasets', dataset);
const COSINE_TOP_K = 20;

type Mode = 'nookive' | 'cosine' | 'keyword';

interface PublicFixture {
  records: SearchResultItem[];
  queryVectors: Record<string, number[]>;
}

/** 게이트 없는 기준선: 파일별 최고 코사인 유사도로 정렬한다. */
function cosineSearch(records: SearchResultItem[], vector: number[]): SearchResultItem[] {
  const best = new Map<string, { item: SearchResultItem; score: number }>();
  for (const item of records) {
    if (!item.vector) continue;
    const score = Math.max(
      computeCosineSimilarity(vector, item.vector),
      item.textVector ? computeCosineSimilarity(vector, item.textVector) : 0,
    );
    const current = best.get(item.file.path);
    if (!current || score > current.score) best.set(item.file.path, { item, score });
  }
  return [...best.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, COSINE_TOP_K)
    .map(({ item }) => item);
}

function search(mode: Mode, fixture: PublicFixture, query: string): SearchResultItem[] {
  const vector = fixture.queryVectors[query];
  if (mode === 'cosine') return cosineSearch(fixture.records, vector);
  return orderResultsBySection(rankQuery(fixture.records, query, mode === 'nookive' ? vector : null));
}

const fmt = (value: number): string => value.toFixed(3);

function summarize(queries: LabeledQuery[], outcomes: QueryOutcome[]) {
  const scope = (predicate: (query: LabeledQuery) => boolean) => {
    const { count, metrics } = aggregateWhere(queries, outcomes, predicate);
    const selected = outcomes.filter((_, index) => predicate(queries[index]));
    return {
      count,
      metrics,
      // 게이트가 너무 엄격하면 결과가 아예 없는 쿼리가 늘어난다.
      emptyRate: selected.filter((outcome) => outcome.resultCount === 0).length / Math.max(selected.length, 1),
      averageResults: selected.reduce((sum, outcome) => sum + outcome.resultCount, 0) / Math.max(selected.length, 1),
    };
  };
  const tags = [...new Set(queries.flatMap((query) => query.tags))].sort();
  return {
    overall: scope(() => true),
    dev: scope((query) => query.split === 'dev'),
    test: scope((query) => query.split === 'test'),
    tags: Object.fromEntries(tags.map((tag) => [tag, scope((query) => query.tags.includes(tag))])),
  };
}

type Summary = ReturnType<typeof summarize>;

function formatTable(results: Record<Mode, Summary>): string {
  const header = '| Mode | Scope | n | Recall@5 | Recall@10 | MRR | nDCG@10 | P@5 | Noise | Empty | Avg results |';
  const divider = '|---|---|---|---|---|---|---|---|---|---|---|';
  const row = (mode: Mode, name: string, scope: Summary['overall']) => {
    const m: EvaluationMetrics = scope.metrics;
    return `| ${mode} | ${name} | ${scope.count} | ${fmt(m.recallAt5)} | ${fmt(m.recallAt10)} | ${fmt(m.mrr)} | ${fmt(m.ndcgAt10)} | ${fmt(m.precisionAt5)} | ${fmt(m.noiseRate)} | ${fmt(scope.emptyRate)} | ${scope.averageResults.toFixed(1)} |`;
  };
  const rows = (Object.keys(results) as Mode[]).flatMap((mode) => {
    const summary = results[mode];
    return [
      row(mode, 'overall', summary.overall),
      row(mode, 'dev', summary.dev),
      row(mode, 'test', summary.test),
      ...Object.entries(summary.tags)
        .filter(([, scope]) => scope.count !== summary.overall.count)
        .map(([tag, scope]) => row(mode, tag, scope)),
    ];
  });
  return [header, divider, ...rows].join('\n');
}

describe.skipIf(!dataset)('public benchmark', () => {
  it(`compares ranking modes on ${dataset}`, { timeout: 30 * 60 * 1000 }, () => {
    const fixtureFile = join(datasetDir, 'fixture.json');
    expect(existsSync(fixtureFile), `run: npm run eval:public:prepare -- ${dataset}`).toBe(true);
    const fixture = JSON.parse(readFileSync(fixtureFile, 'utf-8')) as PublicFixture;
    const { queries } = JSON.parse(readFileSync(join(datasetDir, 'queries.json'), 'utf-8')) as {
      queries: LabeledQuery[];
    };

    const results = Object.fromEntries(
      (['nookive', 'cosine', 'keyword'] as const).map((mode) => {
        const outcomes = queries.map((query) => evaluateQuery(query, search(mode, fixture, query.query)));
        return [mode, summarize(queries, outcomes)];
      }),
    ) as Record<Mode, Summary>;

    const table = formatTable(results);
    writeFileSync(join(datasetDir, 'report.json'), JSON.stringify(results, null, 2));
    writeFileSync(join(datasetDir, 'report.md'), `${table}\n`);
    console.log(`\n${dataset}: ${fixture.records.length} records, ${queries.length} queries\n\n${table}\n`);
  });
});
