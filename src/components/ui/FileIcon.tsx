import type { CSSProperties } from 'react';
import { getFileSection, type FileSection } from '../../utils/fileType';

const FILE_ICON_BY_EXT: Record<string, string> = {
  pdf: 'pdf',
  doc: 'doc', docx: 'docx', rtf: 'doc',
  ppt: 'ppt', pptx: 'pptx',
  xls: 'xls', xlsx: 'xlsx', csv: 'csv', tsv: 'xlsx', numbers: 'xlsx', ods: 'xlsx',
  txt: 'txt', md: 'txt', markdown: 'txt',
  png: 'png', jpg: 'jpg', jpeg: 'jpg', svg: 'svg',
  webp: 'img', gif: 'img', heic: 'img', heif: 'img', bmp: 'img', ico: 'img',
  tiff: 'img', tif: 'img', avif: 'img',
  mp4: 'mp4', mkv: 'mkv', avi: 'avi', mpeg: 'mpeg', mpg: 'mpeg',
  mov: 'mp4', webm: 'mp4', wmv: 'mp4', m4v: 'mp4', flv: 'mp4',
  mp3: 'mp3', wav: 'wav',
  m4a: 'mp3', aac: 'mp3', flac: 'mp3', ogg: 'mp3', wma: 'mp3',
  zip: 'zip', rar: 'rar',
  tar: 'zip', gz: 'zip', tgz: 'zip', '7z': 'zip', pkg: 'zip', dmg: 'zip', bz2: 'zip', xz: 'zip',
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

interface FileIconProps {
  ext: string;
  className?: string;
  size?: number;
}

export function FileIcon({ ext, className, size = 18 }: FileIconProps) {
  const normalized = ext.toLowerCase();
  const typeIcon = FILE_ICON_BY_EXT[normalized];
  const section = getFileSection(normalized);
  const src = typeIcon
    ? `/icons/file-types/${typeIcon}.png`
    : `/icons/sections/${SECTION_ICON_FILE[section]}.png`;
  const style: CSSProperties = { objectFit: 'contain' };

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className={className ? `${className} no-fade` : 'no-fade'}
      draggable={false}
      style={style}
    />
  );
}
