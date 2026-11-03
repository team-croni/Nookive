// src-tauri/src/settings_panes.rs
// 시스템 설정 화면(예: "개인정보 보호 및 보안", "블루투스")을 앱처럼 검색하고 바로 연다.
// - macOS 13+의 설정 화면은 /System/Library/ExtensionKit/Extensions/ 안의 설정 확장(.appex)이다.
//   목록·이름·아이콘을 모두 여기서 읽으므로 화면 목록을 직접 적지 않는다.
// - 다른 회사의 설정 화면(.prefPane)은 /Library/PreferencePanes, ~/Library/PreferencePanes에서 찾는다.
// - 여는 주소는 위 폴더에서 읽은 번들 ID로만 만든다. (x-apple.systempreferences:<번들 ID>)
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::models::{ApplicationChunk, ApplicationFile, ApplicationSearchResult};

const EXTENSIONS_DIR: &str = "/System/Library/ExtensionKit/Extensions";
const SETTINGS_EXTENSION_POINT: &str = "com.apple.Settings.extension.ui";

fn preference_pane_roots() -> Vec<PathBuf> {
    let mut roots = vec![PathBuf::from("/Library/PreferencePanes")];
    if let Ok(home) = std::env::var("HOME") {
        roots.push(PathBuf::from(home).join("Library/PreferencePanes"));
    }
    roots
}

/// 번들 ID로 쓸 수 있는 글자만 받는다. (여는 주소에 다른 것이 섞이지 않게)
fn is_bundle_id(id: &str) -> bool {
    (3..=200).contains(&id.len())
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
}

/// 시스템 설정 화면을 여는 주소
fn settings_url(bundle_id: &str) -> Option<String> {
    is_bundle_id(bundle_id).then(|| format!("x-apple.systempreferences:{bundle_id}"))
}

/// 결과 하나를 만든다. 앱과 같은 모양으로 두고 확장자(appex, prefPane)로 "설정" 묶음을 가른다.
fn pane_result(
    path: &Path,
    extension: &'static str,
    name: String,
    alternate_names: Vec<String>,
    bundle_id: Option<String>,
) -> ApplicationSearchResult {
    let path_string = path.to_string_lossy().to_string();
    ApplicationSearchResult {
        id: format!("settings:{path_string}"),
        file: ApplicationFile {
            path: path_string,
            name: name.clone(),
            extension,
            kind: "application",
            bundle_id,
            alternate_names,
            size_bytes: 0,
            modified_at: String::new(),
        },
        similarity_score: 0.0,
        best_chunk: ApplicationChunk {
            chunk_index: 0,
            text_snippet: format!("macOS System Settings: {name}"),
        },
        category: "application",
    }
}

/// 사람이 읽는 이름이 아닌 내부 이름("HeadphoneSettingsExtension", "CoverageSettingPane_macOS")
fn is_internal_name(name: &str) -> bool {
    name.contains('_')
        || [
            "Extension",
            "Settings",
            "SettingsExt",
            "Ext",
            "Pane",
            "Preferences",
        ]
        .iter()
        .any(|suffix| name.ends_with(suffix) && name.len() > suffix.len() && !name.contains(' '))
}

/// 표시 이름과 검색용 다른 이름. 현지화 이름을 보이고, 영어 이름·번들 이름이 다르면 검색용으로 남긴다.
/// (한국어 화면에서도 "privacy", "bluetooth"로 찾을 수 있게)
fn pane_names(
    localized: Option<String>,
    english: Option<String>,
    bundle_name: String,
) -> (String, Vec<String>) {
    let display = localized
        .or_else(|| english.clone())
        .unwrap_or_else(|| bundle_name.clone());
    let mut alternates: Vec<String> = Vec::new();
    // 내부 번들 이름("AccessibilitySettingsExtension")은 "extension", "settings" 같은 검색어에 잘못 걸리므로 빼고,
    // "Wi-Fi"처럼 사람이 읽는 번들 이름만 남긴다.
    let bundle_name = (!is_internal_name(&bundle_name)).then_some(bundle_name);
    for name in [english, bundle_name].into_iter().flatten() {
        if !name.eq_ignore_ascii_case(&display)
            && !alternates
                .iter()
                .any(|other| other.eq_ignore_ascii_case(&name))
        {
            alternates.push(name);
        }
    }
    (display, alternates)
}

#[cfg(target_os = "macos")]
mod platform {
    use super::*;
    use crate::applications::{bundle_name_from, language_candidates, read_plist_json};

    /// 설정 확장의 이름: InfoPlist.loctable(시스템 확장) 또는 <언어>.lproj/InfoPlist.strings
    fn localized_name(path: &Path, language: &str) -> Option<String> {
        let resources = path.join("Contents/Resources");
        let loctable = resources.join("InfoPlist.loctable");
        let table = loctable
            .is_file()
            .then(|| read_plist_json(&loctable))
            .flatten();
        for candidate in language_candidates(language) {
            if let Some(name) = table
                .as_ref()
                .and_then(|t| t.get(&candidate))
                .and_then(bundle_name_from)
            {
                return Some(name);
            }
            let strings = resources.join(format!("{candidate}.lproj/InfoPlist.strings"));
            if strings.is_file()
                && let Some(name) = read_plist_json(&strings)
                    .as_ref()
                    .and_then(bundle_name_from)
            {
                return Some(name);
            }
        }
        None
    }

    fn first_localized_name(path: &Path, languages: &[String]) -> Option<String> {
        languages
            .iter()
            .find_map(|language| localized_name(path, language))
    }

    fn settings_extension(path: &Path, languages: &[String]) -> Option<ApplicationSearchResult> {
        let info = read_plist_json(&path.join("Contents/Info.plist"))?;
        let point = info
            .get("EXAppExtensionAttributes")
            .and_then(|v| v.get("EXExtensionPointIdentifier"))
            .and_then(|v| v.as_str());
        if point != Some(SETTINGS_EXTENSION_POINT) {
            return None;
        }
        let bundle_id = info.get("CFBundleIdentifier")?.as_str()?.to_string();
        if !is_bundle_id(&bundle_id) {
            return None;
        }
        let bundle_name = bundle_name_from(&info).unwrap_or_else(|| {
            path.file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default()
        });
        let (name, alternates) = pane_names(
            first_localized_name(path, languages),
            localized_name(path, "en"),
            bundle_name,
        );
        // 이름이 없는 확장은 시스템 설정 목록에 보이지 않는 내부용이다. ("HeadphoneSettingsExtension")
        if is_internal_name(&name) {
            return None;
        }
        Some(pane_result(
            path,
            "appex",
            name,
            alternates,
            Some(bundle_id),
        ))
    }

    fn preference_pane(path: &Path, languages: &[String]) -> Option<ApplicationSearchResult> {
        let info = read_plist_json(&path.join("Contents/Info.plist"))?;
        let bundle_name = info
            .get("NSPrefPaneIconLabel")
            .and_then(|v| v.as_str())
            .map(|label| label.replace('\n', " ").trim().to_string())
            .filter(|label| !label.is_empty())
            .or_else(|| bundle_name_from(&info))
            .or_else(|| path.file_stem().map(|s| s.to_string_lossy().to_string()))?;
        let bundle_id = info
            .get("CFBundleIdentifier")
            .and_then(|v| v.as_str())
            .map(str::to_string);
        let (name, alternates) =
            pane_names(first_localized_name(path, languages), None, bundle_name);
        Some(pane_result(path, "prefPane", name, alternates, bundle_id))
    }

    pub fn list(languages: &[String]) -> Vec<ApplicationSearchResult> {
        let mut panes = Vec::new();
        if let Ok(entries) = std::fs::read_dir(EXTENSIONS_DIR) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|v| v.to_str()) == Some("appex")
                    && let Some(pane) = settings_extension(&path, languages)
                {
                    panes.push(pane);
                }
            }
        }
        for root in preference_pane_roots() {
            let Ok(entries) = std::fs::read_dir(&root) else {
                continue;
            };
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|v| v.to_str()) == Some("prefPane")
                    && let Some(pane) = preference_pane(&path, languages)
                {
                    panes.push(pane);
                }
            }
        }
        panes
    }

    /// 설정 화면을 연다. 위 폴더 안의 설정 화면만 받는다.
    pub fn open(path: &Path) -> Result<(), String> {
        let canonical = path
            .canonicalize()
            .map_err(|e| format!("설정 화면을 찾지 못했습니다: {e}"))?;
        let extension = canonical
            .extension()
            .and_then(|v| v.to_str())
            .unwrap_or_default();
        let parent = canonical
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_default();
        if extension == "appex" && parent == Path::new(EXTENSIONS_DIR) {
            let id = read_plist_json(&canonical.join("Contents/Info.plist")).and_then(|info| {
                info.get("CFBundleIdentifier")
                    .and_then(|v| v.as_str())
                    .map(str::to_string)
            });
            // 열지 못하면 시스템 설정 첫 화면이라도 연다.
            let url = id
                .as_deref()
                .and_then(settings_url)
                .unwrap_or_else(|| "x-apple.systempreferences:".to_string());
            let status = Command::new("open")
                .arg(&url)
                .status()
                .map_err(|e| e.to_string())?;
            if !status.success() {
                Command::new("open")
                    .arg("x-apple.systempreferences:")
                    .status()
                    .map_err(|e| e.to_string())?;
            }
            return Ok(());
        }
        let in_pane_root = preference_pane_roots().iter().any(|root| {
            root.canonicalize()
                .map(|root| parent == root)
                .unwrap_or(false)
        });
        if extension == "prefPane" && in_pane_root {
            Command::new("open")
                .arg(&canonical)
                .spawn()
                .map_err(|e| e.to_string())?;
            return Ok(());
        }
        Err("설정 화면이 아닙니다".to_string())
    }
}

/// 설정 화면 목록. 앱 목록(list_applications)에 함께 담아 보낸다.
pub fn list_settings_panes(languages: &[String]) -> Vec<ApplicationSearchResult> {
    #[cfg(target_os = "macos")]
    {
        platform::list(languages)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = languages;
        Vec::new()
    }
}

#[tauri::command]
pub fn open_settings_pane(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        platform::open(Path::new(&path))
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        Err("macOS에서만 열 수 있습니다".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_settings_urls_from_bundle_ids_only() {
        assert_eq!(
            settings_url("com.apple.settings.PrivacySecurity.extension").as_deref(),
            Some("x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension")
        );
        assert_eq!(settings_url("com.apple.x;open -a Terminal"), None);
        assert_eq!(settings_url(""), None);
    }

    #[test]
    fn keeps_english_and_bundle_names_as_alternates() {
        assert_eq!(
            pane_names(
                Some("개인정보 보호 및 보안".into()),
                Some("Privacy & Security".into()),
                "Privacy".into()
            ),
            (
                "개인정보 보호 및 보안".to_string(),
                vec!["Privacy & Security".to_string(), "Privacy".to_string()]
            )
        );
        assert_eq!(
            pane_names(None, Some("Bluetooth".into()), "Bluetooth".into()),
            ("Bluetooth".to_string(), Vec::new())
        );
        assert_eq!(
            pane_names(
                Some("손쉬운 사용".into()),
                Some("Accessibility".into()),
                "AccessibilitySettingsExtension".into()
            ),
            ("손쉬운 사용".to_string(), vec!["Accessibility".to_string()])
        );
    }

    #[test]
    fn recognizes_internal_names() {
        assert!(is_internal_name("HeadphoneSettingsExtension"));
        assert!(is_internal_name("CoverageSettingPane_macOS"));
        assert!(is_internal_name("PowerPreferences"));
        assert!(!is_internal_name("Wi-Fi"));
        assert!(!is_internal_name("Privacy"));
        assert!(!is_internal_name("Game Center"));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn lists_system_settings_panes() {
        let panes = list_settings_panes(&["ko-KR".to_string()]);
        let privacy = panes.iter().find(|pane| {
            pane.file.bundle_id.as_deref() == Some("com.apple.settings.PrivacySecurity.extension")
        });
        let Some(privacy) = privacy else {
            // macOS 13 미만이나 설정 확장이 없는 환경
            return;
        };
        assert_eq!(privacy.file.name, "개인정보 보호 및 보안");
        assert!(
            privacy
                .file
                .alternate_names
                .iter()
                .any(|name| name.starts_with("Privacy"))
        );
        assert_eq!(privacy.file.extension, "appex");
    }
}
