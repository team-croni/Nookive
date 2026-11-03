export const IMAGE_EXTS = new Set([
  'png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'heic', 'heif', 'bmp', 'ico', 'tiff', 'tif', 'avif',
]);

export const VIDEO_EXTS = new Set([
  'mp4', 'mov', 'mkv', 'avi', 'webm', 'wmv', 'm4v', 'flv', 'mpeg', 'mpg',
]);

export const AUDIO_EXTS = new Set([
  'mp3', 'm4a', 'wav', 'flac', 'aac', 'ogg', 'wma',
]);

export const PDF_EXTS = new Set(['pdf']);

export const CODE_EXTS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'c', 'cpp', 'h',
  'java', 'html', 'css', 'scss', 'json', 'yaml', 'yml', 'toml',
  'sh', 'bash', 'zsh', 'sql', 'mjs', 'cjs', 'swift', 'kt', 'kts', 'rb',
  'php', 'vue', 'svelte', 'cs', 'dart', 'lua', 'scala', 'hpp', 'm', 'mm',
  'xml', 'gradle',
]);

export const SHEET_EXTS = new Set([
  'csv', 'xlsx', 'xls', 'tsv', 'numbers', 'ods',
]);

export const ARCHIVE_EXTS = new Set([
  'zip', 'tar', 'gz', 'tgz', '7z', 'rar', 'pkg', 'dmg', 'bz2', 'xz',
]);

export function isImageFile(ext: string): boolean {
  return IMAGE_EXTS.has(ext.toLowerCase());
}

export function isVideoFile(ext: string): boolean {
  return VIDEO_EXTS.has(ext.toLowerCase());
}

export function isAudioFile(ext: string): boolean {
  return AUDIO_EXTS.has(ext.toLowerCase());
}

export function isPdfFile(ext: string): boolean {
  return PDF_EXTS.has(ext.toLowerCase());
}

/** 시스템 설정 화면인지 (Rust settings_panes.rs가 앱 목록에 함께 담는다) */
export function isSettingsPane(ext: string): boolean {
  const normalized = ext.toLowerCase();
  return normalized === 'appex' || normalized === 'prefpane';
}

export type FileSection = 'applications' | 'settings' | 'folders' | 'documents' | 'images' | 'video' | 'audio' | 'code';

export const FILE_SECTION_ORDER: FileSection[] = [
  'applications',
  'settings',
  'folders',
  'documents',
  'images',
  'video',
  'audio',
  'code',
];

export function getFileSection(ext: string): FileSection {
  const normalized = ext.toLowerCase();
  if (normalized === 'app') return 'applications';
  // 시스템 설정 화면(.appex)과 다른 회사의 설정 화면(.prefPane)
  if (isSettingsPane(normalized)) return 'settings';
  if (normalized === 'folder') return 'folders';
  if (VIDEO_EXTS.has(normalized)) return 'video';
  if (AUDIO_EXTS.has(normalized)) return 'audio';
  if (IMAGE_EXTS.has(normalized)) return 'images';
  if (CODE_EXTS.has(normalized)) return 'code';
  return 'documents';
}
