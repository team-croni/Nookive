// src/features/settings/indexing/textChunks.ts
// 텍스트 파일 판별 및 청크 분할 유틸.
const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;

export const TEXT_EXTENSIONS = new Set([
  'md', 'txt', 'json', 'ts', 'tsx', 'js', 'jsx', 'py', 'rtf',
  'rs', 'go', 'java', 'html', 'css', 'scss', 'yaml', 'yml', 'toml', 'sh',
]);

export const CODE_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'java', 'html', 'css', 'scss',
  'yaml', 'yml', 'toml', 'sh',
]);

export const basename = (filePath: string): string =>
  filePath.split(/[\\/]/).pop() || filePath;

export const extensionOf = (filePath: string): string => {
  const name = basename(filePath);
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
};

export const isTextIndexablePath = (filePath: string): boolean =>
  TEXT_EXTENSIONS.has(extensionOf(filePath));

export function chunkText(text: string): Array<{ text: string; start: number }> {
  if (!text.trim()) return [{ text: `${text}\n`, start: 0 }];
  const chunks: Array<{ text: string; start: number }> = [];
  const step = Math.max(1, CHUNK_SIZE - CHUNK_OVERLAP);
  for (let start = 0; start < text.length; start += step) {
    const chunk = text.slice(start, start + CHUNK_SIZE);
    if (chunk.trim()) chunks.push({ text: chunk, start });
    if (start + CHUNK_SIZE >= text.length) break;
  }
  return chunks;
}

export function lineAt(text: string, offset: number): number {
  let lines = 1;
  for (let i = 0; i < offset && i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) lines += 1;
  }
  return lines;
}
