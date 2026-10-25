// src-tauri/src/index/runtime.rs
// runtime 인덱스 저장/갱신 및 인덱스 초기화 커맨드.
use serde::Deserialize;
use std::collections::HashSet;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

use super::manifest::{IndexSyncStatus, get_index_status, load_manifest, save_manifest};

fn runtime_index_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("앱 데이터 디렉터리 확인 실패: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("앱 데이터 디렉터리 생성 실패: {e}"))?;
    Ok(dir.join("runtime-index.json"))
}

pub(crate) fn load_runtime_records(app: &AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let path = runtime_index_path(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let bytes = std::fs::read(path).map_err(|e| format!("runtime 인덱스 읽기 실패: {e}"))?;
    serde_json::from_slice(&bytes).map_err(|e| format!("runtime 인덱스 파싱 실패: {e}"))
}

pub(crate) fn save_runtime_records(
    app: &AppHandle,
    records: &[serde_json::Value],
) -> Result<(), String> {
    let path = runtime_index_path(app)?;
    let temp = path.with_extension("json.tmp");
    let bytes =
        serde_json::to_vec(records).map_err(|e| format!("runtime 인덱스 직렬화 실패: {e}"))?;
    std::fs::write(&temp, bytes).map_err(|e| format!("runtime 인덱스 임시 저장 실패: {e}"))?;
    std::fs::rename(temp, path).map_err(|e| format!("runtime 인덱스 교체 실패: {e}"))?;
    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeIndexUpdate {
    records: Vec<serde_json::Value>,
    replace_paths: Vec<String>,
}

pub(crate) fn load_runtime_index(app: AppHandle) -> Result<Vec<serde_json::Value>, String> {
    load_runtime_records(&app)
}

/// 파일 단위로 기존 runtime chunk를 교체한다. 중간 저장은 atomic rename으로 보호한다.
pub(crate) async fn upsert_runtime_index(
    app: AppHandle,
    update: RuntimeIndexUpdate,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || upsert_runtime_index_sync(app, update))
        .await
        .map_err(|error| format!("runtime 인덱스 저장 작업 실패: {error}"))?
}

fn upsert_runtime_index_sync(app: AppHandle, update: RuntimeIndexUpdate) -> Result<(), String> {
    let replace_paths: HashSet<&str> = update.replace_paths.iter().map(String::as_str).collect();
    let mut records = load_runtime_records(&app)?;
    records.retain(|record| {
        record
            .get("file")
            .and_then(|file| file.get("path"))
            .and_then(serde_json::Value::as_str)
            .is_none_or(|path| !replace_paths.contains(path))
    });
    records.extend(update.records);
    save_runtime_records(&app, &records)
}

pub(crate) async fn mark_index_files_ready(
    app: AppHandle,
    paths: Vec<String>,
) -> Result<IndexSyncStatus, String> {
    tauri::async_runtime::spawn_blocking(move || mark_index_files_ready_sync(app, paths))
        .await
        .map_err(|error| format!("인덱스 상태 갱신 작업 실패: {error}"))?
}

fn mark_index_files_ready_sync(
    app: AppHandle,
    paths: Vec<String>,
) -> Result<IndexSyncStatus, String> {
    let mut manifest = load_manifest(&app)?;
    let ready: HashSet<&str> = paths.iter().map(String::as_str).collect();
    for file in &mut manifest.files {
        if ready.contains(file.path.as_str()) {
            file.status = "ready".to_string();
        }
    }
    manifest
        .pending_paths
        .retain(|path| !ready.contains(path.as_str()));
    save_manifest(&app, &manifest)?;
    get_index_status(app)
}

/// 임베딩/런타임 인덱스를 비우고, 현재 검색 루트의 파일을 다시 pending 상태로 만든다.
/// 검색 폴더 설정 자체는 유지해 초기화 후 바로 재색인할 수 있게 한다.
pub(crate) fn reset_index(app: AppHandle) -> Result<IndexSyncStatus, String> {
    let mut manifest = load_manifest(&app)?;
    let roots = manifest.roots.clone();
    manifest.files.clear();
    manifest.pending_paths.clear();
    manifest.directories.clear();
    manifest.last_sync_at_ms = None;
    save_manifest(&app, &manifest)?;
    save_runtime_records(&app, &[])?;
    super::manifest::sync_index_manifest(app, roots)
}
