// src/features/search/services/searchClient.ts
import type { SearchResultItem } from '../../../types/search';
import { listApplications, listIndexedFolders, loadRuntimeIndex } from '../../../utils/tauriBridge';
import { requestQueryEmbedding } from './embeddingClient';
import { isLowSignalQuery, rankQuery } from './rankQuery';
import { nfc, tokenizeKeywords } from './textUtils';

export class SearchClient {
  private abortController: AbortController | null = null;
  private localIndex: SearchResultItem[] | null = null;
  private loadPromise: Promise<SearchResultItem[]> | null = null;
  private indexGeneration = 0;

  private async loadLocalIndex(): Promise<SearchResultItem[]> {
    if (this.localIndex) return this.localIndex;
    // 앱 시작 직후 preload와 첫 검색이 겹쳐도 무거운 앱 스캔을 한 번만 실행한다.
    if (this.loadPromise) return this.loadPromise;

    const pending = this.loadLocalIndexOnce(this.indexGeneration);
    this.loadPromise = pending;
    try {
      return await pending;
    } finally {
      if (this.loadPromise === pending) this.loadPromise = null;
    }
  }

  private async loadLocalIndexOnce(generation: number): Promise<SearchResultItem[]> {
    const [applications, folders, runtimeRecords] = await Promise.all([
      listApplications(),
      listIndexedFolders(),
      loadRuntimeIndex(),
    ]);
    // 배포 앱은 사용자의 runtime 인덱스만 사용한다. 공개 저장소에 남은
    // 샘플 search_index.json이 삭제/초기화 후에도 검색되는 것을 방지한다.
    const merged = new Map<string, SearchResultItem>();
    for (const record of [...runtimeRecords, ...folders, ...applications]) {
      merged.set(record.id, record);
    }
    if (generation !== this.indexGeneration) return this.localIndex ?? [];
    this.localIndex = Array.from(merged.values());
    return this.localIndex;
  }

  /** 실제 인덱스 변경 시에만 캐시를 비우고 다시 로드한다. */
  async refresh(): Promise<void> {
    this.indexGeneration += 1;
    this.localIndex = null;
    this.loadPromise = null;
    await this.preload();
  }

  /** 인덱스를 미리 로드해 즉시 검색을 가능하게 한다 (앱 시작 시 호출) */
  async preload(): Promise<void> {
    try {
      await this.loadLocalIndex();
    } catch {
      // 무시: 실패 시에도 기존 흐름 유지
    }
  }

  /**
   * 즉시(동기) 키워드 검색.
   * 이미 로드된 로컬 인덱스에서 파일명/스니펫 부분일치로 바로 결과를 돌려준다.
   * 시맨틱 검색(비동기)이 정교화하기 전까지 입력 중에도 목록이 즉시 갱신되도록 함.
   * 인덱스가 아직 로드되지 않았으면 null 반환(호출측은 기존 결과 유지).
   */
  instantSearch(query: string): SearchResultItem[] | null {
    if (!this.localIndex) return null;
    const q = nfc(query).trim().toLowerCase();
    if (!q) return [];
    const keywords = tokenizeKeywords(q);
    if (keywords.length === 0) return [];
    const shortQuery = q.replace(/\s+/g, '').length < 2;

    // 파일 경로 기준으로 최고 점수 청크만 대표로 유지
    const best = new Map<string, { item: SearchResultItem; score: number }>();
    for (const item of this.localIndex) {
      const name = nfc(item.file.name).toLowerCase();
      const snippet = nfc(item.bestChunk?.textSnippet || '').toLowerCase();
      let score = 0;
      for (const kw of keywords) {
        const nameMatch = shortQuery ? name.startsWith(kw) : name.includes(kw);
        if (nameMatch) {
          score += name.startsWith(kw) ? 8 : 3; // 파일명 prefix 일치 우선
        }
        // 한 글자 검색은 본문에 흔히 등장하는 문자가 결과를 오염시키므로
        // 파일명 직접 매칭만 허용한다.
        if (!shortQuery && snippet.includes(kw)) score += 1; // 본문 일치 가중
      }
      if (score <= 0) continue;

      const path = item.file.path;
      const existing = best.get(path);
      if (!existing || score > existing.score) {
        best.set(path, {
          item: { ...item, similarityScore: item.similarityScore ?? 0 },
          score,
        });
      }
    }

    return Array.from(best.values())
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.item)
      .slice(0, 20);
  }

  async search(query: string): Promise<SearchResultItem[]> {
    const records = await this.loadLocalIndex();

    if (!query.trim()) {
      const seen = new Set<string>();
      const uniqueRecords: SearchResultItem[] = [];
      for (const r of records) {
        if (!seen.has(r.file.path)) {
          seen.add(r.file.path);
          uniqueRecords.push(r);
        }
      }
      return uniqueRecords.slice(0, 10);
    }

    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();

    const lowSignal = isLowSignalQuery(query);

    // 1. llama-server (EmbeddingGemma 2)로 쿼리 임베딩 시도
    let queryVector: number[] | null = null;
    if (!lowSignal) {
      try {
        const response = await requestQueryEmbedding(query, this.abortController.signal);
        const json = await response.json();
        queryVector = json.data[0].embedding; // 768차원
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return [];
        console.warn(
          '[SearchClient] 임베딩 서버(127.0.0.1:8080) 연결 실패 → 키워드 전용 검색으로 폴백합니다. ./scripts/run-sidecar.sh 실행 여부를 확인하세요.',
          err,
        );
      }
    }
    return rankQuery(records, query, queryVector);
  }
}

export const searchClient = new SearchClient();
