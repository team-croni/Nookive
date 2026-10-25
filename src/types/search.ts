// src/types/search.ts
import type { FileMetadata } from './file';

export interface SearchWordTimestamp {
  word: string;
  start: number;
  end: number;
}

export interface SearchMatchChunk {
  chunkIndex: number;
  textSnippet: string;
  matchedKeywords?: string[];
  pageNumber?: number;      // PDF: 검색된 페이지 번호
  lineStart?: number;       // 텍스트/코드: 검색된 시작 라인
  lineEnd?: number;         // 텍스트/코드: 검색된 끝 라인
  timestampSeconds?: number; // 오디오/비디오: 검색된 재생 위치(초)
  /** STT 전사 텍스트 (오디오/비디오 사운드트랙) */
  transcript?: string;
  /** ForcedAligner가 반환한 단어 단위 타임스탬프 (파일 절대 시각) */
  words?: SearchWordTimestamp[];
}

export interface SearchResultItem {
  id: string;
  file: FileMetadata;
  similarityScore: number; // 0.0 ~ 1.0 (표시/정렬용 정규화 점수)
  /** 내부 정렬용 z-score 기반 점수 (절대 범위 없음) */
  rankScore?: number;
  bestChunk: SearchMatchChunk;
  chunks?: SearchMatchChunk[]; // 동일 파일 내 매칭된 모든 청크들
  category: 'document' | 'code' | 'media' | 'note' | 'application';
  /** 인덱싱 시 저장된 768차원 벡터 (텍스트/이미지/오디오) */
  vector?: number[];
  /** STT 전사 텍스트의 768차원 벡터 (오디오/비디오 사운드트랙) */
  textVector?: number[];
}

export interface SearchState {
  query: string;
  results: SearchResultItem[];
  selectedIndex: number;
  isLoading: boolean;
  totalIndexedCount: number;
}
