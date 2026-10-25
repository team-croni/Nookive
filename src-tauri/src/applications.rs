// src-tauri/src/applications.rs
// macOS 설치 앱 검색 및 앱 아이콘 추출.
use base64::Engine;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::models::{ApplicationChunk, ApplicationFile, ApplicationSearchResult};

/// 설치된 macOS 앱은 앱 바이너리/리소스를 임베딩하지 않고 LaunchServices 검색에
/// 필요한 표시 이름과 Bundle ID만 색인한다. 앱 검색은 이름/ID에 대한 정확 검색이다.
#[tauri::command]
pub fn list_applications() -> Vec<ApplicationSearchResult> {
    #[cfg(not(target_os = "macos"))]
    {
        return Vec::new();
    }

    #[cfg(target_os = "macos")]
    {
        let mut roots = vec![
            PathBuf::from("/Applications"),
            PathBuf::from("/System/Applications"),
        ];
        if let Ok(home) = std::env::var("HOME") {
            roots.push(PathBuf::from(home).join("Applications"));
        }

        let mut apps = Vec::new();
        for root in roots {
            collect_applications(&root, &mut apps, 0);
        }
        apps.sort_by_key(|a| a.file.name.to_lowercase());
        apps.dedup_by(|a, b| a.file.path == b.file.path);
        apps
    }
}

#[cfg(target_os = "macos")]
fn collect_applications(dir: &Path, out: &mut Vec<ApplicationSearchResult>, depth: u8) {
    if depth > 3 {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if !file_type.is_dir() {
            continue;
        }

        if path.extension().and_then(|v| v.to_str()) == Some("app") {
            if let Some(result) = application_result(&path) {
                out.push(result);
            }
            continue;
        }
        if !path
            .file_name()
            .and_then(|v| v.to_str())
            .is_some_and(|v| v.starts_with('.'))
        {
            collect_applications(&path, out, depth + 1);
        }
    }
}

#[cfg(target_os = "macos")]
fn application_result(path: &Path) -> Option<ApplicationSearchResult> {
    let fallback_name = path.file_stem()?.to_string_lossy().to_string();
    let plist = path.join("Contents/Info.plist");
    let mut display_name = fallback_name;
    let mut bundle_id = None;

    if plist.exists()
        && let Ok(output) = Command::new("plutil")
            .args(["-convert", "json", "-o", "-", plist.to_str()?])
            .output()
        && output.status.success()
        && let Ok(value) = serde_json::from_slice::<serde_json::Value>(&output.stdout)
    {
        display_name = value
            .get("CFBundleDisplayName")
            .or_else(|| value.get("CFBundleName"))
            .and_then(|v| v.as_str())
            .unwrap_or(&display_name)
            .to_string();
        bundle_id = value
            .get("CFBundleIdentifier")
            .and_then(|v| v.as_str())
            .map(str::to_string);
    }

    let path_string = path.to_string_lossy().to_string();
    let snippet = match &bundle_id {
        Some(id) => format!("macOS application: {display_name}; bundle id: {id}"),
        None => format!("macOS application: {display_name}"),
    };
    Some(ApplicationSearchResult {
        id: format!("application:{path_string}"),
        file: ApplicationFile {
            path: path_string,
            name: display_name.clone(),
            extension: "app",
            kind: "application",
            bundle_id,
            size_bytes: 0,
            modified_at: "설치된 앱".to_string(),
        },
        similarity_score: 0.0,
        best_chunk: ApplicationChunk {
            chunk_index: 0,
            text_snippet: snippet,
        },
        category: "application",
    })
}

/// 앱 검색 결과에 표시할 macOS 앱 아이콘을 충분한 해상도의 PNG data URL로 반환한다.
/// 앱 목록 자체에는 아이콘 바이너리를 넣지 않고, 실제 검색 결과에 표시되는
/// 앱에 대해서만 호출해 초기 인덱스 payload와 앱 스캔 비용을 작게 유지한다.
#[tauri::command]
pub fn get_application_icon(path: String) -> Option<String> {
    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        return None;
    }

    #[cfg(target_os = "macos")]
    {
        let app_path = Path::new(&path);
        if app_path.extension().and_then(|value| value.to_str()) != Some("app") {
            return None;
        }

        let resources = app_path.join("Contents/Resources");
        let plist = app_path.join("Contents/Info.plist");
        let mut candidates = Vec::new();
        if let Ok(output) = Command::new("plutil")
            .args(["-convert", "json", "-o", "-", plist.to_str()?])
            .output()
            && output.status.success()
            && let Ok(value) = serde_json::from_slice::<serde_json::Value>(&output.stdout)
        {
            if let Some(icon_file) = value.get("CFBundleIconFile").and_then(|v| v.as_str()) {
                candidates.push(icon_file.to_string());
            }
            if let Some(icon_files) = value.get("CFBundleIconFiles").and_then(|v| v.as_array()) {
                candidates.extend(
                    icon_files
                        .iter()
                        .filter_map(|v| v.as_str())
                        .map(str::to_string),
                );
            }
        }

        candidates.extend(["AppIcon.icns".to_string(), "application.icns".to_string()]);
        let icon_path = candidates
            .into_iter()
            .map(|candidate| {
                let path = resources.join(&candidate);
                if path.extension().is_none() {
                    path.with_extension("icns")
                } else {
                    path
                }
            })
            .find(|candidate| candidate.is_file())
            .or_else(|| {
                std::fs::read_dir(&resources)
                    .ok()?
                    .flatten()
                    .map(|entry| entry.path())
                    .find(|candidate| {
                        candidate.extension().and_then(|v| v.to_str()) == Some("icns")
                    })
            });
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        path.hash(&mut hasher);
        let cache_key = format!("{:x}", hasher.finish());
        let temporary_source = icon_path.is_none();
        let source_path = if let Some(icon_path) = icon_path {
            icon_path
        } else {
            // Assets.car만 포함한 최신 앱은 번들 안에 읽을 수 있는 .icns가 없다.
            // NSWorkspace는 LaunchServices가 관리하는 실제 앱 아이콘을 반환한다.
            use objc2_app_kit::NSWorkspace;
            use objc2_foundation::NSString;

            let ns_path = NSString::from_str(&path);
            let icon = NSWorkspace::sharedWorkspace().iconForFile(&ns_path);
            let tiff = icon.TIFFRepresentation()?.to_vec();
            let tiff_path = std::env::temp_dir().join(format!("nookive-app-icon-{cache_key}.tiff"));
            std::fs::write(&tiff_path, tiff).ok()?;
            tiff_path
        };
        let png_path = std::env::temp_dir().join(format!("nookive-app-icon-{cache_key}.png"));
        let conversion = Command::new("sips")
            // 상세 패널과 Retina 디스플레이에서도 선명하게 보이도록
            // 표시 크기(64px)보다 큰 256px 원본으로 변환한다.
            .args(["-s", "format", "png", "-z", "256", "256"])
            .arg(&source_path)
            .args(["--out"])
            .arg(&png_path)
            .output()
            .ok()?;
        if !conversion.status.success() {
            if temporary_source {
                let _ = std::fs::remove_file(&source_path);
            }
            return None;
        }

        let bytes = std::fs::read(&png_path).ok();
        let _ = std::fs::remove_file(&png_path);
        if temporary_source {
            let _ = std::fs::remove_file(&source_path);
        }
        let encoded = base64::engine::general_purpose::STANDARD.encode(bytes?);
        Some(format!("data:image/png;base64,{encoded}"))
    }
}
