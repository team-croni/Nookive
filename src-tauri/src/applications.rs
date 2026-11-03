// src-tauri/src/applications.rs
// macOS 설치 앱 검색 및 앱 아이콘 추출.
use base64::Engine;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::models::{ApplicationChunk, ApplicationFile, ApplicationSearchResult};

/// 설치된 macOS 앱은 앱 바이너리/리소스를 임베딩하지 않고 LaunchServices 검색에
/// 필요한 표시 이름과 Bundle ID만 색인한다. 앱 검색은 이름/ID에 대한 정확 검색이다.
///
/// `language`는 Nookive의 화면 언어다. 앱 이름도 같은 언어로 보여줘야 화면이 일관되므로
/// macOS 시스템 언어보다 우선한다. 넘기지 않으면 macOS 선호 언어를 쓴다.
fn applications(language: Option<String>) -> Vec<ApplicationSearchResult> {
    #[cfg(not(target_os = "macos"))]
    {
        let _ = language;
        return Vec::new();
    }

    #[cfg(target_os = "macos")]
    {
        let mut roots = vec![PathBuf::from("/System/Applications")];
        roots.extend(user_application_roots());

        let languages = match language.filter(|code| !code.is_empty()) {
            Some(code) => vec![code],
            None => preferred_languages(),
        };
        let mut apps = Vec::new();
        for root in roots {
            collect_applications(&root, &languages, &mut apps, 0);
        }
        apps.sort_by_key(|a| a.file.name.to_lowercase());
        apps.dedup_by(|a, b| a.file.path == b.file.path);
        // 시스템 설정 화면도 같은 목록에 담는다. (확장자 appex·prefPane으로 "설정" 묶음을 가른다)
        apps.extend(crate::settings_panes::list_settings_panes(&languages));
        apps
    }
}

/// 사용자가 앱을 설치·삭제하는 폴더. `/System/Applications`는 macOS 업데이트 때만 바뀌므로 감시하지 않는다.
pub(crate) fn user_application_roots() -> Vec<PathBuf> {
    let mut roots = vec![PathBuf::from("/Applications")];
    if let Ok(home) = std::env::var("HOME") {
        roots.push(PathBuf::from(home).join("Applications"));
    }
    roots
}

#[cfg(target_os = "macos")]
fn collect_applications(
    dir: &Path,
    languages: &[String],
    out: &mut Vec<ApplicationSearchResult>,
    depth: u8,
) {
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
            if let Some(result) = application_result(&path, languages) {
                out.push(result);
            }
            continue;
        }
        if !path
            .file_name()
            .and_then(|v| v.to_str())
            .is_some_and(|v| v.starts_with('.'))
        {
            collect_applications(&path, languages, out, depth + 1);
        }
    }
}

#[cfg(target_os = "macos")]
fn application_result(path: &Path, languages: &[String]) -> Option<ApplicationSearchResult> {
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

    let (display_name, alternate_names) =
        application_names(localized_display_name(path, languages), display_name);
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
            alternate_names,
            size_bytes: 0,
            // 표시 문구는 프론트엔드가 종류(kind)를 보고 번역해 보여준다.
            modified_at: String::new(),
        },
        similarity_score: 0.0,
        best_chunk: ApplicationChunk {
            chunk_index: 0,
            text_snippet: snippet,
        },
        category: "application",
    })
}

/// 사용자가 선호하는 언어 코드 목록 (예: ["ko-KR", "en"]). 앱 목록을 만들 때 한 번만 읽는다.
#[cfg(target_os = "macos")]
fn preferred_languages() -> Vec<String> {
    Command::new("defaults")
        .args(["read", "-g", "AppleLanguages"])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| parse_apple_languages(&String::from_utf8_lossy(&output.stdout)))
        .unwrap_or_default()
}

/// `defaults read -g AppleLanguages` 출력(`("ko-KR", en)`)에서 언어 코드를 꺼낸다.
#[cfg(any(target_os = "macos", test))]
fn parse_apple_languages(output: &str) -> Vec<String> {
    output
        .split([',', '\n', '(', ')'])
        .map(|value| value.trim().trim_matches('"').to_string())
        .filter(|value| !value.is_empty())
        .collect()
}

/// 한 언어 코드에 대해 앱 리소스에서 찾아볼 이름 후보 ("ko-KR" → ko-KR, ko_KR, ko).
#[cfg(any(target_os = "macos", test))]
pub(crate) fn language_candidates(language: &str) -> Vec<String> {
    let mut candidates = vec![language.to_string(), language.replace('-', "_")];
    // 중국어는 앱에 따라 zh_CN/zh_TW 대신 zh-Hans/zh-Hant 폴더를 쓴다.
    match language.replace('_', "-").to_ascii_lowercase().as_str() {
        "zh-cn" | "zh-sg" => candidates.push("zh-Hans".to_string()),
        "zh-tw" | "zh-hk" => candidates.push("zh-Hant".to_string()),
        _ => {}
    }
    if let Some(base) = language.split(['-', '_']).next() {
        candidates.push(base.to_string());
    }
    candidates.dedup();
    candidates
}

#[cfg(target_os = "macos")]
pub(crate) fn read_plist_json(path: &Path) -> Option<serde_json::Value> {
    let output = Command::new("plutil")
        .args(["-convert", "json", "-o", "-"])
        .arg(path)
        .output()
        .ok()?;
    output
        .status
        .success()
        .then(|| serde_json::from_slice(&output.stdout).ok())
        .flatten()
}

#[cfg(target_os = "macos")]
pub(crate) fn bundle_name_from(value: &serde_json::Value) -> Option<String> {
    value
        .get("CFBundleDisplayName")
        .or_else(|| value.get("CFBundleName"))
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(str::to_string)
}

/// 사용자 언어로 현지화된 앱 이름을 읽는다 (예: KakaoTalk.app → "카카오톡", Notes.app → "메모").
/// Info.plist의 CFBundleDisplayName은 현지화되지 않아 한국어 이름으로 검색할 수 없다.
/// 현지화 이름은 일반 앱은 `<언어>.lproj/InfoPlist.strings`, 시스템 앱은 `InfoPlist.loctable`에 있다.
#[cfg(target_os = "macos")]
fn localized_display_name(path: &Path, languages: &[String]) -> Option<String> {
    let resources = path.join("Contents/Resources");
    let loctable = resources.join("InfoPlist.loctable");
    let loctable = loctable
        .is_file()
        .then(|| read_plist_json(&loctable))
        .flatten();
    for language in languages {
        // 영어가 먼저 오면 Info.plist의 기본 이름을 그대로 쓴다.
        if language.starts_with("en") {
            return None;
        }
        for candidate in language_candidates(language) {
            let strings = resources.join(format!("{candidate}.lproj/InfoPlist.strings"));
            if strings.is_file()
                && let Some(name) = read_plist_json(&strings)
                    .as_ref()
                    .and_then(bundle_name_from)
            {
                return Some(name);
            }
            if let Some(name) = loctable
                .as_ref()
                .and_then(|table| table.get(&candidate))
                .and_then(bundle_name_from)
            {
                return Some(name);
            }
        }
    }
    None
}

/// 결과에 보여 줄 이름과 검색에 함께 쓸 다른 이름을 정한다.
/// 현지화 이름을 우선 표시하고, Info.plist 이름이 다르면 검색용 이름으로 남긴다.
#[cfg(any(target_os = "macos", test))]
fn application_names(localized_name: Option<String>, bundle_name: String) -> (String, Vec<String>) {
    match localized_name {
        Some(localized_name) if !localized_name.eq_ignore_ascii_case(&bundle_name) => {
            (localized_name, vec![bundle_name])
        }
        _ => (bundle_name, Vec::new()),
    }
}

/// 앱 검색 결과에 표시할 macOS 앱 아이콘을 충분한 해상도의 PNG data URL로 반환한다.
/// 앱 목록 자체에는 아이콘 바이너리를 넣지 않고, 실제 검색 결과에 표시되는
/// 앱에 대해서만 호출해 초기 인덱스 payload와 앱 스캔 비용을 작게 유지한다.
fn application_icon(path: String) -> Option<String> {
    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        return None;
    }

    #[cfg(target_os = "macos")]
    {
        let app_path = Path::new(&path);
        let extension = app_path.extension().and_then(|value| value.to_str());
        if !matches!(extension, Some("app" | "appex" | "prefPane")) {
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
            // 다른 회사의 설정 화면(.prefPane)은 설정 창에 보일 아이콘을 따로 적어 둔다.
            if let Some(icon_file) = value.get("NSPrefPaneIconFile").and_then(|v| v.as_str()) {
                candidates.insert(0, icon_file.to_string());
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

        // 시스템 설정 화면(appex)은 아이콘 파일 없이 macOS 내장 아이콘 종류(예: com.apple.graphic-icon.privacy)만 적어 둔다.
        let graphic_icon_type = (extension == Some("appex"))
            .then(|| read_plist_json(&plist))
            .flatten()
            .and_then(|info| {
                info.pointer("/CFBundleIcons/ISGraphicIconConfiguration/ISTypeIdentifier")
                    .and_then(|v| v.as_str())
                    .map(str::to_string)
            });
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
        let temporary_source = icon_path.is_none() || graphic_icon_type.is_some();
        let source_path = if let Some(icon_type) = graphic_icon_type {
            use objc2_app_kit::NSWorkspace;
            use objc2_foundation::NSString;

            // 내장 아이콘 종류로 받은 아이콘(시스템 설정의 색 아이콘)
            #[allow(deprecated)]
            let icon =
                NSWorkspace::sharedWorkspace().iconForFileType(&NSString::from_str(&icon_type));
            let tiff = icon.TIFFRepresentation()?.to_vec();
            let tiff_path = std::env::temp_dir().join(format!("nookive-app-icon-{cache_key}.tiff"));
            std::fs::write(&tiff_path, tiff).ok()?;
            tiff_path
        } else if let Some(icon_path) = icon_path {
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

// Tauri v2는 async가 아닌 커맨드를 메인 스레드에서 실행한다. 아래 커맨드는 plutil·sips를 실행하거나
// 폴더를 훑어 오래 걸리므로, 메인 스레드(화면)를 막지 않게 블로킹 작업 스레드에서 실행한다.
#[tauri::command]
pub async fn get_application_icon(path: String) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || application_icon(path))
        .await
        .ok()
        .flatten()
}

#[tauri::command]
pub async fn list_applications(language: Option<String>) -> Vec<ApplicationSearchResult> {
    tauri::async_runtime::spawn_blocking(move || applications(language))
        .await
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::{application_names, language_candidates, parse_apple_languages};

    #[test]
    fn keeps_info_plist_name_as_alternate_when_localized_name_differs() {
        assert_eq!(
            application_names(Some("카카오톡".into()), "KakaoTalk".into()),
            ("카카오톡".to_string(), vec!["KakaoTalk".to_string()])
        );
    }

    #[test]
    fn uses_info_plist_name_when_localized_name_is_missing_or_same() {
        assert_eq!(
            application_names(None, "Safari".into()),
            ("Safari".to_string(), Vec::new())
        );
        assert_eq!(
            application_names(Some("safari".into()), "Safari".into()),
            ("Safari".to_string(), Vec::new())
        );
    }

    #[test]
    fn parses_preferred_languages() {
        assert_eq!(
            parse_apple_languages("(\n    \"ko-KR\",\n    en\n)\n"),
            vec!["ko-KR".to_string(), "en".to_string()]
        );
        assert_eq!(language_candidates("ko-KR"), vec!["ko-KR", "ko_KR", "ko"]);
        assert_eq!(language_candidates("ko"), vec!["ko"]);
        assert_eq!(
            language_candidates("zh-TW"),
            vec!["zh-TW", "zh_TW", "zh-Hant", "zh"]
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn reads_localized_names_from_system_apps() {
        let notes = std::path::Path::new("/System/Applications/Notes.app");
        let korean = super::localized_display_name(notes, &["ko-KR".to_string()]);
        assert_eq!(korean.as_deref(), Some("메모"));
        assert_eq!(
            super::localized_display_name(notes, &["en".to_string()]),
            None
        );
    }
}
