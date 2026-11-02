// src/utils/tauri/codeSearch.ts
// 코드 검색(파일 이름/경로, 내용 색인) Tauri IPC 래퍼.
import { invoke } from '@tauri-apps/api/core';
import type { SearchResultItem } from '../../types/search';

/** 오래된 코드 파일 목록을 다시 훑고 코드 파일 수를 돌려준다. (30초 이내면 그대로 쓴다) */
export async function refreshCodeFiles(): Promise<number> {
  try {
    return await invoke<number>('refresh_code_files');
  } catch (err) {
    console.warn('[Tauri] refresh_code_files 실패:', err);
    return 0;
  }
}

/** 이름/경로가 일치하는 파일 뒤에 내용이 일치하는 줄을 붙여 돌려준다. 순서는 Rust가 정한 그대로다. */
export async function searchCodeFiles(query: string): Promise<SearchResultItem[]> {
  try {
    return await invoke<SearchResultItem[]>('search_code_files', { query });
  } catch (err) {
    console.warn('[Tauri] search_code_files 실패:', err);
    return [];
  }
}

/** 코드 내용 색인을 백그라운드에서 맞춘다. 끝나면 code-index-state 이벤트가 온다. */
export async function syncCodeIndex(): Promise<boolean> {
  try {
    return await invoke<boolean>('sync_code_index');
  } catch (err) {
    console.warn('[Tauri] sync_code_index 실패:', err);
    return false;
  }
}

export async function isCodeIndexBuilding(): Promise<boolean> {
  try {
    return await invoke<boolean>('is_code_index_building');
  } catch {
    return false;
  }
}

export interface CodeEditor {
  id: string;
  name: string;
}

let editorsPromise: Promise<CodeEditor[]> | null = null;

/** 설치된 에디터 (자동 선택 순서). 앱이 떠 있는 동안은 한 번만 찾는다. */
export function listCodeEditors(): Promise<CodeEditor[]> {
  editorsPromise ??= invoke<CodeEditor[]>('list_code_editors').catch((err) => {
    console.warn('[Tauri] list_code_editors 실패:', err);
    editorsPromise = null;
    return [];
  });
  return editorsPromise;
}

/** 코드 파일을 에디터에서 해당 줄로 연다. 에디터가 없거나 실패하면 Rust가 기본 앱으로 연다. */
export async function openCodeFile(path: string, line: number | undefined, editor: string): Promise<void> {
  try {
    await invoke('open_code_file', { path, line, editor });
  } catch (err) {
    console.warn('[Tauri] open_code_file 실패:', err);
  }
}

/** 설정의 코드 검색 스위치를 Rust에 알린다. 꺼져 있으면 파일 감시가 코드 색인을 갱신하지 않는다. */
export async function sendCodeSearchEnabled(enabled: boolean): Promise<void> {
  try {
    await invoke('set_code_search_enabled', { enabled });
  } catch (err) {
    console.warn('[Tauri] set_code_search_enabled 실패:', err);
  }
}

export interface CodeIndexStatus {
  exists: boolean;
  building: boolean;
  files: number;
  skipped: number;
  sizeBytes: number;
  updatedAtMs?: number;
}

export async function getCodeIndexStatus(): Promise<CodeIndexStatus | null> {
  try {
    return await invoke<CodeIndexStatus>('get_code_index_status');
  } catch (err) {
    console.warn('[Tauri] get_code_index_status 실패:', err);
    return null;
  }
}
