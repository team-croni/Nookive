// src-tauri/src/index.rs
// 인덱스 도메인 커맨드 진입점. 실제 구현은 `index/*` 하위 모듈에 있다.
pub(crate) mod file_class;
pub(crate) mod manifest;
pub(crate) mod media;
pub(crate) mod runtime;
pub(crate) mod watcher;

use serde::Serialize;
use std::ffi::CString;
use std::fs;
use std::sync::Mutex;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Manager};

pub use manifest::IndexSyncStatus;
pub(crate) use manifest::load_manifest;
pub use media::{BatchIndexResult, MediaIndexState};
pub use runtime::RuntimeIndexUpdate;
pub use watcher::{IndexOptionsState, IndexWatcherState, IndexingBusyState};

#[derive(Default)]
pub struct IndexErrorState {
    last_error: Mutex<Option<String>>,
}

impl IndexErrorState {
    fn set(&self, error: String) {
        if let Ok(mut last_error) = self.last_error.lock() {
            *last_error = Some(error);
        }
    }

    fn clear(&self) {
        if let Ok(mut last_error) = self.last_error.lock() {
            *last_error = None;
        }
    }

    fn get(&self) -> Option<String> {
        self.last_error.lock().ok().and_then(|error| error.clone())
    }
}

pub fn set_last_index_error(app: &AppHandle, error: String) {
    app.state::<IndexErrorState>().set(error);
}

pub fn clear_last_index_error(app: &AppHandle) {
    app.state::<IndexErrorState>().clear();
}

const INDEX_DISK_SPACE_FLOOR: u64 = 512 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
pub struct DiskSpaceStatus {
    pub available_bytes: u64,
    pub total_bytes: u64,
    pub minimum_required_bytes: u64,
}

/// 인덱스 결과와 임시 파일이 저장되는 앱 데이터 볼륨의 여유 공간을 확인한다.
/// 인덱싱은 파일별 결과 외에도 atomic 교체용 임시 파일을 만들기 때문에
/// 작은 여유 공간에서는 시작하지 않도록 보수적인 하한을 둔다.
#[tauri::command]
pub fn get_index_disk_space(app: AppHandle) -> Result<DiskSpaceStatus, String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("앱 데이터 경로를 확인하지 못했습니다: {error}"))?;
    let path_string = path.to_string_lossy().into_owned();
    let c_path = CString::new(path_string)
        .map_err(|_| "앱 데이터 경로를 확인하지 못했습니다.".to_string())?;
    let mut stats: libc::statvfs = unsafe { std::mem::zeroed() };
    let result = unsafe { libc::statvfs(c_path.as_ptr(), &mut stats) };
    if result != 0 {
        return Err(format!(
            "디스크 여유 공간을 확인하지 못했습니다: {}",
            std::io::Error::last_os_error()
        ));
    }
    let block_size = stats.f_frsize as u64;
    Ok(DiskSpaceStatus {
        available_bytes: (stats.f_bavail as u64).saturating_mul(block_size),
        total_bytes: (stats.f_blocks as u64).saturating_mul(block_size),
        minimum_required_bytes: INDEX_DISK_SPACE_FLOOR,
    })
}

fn remove_directory_contents(path: std::path::PathBuf) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    for entry in
        fs::read_dir(&path).map_err(|error| format!("앱 데이터 목록을 읽지 못했습니다: {error}"))?
    {
        let entry =
            entry.map_err(|error| format!("앱 데이터 항목을 확인하지 못했습니다: {error}"))?;
        let entry_path = entry.path();
        if entry_path.is_dir() {
            fs::remove_dir_all(&entry_path)
                .map_err(|error| format!("앱 데이터 폴더 삭제 실패: {error}"))?;
        } else {
            fs::remove_file(&entry_path)
                .map_err(|error| format!("앱 데이터 파일 삭제 실패: {error}"))?;
        }
    }
    Ok(())
}

/// 모델, 앱이 만든 검색 데이터와 앱 전용 설정을 삭제한다.
/// 사용자가 선택한 원본 폴더와 파일은 절대 삭제하지 않는다.
#[tauri::command]
pub async fn delete_app_data(
    app: AppHandle,
    state: tauri::State<'_, MediaIndexState>,
) -> Result<(), String> {
    media::cancel_media_indexing(state)?;
    // 다운로드 중인 모델이 있다면 잠금이 풀린 뒤 모델 파일을 정리한다.
    crate::models::reset_model_download(app.clone()).await?;

    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("앱 데이터 경로를 확인하지 못했습니다: {error}"))?;
    remove_directory_contents(app_data)?;
    if let Ok(log_dir) = app.path().app_log_dir() {
        remove_directory_contents(log_dir)?;
    }
    if let Ok(config_dir) = app.path().app_config_dir() {
        remove_directory_contents(config_dir)?;
    }
    if let Ok(cache_dir) = app.path().app_cache_dir() {
        remove_directory_contents(cache_dir)?;
    }
    clear_last_index_error(&app);
    Ok(())
}

#[tauri::command]
pub fn cancel_media_indexing(state: tauri::State<MediaIndexState>) -> Result<(), String> {
    media::cancel_media_indexing(state)
}

/// 설정 창의 "정확한 시점 표시" 값을 자동 색인에도 반영한다.
#[tauri::command]
pub fn set_index_options(use_aligner: bool, state: tauri::State<IndexOptionsState>) {
    state.use_aligner.store(use_aligner, Ordering::Relaxed);
}

/// 수동 색인 중에는 자동 색인이 겹치지 않도록 표시한다.
#[tauri::command]
pub fn set_indexing_busy(busy: bool, state: tauri::State<IndexingBusyState>) -> bool {
    if busy {
        state.try_acquire()
    } else {
        state.set(false);
        true
    }
}

#[tauri::command]
pub fn sync_index_manifest(app: AppHandle, roots: Vec<String>) -> Result<IndexSyncStatus, String> {
    let status = manifest::sync_index_manifest(app.clone(), roots)?;
    // 검색 폴더가 추가/제거되면 워처도 새 루트로 다시 시작한다.
    watcher::restart_index_watcher(app);
    Ok(status)
}

#[tauri::command]
pub fn sync_saved_index_manifest(app: AppHandle) -> Result<IndexSyncStatus, String> {
    manifest::sync_saved_index_manifest(app)
}

#[tauri::command]
pub fn get_index_status(app: AppHandle) -> Result<IndexSyncStatus, String> {
    manifest::get_index_status(app)
}

#[tauri::command]
pub fn get_index_error(app: AppHandle) -> Option<String> {
    app.state::<IndexErrorState>().get()
}

#[tauri::command]
pub fn clear_index_error(app: AppHandle) {
    clear_last_index_error(&app);
}

#[tauri::command]
pub fn load_runtime_index(app: AppHandle) -> Result<Vec<serde_json::Value>, String> {
    runtime::load_runtime_index(app)
}

#[tauri::command]
pub async fn upsert_runtime_index(
    app: AppHandle,
    update: RuntimeIndexUpdate,
) -> Result<(), String> {
    runtime::upsert_runtime_index(app, update).await
}

#[tauri::command]
pub async fn mark_index_files_ready(
    app: AppHandle,
    paths: Vec<String>,
) -> Result<IndexSyncStatus, String> {
    runtime::mark_index_files_ready(app, paths).await
}

#[tauri::command]
pub fn reset_index(app: AppHandle) -> Result<IndexSyncStatus, String> {
    runtime::reset_index(app)
}

#[tauri::command]
pub async fn index_pending_media(
    app: AppHandle,
    paths: Vec<String>,
    use_asr: bool,
    use_aligner: bool,
    run_id: String,
) -> Result<BatchIndexResult, String> {
    media::index_pending_media(app, paths, use_asr, use_aligner, run_id).await
}
