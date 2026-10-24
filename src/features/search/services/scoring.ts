// src/features/search/services/scoring.ts
// 하이브리드 검색 점수 계산, 파일 단위 그룹화, 임계값 필터링.
//
// DigUp의 z-score 정규화를 기반으로 하되, 작은 데이터셋에서도 안정적으로
// 동작하도록 모달리티 평균에 shrinkage(사전 가중치)를 적용한다.
//
// - 코사인 유사도는 모달리티(문서/이미지/비디오/오디오/코드)마다 기준선이 다르다.
//   (텍스트 0.75~0.86, 이미지/오디오 0.65~0.78)
// - 따라서 절대 컷오프 대신 "모달리티 평균에서 얼마나 떨어졌는가"(z-score)로 판정한다.
// - 키워드 일치는 coverage(쿼리 단어 중 몇 %가 파일명/스니펫에 있는가)로 반영한다.
import type { SearchMatchChunk, SearchResultItem } from '../../../types/search';
import { getFileSection, type FileSection } from '../../../utils/fileType';
import { nfc } from './textUtils';

const Z_GATE = 2.0;
const WORD_WEIGHT = 2.0;
const LOOKUP_WORD_WEIGHT = 4.0;
const LOOKUP_MEANING_WEIGHT = 0.5;
const MIN_STD = 0.02;
// z-score는 "같은 쿼리 안에서 상대적으로 튀는 항목"을 찾을 뿐이라,
// 데이터셋에 정답이 없어도 항상 상위 outlier가 생긴다.
// (예: "현재 sota 모델을 알려줘" → 무관한 오디오/이미지가 z 게이트 통과)
// 따라서 z 게이트와 함께 모달리티별 절대 코사인 하한을 요구한다.
// 값은 EmbeddingGemma 2 기준으로 관측한 관련/비관련 분포 사이에 맞췄다.
const MIN_SEMANTIC_SIMILARITY: Record<FileSection, number> = {
  applications: 0.69,
  folders: 0.69,
  documents: 0.69,
  code: 0.69,
  images: 0.64,
  audio: 0.71,
  video: 0.71,
};
// "음악 찾아줘"처럼 파일 종류를 명시한 쿼리는 해당 모달리티의 하한을
// 조금 완화해, 관련 미디어가 절대 하한 바로 아래라도 놓치지 않게 한다.
const HINTED_MIN_SIMILARITY: Partial<Record<FileSection, number>> = {
  audio: 0.66,
  video: 0.66,
};
// 모달리티 평균의 사전 가중치. 표본이 적은 모달리티(예: 오디오 6청크)도
// 전체 평균 쪽으로 과도하게 끌려가지 않도록 완만하게 보정한다.
const MODALITY_PRIOR = 5;
const MAX_RESULTS = 20;
const MAX_VIDEO_RESULTS = 5;
// "오디오 찾아줘"처럼 파일 종류를 명시한 쿼리는 해당 섹션을 강하게 끌어올린다.
const KIND_HINT_BONUS = 4.0;
// 종류 힌트가 있으면 해당 섹션의 z 게이트를 완화해, 작은 데이터셋에서도
// "음악", "녹음" 같은 쿼리가 관련 오디오를 놓치지 않게 한다.
const HINTED_Z_GATE = Z_GATE * 0.6;

export type MediaSegmentKind = 'audio' | 'visual';

export type ScoredSearchResult = SearchResultItem & {
  vectorSimilarity: number;
  zScore: number;
  keywordCoverage: number;
  /** 파일명을 제외한 본문/전사 텍스트의 키워드 일치 비율 */
  contentCoverage: number;
  /** @deprecated keywordCoverage 사용 */
  keywordScore: number;
  rankScore: number;
  mediaSegmentKind?: MediaSegmentKind;
};

export interface ScoreContext {
  queryVector: number[] | null;
  semanticMode: boolean;
  baseKeywords: string[];
  queryKeywords: string[];
  query: string;
}

// 768차원 코사인 유사도 계산기 (차원 불일치/NaN 방어)
export function computeCosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    console.warn(
      `[SearchClient] 벡터 차원 불일치: query=${vecA.length}, doc=${vecB.length}`,
    );
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function getMediaSegmentKind(item: SearchResultItem): MediaSegmentKind | undefined {
  if (getFileSection(item.file.extension) !== 'video') return undefined;
  const snippet = nfc(item.bestChunk?.textSnippet || '').toLowerCase();
  if (snippet.startsWith('[오디오 구간')) return 'audio';
  return 'visual';
}

function modalityOf(item: SearchResultItem): FileSection {
  return getFileSection(item.file.extension);
}

interface KeywordMatch {
  /** 원본 단어 coverage와 동의어 coverage(0.7배) 중 큰 값 (0~1) */
  coverage: number;
  /** 원본 쿼리 단어 중 파일명에 직접 등장한 비율 (0~1) */
  filenameCoverage: number;
  /** 원본 쿼리 단어 중 본문/전사 텍스트에 등장한 비율 (0~1) */
  contentCoverage: number;
  /** macOS 앱의 bundle id에 등장한 비율 (0~1) */
  bundleIdCoverage: number;
  /** 파일명 시작 부분에 직접 등장한 비율 (0~1) */
  filenamePrefixCoverage: number;
}

function keywordCoverage(
  item: SearchResultItem,
  baseKeywords: string[],
  queryKeywords: string[],
): KeywordMatch {
  if (queryKeywords.length === 0) {
    return {
      coverage: 0,
      filenameCoverage: 0,
      contentCoverage: 0,
      bundleIdCoverage: 0,
      filenamePrefixCoverage: 0,
    };
  }

  const fileName = nfc(item.file.name).toLowerCase();
  // 전사 텍스트는 스니펫에 포함되지 않는 비디오 사운드트랙도 검색되도록 별도로 합친다.
  const snippet = nfc(
    `${item.bestChunk?.textSnippet || ''} ${item.bestChunk?.transcript || ''}`,
  ).toLowerCase();
  // contentCoverage는 제목이 섞인 스니펫 대신 실제 본문/전사만 본다.
  // (오디오 스니펫에는 파일명이 들어가므로, 제목만으로 모든 청크가 매칭되는 것을 막는다)
  const contentText = nfc(
    item.bestChunk?.transcript || item.bestChunk?.textSnippet || '',
  ).toLowerCase();
  const bundleId = nfc(item.file.bundleId || '').toLowerCase();
  const baseSet = new Set(baseKeywords);
  const synonymKeywords = queryKeywords.filter((keyword) => !baseSet.has(keyword));

  let baseMatched = 0;
  let filenameMatched = 0;
  let contentMatched = 0;
  let bundleIdMatched = 0;
  let filenamePrefixMatched = 0;
  for (const keyword of baseKeywords) {
    const inName = fileName.includes(keyword);
    const inSnippet = snippet.includes(keyword);
    if (inName || inSnippet) baseMatched += 1;
    if (inName) filenameMatched += 1;
    if (contentText.includes(keyword)) contentMatched += 1;
    if (bundleId.includes(keyword)) bundleIdMatched += 1;
    if (fileName.startsWith(keyword)) filenamePrefixMatched += 1;
  }

  let synonymMatched = 0;
  for (const keyword of synonymKeywords) {
    if (fileName.includes(keyword) || snippet.includes(keyword)) {
      synonymMatched += 1;
    }
  }

  const baseCoverage =
    baseKeywords.length > 0 ? baseMatched / baseKeywords.length : 0;
  const synonymCoverage =
    synonymKeywords.length > 0 ? synonymMatched / synonymKeywords.length : 0;

  return {
    // 동의어만 일치한 경우(예: "고양이" → "cat")는 0.7배로 낮춰 반영한다.
    coverage: Math.max(baseCoverage, synonymCoverage * 0.7),
    filenameCoverage:
      baseKeywords.length > 0 ? filenameMatched / baseKeywords.length : 0,
    contentCoverage:
      baseKeywords.length > 0 ? contentMatched / baseKeywords.length : 0,
    bundleIdCoverage:
      baseKeywords.length > 0 ? bundleIdMatched / baseKeywords.length : 0,
    filenamePrefixCoverage:
      baseKeywords.length > 0
        ? filenamePrefixMatched / baseKeywords.length
        : 0,
  };
}

// "오디오 찾아줘", "사진", "영상"처럼 파일 종류를 말하는 쿼리는
// 해당 섹션에 가산점을 준다. DigUp의 kindHints에 한국어를 더한 형태.
const KIND_HINTS: Record<string, string[]> = {
  audio: [
    '오디오', '음성', '녹음', '노래', '사운드', '음악',
    'audio', 'sound', 'recording', 'song', 'podcast', 'voice',
  ],
  video: ['영상', '비디오', '동영상', 'video', 'movie', 'clip'],
  images: ['이미지', '사진', '그림', 'image', 'photo', 'picture', 'screenshot'],
  documents: ['문서', 'pdf', 'document', 'doc'],
  code: ['코드', 'code', 'source'],
};

function detectKindHints(query: string): Set<FileSection> {
  const normalized = nfc(query).toLowerCase();
  const hints = new Set<FileSection>();
  for (const [section, words] of Object.entries(KIND_HINTS)) {
    if (words.some((word) => normalized.includes(word))) {
      hints.add(section as FileSection);
    }
  }
  return hints;
}

// 코드/ID/긴 숫자처럼 임베딩이 의미를 갖기 어려운 쿼리는 단어 일치에 더 무게를 둔다.
function isLookupQuery(baseKeywords: string[]): boolean {
  return (
    baseKeywords.length > 0 &&
    baseKeywords.every((keyword) => {
      const hasNumber = /\d/.test(keyword);
      const hasLetter = /[a-z]/i.test(keyword);
      return hasNumber && (hasLetter || keyword.length >= 4);
    })
  );
}

/** z 기반 rankScore를 0~1 표시/정렬용 점수로 단조 변환한다. */
function normalizeRank(rankScore: number): number {
  if (rankScore <= 0) return 0;
  return Math.min(0.99, 1 - Math.exp(-rankScore / 3));
}

/**
 * 전체 레코드의 코사인 유사도를 한 번에 계산한 뒤,
 * 모달리티별 평균을 제거하고 전체 표준편차로 나눈 z-score로 점수를 매긴다.
 *
 * 기존의 "모달리티별 절대 하한" 방식은 데이터셋/모델이 바뀔 때마다
 * 임계값을 다시 맞춰야 했고, 실제로 오디오 정답이 전부 필터링됐다.
 * z-score는 같은 쿼리 안에서 상대적으로 얼마나 튀는지를 보므로
 * 텍스트·이미지·오디오를 공정하게 비교할 수 있다.
 */
export function scoreRecords(
  items: SearchResultItem[],
  ctx: ScoreContext,
): ScoredSearchResult[] {
  const { queryVector, semanticMode, baseKeywords, queryKeywords, query } = ctx;

  const cosines = items.map((item) => {
    if (!queryVector) return 0;
    const audioSim = item.vector
      ? Math.max(0, computeCosineSimilarity(queryVector, item.vector))
      : 0;
    // STT 전사 텍스트 벡터가 있으면 오디오 벡터와 비교해 더 강한 신호를 쓴다.
    const textSim = item.textVector
      ? Math.max(0, computeCosineSimilarity(queryVector, item.textVector))
      : 0;
    return Math.max(audioSim, textSim);
  });

  // 모달리티별 평균 (표본이 적으면 전체 평균 쪽으로 shrinkage)
  const sums = new Map<FileSection, { sum: number; count: number }>();
  let globalSum = 0;
  for (let i = 0; i < items.length; i += 1) {
    const section = modalityOf(items[i]);
    const entry = sums.get(section) ?? { sum: 0, count: 0 };
    entry.sum += cosines[i];
    entry.count += 1;
    sums.set(section, entry);
    globalSum += cosines[i];
  }
  const globalMean = items.length > 0 ? globalSum / items.length : 0;
  const means = new Map<FileSection, number>();
  for (const [section, entry] of sums) {
    means.set(
      section,
      (entry.sum + globalMean * MODALITY_PRIOR) / (entry.count + MODALITY_PRIOR),
    );
  }

  // 모달리티 평균을 뺀 값의 전체 표준편차
  const centered = items.map(
    (item, i) => cosines[i] - (means.get(modalityOf(item)) ?? globalMean),
  );
  const centeredMean =
    centered.length > 0
      ? centered.reduce((sum, value) => sum + value, 0) / centered.length
      : 0;
  const variance =
    centered.length > 0
      ? centered.reduce((sum, value) => sum + (value - centeredMean) ** 2, 0) /
      centered.length
      : 0;
  const std = Math.max(Math.sqrt(variance), MIN_STD);

  const kindHints = detectKindHints(query);
  const lookup = isLookupQuery(baseKeywords);
  const meaningWeight = lookup ? LOOKUP_MEANING_WEIGHT : 1;
  const wordsWeight = lookup ? LOOKUP_WORD_WEIGHT : WORD_WEIGHT;
  // "맞아", "바다"처럼 1~2글자짜리 짧은 쿼리는 임베딩 공간에서 거의 모든
  // 문서/미디어와 비슷하게 보인다. 이런 쿼리는 시맨틱 단독 매칭을 허용하지 않고
  // 파일명/본문/전사에 실제 단어(또는 동의어)가 있어야만 통과시킨다.
  const shortQuery =
    baseKeywords.length === 1 && baseKeywords[0].length <= 2;

  return items.map((item, i) => {
    const zScore = (centered[i] - centeredMean) / std;
    const {
      coverage,
      filenameCoverage,
      contentCoverage,
      bundleIdCoverage,
      filenamePrefixCoverage,
    } = keywordCoverage(item, baseKeywords, queryKeywords);
    const section = modalityOf(item);
    // 한 글자 검색은 본문에 우연히 포함된 결과가 너무 많이 나오므로
    // 파일명 직접 매칭만 허용한다.
    const shortQueryMatch = baseKeywords.every((keyword) =>
      nfc(item.file.name).toLowerCase().startsWith(keyword),
    );
    const effectiveCoverage = shortQuery ? filenameCoverage : coverage;

    let rankScore =
      meaningWeight * Math.max(zScore, 0) + wordsWeight * Math.pow(effectiveCoverage, 1.5);
    // 파일명 직접 일치는 본문 일치보다 강한 결정적 신호다.
    rankScore += wordsWeight * 0.5 * filenameCoverage;
    // 파일명 시작 부분 일치는 의미 유사도보다 우선한다.
    // 예: "ter"에서는 Terminal이 Digital Color Meter보다 먼저 와야 한다.
    rankScore += wordsWeight * 2.5 * filenamePrefixCoverage;
    // macOS 앱의 bundle id 일치(예: "riot" → com.riotgames.LeagueofLegends)는
    // 앱 이름에 개발자명이 없어도 강하게 노출되도록 별도 가산한다.
    rankScore += wordsWeight * 1.5 * bundleIdCoverage;
    if (kindHints.has(section)) rankScore += KIND_HINT_BONUS;

    const hinted = kindHints.has(section);
    const similarityFloor = hinted
      ? (HINTED_MIN_SIMILARITY[section] ?? MIN_SEMANTIC_SIMILARITY[section])
      : MIN_SEMANTIC_SIMILARITY[section];
    const absolutePass = cosines[i] >= similarityFloor;
    const lexicalPass = !shortQuery || shortQueryMatch;
    const semanticPass =
      semanticMode &&
      absolutePass &&
      lexicalPass &&
      (zScore >= Z_GATE || (hinted && zScore >= HINTED_Z_GATE));
    const keywordPass = shortQuery ? shortQueryMatch : coverage >= 0.5;
    const offlinePass = !semanticMode && (shortQuery ? shortQueryMatch : coverage > 0);
    const pass = semanticPass || keywordPass || offlinePass;

    return {
      ...item,
      vectorSimilarity: cosines[i],
      zScore,
      keywordCoverage: coverage,
      contentCoverage,
      keywordScore: coverage,
      rankScore: pass ? rankScore : 0,
      similarityScore: pass ? normalizeRank(rankScore) : 0,
      mediaSegmentKind: getMediaSegmentKind(item),
    };
  });
}

export function aggregateSegmentScores(segments: ScoredSearchResult[]): {
  score: number;
  representative: ScoredSearchResult;
} {
  const ranked = [...segments].sort((a, b) => b.rankScore - a.rankScore);
  const representative = ranked[0];
  const top = ranked.slice(0, 3);
  const topMean = top.reduce((sum, item) => sum + item.rankScore, 0) / top.length;
  return {
    // 최고점 하나에 대한 우연한 적중을 완화하고, 여러 구간에서 반복되는 증거를 반영한다.
    score: representative.rankScore * 0.65 + topMean * 0.35,
    representative,
  };
}

interface FileGroup {
  topItem: ScoredSearchResult;
  chunks: SearchMatchChunk[];
  segments: ScoredSearchResult[];
}

/**
 * ForcedAligner 단어 타임스탬프에서 쿼리 키워드와 일치하는 첫 단어를 찾아
 * 대표 청크의 timestampSeconds를 그 단어의 시작 시각으로 보정한다.
 * (예: "bread" → 0:02.96, "James Webb" → 0:16.2)
 */
function refineTimestamp(
  item: SearchResultItem,
  baseKeywords: string[],
): SearchResultItem {
  const words = item.bestChunk?.words;
  if (!words || words.length === 0 || baseKeywords.length === 0) return item;

  const keywords = baseKeywords.map((keyword) => nfc(keyword).toLowerCase());
  const match = words.find((word) => {
    const normalized = nfc(word.word).toLowerCase();
    return keywords.some((keyword) => normalized.includes(keyword));
  });
  if (!match) return item;

  return {
    ...item,
    bestChunk: { ...item.bestChunk, timestampSeconds: match.start },
  };
}

/**
 * 텍스트 청크의 시작 라인이 아니라 실제 검색어가 포함된 첫 라인으로 보정한다.
 * 인덱스의 lineStart는 청크 경계의 라인이므로, 여러 줄을 포함한 청크에서는
 * 검색 결과 뱃지가 실제 매칭 위치보다 앞선 라인을 가리킬 수 있다.
 */
function refineLineStart(
  item: SearchResultItem,
  baseKeywords: string[],
): SearchResultItem {
  const chunk = item.bestChunk;
  if (
    chunk.lineStart === undefined ||
    !chunk.textSnippet ||
    baseKeywords.length === 0
  ) {
    return item;
  }

  const text = nfc(chunk.textSnippet);
  const lowerText = text.toLowerCase();
  let firstMatchIndex = -1;

  for (const keyword of baseKeywords) {
    const index = lowerText.indexOf(nfc(keyword).toLowerCase());
    if (index !== -1 && (firstMatchIndex === -1 || index < firstMatchIndex)) {
      firstMatchIndex = index;
    }
  }

  // 파일명이나 의미 유사도로만 선택된 경우에는 청크 시작 라인을 유지한다.
  if (firstMatchIndex === -1) return item;

  const lineOffset = text.slice(0, firstMatchIndex).split('\n').length - 1;
  return {
    ...item,
    bestChunk: {
      ...chunk,
      lineStart: chunk.lineStart + lineOffset,
    },
  };
}

/**
 * 동일 파일의 다수 청크를 하나로 통합하고 최고 점수 청크를 대표로 노출한다.
 * 비디오는 시각/오디오 세그먼트를 각각 집계해 결합 점수를 사용하고,
 * 오디오도 여러 윈도우의 증거를 top-3 평균으로 완만하게 집계한다.
 */
export function groupAndDeduplicate(
  scored: ScoredSearchResult[],
  baseKeywords: string[] = [],
): SearchResultItem[] {
  const fileGroupMap = new Map<string, FileGroup>();

  for (const item of scored) {
    const filePath = item.file.path;
    const existing = fileGroupMap.get(filePath);

    if (!existing) {
      fileGroupMap.set(filePath, {
        topItem: { ...item },
        chunks: [item.bestChunk],
        segments: [item],
      });
    } else {
      existing.segments.push(item);
      // 더 높은 rankScore의 청크 발견 시 대표 점수 및 bestChunk 갱신
      if (item.rankScore > existing.topItem.rankScore) {
        existing.topItem.rankScore = item.rankScore;
        existing.topItem.similarityScore = item.similarityScore;
        existing.topItem.bestChunk = item.bestChunk;
        existing.topItem.id = item.id;
      }
      // 청크 목록 추가 (chunkIndex 기준 중복 방지)
      if (!existing.chunks.some((c) => c.chunkIndex === item.bestChunk.chunkIndex)) {
        existing.chunks.push(item.bestChunk);
      }
    }
  }

  return Array.from(fileGroupMap.values()).map(({ topItem, chunks, segments }) => {
    const section = getFileSection(topItem.file.extension);
    const sortedChunks = chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

    // 게이트를 통과한 세그먼트만 집계한다. (0점 청크가 평균을 끌어내리지 않도록)
    const passingSegments = segments.filter((item) => item.rankScore > 0);
    // 본문/전사 텍스트에 쿼리 단어가 실제로 등장하는 청크를 대표로 우선한다.
    // 파일명만 일치하는 경우 엉뚱한 구간이 뱃지에 표시되는 것을 막는다.
    const contentSegments = passingSegments.filter(
      (item) => item.contentCoverage > 0,
    );
    const representativePool =
      contentSegments.length > 0 ? contentSegments : passingSegments;

    if (section === 'video') {
      const visualSegments = representativePool.filter(
        (item) => item.mediaSegmentKind === 'visual',
      );
      const audioSegments = representativePool.filter(
        (item) => item.mediaSegmentKind === 'audio',
      );
      const visual = visualSegments.length > 0 ? aggregateSegmentScores(visualSegments) : null;
      const audio = audioSegments.length > 0 ? aggregateSegmentScores(audioSegments) : null;
      const representative = visual && audio
        ? (visual.score >= audio.score ? visual.representative : audio.representative)
        : (visual?.representative ?? audio?.representative ?? topItem);
      const aggregateScore = visual && audio
        ? (visual.score * 0.55) + (audio.score * 0.45)
        : (visual?.score ?? audio?.score ?? topItem.rankScore);

      return {
        ...refineLineStart(refineTimestamp(representative, baseKeywords), baseKeywords),
        rankScore: aggregateScore,
        similarityScore: normalizeRank(aggregateScore),
        chunks: sortedChunks,
      };
    }

    if (section === 'audio') {
      const aggregate = aggregateSegmentScores(
        representativePool.length > 0 ? representativePool : segments,
      );
      return {
        ...refineLineStart(
          refineTimestamp(aggregate.representative, baseKeywords),
          baseKeywords,
        ),
        rankScore: aggregate.score,
        similarityScore: normalizeRank(aggregate.score),
        chunks: sortedChunks,
      };
    }

    // PDF를 포함한 일반 문서는 의미 점수가 가장 높은 청크보다
    // 검색어가 실제 본문에 포함된 청크를 대표로 사용해야 페이지 뱃지가
    // 검색 결과가 있는 페이지를 가리킨다.
    const representative = representativePool.reduce(
      (best, item) => (item.rankScore > best.rankScore ? item : best),
      topItem,
    );

    return {
      ...refineLineStart(refineTimestamp(representative, baseKeywords), baseKeywords),
      similarityScore: normalizeRank(representative.rankScore),
      chunks: sortedChunks,
    };
  });
}

/**
 * z-score 게이트를 통과한 결과만 정렬해 반환한다.
 * 검색어가 비어 있으면 상위 10개만 반환한다.
 */
export function rankResults(sorted: SearchResultItem[], query: string): SearchResultItem[] {
  if (!query.trim()) {
    return sorted.slice(0, 10);
  }

  const gated = sorted
    .filter((item) => (item.rankScore ?? 0) > 0)
    .sort((a, b) => (b.rankScore ?? 0) - (a.rankScore ?? 0));

  const limitedResults: SearchResultItem[] = [];
  let videoCount = 0;
  for (const item of gated) {
    const isVideo = getFileSection(item.file.extension) === 'video';
    if (isVideo && videoCount >= MAX_VIDEO_RESULTS) continue;
    limitedResults.push(item);
    if (isVideo) videoCount += 1;
    if (limitedResults.length >= MAX_RESULTS) break;
  }
  return limitedResults;
}
