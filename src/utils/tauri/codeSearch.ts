// src/utils/tauri/codeSearch.ts
// 코드 검색(파일 이름/경로) Tauri IPC 래퍼.
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

/** 코드 파일을 이름/경로로 찾는다. 순서는 Rust가 정한 그대로다. */
export async function searchCodeFiles(query: string): Promise<SearchResultItem[]> {
  try {
    return await invoke<SearchResultItem[]>('search_code_files', { query });
  } catch (err) {
    console.warn('[Tauri] search_code_files 실패:', err);
    return [];
  }
}
