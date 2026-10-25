// src-tauri/src/index/manifest.rs
// 인덱스 manifest 스캔/저장 및 동기화 커맨드.
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

use crate::paths::resolve_home;

const INDEX_MANIFEST_VERSION: u32 = 1;
const INDEX_MODEL_VERSION: &str = "embeddinggemma-2-Q8_0";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct FileFingerprint {
    pub(crate) path: String,
    #[serde(rename = "sizeBytes")]
    pub(crate) size_bytes: u64,
    #[serde(rename = "modifiedAtMs")]
    pub(crate) modified_at_ms: u128,
    pub(crate) extension: String,
    pub(crate) status: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub(crate) struct IndexManifest {
    pub(crate) schema_version: u32,
    pub(crate) model_version: String,
    pub(crate) roots: Vec<String>,
    #[serde(default)]
    pub(crate) directories: Vec<String>,
    pub(crate) files: Vec<FileFingerprint>,
    pub(crate) pending_paths: Vec<String>,
    pub(crate) last_sync_at_ms: Option<u128>,
}

#[derive(Debug, Serialize)]
pub struct IndexSyncStatus {
    manifest_path: String,
    roots: Vec<String>,
    total_files: usize,
    pending_files: usize,
    pub(crate) pending_paths: Vec<String>,
    changed_files: usize,
    removed_files: usize,
    last_sync_at_ms: Option<u128>,
}

fn manifest_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("앱 데이터 디렉터리 확인 실패: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("앱 데이터 디렉터리 생성 실패: {e}"))?;
    Ok(dir.join("index-manifest.json"))
}

pub(crate) fn load_manifest(app: &AppHandle) -> Result<IndexManifest, String> {
    let path = manifest_path(app)?;
    if !path.exists() {
        return Ok(IndexManifest {
            schema_version: INDEX_MANIFEST_VERSION,
            model_version: INDEX_MODEL_VERSION.to_string(),
            ..Default::default()
        });
    }
    let bytes = std::fs::read(&path).map_err(|e| format!("인덱스 manifest 읽기 실패: {e}"))?;
    let mut manifest: IndexManifest =
        serde_json::from_slice(&bytes).map_err(|e| format!("인덱스 manifest 파싱 실패: {e}"))?;
    if manifest.schema_version != INDEX_MANIFEST_VERSION
        || manifest.model_version != INDEX_MODEL_VERSION
    {
        manifest = IndexManifest {
            schema_version: INDEX_MANIFEST_VERSION,
            model_version: INDEX_MODEL_VERSION.to_string(),
            ..Default::default()
        };
    }
    Ok(manifest)
}

pub(crate) fn save_manifest(app: &AppHandle, manifest: &IndexManifest) -> Result<(), String> {
    let path = manifest_path(app)?;
    let temp = path.with_extension("json.tmp");
    let bytes =
        serde_json::to_vec_pretty(manifest).map_err(|e| format!("manifest 직렬화 실패: {e}"))?;
    std::fs::write(&temp, bytes).map_err(|e| format!("manifest 임시 저장 실패: {e}"))?;
    std::fs::rename(&temp, &path).map_err(|e| format!("manifest 교체 실패: {e}"))?;
    Ok(())
}

fn modified_at_ms(metadata: &std::fs::Metadata) -> u128 {
    metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis())
        .unwrap_or_else(|| {
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0)
        })
}

fn supported_extension(path: &Path) -> Option<String> {
    let ext = path.extension()?.to_string_lossy().to_lowercase();
    let supported = [
        "md", "txt", "json", "ts", "tsx", "js", "py", "rtf", "pdf", "png", "jpg", "jpeg", "webp",
        "heic", "bmp", "gif", "mp3", "m4a", "wav", "flac", "aac", "ogg", "wma", "mp4", "mov",
        "mkv", "avi", "webm", "m4v",
    ];
    supported.contains(&ext.as_str()).then_some(ext)
}

fn should_skip_directory(name: &str) -> bool {
    name.starts_with('.') || matches!(name, "node_modules" | "dist" | "target" | "build")
}

fn scan_indexable_files(dir: &Path, out: &mut Vec<FileFingerprint>, directories: &mut Vec<String>) {
    directories.push(dir.to_string_lossy().to_string());
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_dir() {
            if !path
                .file_name()
                .and_then(|v| v.to_str())
                .is_some_and(should_skip_directory)
            {
                scan_indexable_files(&path, out, directories);
            }
            continue;
        }
        if !file_type.is_file() {
            continue;
        }
        let Some(extension) = supported_extension(&path) else {
            continue;
        };
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        if metadata.len() > 200 * 1024 * 1024 {
            continue;
        }
        out.push(FileFingerprint {
            path: path.to_string_lossy().to_string(),
            size_bytes: metadata.len(),
            modified_at_ms: modified_at_ms(&metadata),
            extension,
            status: "pending".to_string(),
        });
    }
}

/// 선택된 루트만 스캔해 파일 fingerprint를 갱신한다. 실제 임베딩은 별도 작업 큐에서
/// 처리할 수 있도록 pending_paths로 분리한다. 파일 내용을 읽거나 업로드하지 않는다.
pub(crate) fn sync_index_manifest(
    app: AppHandle,
    roots: Vec<String>,
) -> Result<IndexSyncStatus, String> {
    let mut manifest = load_manifest(&app)?;
    let previous: HashMap<String, FileFingerprint> = std::mem::take(&mut manifest.files)
        .into_iter()
        .map(|file| (file.path.clone(), file))
        .collect();
    let mut current = Vec::new();
    let mut directories = Vec::new();
    let mut normalized_roots = Vec::new();
    for root in roots {
        let resolved = PathBuf::from(resolve_home(&root));
        if !resolved.is_dir() {
            continue;
        }
        let normalized = resolved.to_string_lossy().to_string();
        if normalized_roots.contains(&normalized) {
            continue;
        }
        normalized_roots.push(normalized);
        scan_indexable_files(&resolved, &mut current, &mut directories);
    }

    let mut pending = Vec::new();
    for file in &mut current {
        let unchanged = previous.get(&file.path).is_some_and(|old| {
            old.size_bytes == file.size_bytes
                && old.modified_at_ms == file.modified_at_ms
                && old.status == "ready"
        });
        if unchanged {
            file.status = "ready".to_string();
        } else {
            pending.push(file.path.clone());
        }
    }
    let current_paths: HashSet<&str> = current.iter().map(|file| file.path.as_str()).collect();
    let removed_files = previous
        .keys()
        .filter(|path| !current_paths.contains(path.as_str()))
        .count();
    let removed_paths: Vec<String> = previous
        .keys()
        .filter(|path| !current_paths.contains(path.as_str()))
        .cloned()
        .collect();
    let changed_files = pending.len();

    // 빈 roots는 사용자가 모든 검색 폴더를 제거한 경우로 처리한다.
    // 단순 상태 조회는 get_index_status가 별도로 manifest를 읽는다.
    let has_scan_roots = !normalized_roots.is_empty();
    directories.sort();
    directories.dedup();
    manifest.roots = normalized_roots;
    manifest.directories = directories;
    manifest.files = current;
    manifest.pending_paths = pending;
    manifest.last_sync_at_ms = Some(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0),
    );
    save_manifest(&app, &manifest)?;
    if !removed_paths.is_empty() {
        let removed: HashSet<&str> = removed_paths.iter().map(String::as_str).collect();
        let mut runtime_records = super::runtime::load_runtime_records(&app)?;
        runtime_records.retain(|record| {
            record
                .get("file")
                .and_then(|file| file.get("path"))
                .and_then(serde_json::Value::as_str)
                .is_none_or(|path| !removed.contains(path))
        });
        super::runtime::save_runtime_records(&app, &runtime_records)?;
    }
    let path = manifest_path(&app)?;
    Ok(IndexSyncStatus {
        manifest_path: path.to_string_lossy().to_string(),
        roots: manifest.roots,
        total_files: manifest.files.len(),
        pending_files: manifest.pending_paths.len(),
        pending_paths: manifest.pending_paths,
        changed_files: if has_scan_roots { changed_files } else { 0 },
        removed_files: if has_scan_roots { removed_files } else { 0 },
        last_sync_at_ms: manifest.last_sync_at_ms,
    })
}

pub(crate) fn get_index_status(app: AppHandle) -> Result<IndexSyncStatus, String> {
    let manifest = load_manifest(&app)?;
    let path = manifest_path(&app)?;
    Ok(IndexSyncStatus {
        manifest_path: path.to_string_lossy().to_string(),
        roots: manifest.roots,
        total_files: manifest.files.len(),
        pending_files: manifest.pending_paths.len(),
        pending_paths: manifest.pending_paths,
        changed_files: 0,
        removed_files: 0,
        last_sync_at_ms: manifest.last_sync_at_ms,
    })
}

/// 앱/설정 창을 다시 열 때 저장된 검색 루트의 변경분을 즉시 pending으로 반영한다.
/// 실제 임베딩은 UI 작업 큐가 담당하므로 여기서는 파일 fingerprint만 갱신한다.
pub(crate) fn sync_saved_index_manifest(app: AppHandle) -> Result<IndexSyncStatus, String> {
    let roots = load_manifest(&app)?.roots;
    sync_index_manifest(app, roots)
}
