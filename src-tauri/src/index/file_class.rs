// src-tauri/src/index/file_class.rs
// 파일 분류와 기본 제외 규칙. 어떤 파일을 읽고 임베딩할지는 이 모듈이 단일 기준이다.
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum FileClass {
    Document,
    Code,
    Pdf,
    Image,
    Audio,
    Video,
}

impl FileClass {
    /// 기본 시맨틱 임베딩 대상인지 여부. 코드는 별도 lexical 인덱스(#10) 대상이다.
    pub(crate) fn is_embedded(self) -> bool {
        !matches!(self, FileClass::Code)
    }
}

const DOCUMENT_EXTENSIONS: &[&str] = &["md", "txt", "rtf"];
const CODE_EXTENSIONS: &[&str] = &[
    "ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "rs", "go", "java", "c", "cpp", "h", "html",
    "css", "scss", "json", "yaml", "yml", "toml", "sh", "bash", "zsh", "sql",
];
const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "webp", "heic", "bmp", "gif"];
const AUDIO_EXTENSIONS: &[&str] = &["mp3", "m4a", "wav", "flac", "aac", "ogg", "wma"];
const VIDEO_EXTENSIONS: &[&str] = &["mp4", "mov", "mkv", "avi", "webm", "m4v"];

/// 의존성/빌드/캐시 디렉터리. 점으로 시작하는 디렉터리(.git, .venv, .cache 등)도 제외한다.
const EXCLUDED_DIRECTORIES: &[&str] = &[
    "node_modules",
    "vendor",
    "dist",
    "build",
    "out",
    "target",
    "coverage",
    "__pycache__",
];

/// 키/인증서/비밀번호 저장소 확장자.
const SENSITIVE_EXTENSIONS: &[&str] = &[
    "pem", "p12", "pfx", "crt", "cer", "der", "jks", "keystore", "kdbx",
];

pub(crate) fn extension_of(path: &Path) -> Option<String> {
    Some(path.extension()?.to_string_lossy().to_lowercase())
}

pub(crate) fn classify_extension(extension: &str) -> Option<FileClass> {
    let ext = extension.to_lowercase();
    let ext = ext.as_str();
    if DOCUMENT_EXTENSIONS.contains(&ext) {
        Some(FileClass::Document)
    } else if CODE_EXTENSIONS.contains(&ext) {
        Some(FileClass::Code)
    } else if ext == "pdf" {
        Some(FileClass::Pdf)
    } else if IMAGE_EXTENSIONS.contains(&ext) {
        Some(FileClass::Image)
    } else if AUDIO_EXTENSIONS.contains(&ext) {
        Some(FileClass::Audio)
    } else if VIDEO_EXTENSIONS.contains(&ext) {
        Some(FileClass::Video)
    } else {
        None
    }
}

pub(crate) fn is_excluded_directory_name(name: &str) -> bool {
    name.starts_with('.') || EXCLUDED_DIRECTORIES.contains(&name)
}

/// 파일 이름만으로 판단하는 제외 규칙. 숨김 파일, 비밀/키 파일, lock·minified·source map을 거른다.
pub(crate) fn is_excluded_file_name(name: &str) -> bool {
    let lower = name.to_lowercase();
    if lower.starts_with('.') {
        return true;
    }
    if ["id_rsa", "id_dsa", "id_ecdsa", "id_ed25519"]
        .iter()
        .any(|prefix| lower.starts_with(prefix))
    {
        return true;
    }
    if lower.ends_with(".lock")
        || lower.ends_with("-lock.json")
        || lower.ends_with(".min.js")
        || lower.ends_with(".min.css")
        || lower.ends_with(".map")
    {
        return true;
    }
    let extension = lower.rsplit_once('.').map(|(_, ext)| ext).unwrap_or("");
    if SENSITIVE_EXTENSIONS.contains(&extension) {
        return true;
    }
    // 이미지/미디어 이름에는 "secret" 같은 단어가 흔하므로 본문을 읽는 텍스트 문서에만 적용한다.
    let is_text = classify_extension(extension)
        .is_some_and(|class| matches!(class, FileClass::Document | FileClass::Code));
    is_text
        && ["credential", "secret", "password", "service-account"]
            .iter()
            .any(|word| lower.contains(word))
}

/// 기본 임베딩 대상 파일이면 소문자 확장자를 돌려준다.
pub(crate) fn embeddable_extension(path: &Path) -> Option<String> {
    let name = path.file_name()?.to_str()?;
    if is_excluded_file_name(name) {
        return None;
    }
    let extension = extension_of(path)?;
    classify_extension(&extension)?
        .is_embedded()
        .then_some(extension)
}

/// 감시 루트 기준 상대 경로가 제외 디렉터리를 지나는지 확인한다.
/// 루트 자체가 숨김 폴더 안에 있어도 사용자가 고른 루트이므로 루트 위쪽은 보지 않는다.
fn is_under_excluded_directory(relative: &Path) -> bool {
    let mut components = relative.components().peekable();
    while let Some(component) = components.next() {
        // 마지막 구성 요소는 파일일 수 있으므로 디렉터리 규칙을 적용하지 않는다.
        if components.peek().is_none() {
            break;
        }
        if component
            .as_os_str()
            .to_str()
            .is_some_and(is_excluded_directory_name)
        {
            return true;
        }
    }
    false
}

/// 파일 감시 이벤트가 manifest 재동기화를 일으켜야 하는지 판단한다.
/// 삭제 이벤트는 디렉터리 삭제일 수 있어 확장자로 거르지 않는다.
pub(crate) fn is_relevant_change(path: &Path, roots: &[std::path::PathBuf], removal: bool) -> bool {
    let Some(relative) = roots.iter().find_map(|root| path.strip_prefix(root).ok()) else {
        return false;
    };
    if relative.as_os_str().is_empty() {
        return true;
    }
    if is_under_excluded_directory(relative) {
        return false;
    }
    let Some(name) = relative.file_name().and_then(|name| name.to_str()) else {
        return true;
    };
    if removal || path.is_dir() {
        return !is_excluded_directory_name(name);
    }
    embeddable_extension(path).is_some()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn classifies_extensions() {
        assert_eq!(classify_extension("MD"), Some(FileClass::Document));
        assert_eq!(classify_extension("json"), Some(FileClass::Code));
        assert_eq!(classify_extension("ts"), Some(FileClass::Code));
        assert_eq!(classify_extension("pdf"), Some(FileClass::Pdf));
        assert_eq!(classify_extension("heic"), Some(FileClass::Image));
        assert_eq!(classify_extension("m4a"), Some(FileClass::Audio));
        assert_eq!(classify_extension("mov"), Some(FileClass::Video));
        assert_eq!(classify_extension("exe"), None);
    }

    #[test]
    fn code_is_not_embedded() {
        assert_eq!(
            embeddable_extension(Path::new("/r/notes.md")),
            Some("md".into())
        );
        assert_eq!(
            embeddable_extension(Path::new("/r/photo.JPG")),
            Some("jpg".into())
        );
        assert_eq!(embeddable_extension(Path::new("/r/main.rs")), None);
        assert_eq!(embeddable_extension(Path::new("/r/package.json")), None);
        assert_eq!(embeddable_extension(Path::new("/r/config.yaml")), None);
    }

    #[test]
    fn excludes_sensitive_files() {
        for name in [
            ".env",
            ".env.local",
            ".npmrc",
            ".netrc",
            "id_rsa",
            "id_ed25519.pub",
            "server.pem",
            "cert.p12",
            "vault.kdbx",
            "aws-credentials.txt",
            "my-secrets.md",
            "passwords.txt",
            "service-account.json",
        ] {
            assert!(is_excluded_file_name(name), "{name} should be excluded");
        }
    }

    #[test]
    fn keeps_media_with_sensitive_words() {
        assert!(!is_excluded_file_name("secret-garden.jpg"));
        assert!(!is_excluded_file_name("password-reset-screen.png"));
        assert!(!is_excluded_file_name("meeting notes.md"));
    }

    #[test]
    fn excludes_lock_minified_and_maps() {
        for name in [
            "Cargo.lock",
            "package-lock.json",
            "app.min.js",
            "site.min.css",
            "app.js.map",
        ] {
            assert!(is_excluded_file_name(name), "{name} should be excluded");
        }
    }

    #[test]
    fn excludes_dependency_and_build_directories() {
        for name in [
            ".git",
            ".venv",
            ".cache",
            "node_modules",
            "vendor",
            "target",
            "__pycache__",
        ] {
            assert!(
                is_excluded_directory_name(name),
                "{name} should be excluded"
            );
        }
        assert!(!is_excluded_directory_name("Documents"));
        assert!(!is_excluded_directory_name("src"));
    }

    #[test]
    fn watcher_ignores_changes_under_excluded_directories() {
        let roots = vec![PathBuf::from("/nonexistent-root")];
        let relevant = |p: &str, removal| is_relevant_change(Path::new(p), &roots, removal);
        assert!(relevant("/nonexistent-root/notes/a.md", false));
        assert!(relevant("/nonexistent-root/movie.mp4", false));
        assert!(!relevant(
            "/nonexistent-root/app/node_modules/x/readme.md",
            false
        ));
        assert!(!relevant(
            "/nonexistent-root/app/target/debug/out.txt",
            false
        ));
        assert!(!relevant("/nonexistent-root/.git/index", false));
        assert!(!relevant("/nonexistent-root/src/main.rs", false));
        assert!(!relevant("/elsewhere/a.md", false));
        // 삭제 이벤트는 폴더 삭제일 수 있으므로 통과시킨다.
        assert!(relevant("/nonexistent-root/old-folder", true));
        assert!(!relevant("/nonexistent-root/node_modules/pkg", true));
    }

    #[test]
    fn root_inside_hidden_directory_is_watched() {
        let roots = vec![PathBuf::from("/nonexistent/.config/notes")];
        assert!(is_relevant_change(
            Path::new("/nonexistent/.config/notes/todo.md"),
            &roots,
            false,
        ));
    }
}
