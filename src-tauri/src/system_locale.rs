// src-tauri/src/system_locale.rs
// macOS 시스템 설정 > 일반 > 언어 및 지역의 값. 웹뷰의 navigator.language는 "선호 언어" 목록이라
// 사는 지역, 온도 단위, 측정 단위, 24시간 표시를 알 수 없으므로 전역 설정에서 직접 읽는다.
// 사용자가 따로 고르지 않은 값은 키가 없으므로 None으로 돌려주고, 기본값은 프론트엔드가 지역으로 정한다.
use serde::Serialize;

#[derive(Debug, Default, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemLocale {
    /// 지역 코드 (AppleLocale "ko_KR" → "KR")
    region: Option<String>,
    /// 온도 단위 (AppleTemperatureUnit): "celsius" | "fahrenheit"
    temperature_unit: Option<&'static str>,
    /// 미터법 사용 (AppleMetricUnits)
    metric: Option<bool>,
    /// 24시간 표시 (AppleICUForce24HourTime / AppleICUForce12HourTime)
    uses_24_hour: Option<bool>,
}

fn region_of(locale: &str) -> Option<String> {
    // "ko_KR", "en_US@rg=gbzzzz", "zh-Hant_TW" 같은 값에서 지역 코드만 꺼낸다.
    // rg(지역 덮어쓰기)가 있으면 그것을 쓴다. ("gbzzzz" → "GB")
    if let Some(index) = locale.find("rg=") {
        let code: String = locale[index + 3..].chars().take(2).collect();
        if code.len() == 2 && code.chars().all(|c| c.is_ascii_alphabetic()) {
            return Some(code.to_ascii_uppercase());
        }
    }
    let base = locale.split('@').next().unwrap_or(locale);
    base.rsplit(['_', '-'])
        .next()
        .filter(|code| code.len() == 2 && code.chars().all(|c| c.is_ascii_alphabetic()))
        .filter(|code| *code != base)
        .map(|code| code.to_ascii_uppercase())
}

fn parse_temperature_unit(value: &str) -> Option<&'static str> {
    match value.trim() {
        "Celsius" => Some("celsius"),
        "Fahrenheit" => Some("fahrenheit"),
        _ => None,
    }
}

fn parse_flag(value: &str) -> Option<bool> {
    match value.trim() {
        "1" | "true" | "YES" => Some(true),
        "0" | "false" | "NO" => Some(false),
        _ => None,
    }
}

#[cfg(target_os = "macos")]
fn read_global(key: &str) -> Option<String> {
    let output = std::process::Command::new("defaults")
        .args(["read", "-g", key])
        .output()
        .ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).trim().to_string())
        .filter(|value| !value.is_empty())
}

#[cfg(not(target_os = "macos"))]
fn read_global(_key: &str) -> Option<String> {
    None
}

/// macOS 선호 언어 목록(AppleLanguages)의 첫 언어. 예: "ko-KR". 읽지 못하면 "en".
/// 프론트엔드가 앱 언어를 알려 주기 전의 트레이 메뉴 언어로 쓴다. (tray_labels가 언어 코드 앞부분으로 고른다)
pub fn preferred_language() -> String {
    read_global("AppleLanguages")
        .and_then(|value| first_language(&value))
        .unwrap_or_else(|| "en".to_string())
}

/// `defaults read`의 배열 출력 `(\n    "ko-KR",\n    en\n)`에서 첫 항목을 꺼낸다.
fn first_language(value: &str) -> Option<String> {
    value
        .trim()
        .trim_start_matches('(')
        .split(',')
        .next()
        .map(|item| {
            item.trim()
                .trim_matches(|c| c == '"' || c == ')')
                .trim()
                .to_string()
        })
        .filter(|item| !item.is_empty())
}

#[tauri::command]
pub async fn get_system_locale() -> SystemLocale {
    tauri::async_runtime::spawn_blocking(|| {
        let force_24 = read_global("AppleICUForce24HourTime").and_then(|v| parse_flag(&v));
        let force_12 = read_global("AppleICUForce12HourTime").and_then(|v| parse_flag(&v));
        SystemLocale {
            region: read_global("AppleLocale").and_then(|v| region_of(&v)),
            temperature_unit: read_global("AppleTemperatureUnit")
                .and_then(|v| parse_temperature_unit(&v)),
            metric: read_global("AppleMetricUnits").and_then(|v| parse_flag(&v)),
            uses_24_hour: match (force_24, force_12) {
                (Some(true), _) => Some(true),
                (_, Some(true)) => Some(false),
                _ => None,
            },
        }
    })
    .await
    .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_region_codes() {
        assert_eq!(region_of("ko_KR").as_deref(), Some("KR"));
        assert_eq!(region_of("en_US@rg=gbzzzz").as_deref(), Some("GB"));
        assert_eq!(region_of("zh-Hant_TW").as_deref(), Some("TW"));
        assert_eq!(region_of("en").as_deref(), None);
    }

    #[test]
    fn reads_first_preferred_language() {
        assert_eq!(
            first_language("(\n    \"ko-KR\",\n    en\n)").as_deref(),
            Some("ko-KR")
        );
        assert_eq!(first_language("(\n    en\n)").as_deref(), Some("en"));
        assert_eq!(first_language("()"), None);
    }

    #[test]
    fn reads_units_and_flags() {
        assert_eq!(parse_temperature_unit("Fahrenheit"), Some("fahrenheit"));
        assert_eq!(parse_temperature_unit("Kelvin"), None);
        assert_eq!(parse_flag("1"), Some(true));
        assert_eq!(parse_flag("0"), Some(false));
        assert_eq!(parse_flag("x"), None);
    }
}
