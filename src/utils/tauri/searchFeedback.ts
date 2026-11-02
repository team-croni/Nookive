// src/utils/tauri/searchFeedback.ts
// 검색 개인화 기록(search-feedback.json) Tauri IPC 래퍼.
import { invoke } from '@tauri-apps/api/core';

/** 저장된 기록. 파일이 없거나 IPC가 없는 브라우저 환경이면 null. */
export async function loadSearchFeedback(): Promise<unknown> {
  try {
    return await invoke<unknown>('load_search_feedback');
  } catch {
    return null;
  }
}

/** 저장에 실패해도 검색은 계속되므로 경고만 남긴다. */
export async function saveSearchFeedback(data: unknown): Promise<void> {
  try {
    await invoke('save_search_feedback', { data });
  } catch (err) {
    console.warn('[Tauri] save_search_feedback 실패:', err);
  }
}

/** 기록을 지우고 모든 창에 search-feedback-reset 이벤트를 보낸다. */
export async function resetSearchFeedback(): Promise<void> {
  await invoke('reset_search_feedback');
}
