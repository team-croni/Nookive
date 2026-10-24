// src-tauri/src/paths.rs
// 경로 해석 유틸리티: `~` 확장 및 번들 리소스 경로 탐색.
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// `~` 를 사용자 홈 디렉터리로 확장
pub fn resolve_home(path: &str) -> String {
    if path.starts_with('~') {
        if let Ok(home) = std::env::var("HOME") {
            return path.replacen('~', &home, 1);
        }
    }
    path.to_string()
}

/// 번들 리소스 경로를 찾는다. `tauri dev`에는 번들 리소스 디렉터리가 없으므로
/// 프로젝트 리소스를 폴백으로 사용한다.
pub fn bundled_resource_path(app: &AppHandle, relative: &str) -> PathBuf {
    if let Ok(resource_dir) = app.path().resource_dir() {
        let candidate = resource_dir.join(relative);
        if candidate.exists() {
            return candidate;
        }
    }

    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join(relative)
}

/// Installed builds keep models outside the app bundle so the DMG stays small.
/// Development builds fall back to the repository's `models/` directory.
pub fn model_path(app: &AppHandle, relative: &str) -> Result<PathBuf, String> {
    if let Ok(app_data) = app.path().app_data_dir() {
        let candidate = app_data.join("models").join(relative);
        if candidate.exists() {
            return Ok(candidate);
        }
    }

    let bundled = bundled_resource_path(app, &format!("models/{relative}"));
    if bundled.exists() {
        return Ok(bundled);
    }

    app.path()
        .app_data_dir()
        .map(|path| path.join("models").join(relative))
        .map_err(|error| format!("모델 저장 경로를 확인하지 못했습니다: {error}"))
}
