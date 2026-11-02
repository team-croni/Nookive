// src-tauri/src/web.rs
// 웹 검색 보조 커맨드. (로컬 결과가 없을 때의 웹 폴백과 웹 검색 모드)
// - web_suggest: 고른 검색 엔진의 자동완성 제안을 가져온다 (CORS 우회를 위해 Rust에서 요청).
//   요청 주소는 아래 목록의 엔진으로만 만든다.
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

/// URL에 넣을 수 있는 언어 코드만 받는다 (예: "en", "zh-TW", "pt-BR"). 그 밖에는 영어를 쓴다.
fn suggest_language(language: Option<&str>) -> &str {
    match language {
        Some(code)
            if (2..=10).contains(&code.len())
                && code.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') =>
        {
            code
        }
        _ => "en",
    }
}

/// 자동완성 응답 형식
#[derive(Debug, PartialEq)]
enum SuggestFormat {
    /// OpenSearch: `["검색어", ["제안1", "제안2", …]]` (Google, Bing, DuckDuckGo, Brave, Ecosia, Baidu)
    OpenSearch,
    /// Naver: `{"items": [[["제안1"], ["제안2"], …]]}`
    Naver,
}

/// 엔진 id로 자동완성 요청 주소와 응답 형식을 만든다. 모르는 엔진이면 None.
fn suggest_request(engine: &str, query: &str, language: &str) -> Option<(String, SuggestFormat)> {
    let q = encode_component(query);
    let url = match engine {
        // 앱 언어를 hl로 넘겨 그 언어권 기준으로 제안을 받는다. (한국어로 입력하면 hl과 관계없이 한국어 제안이 온다)
        "google" => format!(
            "https://suggestqueries.google.com/complete/search?client=firefox&hl={language}&q={q}"
        ),
        "bing" => format!("https://api.bing.com/osjson.aspx?query={q}"),
        "duckduckgo" => format!("https://duckduckgo.com/ac/?q={q}&type=list"),
        "brave" => format!("https://search.brave.com/api/suggest?q={q}"),
        "ecosia" => format!("https://ac.ecosia.org/autocomplete?q={q}&type=list"),
        // ie=utf-8이 없으면 GBK로 해석해 한자 검색어가 깨진다.
        "baidu" => format!("https://suggestion.baidu.com/su?wd={q}&action=opensearch&ie=utf-8"),
        "naver" => {
            return Some((
                format!(
                    "https://ac.search.naver.com/nx/ac?q={q}&st=100&r_format=json&q_enc=UTF-8&r_enc=UTF-8"
                ),
                SuggestFormat::Naver,
            ));
        }
        _ => return None,
    };
    Some((url, SuggestFormat::OpenSearch))
}

fn parse_suggestions(json: &serde_json::Value, format: &SuggestFormat) -> Vec<String> {
    let items = match format {
        SuggestFormat::OpenSearch => json.get(1).and_then(|value| value.as_array()),
        SuggestFormat::Naver => json
            .get("items")
            .and_then(|items| items.get(0))
            .and_then(|value| value.as_array()),
    };
    items
        .map(|items| {
            items
                .iter()
                .filter_map(|item| match format {
                    SuggestFormat::OpenSearch => item.as_str(),
                    SuggestFormat::Naver => item.get(0).and_then(|word| word.as_str()),
                })
                .map(|item| item.trim().to_string())
                .filter(|item| !item.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

/// 검색 엔진 자동완성 제안 조회.
/// 웹뷰의 fetch는 자동완성 서버의 CORS 헤더가 없어 실패하므로
/// 네이티브 curl로 요청한 뒤 JSON만 파싱해 프론트엔드로 돌려준다.
#[tauri::command]
pub async fn web_suggest(
    engine: String,
    query: String,
    language: Option<String>,
) -> Result<Vec<String>, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }
    let (url, format) = suggest_request(&engine, trimmed, suggest_language(language.as_deref()))
        .ok_or_else(|| format!("지원하지 않는 검색 엔진: {engine}"))?;

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
    Ok(parse_suggestions(&json, &format))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_suggest_urls_only_for_known_engines() {
        let (url, format) = suggest_request("google", "a b&c", "ko").unwrap();
        assert_eq!(
            url,
            "https://suggestqueries.google.com/complete/search?client=firefox&hl=ko&q=a+b%26c"
        );
        assert_eq!(format, SuggestFormat::OpenSearch);
        assert!(
            suggest_request("duckduckgo", "x", "en")
                .unwrap()
                .0
                .starts_with("https://duckduckgo.com/ac/")
        );
        assert_eq!(
            suggest_request("naver", "날씨", "ko").unwrap().1,
            SuggestFormat::Naver
        );
        assert!(
            suggest_request("baidu", "天气", "zh-CN")
                .unwrap()
                .0
                .contains("ie=utf-8")
        );
        assert_eq!(
            suggest_request("ecosia", "x", "de").unwrap().1,
            SuggestFormat::OpenSearch
        );
        assert!(suggest_request("https://evil.example", "x", "en").is_none());
    }

    #[test]
    fn parses_opensearch_and_naver_responses() {
        let open: serde_json::Value =
            serde_json::from_str(r#"["we",["weather"," weather radar ",""]]"#).unwrap();
        assert_eq!(
            parse_suggestions(&open, &SuggestFormat::OpenSearch),
            vec!["weather", "weather radar"]
        );
        let naver: serde_json::Value =
            serde_json::from_str(r#"{"query":["날씨"],"items":[[["날씨"],["오늘날씨"]]]}"#)
                .unwrap();
        assert_eq!(
            parse_suggestions(&naver, &SuggestFormat::Naver),
            vec!["날씨", "오늘날씨"]
        );
        let broken: serde_json::Value = serde_json::from_str("{}").unwrap();
        assert!(parse_suggestions(&broken, &SuggestFormat::OpenSearch).is_empty());
    }

    #[test]
    fn accepts_locale_codes_and_falls_back_to_english() {
        assert_eq!(suggest_language(Some("ko")), "ko");
        assert_eq!(suggest_language(Some("zh-TW")), "zh-TW");
        assert_eq!(suggest_language(None), "en");
        assert_eq!(suggest_language(Some("en&q=x")), "en");
        assert_eq!(suggest_language(Some("")), "en");
    }
}
