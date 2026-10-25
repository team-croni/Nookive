// src/utils/tauri/icons.ts
// macOS 앱/폴더 아이콘 조회 (중복 요청 병합 + 캐시).
import { invoke } from '@tauri-apps/api/core';

const applicationIconCache = new Map<string, string | null>();
const applicationIconPending = new Map<string, Promise<string | null>>();
const folderIconCache = new Map<string, string | null>();
const folderIconPending = new Map<string, Promise<string | null>>();

/** macOS 앱 번들의 실제 아이콘을 검색 결과용 PNG data URL로 가져온다. */
export async function getApplicationIcon(path: string): Promise<string | null> {
  if (applicationIconCache.has(path)) return applicationIconCache.get(path) ?? null;
  const pending = applicationIconPending.get(path);
  if (pending) return pending;

  const request = invoke<string | null>('get_application_icon', { path })
    .catch(() => null)
    .then((icon) => {
      applicationIconCache.set(path, icon);
      applicationIconPending.delete(path);
      return icon;
    });
  applicationIconPending.set(path, request);
  return request;
}

/** macOS Finder의 실제 폴더 아이콘을 가져온다. */
export async function getFolderIcon(path: string): Promise<string | null> {
  if (folderIconCache.has(path)) return folderIconCache.get(path) ?? null;
  const pending = folderIconPending.get(path);
  if (pending) return pending;

  const request = invoke<string | null>('get_folder_icon', { path })
    .catch(() => null)
    .then((icon) => {
      folderIconCache.set(path, icon);
      folderIconPending.delete(path);
      return icon;
    });
  folderIconPending.set(path, request);
  return request;
}
