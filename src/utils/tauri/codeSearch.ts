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
