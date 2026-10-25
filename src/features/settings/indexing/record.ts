// src/features/settings/indexing/record.ts
// 인덱싱 결과 레코드 생성.
import type { SearchResultItem } from '../../../types/search';
import { CODE_EXTENSIONS, basename, extensionOf, lineAt } from './textChunks';

export function makeRecord(
  filePath: string,
  text: string,
  chunk: { text: string; start: number },
  index: number,
  vector: number[],
): SearchResultItem & { vector: number[] } {
  const extension = extensionOf(filePath);
  const lineStart = lineAt(text, chunk.start);
  const lineEnd = lineAt(text, Math.min(text.length, chunk.start + chunk.text.length));
  const name = basename(filePath);
  return {
    id: `${filePath}#${index}`,
    file: {
      path: filePath,
      name,
      extension,
      kind: 'file',
      sizeBytes: new TextEncoder().encode(text).byteLength,
      modifiedAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
    },
    similarityScore: 0,
    bestChunk: {
      chunkIndex: index,
      textSnippet: chunk.text,
      lineStart,
      lineEnd,
    },
    category: CODE_EXTENSIONS.has(extension) ? 'code' : 'document',
    vector,
  };
}
