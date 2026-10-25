// src/utils/path.ts

/**
 * 파일 경로에서 파일명을 제외한 디렉터리 경로를 그대로 반환한다.
 * 파일명은 목록 1행에 이미 노출되므로, 2행 경로는 디렉터리 위치만 보여준다.
 *
 * 예)
 *   /Users/username/Downloads/photos/IMG_1.HEIC -> /Users/username/Downloads/photos
 *   ~/Projects/nookive/docs/system.md           -> ~/Projects/nookive/docs
 *   file.pdf                                      -> ''
 */
export function directoryPath(path: string): string {
  if (!path) return '';
  const normalized = path.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);

  // 마지막 세그먼트(파일명/폴더명)는 1행에 표시되므로 경로에서 제외한다.
  const dirs = segments.slice(0, -1);
  if (dirs.length === 0) return '';

  const prefix = normalized.startsWith('/') ? '/' : '';
  return `${prefix}${dirs.join('/')}`;
}
