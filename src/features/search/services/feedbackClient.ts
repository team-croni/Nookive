// src/features/search/services/feedbackClient.ts
// 검색 창이 쓰는 개인화 기록 보관소. 메모리에 들고 있다가 기록이 바뀔 때마다 파일에 저장한다.
import { loadSearchFeedback, saveSearchFeedback } from '../../../utils/tauriBridge';
import {
  createRankBoost,
  parseFeedbackEntries,
  recordOpen,
  type FeedbackEntry,
  type RankBoost,
} from './feedback';

const FEEDBACK_VERSION = 1;

export class FeedbackClient {
  private entries: FeedbackEntry[] = [];
  private loadPromise: Promise<void> | null = null;
  private generation = 0;

  /** 저장된 기록을 한 번만 불러온다. 실패하면 기록 없이 동작한다. */
  load(): Promise<void> {
    if (!this.loadPromise) {
      const generation = this.generation;
      this.loadPromise = loadSearchFeedback().then((data) => {
        // 불러오는 사이에 초기화나 새 기록이 있었으면 그 상태를 유지한다.
        if (generation === this.generation) this.entries = parseFeedbackEntries(data);
      });
    }
    return this.loadPromise;
  }

  async boostFor(query: string): Promise<RankBoost | undefined> {
    await this.load();
    return createRankBoost(this.entries, query, Date.now());
  }

  /** 이미 불러온 기록으로 바로 배율을 만든다. 아직 불러오지 않았으면 undefined. (인라인 자동완성용) */
  peekBoost(query: string): RankBoost | undefined {
    return createRankBoost(this.entries, query, Date.now());
  }

  /** query는 화면 결과를 만든 검색어(settledQuery)여야 한다. */
  async recordOpen(query: string, path: string): Promise<void> {
    await this.load();
    const next = recordOpen(this.entries, query, path, Date.now());
    if (next === this.entries) return;
    this.entries = next;
    this.generation += 1;
    await saveSearchFeedback({ version: FEEDBACK_VERSION, entries: next });
  }

  /** 설정에서 초기화했을 때 메모리 기록도 비운다. (파일은 Rust가 지운다) */
  clear(): void {
    this.entries = [];
    this.generation += 1;
  }
}

export const feedbackClient = new FeedbackClient();
