// src/features/settings/indexingWorker.ts
// 텍스트/코드 파일용 증분 인덱싱 오케스트레이터.
import type { SearchResultItem } from '../../types/search';
import { markIndexFilesReady, readFileBytes, upsertRuntimeIndex } from '../../utils/tauriBridge';
import { EmbeddingTimeoutError, embedTextBatch } from './indexing/embedding';
import { makeRecord } from './indexing/record';
import {
  basename,
  chunkText,
  isTextIndexablePath,
} from './indexing/textChunks';
import type { IndexProgress } from './indexing/types';

export type { IndexProgress } from './indexing/types';
export { isTextIndexablePath } from './indexing/textChunks';

export const isStorageSpaceError = (error: unknown): boolean =>
  /ENOSPC|No space left|disk full|not enough space|os error 28|error 28|저장 공간|디스크 공간/i.test(String(error));

const TEXT_EMBED_BATCH_SIZE = 8;
const MAX_TEXT_BYTES = 5 * 1024 * 1024;

/**
 * 텍스트/코드 파일용 증분 worker다.
 * 이미지/PDF/오디오/비디오는 설정 화면에서 native IPC를 통해 기존
 * scripts/index-folder.mjs 멀티모달 파이프라인으로 전달된다.
 */
export async function indexPendingTextFiles(
  pendingPaths: string[],
  onProgress: (progress: IndexProgress) => void,
  signal?: AbortSignal,
): Promise<IndexProgress> {
  const textPaths = pendingPaths.filter(isTextIndexablePath);
  const progress: IndexProgress = {
    total: textPaths.length,
    completed: 0,
    indexed: 0,
    skipped: pendingPaths.length - textPaths.length,
    errors: 0,
  };
  onProgress({ ...progress });

  for (const filePath of textPaths) {
    if (signal?.aborted) break;
    progress.currentPath = filePath;
    onProgress({ ...progress });
    try {
      const bytes = await readFileBytes(filePath);
      if (bytes.byteLength > MAX_TEXT_BYTES) {
        progress.skipped += 1;
        progress.completed += 1;
        onProgress({ ...progress });
        continue;
      }
      const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      const chunks = chunkText(text);
      const records: Array<SearchResultItem & { vector: number[] }> = [];
      for (let batchStart = 0; batchStart < chunks.length; batchStart += TEXT_EMBED_BATCH_SIZE) {
        if (signal?.aborted) break;
        const batch = chunks.slice(batchStart, batchStart + TEXT_EMBED_BATCH_SIZE);
        const vectors = await embedTextBatch(
          batch.map((chunk) => chunk.text),
          basename(filePath),
          signal,
        );
        for (const [offset, chunk] of batch.entries()) {
          records.push(makeRecord(filePath, text, chunk, batchStart + offset, vectors[offset]));
        }
      }
      if (signal?.aborted) break;
      await upsertRuntimeIndex(records, [filePath]);
      await markIndexFilesReady([filePath]);
      progress.indexed += 1;
    } catch (error) {
      console.warn(`[Indexer] ${filePath} 처리 실패`, error);
      if (signal?.aborted) break;
      progress.errors += 1;
      progress.skipped += 1;
      if (isStorageSpaceError(error)) {
        progress.storageError = true;
        progress.stopped = true;
        progress.stopReason = 'storage';
        progress.completed += 1;
        onProgress({ ...progress });
        break;
      }
      if (error instanceof EmbeddingTimeoutError) {
        progress.stopped = true;
        progress.stopReason = error.message;
        progress.completed += 1;
        onProgress({ ...progress });
        break;
      }
    }
    progress.completed += 1;
    onProgress({ ...progress });
  }

  delete progress.currentPath;
  return progress;
}
