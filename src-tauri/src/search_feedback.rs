// src-tauri/src/search_feedback.rs
// 검색 개인화 기록(search-feedback.json) 저장/불러오기/초기화.
// 점수 계산은 프론트엔드(feedback.ts)가 하고, 여기서는 JSON을 그대로 보관한다.
// 기록에는 검색어가 평문으로 들어가며 이 Mac 밖으로 보내지 않는다.
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Emitter, Manager};

const FEEDBACK_FILE: &str = "search-feedback.json";
/// 비정상적으로 큰 값이 저장되지 않게 막는다. (2,000개 기록은 수백 KB 수준)
const MAX_FEEDBACK_BYTES: usize = 2 * 1024 * 1024;
pub(crate) const FEEDBACK_RESET_EVENT: &str = "search-feedback-reset";

fn feedback_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("앱 데이터 디렉터리 확인 실패: {e}"))?;
    Ok(dir.join(FEEDBACK_FILE))
}

fn read_feedback(path: &Path) -> Result<Option<serde_json::Value>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let bytes = std::fs::read(path).map_err(|e| format!("검색 기록 읽기 실패: {e}"))?;
    // 파일이 깨졌으면 기록 없이 시작한다. 다음 저장에서 덮어쓴다.
    Ok(serde_json::from_slice(&bytes).ok())
}

fn write_feedback(path: &Path, data: &serde_json::Value) -> Result<(), String> {
    let bytes = serde_json::to_vec(data).map_err(|e| format!("검색 기록 직렬화 실패: {e}"))?;
    if bytes.len() > MAX_FEEDBACK_BYTES {
        return Err("검색 기록이 너무 큽니다.".to_string());
    }
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("앱 데이터 디렉터리 생성 실패: {e}"))?;
    }
    let temp = path.with_extension("json.tmp");
    std::fs::write(&temp, bytes).map_err(|e| format!("검색 기록 임시 저장 실패: {e}"))?;
    std::fs::rename(temp, path).map_err(|e| format!("검색 기록 교체 실패: {e}"))?;
    Ok(())
}

fn remove_feedback(path: &Path) -> Result<(), String> {
    match std::fs::remove_file(path) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => {
            Err(format!("검색 기록 삭제 실패: {e}"))
        }
        _ => Ok(()),
    }
}

#[tauri::command]
pub fn load_search_feedback(app: AppHandle) -> Result<Option<serde_json::Value>, String> {
    read_feedback(&feedback_path(&app)?)
}

#[tauri::command]
pub fn save_search_feedback(app: AppHandle, data: serde_json::Value) -> Result<(), String> {
    write_feedback(&feedback_path(&app)?, &data)
}

/// 기록을 지우고 모든 창에 알린다. 검색 창은 메모리에 든 기록도 비운다.
#[tauri::command]
pub fn reset_search_feedback(app: AppHandle) -> Result<(), String> {
    remove_feedback(&feedback_path(&app)?)?;
    let _ = app.emit(FEEDBACK_RESET_EVENT, ());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_path(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("nookive-feedback-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir.join(FEEDBACK_FILE)
    }

    #[test]
    fn saves_loads_and_removes() {
        let path = temp_path("roundtrip");
        assert_eq!(read_feedback(&path).unwrap(), None);

        let data = serde_json::json!({ "version": 1, "entries": [{ "query": "slack" }] });
        write_feedback(&path, &data).unwrap();
        assert_eq!(read_feedback(&path).unwrap(), Some(data));
        assert!(!path.with_extension("json.tmp").exists());

        remove_feedback(&path).unwrap();
        assert_eq!(read_feedback(&path).unwrap(), None);
        // 이미 없는 파일을 지워도 오류가 아니다.
        remove_feedback(&path).unwrap();
    }

    #[test]
    fn corrupt_file_starts_empty() {
        let path = temp_path("corrupt");
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, b"{not json").unwrap();
        assert_eq!(read_feedback(&path).unwrap(), None);
    }

    #[test]
    fn rejects_oversized_data() {
        let path = temp_path("oversized");
        let data = serde_json::json!({ "entries": "x".repeat(MAX_FEEDBACK_BYTES) });
        assert!(write_feedback(&path, &data).is_err());
        assert!(!path.exists());
    }
}
