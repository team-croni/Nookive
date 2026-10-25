// src/utils/tauri/types.ts
// Tauri IPC 응답 타입 정의.
export interface IndexSyncStatus {
  manifest_path: string;
  roots: string[];
  total_files: number;
  pending_files: number;
  pending_paths: string[];
  changed_files: number;
  removed_files: number;
  last_sync_at_ms?: number;
}

export interface BatchIndexResult {
  status: IndexSyncStatus;
  indexed_files: number;
  records: number;
}

export interface MediaIndexProgress {
  runId?: string;
  completed: number;
  total: number;
  path: string;
  indexed: boolean;
}

export interface EmbeddingEngineStatus {
  ready: boolean;
  starting: boolean;
  message: string;
}

export interface ModelBundleStatus {
  embedding_ready: boolean;
  speech_ready: boolean;
  embedding_bytes: number;
  embedding_total: number;
  speech_bytes: number;
  speech_total: number;
}

export interface ModelDownloadProgress {
  kind: 'embedding' | 'speech' | 'all';
  file: string;
  completed: number;
  total: number;
  overall_completed: number;
  overall_total: number;
}

export interface DiskSpaceStatus {
  available_bytes: number;
  total_bytes: number;
  minimum_required_bytes: number;
}
