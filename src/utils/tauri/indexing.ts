// src/utils/tauri/indexing.ts
// 인덱스/임베딩 관련 Tauri IPC 래퍼.
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { SearchResultItem } from '../../types/search';
import type {
  BatchIndexResult,
  EmbeddingEngineStatus,
  IndexSyncStatus,
  ModelBundleStatus,
  DiskSpaceStatus,
} from './types';

/**
 * macOS LaunchServices에 등록된 앱 중 주요 앱 폴더의 .app 메타데이터를 가져온다.
 * 브라우저 개발 환경에서는 Tauri IPC가 없으므로 빈 배열로 폴백한다.
 */
export async function listApplications(): Promise<SearchResultItem[]> {
  try {
    return await invoke<SearchResultItem[]>('list_applications');
  } catch {
    return [];
  }
}

/** 설정된 검색 루트의 폴더를 이름/경로 메타데이터로 가져온다. */
export async function listIndexedFolders(): Promise<SearchResultItem[]> {
  try {
    return await invoke<SearchResultItem[]>('list_indexed_folders');
  } catch {
    return [];
  }
}

export async function getIndexStatus(): Promise<IndexSyncStatus | null> {
  try {
    return await invoke<IndexSyncStatus>('get_index_status');
  } catch {
    return null;
  }
}

export async function getIndexError(): Promise<string | null> {
  try {
    return await invoke<string | null>('get_index_error');
  } catch (err) {
    console.warn('[Tauri] 인덱싱 오류 상태 확인 실패:', err);
    return null;
  }
}

export async function clearIndexError(): Promise<void> {
  try {
    await invoke('clear_index_error');
  } catch (err) {
    console.warn('[Tauri] 인덱싱 오류 상태 초기화 실패:', err);
  }
}

export async function deleteAppData(): Promise<void> {
  await invoke('delete_app_data');
}

export async function getIndexDiskSpace(): Promise<DiskSpaceStatus | null> {
  try {
    return await invoke<DiskSpaceStatus>('get_index_disk_space');
  } catch (err) {
    console.warn('[Tauri] 인덱싱 디스크 여유 공간 확인 실패:', err);
    return null;
  }
}

export async function getEmbeddingStatus(): Promise<EmbeddingEngineStatus | null> {
  try {
    return await invoke<EmbeddingEngineStatus>('get_embedding_status');
  } catch {
    return null;
  }
}

/** 첫 색인 전에 자동 시작된 EmbeddingGemma sidecar가 준비될 때까지 기다린다. */
export async function waitForEmbeddingServer(timeoutMs = 120_000): Promise<EmbeddingEngineStatus | null> {
  try {
    return await invoke<EmbeddingEngineStatus>('wait_for_embedding_server', { timeoutMs });
  } catch (err) {
    console.warn('[Tauri] EmbeddingGemma 준비 대기 실패:', err);
    return null;
  }
}

export async function getModelStatus(): Promise<ModelBundleStatus | null> {
  try {
    return await invoke<ModelBundleStatus>('get_model_status');
  } catch (err) {
    console.warn('[Tauri] 모델 상태 확인 실패:', err);
    return null;
  }
}

export async function downloadModelBundle(kind: 'embedding' | 'speech' | 'all'): Promise<ModelBundleStatus | null> {
  try {
    return await invoke<ModelBundleStatus>('download_model_bundle', { kind });
  } catch (err) {
    console.warn('[Tauri] 모델 다운로드 실패:', err);
    throw err;
  }
}

export async function cancelModelDownload(): Promise<void> {
  try {
    await invoke('cancel_model_download');
  } catch (err) {
    console.warn('[Tauri] 모델 다운로드 취소 실패:', err);
  }
}

export async function pauseModelDownload(): Promise<void> {
  try {
    await invoke('pause_model_download');
  } catch (err) {
    console.warn('[Tauri] 모델 다운로드 일시정지 실패:', err);
  }
}

export async function resumeModelDownload(): Promise<void> {
  try {
    await invoke('resume_model_download');
  } catch (err) {
    console.warn('[Tauri] 모델 다운로드 재개 실패:', err);
  }
}

export async function resetModelDownload(): Promise<void> {
  try {
    await invoke('reset_model_download');
  } catch (err) {
    console.warn('[Tauri] 모델 설치 초기화 실패:', err);
    throw err;
  }
}

export async function syncIndexManifest(roots: string[]): Promise<IndexSyncStatus | null> {
  try {
    return await invoke<IndexSyncStatus>('sync_index_manifest', { roots });
  } catch {
    return null;
  }
}

export async function syncSavedIndexManifest(): Promise<IndexSyncStatus | null> {
  try {
    return await invoke<IndexSyncStatus>('sync_saved_index_manifest');
  } catch (err) {
    console.warn('[Tauri] 저장된 검색 폴더 동기화 실패:', err);
    return null;
  }
}

export async function pickIndexFolder(): Promise<string | null> {
  try {
    const selected = await open({
      directory: true,
      multiple: false,
    });
    return typeof selected === 'string' ? selected : null;
  } catch {
    return null;
  }
}

export async function loadRuntimeIndex(): Promise<SearchResultItem[]> {
  try {
    return await invoke<SearchResultItem[]>('load_runtime_index');
  } catch {
    return [];
  }
}

export async function upsertRuntimeIndex(
  records: SearchResultItem[],
  replacePaths: string[],
): Promise<void> {
  await invoke('upsert_runtime_index', {
    update: { records, replacePaths },
  });
}

export async function markIndexFilesReady(paths: string[]): Promise<IndexSyncStatus | null> {
  return await invoke<IndexSyncStatus>('mark_index_files_ready', { paths });
}

/** 검색 루트는 유지한 채 파일/임베딩 인덱스를 비우고 재색인 대기 상태로 만든다. */
export async function resetIndex(): Promise<IndexSyncStatus | null> {
  try {
    return await invoke<IndexSyncStatus>('reset_index');
  } catch (err) {
    console.warn('[Tauri] 인덱스 초기화 실패:', err);
    return null;
  }
}

/**
 * 기존 Node 멀티모달 인덱서로 이미지/PDF/오디오/비디오 pending 파일을 처리한다.
 * 음성 모델이 설치되어 있으면 Rust가 Qwen3-ASR 서버를 자동 기동/종료하고 전사까지 수행한다.
 * 음성 모델이 없거나 서버를 시작하지 못해도 다른 미디어의 멀티모달 색인은 계속한다.
 * `useAligner`가 true면 단어 단위 타임스탬프까지 정렬한다.
 */
export async function indexPendingMedia(
  paths: string[],
  useAligner = true,
  runId = `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`,
): Promise<BatchIndexResult> {
  try {
    // ASR은 설치되어 있을 때만 활성화되며, 음성 구성 요소가 없어도 미디어 색인은 계속된다.
    return await invoke<BatchIndexResult>('index_pending_media', {
      paths,
      useAsr: true,
      useAligner,
      runId,
    });
  } catch (err) {
    console.warn('[Tauri] 멀티모달 색인 실패:', err);
    throw err;
  }
}

/** 실행 중인 미디어 인덱서(Node)를 중지한다. */
export async function cancelMediaIndexing(): Promise<boolean> {
  try {
    await invoke('cancel_media_indexing');
    return true;
  } catch (err) {
    console.warn('[Tauri] 미디어 인덱싱 중지 실패:', err);
    return false;
  }
}

/** 자동 색인 옵션(정확한 시점 표시)을 Rust 워처에 전달한다. */
export async function setIndexOptions(useAligner: boolean): Promise<void> {
  try {
    await invoke('set_index_options', { useAligner });
  } catch (err) {
    console.warn('[Tauri] 색인 옵션 저장 실패:', err);
  }
}

/** 수동 색인 중임을 Rust 워처에 알려 자동 색인과 겹치지 않게 한다. */
export async function setIndexingBusy(busy: boolean): Promise<boolean> {
  try {
    return await invoke<boolean>('set_indexing_busy', { busy });
  } catch (err) {
    console.warn('[Tauri] 색인 상태 전달 실패:', err);
    return false;
  }
}
