// src-tauri/src/files.rs
// 로컬 파일 읽기/열기/탐색기 표시 커맨드.
use std::process::Command;

use crate::paths::resolve_home;

/// PDF 등 미리보기용: 로컬 파일을 raw 바이트로 읽어 IPC로 반환
#[tauri::command]
pub fn read_file_bytes(path: String) -> Result<tauri::ipc::Response, String> {
    let resolved_path = resolve_home(&path);
    let bytes = std::fs::read(&resolved_path)
        .map_err(|e| format!("파일 읽기 실패 ({}): {}", resolved_path, e))?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
pub fn open_file(path: String) -> Result<(), String> {
    let resolved_path = resolve_home(&path);

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&resolved_path)
            .spawn()
            .map_err(|e| format!("파일 열기 실패: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", &resolved_path])
            .spawn()
            .map_err(|e| format!("파일 열기 실패: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub fn reveal_file(path: String) -> Result<(), String> {
    let resolved_path = resolve_home(&path);

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-R", &resolved_path])
            .spawn()
            .map_err(|e| format!("Finder에서 파일 표시 실패: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .args(["/select,", &resolved_path])
            .spawn()
            .map_err(|e| format!("탐색기에서 파일 표시 실패: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        let parent = std::path::Path::new(&resolved_path)
            .parent()
            .ok_or_else(|| "파일의 상위 폴더를 찾을 수 없습니다".to_string())?;
        Command::new("xdg-open")
            .arg(parent)
            .spawn()
            .map_err(|e| format!("파일 관리자에서 파일 표시 실패: {}", e))?;
    }

    Ok(())
}
