// src-tauri/src/web.rs
// 로컬 검색 결과가 없을 때 사용하는 웹 검색 보조 커맨드.
// - google_suggest: Google 자동완성 제안을 가져온다 (CORS 우회를 위해 Rust에서 요청).
// - open_url: 기본 브라우저로 http(s) URL을 연다.
use std::process::Command;

/// URL 쿼리 컴포넌트용 퍼센트 인코딩 (외부 crate 의존성 없이 처리)
fn encode_component(input: &str) -> String {
    let mut out = String::with_capacity(input.len() * 3);
    for byte in input.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*byte as char)
            }
            b' ' => out.push('+'),
            _ => out.push_str(&format!("%{:02X}", byte)),
        }
    }
    out
}

/// Google 자동완성 제안 조회.
/// 웹뷰의 fetch는 suggestqueries.google.com의 CORS 헤더가 없어 실패하므로
/// 네이티브 curl로 요청한 뒤 JSON만 파싱해 프론트엔드로 돌려준다.
#[tauri::command]
pub async fn google_suggest(query: String) -> Result<Vec<String>, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }

    let url = format!(
        "https://suggestqueries.google.com/complete/search?client=firefox&hl=ko&q={}",
        encode_component(trimmed)
    );

    let output = tauri::async_runtime::spawn_blocking(move || {
        Command::new("curl")
            .args([
                "-sS",
                "--max-time",
                "3",
                "--compressed",
                "-A",
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
                &url,
            ])
            .output()
    })
    .await
    .map_err(|e| format!("자동완성 요청 스레드 실패: {}", e))?
    .map_err(|e| format!("자동완성 요청 실패: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "자동완성 요청 실패 (status {}): {}",
            output.status,
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }

    let json: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("자동완성 응답 파싱 실패: {}", e))?;

    let suggestions = json
        .get(1)
        .and_then(|value| value.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str())
                .map(|item| item.trim().to_string())
                .filter(|item| !item.is_empty())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    Ok(suggestions)
}

/// 기본 브라우저로 URL 열기. http/https만 허용한다.
#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("http(s) URL만 열 수 있습니다".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("브라우저 열기 실패: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", &url])
            .spawn()
            .map_err(|e| format!("브라우저 열기 실패: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("브라우저 열기 실패: {}", e))?;
    }

    Ok(())
}
