// src-tauri/src/editors.rs
// 코드 검색 결과를 에디터에서 해당 줄로 연다. 설치된 에디터는 번들 ID로 찾는다.
// Finder에서 실행한 앱은 셸 PATH를 물려받지 않으므로 `code` 같은 명령어에 기대지 않고,
// 앱 번들 안의 실행 파일을 쓴다. 명령은 셸 없이 인자로만 넘긴다.
// VS Code 계열의 URL 스킴(vscode://file/...)은 열 때마다 확인 창을 띄우므로 쓰지 않는다.
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::AppHandle;

use crate::index::file_class::{FileClass, classify_extension, extension_of};
use crate::index::load_manifest;

#[derive(Debug, Clone, Copy, PartialEq)]
enum Launch {
    /// 번들 안의 CLI에 `-g <경로>:<줄>`을 넘긴다. (VS Code 계열) 앱 이름이 바뀌며 CLI 이름도 바뀐 경우가 있어
    /// 후보 중 처음 있는 파일을 쓴다.
    Goto(&'static [&'static str]),
    /// 번들 안의 CLI에 `<경로>:<줄>`을 넘긴다. (Zed, Sublime Text)
    PathColonLine(&'static str),
    /// 번들 안의 실행 파일에 `--line <줄> <경로>`를 넘긴다. (JetBrains)
    LineFlag(&'static str),
    /// `/usr/bin/xed --line <줄> <경로>` (Xcode)
    Xed,
}

struct EditorDefinition {
    id: &'static str,
    name: &'static str,
    bundle_ids: &'static [&'static str],
    launch: Launch,
}

/// 자동 선택은 이 순서로 처음 찾은 에디터를 쓴다.
const EDITORS: &[EditorDefinition] = &[
    EditorDefinition {
        id: "vscode",
        name: "VS Code",
        bundle_ids: &["com.microsoft.VSCode"],
        launch: Launch::Goto(&["Contents/Resources/app/bin/code"]),
    },
    EditorDefinition {
        id: "cursor",
        name: "Cursor",
        bundle_ids: &["com.todesktop.230313mzl4w4u92"],
        launch: Launch::Goto(&["Contents/Resources/app/bin/cursor"]),
    },
    EditorDefinition {
        id: "windsurf",
        name: "Windsurf",
        bundle_ids: &["com.exafunction.windsurf"],
        launch: Launch::Goto(&[
            "Contents/Resources/app/bin/windsurf",
            // Windsurf가 Devin으로 이름을 바꾼 뒤의 CLI
            "Contents/Resources/app/bin/devin-desktop",
        ]),
    },
    EditorDefinition {
        id: "zed",
        name: "Zed",
        bundle_ids: &["dev.zed.Zed"],
        launch: Launch::PathColonLine("Contents/MacOS/cli"),
    },
    EditorDefinition {
        id: "sublime",
        name: "Sublime Text",
        bundle_ids: &["com.sublimetext.4", "com.sublimetext.3"],
        launch: Launch::PathColonLine("Contents/SharedSupport/bin/subl"),
    },
    EditorDefinition {
        id: "intellij",
        name: "IntelliJ IDEA",
        bundle_ids: &["com.jetbrains.intellij", "com.jetbrains.intellij.ce"],
        launch: Launch::LineFlag("Contents/MacOS/idea"),
    },
    EditorDefinition {
        id: "webstorm",
        name: "WebStorm",
        bundle_ids: &["com.jetbrains.WebStorm"],
        launch: Launch::LineFlag("Contents/MacOS/webstorm"),
    },
    EditorDefinition {
        id: "pycharm",
        name: "PyCharm",
        bundle_ids: &["com.jetbrains.pycharm", "com.jetbrains.pycharm.ce"],
        launch: Launch::LineFlag("Contents/MacOS/pycharm"),
    },
    EditorDefinition {
        id: "goland",
        name: "GoLand",
        bundle_ids: &["com.jetbrains.goland"],
        launch: Launch::LineFlag("Contents/MacOS/goland"),
    },
    EditorDefinition {
        id: "rustrover",
        name: "RustRover",
        bundle_ids: &["com.jetbrains.rustrover"],
        launch: Launch::LineFlag("Contents/MacOS/rustrover"),
    },
    EditorDefinition {
        id: "phpstorm",
        name: "PhpStorm",
        bundle_ids: &["com.jetbrains.PhpStorm"],
        launch: Launch::LineFlag("Contents/MacOS/phpstorm"),
    },
    EditorDefinition {
        id: "clion",
        name: "CLion",
        bundle_ids: &["com.jetbrains.CLion"],
        launch: Launch::LineFlag("Contents/MacOS/clion"),
    },
    EditorDefinition {
        id: "rider",
        name: "Rider",
        bundle_ids: &["com.jetbrains.rider"],
        launch: Launch::LineFlag("Contents/MacOS/rider"),
    },
    EditorDefinition {
        id: "android-studio",
        name: "Android Studio",
        bundle_ids: &["com.google.android.studio"],
        launch: Launch::LineFlag("Contents/MacOS/studio"),
    },
    EditorDefinition {
        id: "xcode",
        name: "Xcode",
        bundle_ids: &["com.apple.dt.Xcode"],
        launch: Launch::Xed,
    },
];

pub(crate) const AUTO_EDITOR: &str = "auto";
pub(crate) const DEFAULT_APP: &str = "default";

#[derive(Debug, Clone, Serialize)]
pub struct EditorInfo {
    id: &'static str,
    /// Finder에 보이는 앱 이름. 앱 이름이 바뀌어도(예: Windsurf → Devin) 실제 이름을 보여준다.
    name: String,
}

#[derive(Debug, PartialEq)]
struct LaunchCommand {
    program: PathBuf,
    args: Vec<String>,
}

#[cfg(target_os = "macos")]
fn application_path(bundle_id: &str) -> Option<PathBuf> {
    use objc2_app_kit::NSWorkspace;
    use objc2_foundation::NSString;

    let url = NSWorkspace::sharedWorkspace()
        .URLForApplicationWithBundleIdentifier(&NSString::from_str(bundle_id))?;
    let path = PathBuf::from(url.path()?.to_string());
    path.is_dir().then_some(path)
}

#[cfg(not(target_os = "macos"))]
fn application_path(_bundle_id: &str) -> Option<PathBuf> {
    None
}

/// 설치된 에디터와 앱 경로. 번들 안 실행 파일이 필요한 에디터는 그 파일이 있어야 한다.
fn detect_editors() -> Vec<(&'static EditorDefinition, PathBuf)> {
    EDITORS
        .iter()
        .filter_map(|editor| {
            let app = editor
                .bundle_ids
                .iter()
                .find_map(|id| application_path(id))?;
            let usable = match editor.launch {
                Launch::PathColonLine(binary) | Launch::LineFlag(binary) => {
                    app.join(binary).is_file()
                }
                Launch::Goto(candidates) => {
                    candidates.iter().any(|binary| app.join(binary).is_file())
                }
                Launch::Xed => Path::new("/usr/bin/xed").is_file(),
            };
            usable.then_some((editor, app))
        })
        .collect()
}

fn build_command(launch: Launch, app: &Path, file: &str, line: Option<u32>) -> LaunchCommand {
    match launch {
        Launch::Goto(candidates) => LaunchCommand {
            program: candidates
                .iter()
                .map(|binary| app.join(binary))
                .find(|path| path.is_file())
                .unwrap_or_else(|| app.join(candidates[0])),
            args: match line {
                Some(line) => vec!["-g".to_string(), format!("{file}:{line}")],
                None => vec![file.to_string()],
            },
        },
        Launch::PathColonLine(binary) => LaunchCommand {
            program: app.join(binary),
            args: vec![line.map_or_else(|| file.to_string(), |line| format!("{file}:{line}"))],
        },
        Launch::LineFlag(binary) => LaunchCommand {
            program: app.join(binary),
            args: line
                .map(|line| vec!["--line".to_string(), line.to_string()])
                .unwrap_or_default()
                .into_iter()
                .chain([file.to_string()])
                .collect(),
        },
        Launch::Xed => LaunchCommand {
            program: PathBuf::from("/usr/bin/xed"),
            args: line
                .map(|line| vec!["--line".to_string(), line.to_string()])
                .unwrap_or_default()
                .into_iter()
                .chain([file.to_string()])
                .collect(),
        },
    }
}

/// "auto"면 첫 번째로 찾은 에디터, 아니면 그 id의 에디터. 없으면 None(기본 앱).
fn choose_editor<'a, T>(
    preference: &str,
    detected: &'a [(&'static EditorDefinition, T)],
) -> Option<&'a (&'static EditorDefinition, T)> {
    match preference {
        DEFAULT_APP => None,
        AUTO_EDITOR => detected.first(),
        id => detected.iter().find(|(editor, _)| editor.id == id),
    }
}

/// 에디터에 넘겨도 되는 경로인지 본다: 검색 폴더 안에 있는 실제 코드 파일의 절대 경로.
fn validate_code_path(path: &str, roots: &[String]) -> Result<PathBuf, String> {
    let candidate = Path::new(path);
    if !candidate.is_absolute() {
        return Err("절대 경로가 아닙니다.".to_string());
    }
    let resolved = candidate
        .canonicalize()
        .map_err(|e| format!("파일을 찾을 수 없습니다: {e}"))?;
    if !resolved.is_file() {
        return Err("파일이 아닙니다.".to_string());
    }
    if extension_of(&resolved).and_then(|ext| classify_extension(&ext)) != Some(FileClass::Code) {
        return Err("코드 파일이 아닙니다.".to_string());
    }
    let inside = roots.iter().any(|root| {
        Path::new(root)
            .canonicalize()
            .is_ok_and(|root| resolved.starts_with(root))
    });
    if !inside {
        return Err("검색 폴더 밖의 파일입니다.".to_string());
    }
    Ok(resolved)
}

#[tauri::command]
pub fn list_code_editors() -> Vec<EditorInfo> {
    detect_editors()
        .into_iter()
        .map(|(editor, app)| EditorInfo {
            id: editor.id,
            name: app
                .file_stem()
                .map(|stem| stem.to_string_lossy().to_string())
                .unwrap_or_else(|| editor.name.to_string()),
        })
        .collect()
}

/// 코드 파일을 고른 에디터에서 연다. 에디터가 없거나, 경로가 허용 범위 밖이거나, 실행에 실패하면
/// 기본 앱으로 연다. 실제로 연 에디터 id(기본 앱이면 "default")를 돌려준다.
#[tauri::command]
pub fn open_code_file(
    app: AppHandle,
    path: String,
    line: Option<u32>,
    editor: Option<String>,
) -> Result<String, String> {
    let preference = editor.as_deref().unwrap_or(AUTO_EDITOR);
    let detected = if preference == DEFAULT_APP {
        Vec::new()
    } else {
        detect_editors()
    };
    if let Some((editor, app_path)) = choose_editor(preference, &detected) {
        let roots = load_manifest(&app)?.roots;
        match validate_code_path(&path, &roots) {
            Ok(file) => {
                let command = build_command(editor.launch, app_path, &file.to_string_lossy(), line);
                // VS Code 터미널에서 실행된 경우 CLI가 원격 CLI로 넘기지 않게 터미널 연결 정보를 지운다.
                let spawned = Command::new(&command.program)
                    .args(&command.args)
                    .env_remove("VSCODE_IPC_HOOK_CLI")
                    .spawn();
                match spawned {
                    Ok(_) => return Ok(editor.id.to_string()),
                    Err(error) => log::warn!("[Editors] {} 실행 실패: {error}", editor.name),
                }
            }
            Err(error) => log::warn!("[Editors] {path}: {error}"),
        }
    }
    crate::files::open_file(path)?;
    Ok(DEFAULT_APP.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn editor(id: &str) -> &'static EditorDefinition {
        EDITORS.iter().find(|editor| editor.id == id).unwrap()
    }

    fn command(id: &str, file: &str, line: Option<u32>) -> (String, Vec<String>) {
        let built = build_command(
            editor(id).launch,
            Path::new("/Applications/Editor.app"),
            file,
            line,
        );
        (built.program.to_string_lossy().to_string(), built.args)
    }

    #[test]
    fn builds_vscode_family_goto_commands() {
        assert_eq!(
            command("vscode", "/Users/me/My Project/a.ts", Some(12)),
            (
                "/Applications/Editor.app/Contents/Resources/app/bin/code".into(),
                vec!["-g".into(), "/Users/me/My Project/a.ts:12".into()]
            )
        );
        assert_eq!(command("cursor", "/r/main.rs", None).1, vec!["/r/main.rs"]);

        // CLI 후보 중 실제로 있는 파일을 쓴다. (Windsurf → Devin)
        let app = std::env::temp_dir().join(format!("nookive-editors-app-{}", std::process::id()));
        let devin = app.join("Contents/Resources/app/bin/devin-desktop");
        fs::create_dir_all(devin.parent().unwrap()).unwrap();
        fs::write(&devin, "").unwrap();
        let built = build_command(editor("windsurf").launch, &app, "/r/a.ts", Some(1));
        assert_eq!(built.program, devin);
        let _ = fs::remove_dir_all(&app);
    }

    #[test]
    fn builds_bundled_cli_commands() {
        assert_eq!(
            command("zed", "/r/main.rs", Some(3)),
            (
                "/Applications/Editor.app/Contents/MacOS/cli".into(),
                vec!["/r/main.rs:3".into()]
            )
        );
        assert_eq!(command("sublime", "/r/main.rs", None).1, vec!["/r/main.rs"]);
        assert_eq!(
            command("webstorm", "/r/app.ts", Some(40)),
            (
                "/Applications/Editor.app/Contents/MacOS/webstorm".into(),
                vec!["--line".into(), "40".into(), "/r/app.ts".into()]
            )
        );
        assert_eq!(command("intellij", "/r/A.kt", None).1, vec!["/r/A.kt"]);
        assert_eq!(
            command("xcode", "/r/App.swift", Some(7)),
            (
                "/usr/bin/xed".into(),
                vec!["--line".into(), "7".into(), "/r/App.swift".into()]
            )
        );
    }

    #[test]
    fn chooses_first_detected_editor_automatically() {
        let detected = vec![(editor("zed"), ()), (editor("xcode"), ())];
        assert_eq!(
            choose_editor(AUTO_EDITOR, &detected).map(|(e, _)| e.id),
            Some("zed")
        );
        assert_eq!(
            choose_editor("xcode", &detected).map(|(e, _)| e.id),
            Some("xcode")
        );
        assert!(choose_editor("vscode", &detected).is_none());
        assert!(choose_editor(DEFAULT_APP, &detected).is_none());
        assert!(choose_editor::<()>(AUTO_EDITOR, &[]).is_none());
    }

    #[test]
    fn only_code_files_inside_search_folders_pass() {
        let base = std::env::temp_dir().join(format!("nookive-editors-{}", std::process::id()));
        let root = base.join("root");
        fs::create_dir_all(root.join("src")).unwrap();
        fs::write(root.join("src/main.rs"), "fn main() {}").unwrap();
        fs::write(root.join("notes.pdf"), "x").unwrap();
        fs::write(base.join("outside.rs"), "x").unwrap();
        let roots = vec![root.to_string_lossy().to_string()];

        assert!(validate_code_path(&root.join("src/main.rs").to_string_lossy(), &roots).is_ok());
        // `..`로 폴더 밖을 가리켜도 실제 경로로 확인한다.
        let escaped = root.join("src/../../outside.rs");
        assert!(validate_code_path(&escaped.to_string_lossy(), &roots).is_err());
        assert!(validate_code_path(&root.join("notes.pdf").to_string_lossy(), &roots).is_err());
        assert!(validate_code_path("src/main.rs", &roots).is_err());
        assert!(validate_code_path(&root.join("missing.rs").to_string_lossy(), &roots).is_err());
        let _ = fs::remove_dir_all(&base);
    }
}
