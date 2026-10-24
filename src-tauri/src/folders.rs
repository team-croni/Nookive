// src-tauri/src/folders.rs
// 검색 루트 내 폴더 메타데이터 검색 및 폴더 아이콘 추출.
use base64::Engine;
use std::collections::HashSet;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::AppHandle;

use crate::index::load_manifest;
use crate::models::{ApplicationChunk, FolderFile, FolderSearchResult};

/// 설정된 검색 루트 안의 디렉터리는 내용을 임베딩하지 않고 이름/경로 메타데이터만
/// 검색한다. 파일 색인과 동일한 디렉터리 제외 규칙을 사용해 결과 수를 제한한다.
#[tauri::command]
pub fn list_indexed_folders(app: AppHandle) -> Result<Vec<FolderSearchResult>, String> {
    let manifest = load_manifest(&app)?;
    let mut paths: HashSet<String> = manifest.directories.into_iter().collect();

    // 이전 버전 manifest에는 directories가 없을 수 있으므로, 기존 파일 경로에서
    // 부모 디렉터리를 복원해 앱 업데이트 직후에도 폴더 검색이 동작하게 한다.
    if paths.is_empty() {
        for root in &manifest.roots {
            paths.insert(root.clone());
        }
        for file in &manifest.files {
            let mut parent = Path::new(&file.path).parent();
            while let Some(path) = parent {
                let path_string = path.to_string_lossy().to_string();
                paths.insert(path_string.clone());
                if manifest.roots.iter().any(|root| root == &path_string) {
                    break;
                }
                parent = path.parent();
            }
        }
    }

    let mut folders: Vec<FolderSearchResult> = paths
        .into_iter()
        .filter_map(|path| {
            let folder_path = PathBuf::from(&path);
            if !folder_path.is_dir() {
                return None;
            }
            let name = folder_path
                .file_name()
                .map(|value| value.to_string_lossy().to_string())
                .filter(|value| !value.is_empty())
                .unwrap_or_else(|| path.clone());
            Some(FolderSearchResult {
                id: format!("folder:{path}"),
                file: FolderFile {
                    path: path.clone(),
                    name: name.clone(),
                    extension: "folder",
                    kind: "folder",
                    size_bytes: 0,
                    modified_at: "폴더".to_string(),
                },
                similarity_score: 0.0,
                best_chunk: ApplicationChunk {
                    chunk_index: 0,
                    text_snippet: format!("macOS folder: {name}"),
                },
                category: "document",
            })
        })
        .collect();
    folders.sort_by(|a, b| a.file.name.to_lowercase().cmp(&b.file.name.to_lowercase()));
    Ok(folders)
}

/// macOS Finder가 사용하는 실제 폴더 아이콘을 PNG data URL로 반환한다.
#[tauri::command]
pub fn get_folder_icon(path: String) -> Option<String> {
    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        return None;
    }

    #[cfg(target_os = "macos")]
    {
        let folder_path = Path::new(&path);
        if !folder_path.is_dir() {
            return None;
        }

        use objc2_app_kit::NSWorkspace;
        use objc2_foundation::NSString;

        let ns_path = NSString::from_str(&path);
        let icon = NSWorkspace::sharedWorkspace().iconForFile(&ns_path);
        let tiff = icon.TIFFRepresentation()?.to_vec();
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        path.hash(&mut hasher);
        let cache_key = format!("{:x}", hasher.finish());
        let tiff_path = std::env::temp_dir().join(format!("nookive-folder-icon-{cache_key}.tiff"));
        let png_path = std::env::temp_dir().join(format!("nookive-folder-icon-{cache_key}.png"));
        std::fs::write(&tiff_path, tiff).ok()?;
        let conversion = Command::new("sips")
            .args(["-s", "format", "png", "-z", "96", "96"])
            .arg(&tiff_path)
            .args(["--out"])
            .arg(&png_path)
            .output()
            .ok()?;
        let _ = std::fs::remove_file(&tiff_path);
        if !conversion.status.success() {
            let _ = std::fs::remove_file(&png_path);
            return None;
        }
        let bytes = std::fs::read(&png_path).ok();
        let _ = std::fs::remove_file(&png_path);
        let encoded = base64::engine::general_purpose::STANDARD.encode(bytes?);
        Some(format!("data:image/png;base64,{encoded}"))
    }
}
