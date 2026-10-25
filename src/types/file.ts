// src/types/file.ts
export type FileExtension =
  | 'pdf'
  | 'md'
  | 'txt'
  | 'json'
  | 'ts'
  | 'tsx'
  | 'js'
  | 'py'
  | 'png'
  | 'jpg'
  | 'mp4'
  | 'mp3';

export interface FileMetadata {
  path: string;
  name: string;
  extension: FileExtension | string;
  /** 일반 파일과 macOS 애플리케이션을 구분한다. 앱은 내용 임베딩 없이 메타데이터로 검색한다. */
  kind?: 'file' | 'application' | 'folder';
  bundleId?: string;
  sizeBytes: number;
  modifiedAt: string;
  pageCount?: number;
  durationSeconds?: number;
  /** 목록용 소형 썸네일 경로 (인덱싱 시 생성, 이미지 파일에만 존재) */
  thumbnail?: string;
  /** 미리보기용 중간 해상도 이미지 경로 (인덱싱 시 생성, 이미지 파일에만 존재) */
  preview?: string;
}
