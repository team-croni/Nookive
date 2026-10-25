// src/features/search/utils/formatTimestamp.ts
// 초 단위 재생 위치를 m:ss 로 포맷 (오디오/비디오 뱃지용)
export function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
