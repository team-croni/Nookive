// 의미 게이트 분석 (로컬 전용, CI에서는 건너뛴다).
// 회귀 평가셋과 준비된 공개 데이터셋에서 게이트 조건을 바꿔 보며 지표를 비교하고,
// 정답을 놓친 경우와 잡음이 통과한 경우의 코사인/z-score 분포를 출력한다.
//
// 실행: NOOKIVE_GATE_ANALYSIS=1 npx vitest run src/features/search/evaluation/gate-analysis.test.ts --silent=false
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import type { SearchResultItem } from '../../../types/search';
import { getFileSection, type FileSection } from '../../../utils/fileType';
import { isLowSignalQuery } from '../services/rankQuery';
import {
  groupAndDeduplicate,
  normalizeRank,
  rankResults,
  scoreRecords,
  type ScoredSearchResult,
} from '../services/scoring';
import { expandKeywords, nfc, tokenizeKeywords } from '../services/textUtils';
import { orderResultsBySection } from '../utils/orderResults';
import { aggregateWhere, evaluateQuery, type LabeledQuery, type QueryOutcome } from './metrics';

interface Dataset {
  name: string;
  records: SearchResultItem[];
  queryVectors: Record<string, number[]>;
  queries: LabeledQuery[];
}

/** 쿼리 하나에 대해 게이트 변형이 참고할 수 있는 정보 */
interface QueryInfo {
  query: string;
  /** 쿼리 전체가 어떤 앱/폴더 이름과 정확히 같은지 */
  exactNameMatch: boolean;
  /** 모달리티별 최고 코사인 */
  topCos: Map<FileSection, number>;
  /** 모달리티별 두 번째 코사인 */
  secondCos: Map<FileSection, number>;
}

type GateVariant = (item: ScoredSearchResult, info: QueryInfo) => boolean;

const FLOORS: Record<FileSection, number> = {
  applications: 0.69, folders: 0.69, documents: 0.69, code: 0.69, images: 0.64, audio: 0.71, video: 0.71,
};

// 변형은 현재 게이트(semanticPass) 위에 조건을 더하거나 뺀다. 새 규칙을 시험할 때 여기에 추가한다.
const variants: Record<string, GateVariant> = {
  current: (item) => item.semanticPass,
  relativeTop003: (item, info) => relativeTop(item, info, 0.03),
  relativeTop005: (item, info) => relativeTop(item, info, 0.05),
};

// 결과가 하나도 없을 때만 적용하는 보조 게이트. rescue는 rankQuery와 같은 규칙이다.
const fallbacks: Record<string, GateVariant> = {
  rescue: (item) => item.rescuePass,
  noRescue: () => false,
};

function relativeTop(item: ScoredSearchResult, info: QueryInfo, margin: number): boolean {
  const top = info.topCos.get(getFileSection(item.file.extension)) ?? 0;
  return item.semanticPass && item.vectorSimilarity >= top - margin;
}


function loadDatasets(): Dataset[] {
  const datasets: Dataset[] = [];
  const read = (path: string) => JSON.parse(readFileSync(path, 'utf-8'));
  const local = read(new URL('./fixture.json', import.meta.url).pathname);
  datasets.push({ name: 'regression', ...local, ...read(new URL('./queries.json', import.meta.url).pathname) });
  for (const name of ['xm3600', 'mixed']) {
    const dir = join(homedir(), 'Library/Caches/nookive-eval/datasets', name);
    if (!existsSync(join(dir, 'fixture.json'))) continue;
    datasets.push({ name, ...read(join(dir, 'fixture.json')), ...read(join(dir, 'queries.json')) });
  }
  return datasets;
}

function queryInfo(query: string, scored: ScoredSearchResult[]): QueryInfo {
  const normalized = nfc(query).toLowerCase().trim();
  const exactNameMatch = scored.some((item) =>
    (item.file.kind === 'application' || item.file.kind === 'folder')
    && [item.file.name, ...(item.file.alternateNames ?? [])].some((name) => nfc(name).toLowerCase() === normalized));
  const byModality = new Map<FileSection, number[]>();
  for (const item of scored) {
    if (!item.vector && !item.textVector) continue;
    const section = getFileSection(item.file.extension);
    byModality.set(section, [...(byModality.get(section) ?? []), item.vectorSimilarity]);
  }
  const topCos = new Map<FileSection, number>();
  const secondCos = new Map<FileSection, number>();
  for (const [section, values] of byModality) {
    const sorted = [...new Set(values)].sort((a, b) => b - a);
    topCos.set(section, sorted[0] ?? 0);
    secondCos.set(section, sorted[1] ?? 0);
  }
  return { query, exactNameMatch, topCos, secondCos };
}

function scoreQuery(dataset: Dataset, query: string): ScoredSearchResult[] {
  const vector = isLowSignalQuery(query) ? null : dataset.queryVectors[query] ?? null;
  const baseKeywords = tokenizeKeywords(nfc(query).toLowerCase().trim());
  return scoreRecords(dataset.records, {
    queryVector: vector,
    semanticMode: vector !== null,
    baseKeywords,
    queryKeywords: expandKeywords(baseKeywords),
    query,
  });
}

function applyVariant(
  scored: ScoredSearchResult[],
  query: string,
  variant: GateVariant,
  fallback: GateVariant,
): SearchResultItem[] {
  const info = queryInfo(query, scored);
  const run = (gate: GateVariant) => {
    const gated = scored.map((item) => {
      const pass = item.keywordPass || gate(item, info);
      const rankScore = pass ? item.ungatedRankScore : 0;
      return { ...item, rankScore, similarityScore: normalizeRank(rankScore) };
    });
    const baseKeywords = tokenizeKeywords(nfc(query).toLowerCase().trim());
    const grouped = groupAndDeduplicate(gated, baseKeywords).sort((a, b) => (b.rankScore ?? 0) - (a.rankScore ?? 0));
    return orderResultsBySection(rankResults(grouped, query));
  };
  const results = run(variant);
  return results.length > 0 ? results : run((item, queryInfo) => variant(item, queryInfo) || fallback(item, queryInfo));
}

const fmt = (value: number) => value.toFixed(3);
const quantiles = (values: number[]) => {
  if (values.length === 0) return 'n=0';
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => fmt(sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]);
  return `n=${values.length} p10=${at(0.1)} p50=${at(0.5)} p90=${at(0.9)}`;
};

describe.skipIf(!process.env.NOOKIVE_GATE_ANALYSIS)('semantic gate analysis', () => {
  it('compares gate variants', { timeout: 60 * 60 * 1000 }, () => {
    for (const dataset of loadDatasets()) {
      const scoredByQuery = dataset.queries.map((labeled) => scoreQuery(dataset, labeled.query));
      const lines: string[] = [`\n## ${dataset.name} (${dataset.records.length} records, ${dataset.queries.length} queries)`];
      lines.push('| variant | split | recall@5 | mrr | p@5 | noise | no-answer fp | empty |');
      lines.push('|---|---|---|---|---|---|---|---|');
      const combos = Object.entries(variants).flatMap(([name, variant]) =>
        Object.entries(fallbacks).map(([fallbackName, fallback]) =>
          [fallbackName === 'rescue' ? name : `${name}+${fallbackName}`, variant, fallback] as const));
      for (const [name, variant, fallback] of combos) {
        const outcomes: QueryOutcome[] = dataset.queries.map((labeled, index) =>
          evaluateQuery(labeled, applyVariant(scoredByQuery[index], labeled.query, variant, fallback)));
        for (const split of ['dev', 'test'] as const) {
          const selected = (query: LabeledQuery) => query.split === split;
          const { metrics } = aggregateWhere(dataset.queries, outcomes, selected);
          const scoped = outcomes.filter((_, index) => selected(dataset.queries[index]) && dataset.queries[index].relevant.length > 0);
          const empty = scoped.filter((outcome) => outcome.resultCount === 0).length / Math.max(scoped.length, 1);
          lines.push(`| ${name} | ${split} | ${fmt(metrics.recallAt5)} | ${fmt(metrics.mrr)} | ${fmt(metrics.precisionAt5)} | ${fmt(metrics.noiseRate)} | ${fmt(metrics.noAnswerFalsePositiveRate)} | ${fmt(empty)} |`);
        }
      }

      // 현재 게이트에서 정답이 의미 게이트를 통과하지 못한 경우와, 잡음이 의미 게이트로 통과한 경우의 분포
      const missedZ: number[] = [];
      const missedCosOverFloor: number[] = [];
      const noiseZ: number[] = [];
      const noiseCosOverFloor: number[] = [];
      dataset.queries.forEach((labeled, index) => {
        const relevant = new Set([...labeled.relevant, ...(labeled.acceptable ?? [])].map((path) => path.normalize('NFC')));
        const best = new Map<string, ScoredSearchResult>();
        for (const item of scoredByQuery[index]) {
          if (!item.vector && !item.textVector) continue;
          const current = best.get(item.file.path);
          if (!current || item.vectorSimilarity > current.vectorSimilarity) best.set(item.file.path, item);
        }
        for (const item of best.values()) {
          const floor = FLOORS[getFileSection(item.file.extension)];
          const isRelevant = relevant.has(item.file.path.normalize('NFC'));
          if (isRelevant && labeled.relevant.length > 0 && !item.semanticPass && !item.keywordPass) {
            missedZ.push(item.zScore);
            missedCosOverFloor.push(item.vectorSimilarity - floor);
          }
          if (!isRelevant && item.semanticPass && !item.keywordPass) {
            noiseZ.push(item.zScore);
            noiseCosOverFloor.push(item.vectorSimilarity - floor);
          }
        }
      });
      lines.push('', `missed relevant  z: ${quantiles(missedZ)} | cos-floor: ${quantiles(missedCosOverFloor)}`);
      lines.push(`semantic noise   z: ${quantiles(noiseZ)} | cos-floor: ${quantiles(noiseCosOverFloor)}`);
      console.log(lines.join('\n'));
    }
  });
});
