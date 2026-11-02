// src-tauri/src/code_search.rs
// 코드 검색(1단계): 검색 폴더의 코드 파일을 이름/경로로 찾는다. 켜고 끄기는 프론트엔드 설정이다.
// 파일 내용은 읽지 않고 임베딩도 하지 않는다. 목록은 메모리에만 두고 필요할 때 다시 훑는다.
use serde::Serialize;
use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, Instant, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use unicode_normalization::UnicodeNormalization;

use crate::index::file_class::{
    FileClass, classify_extension, extension_of, is_excluded_directory_name, is_excluded_file_name,
};
use crate::index::load_manifest;

/// 코드 검색 모드에 들어올 때 목록이 이보다 오래됐으면 다시 훑는다. (증분 갱신은 #69)
const CODE_FILES_MAX_AGE: Duration = Duration::from_secs(30);
/// 아주 큰 폴더에서도 메모리 사용량이 일정 수준을 넘지 않게 한다.
const MAX_CODE_FILES: usize = 200_000;
const MAX_RESULTS: usize = 50;

#[derive(Debug, Clone)]
struct CodeFile {
    path: String,
    name: String,
    /// 검색 폴더 기준 상대 경로 (결과의 두 번째 줄)
    relative: String,
    extension: String,
    size_bytes: u64,
    modified_at_ms: u128,
    name_key: String,
    relative_key: String,
}

struct CodeFileCache {
    roots: Vec<String>,
    scanned_at: Instant,
    files: Vec<CodeFile>,
}

#[derive(Default)]
pub struct CodeSearchState {
    cache: Mutex<Option<CodeFileCache>>,
}

#[derive(Debug, Serialize)]
pub struct CodeFileMetadata {
    path: String,
    name: String,
    extension: String,
    #[serde(rename = "sizeBytes")]
    size_bytes: u64,
    #[serde(rename = "modifiedAt")]
    modified_at: String,
}

#[derive(Debug, Serialize)]
pub struct CodeSnippet {
    #[serde(rename = "chunkIndex")]
    chunk_index: u32,
    #[serde(rename = "textSnippet")]
    text_snippet: String,
}

/// 프론트엔드 SearchResultItem과 같은 모양이다.
#[derive(Debug, Serialize)]
pub struct CodeSearchResult {
    id: String,
    file: CodeFileMetadata,
    #[serde(rename = "similarityScore")]
    similarity_score: f64,
    #[serde(rename = "bestChunk")]
    best_chunk: CodeSnippet,
    category: &'static str,
}

/// macOS 파일 이름은 분해형(NFD)일 수 있으므로 검색어와 같은 형태로 맞춘다.
fn search_key(value: &str) -> String {
    value.nfc().collect::<String>().to_lowercase()
}

fn modified_at_ms(metadata: &std::fs::Metadata) -> u128 {
    metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

/// 다른 결과와 같은 "YYYY-MM-DD HH:MM" (UTC) 형식으로 바꾼다.
fn format_modified_at(ms: u128) -> String {
    if ms == 0 {
        return String::new();
    }
    let seconds = (ms / 1000) as i64;
    let (days, rest) = (seconds.div_euclid(86_400), seconds.rem_euclid(86_400));
    // Howard Hinnant의 civil_from_days
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02} {:02}:{:02}",
        rest / 3600,
        rest % 3600 / 60
    )
}

/// 검색 폴더 하나를 훑는다. .gitignore(하위 폴더 포함)와 .git/info/exclude를 따르고,
/// 숨김·의존성·빌드 폴더와 비밀/키·lock·minified 파일은 기존 제외 규칙으로 거른다.
fn scan_root(root: &Path, out: &mut Vec<CodeFile>) {
    let walker = ignore::WalkBuilder::new(root)
        .hidden(true)
        .git_ignore(true)
        .git_exclude(true)
        .git_global(false)
        .parents(false)
        .require_git(false)
        .follow_links(false)
        .filter_entry(|entry| {
            entry.depth() == 0
                || !entry.file_type().is_some_and(|kind| kind.is_dir())
                || entry
                    .file_name()
                    .to_str()
                    .is_some_and(|name| !is_excluded_directory_name(name))
        })
        .build();

    for entry in walker.flatten() {
        if out.len() >= MAX_CODE_FILES {
            return;
        }
        if !entry.file_type().is_some_and(|kind| kind.is_file()) {
            continue;
        }
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if is_excluded_file_name(name) {
            continue;
        }
        let Some(extension) = extension_of(path) else {
            continue;
        };
        if classify_extension(&extension) != Some(FileClass::Code) {
            continue;
        }
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        let relative = path
            .strip_prefix(root)
            .unwrap_or(path)
            .to_string_lossy()
            .to_string();
        out.push(CodeFile {
            path: path.to_string_lossy().to_string(),
            name: name.to_string(),
            name_key: search_key(name),
            relative_key: search_key(&relative),
            relative,
            extension,
            size_bytes: metadata.len(),
            modified_at_ms: modified_at_ms(&metadata),
        });
    }
}

fn scan_search_roots(roots: &[String]) -> Vec<CodeFile> {
    let mut files = Vec::new();
    for root in roots {
        let path = Path::new(root);
        if path.is_dir() {
            scan_root(path, &mut files);
        }
    }
    files
}

/// 낮을수록 앞선다. 검색어 단어가 하나라도 이름/경로에 없으면 None.
fn match_tier(file: &CodeFile, query: &str, tokens: &[&str]) -> Option<u8> {
    if !tokens
        .iter()
        .all(|token| file.name_key.contains(token) || file.relative_key.contains(token))
    {
        return None;
    }
    let stem = file
        .name_key
        .rsplit_once('.')
        .map_or(file.name_key.as_str(), |(stem, _)| stem);
    Some(if file.name_key == query || stem == query {
        0
    } else if file.name_key.starts_with(query) {
        1
    } else if file.name_key.contains(query) {
        2
    } else if tokens.iter().all(|token| file.name_key.contains(token)) {
        3
    } else {
        4
    })
}

/// 이름 정확 일치 > 이름 시작 > 이름 포함 > 모든 단어가 이름에 > 경로 일치.
/// 같은 단계에서는 얕은 경로, 이름 순이다.
fn rank_code_files<'a>(
    files: &'a [CodeFile],
    query: &str,
    limit: usize,
) -> Vec<(u8, &'a CodeFile)> {
    let query = search_key(query.trim());
    let tokens: Vec<&str> = query.split_whitespace().collect();
    if tokens.is_empty() {
        return Vec::new();
    }
    let mut matches: Vec<(u8, &CodeFile)> = files
        .iter()
        .filter_map(|file| match_tier(file, &query, &tokens).map(|tier| (tier, file)))
        .collect();
    matches.sort_by(|(tier_a, a), (tier_b, b)| {
        tier_a
            .cmp(tier_b)
            .then_with(|| {
                a.relative
                    .matches('/')
                    .count()
                    .cmp(&b.relative.matches('/').count())
            })
            .then_with(|| a.relative.len().cmp(&b.relative.len()))
            .then_with(|| a.name_key.cmp(&b.name_key))
    });
    matches.truncate(limit);
    matches
}

fn to_result((tier, file): (u8, &CodeFile)) -> CodeSearchResult {
    CodeSearchResult {
        id: format!("code:{}", file.path),
        file: CodeFileMetadata {
            path: file.path.clone(),
            name: file.name.clone(),
            extension: file.extension.clone(),
            size_bytes: file.size_bytes,
            modified_at: format_modified_at(file.modified_at_ms),
        },
        // 표시용 점수: 정확 일치일수록 높다. 순서는 Rust가 정한 그대로 쓴다.
        similarity_score: 1.0 - f64::from(tier) * 0.15,
        best_chunk: CodeSnippet {
            chunk_index: 0,
            text_snippet: file.relative.clone(),
        },
        category: "code",
    }
}

/// 목록이 없거나, 검색 폴더가 바뀌었거나, max_age보다 오래됐으면 다시 훑는다.
fn ensure_code_files(
    app: &AppHandle,
    state: &CodeSearchState,
    max_age: Option<Duration>,
) -> Result<usize, String> {
    let roots = load_manifest(app)?.roots;
    let mut cache = state
        .cache
        .lock()
        .map_err(|_| "코드 목록 잠금 실패".to_string())?;
    let fresh = cache.as_ref().is_some_and(|cache| {
        cache.roots == roots && max_age.is_none_or(|age| cache.scanned_at.elapsed() < age)
    });
    if !fresh {
        let files = scan_search_roots(&roots);
        *cache = Some(CodeFileCache {
            roots,
            scanned_at: Instant::now(),
            files,
        });
    }
    Ok(cache.as_ref().map_or(0, |cache| cache.files.len()))
}

/// 코드 검색 모드에 들어올 때(와 검색창이 Tab 안내를 정할 때) 호출한다.
/// 오래된 목록만 다시 훑고 코드 파일 수를 돌려준다.
#[tauri::command]
pub async fn refresh_code_files(app: AppHandle) -> Result<usize, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<CodeSearchState>();
        ensure_code_files(&app, &state, Some(CODE_FILES_MAX_AGE))
    })
    .await
    .map_err(|e| format!("코드 목록 갱신 실패: {e}"))?
}

#[tauri::command]
pub async fn search_code_files(
    app: AppHandle,
    query: String,
) -> Result<Vec<CodeSearchResult>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<CodeSearchState>();
        ensure_code_files(&app, &state, None)?;
        let cache = state
            .cache
            .lock()
            .map_err(|_| "코드 목록 잠금 실패".to_string())?;
        let files = cache
            .as_ref()
            .map_or(&[][..], |cache| cache.files.as_slice());
        Ok(rank_code_files(files, &query, MAX_RESULTS)
            .into_iter()
            .map(to_result)
            .collect())
    })
    .await
    .map_err(|e| format!("코드 검색 실패: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn temp_root(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("nookive-code-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn touch(root: &Path, relative: &str) {
        let path = root.join(relative);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, "x").unwrap();
    }

    fn scanned(root: &Path) -> Vec<String> {
        let mut files = Vec::new();
        scan_root(root, &mut files);
        let mut names: Vec<String> = files.into_iter().map(|file| file.relative).collect();
        names.sort();
        names
    }

    #[test]
    fn scan_respects_gitignore_and_exclusion_rules() {
        let root = temp_root("scan");
        touch(&root, "src/main.rs");
        touch(&root, "src/app/useSearch.ts");
        touch(&root, "README.md");
        touch(&root, "node_modules/pkg/index.js");
        touch(&root, "target/debug/build.rs");
        touch(&root, ".github/workflows/ci.yml");
        touch(&root, ".env");
        touch(&root, "config/secrets.json");
        touch(&root, "package-lock.json");
        touch(&root, "dist-bundle.min.js");
        touch(&root, "generated/schema.ts");
        touch(&root, "web/.gitignore");
        fs::write(root.join(".gitignore"), "generated/\n").unwrap();
        fs::write(root.join("web/.gitignore"), "local.ts\n").unwrap();
        touch(&root, "web/local.ts");
        touch(&root, "web/page.tsx");

        assert_eq!(
            scanned(&root),
            vec!["src/app/useSearch.ts", "src/main.rs", "web/page.tsx"]
        );
        let _ = fs::remove_dir_all(&root);
    }

    fn file(relative: &str) -> CodeFile {
        let name = relative.rsplit('/').next().unwrap();
        CodeFile {
            path: format!("/p/{relative}"),
            name: name.to_string(),
            relative: relative.to_string(),
            extension: name.rsplit('.').next().unwrap().to_string(),
            size_bytes: 1,
            modified_at_ms: 0,
            name_key: search_key(name),
            relative_key: search_key(relative),
        }
    }

    fn ranked(files: &[CodeFile], query: &str) -> Vec<String> {
        rank_code_files(files, query, 10)
            .into_iter()
            .map(|(_, file)| file.relative.clone())
            .collect()
    }

    #[test]
    fn ranks_exact_name_then_prefix_then_contains_then_path() {
        let files = [
            file("src/search/helpers.ts"),
            file("src/hooks/useSearchResults.ts"),
            file("src/search.ts"),
            file("src/deep/nested/search.ts"),
            file("src/searchClient.ts"),
            file("docs/notes.rs"),
        ];
        assert_eq!(
            ranked(&files, "search"),
            vec![
                "src/search.ts",
                "src/deep/nested/search.ts",
                "src/searchClient.ts",
                "src/hooks/useSearchResults.ts",
                "src/search/helpers.ts",
            ]
        );
    }

    #[test]
    fn every_word_must_match_name_or_path() {
        let files = [file("src/index/manifest.rs"), file("src/models.rs")];
        assert_eq!(
            ranked(&files, "index manifest"),
            vec!["src/index/manifest.rs"]
        );
        assert_eq!(ranked(&files, "Manifest.RS"), vec!["src/index/manifest.rs"]);
        assert!(ranked(&files, "index missing").is_empty());
        assert!(ranked(&files, "   ").is_empty());
    }

    #[test]
    fn matches_decomposed_korean_names() {
        let files = [file(&"프로젝트/설정.ts".nfd().collect::<String>())];
        assert_eq!(ranked(&files, "설정").len(), 1);
    }

    #[test]
    fn formats_modified_time() {
        assert_eq!(format_modified_at(0), "");
        // 2026-11-02 08:30 UTC
        assert_eq!(format_modified_at(1_793_608_200_000), "2026-11-02 08:30");
    }
}
