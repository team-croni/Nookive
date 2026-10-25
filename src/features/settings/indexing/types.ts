// src/features/settings/indexing/types.ts
export interface IndexProgress {
  total: number;
  completed: number;
  indexed: number;
  skipped: number;
  errors: number;
  phase?: 'text' | 'media';
  overallTotal?: number;
  overallCompleted?: number;
  textTotal?: number;
  textCompleted?: number;
  mediaTotal?: number;
  mediaCompleted?: number;
  pendingMedia?: number;
  stopped?: boolean;
  stopReason?: string;
  storageError?: boolean;
  currentPath?: string;
}
