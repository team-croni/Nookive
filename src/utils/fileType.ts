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
  'sh', 'bash', 'zsh', 'sql', 'mjs', 'cjs',
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

export type FileSection = 'applications' | 'folders' | 'documents' | 'images' | 'video' | 'audio' | 'code';

export const FILE_SECTION_ORDER: FileSection[] = [
  'applications',
  'folders',
  'documents',
  'images',
  'video',
  'audio',
  'code',
];

export const FILE_SECTION_LABELS: Record<FileSection, string> = {
  applications: '앱',
  folders: '폴더',
  documents: '문서',
  images: '이미지',
  video: '비디오',
  audio: '오디오',
  code: '코드',
};

export function getFileSection(ext: string): FileSection {
  const normalized = ext.toLowerCase();
  if (normalized === 'app') return 'applications';
  if (normalized === 'folder') return 'folders';
  if (VIDEO_EXTS.has(normalized)) return 'video';
  if (AUDIO_EXTS.has(normalized)) return 'audio';
  if (IMAGE_EXTS.has(normalized)) return 'images';
  if (CODE_EXTS.has(normalized)) return 'code';
  return 'documents';
}
