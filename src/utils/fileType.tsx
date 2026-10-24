// src/utils/fileType.tsx
import React from 'react';

export const IMAGE_EXTS = new Set([
  'png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'heic', 'heif', 'bmp', 'ico', 'tiff', 'tif', 'avif'
]);

export const VIDEO_EXTS = new Set([
  'mp4', 'mov', 'mkv', 'avi', 'webm', 'wmv', 'm4v', 'flv', 'mpeg', 'mpg'
]);

export const AUDIO_EXTS = new Set([
  'mp3', 'm4a', 'wav', 'flac', 'aac', 'ogg', 'wma'
]);

export const PDF_EXTS = new Set([
  'pdf'
]);

export const CODE_EXTS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'c', 'cpp', 'h',
  'java', 'html', 'css', 'scss', 'json', 'yaml', 'yml', 'toml',
  'sh', 'bash', 'zsh', 'sql', 'mjs', 'cjs'
]);

export const SHEET_EXTS = new Set([
  'csv', 'xlsx', 'xls', 'tsv', 'numbers', 'ods'
]);

export const ARCHIVE_EXTS = new Set([
  'zip', 'tar', 'gz', 'tgz', '7z', 'rar', 'pkg', 'dmg', 'bz2', 'xz'
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

// 검색 결과 섹션 분류 (표시 순서: 문서 → 이미지 → 비디오 → 오디오 → 코드)
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

/*
 * 파일 아이콘 매핑.
 * public/icons/file-types/<name>.png에 타입별 표준 파일명으로 저장된
 * Outline + Color 세트를 사용한다.
 */
const FILE_ICON_BY_EXT: Record<string, string> = {
  // 문서/오피스
  pdf: 'pdf',
  doc: 'doc', docx: 'docx', rtf: 'doc',
  ppt: 'ppt', pptx: 'pptx',
  xls: 'xls', xlsx: 'xlsx', csv: 'csv', tsv: 'xlsx', numbers: 'xlsx', ods: 'xlsx',
  txt: 'txt', md: 'txt', markdown: 'txt',
  // 이미지
  png: 'png', jpg: 'jpg', jpeg: 'jpg', svg: 'svg',
  webp: 'img', gif: 'img', heic: 'img', heif: 'img', bmp: 'img', ico: 'img',
  tiff: 'img', tif: 'img', avif: 'img',
  // 비디오
  mp4: 'mp4', mkv: 'mkv', avi: 'avi', mpeg: 'mpeg', mpg: 'mpeg',
  mov: 'mp4', webm: 'mp4', wmv: 'mp4', m4v: 'mp4', flv: 'mp4',
  // 오디오
  mp3: 'mp3', wav: 'wav',
  m4a: 'mp3', aac: 'mp3', flac: 'mp3', ogg: 'mp3', wma: 'mp3',
  // 압축
  zip: 'zip', rar: 'rar',
  tar: 'zip', gz: 'zip', tgz: 'zip', '7z': 'zip', pkg: 'zip', dmg: 'zip', bz2: 'zip', xz: 'zip',
  // 디자인
  ai: 'ai', psd: 'psd', fig: 'fig', indd: 'indd', aep: 'aep',
};

const SECTION_ICON_FILE: Record<FileSection, string> = {
  applications: 'applications',
  folders: 'folder',
  documents: 'documents',
  images: 'image',
  video: 'video',
  audio: 'audio',
  code: 'code',
};

export function renderFileIcon(ext: string, className?: string, size = 18): React.ReactElement {
  const normalized = ext.toLowerCase();
  const typeIcon = FILE_ICON_BY_EXT[normalized];
  const section = getFileSection(normalized);
  const src = typeIcon
    ? `/icons/file-types/${typeIcon}.png`
    : `/icons/sections/${SECTION_ICON_FILE[section]}.png`;

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      // 전역 페이드인 예외 처리: 파일 아이콘은 리마운트되어도 깜빡이지 않도록 즉시 표시
      className={className ? `${className} no-fade` : 'no-fade'}
      draggable={false}
      style={{ objectFit: 'contain' }}
    />
  );
}
