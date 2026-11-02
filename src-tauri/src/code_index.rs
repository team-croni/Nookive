// src-tauri/src/code_index.rs
// 코드 검색(2단계): 코드 파일 내용을 줄 단위로 SQLite FTS5(trigram)에 색인해 줄 번호와 함께 찾는다.
// 대상은 code_search가 훑은 코드 파일 목록이다. 파일 감시는 없고(#69), 코드 모드에 들어올 때
// 수정 시각·크기가 바뀐 파일만 다시 읽는다. 임베딩 모델은 쓰지 않는다.
use rusqlite::{Connection, params};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager};
use unicode_normalization::UnicodeNormalization;

const INDEX_FILE: &str = "code-index.sqlite";
pub(crate) const CODE_INDEX_EVENT: &str = "code-index-state";
/// 이보다 큰 파일은 내용을 색인하지 않는다. (미리보기 한도와 같다)
const MAX_INDEXED_FILE_BYTES: u64 = 1024 * 1024;
/// 한 줄에 저장하는 최대 글자 수. 뒷부분은 검색되지 않는다.
const MAX_LINE_CHARS: usize = 500;
/// 이보다 긴 줄이 있으면 압축(minified)·생성된 파일로 보고 건너뛴다.
const MINIFIED_LINE_CHARS: usize = 5_000;
/// FTS rowid = 파일 id << LINE_BITS | 줄 번호. 파일 하나의 줄을 rowid 범위로 지운다.
const LINE_BITS: u32 = 24;
const LINE_MASK: i64 = (1 << LINE_BITS) - 1;
/// 색인 중에도 검색이 진행 상황을 보도록 이만큼 읽을 때마다 커밋한다.
const COMMIT_EVERY_FILES: usize = 200;
/// trigram은 3글자 미만 단어를 색인에서 찾지 못한다. 더 짧은 검색어는 이름만 찾는다.
pub(crate) const MIN_CONTENT_QUERY_CHARS: usize = 3;
/// 검색어가 아주 흔하면 앞쪽 후보만 보고 순위를 매긴다.
const MAX_CANDIDATE_LINES: usize = 5_000;
/// 파일 하나에서 돌려주는 최대 줄 수. 결과는 파일당 하나이고 나머지 줄은 미리보기에서 강조한다.
const MAX_LINES_PER_FILE: usize = 20;

/// 색인할 파일. code_search의 목록에서 만든다.
#[derive(Debug, Clone)]
pub(crate) struct IndexTarget {
    pub(crate) path: String,
    pub(crate) size_bytes: u64,
    pub(crate) modified_at_ms: i64,
}

#[derive(Debug, Default, Clone, Copy, Serialize)]
pub struct SyncStats {
    /// 색인 대상 코드 파일 수
    files: usize,
    /// 이번에 새로 읽은 파일 수
    read: usize,
    /// 크기·바이너리·압축 파일이라 내용을 색인하지 않은 파일 수 (전체)
    skipped: usize,
    /// 목록에서 사라져 지운 파일 수
    removed: usize,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct LineMatch {
    pub(crate) path: String,
    /// 1부터 시작
    pub(crate) line: u32,
    pub(crate) text: String,
    pub(crate) size_bytes: u64,
    pub(crate) modified_at_ms: i64,
    /// 낮을수록 앞선다: 0 = 단어 단위 일치, 1 = 검색어 전체 포함, 2 = 모든 단어 포함
    pub(crate) tier: u8,
}

#[derive(Default)]
pub struct CodeIndexState {
    building: AtomicBool,
}

#[derive(Debug, Clone, Serialize)]
struct CodeIndexEvent {
    building: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    stats: Option<SyncStats>,
}

fn index_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("앱 데이터 디렉터리 확인 실패: {e}"))?;
    Ok(dir.join(INDEX_FILE))
}

fn open_at(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    conn.busy_timeout(std::time::Duration::from_secs(2))?;
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         CREATE TABLE IF NOT EXISTS code_files (
             id INTEGER PRIMARY KEY,
             path TEXT NOT NULL UNIQUE,
             size_bytes INTEGER NOT NULL,
             modified_at_ms INTEGER NOT NULL,
             skipped INTEGER NOT NULL
         );
         CREATE VIRTUAL TABLE IF NOT EXISTS code_lines USING fts5(text, tokenize = 'trigram', detail = none);",
    )?;
    Ok(conn)
}

/// 파일 내용을 줄 목록으로 읽는다. 색인하지 않을 파일이면 None.
fn read_lines(path: &Path, size_bytes: u64) -> Option<Vec<String>> {
    if size_bytes > MAX_INDEXED_FILE_BYTES {
        return None;
    }
    let bytes = std::fs::read(path).ok()?;
    if bytes.len() as u64 > MAX_INDEXED_FILE_BYTES || bytes.contains(&0) {
        return None;
    }
    let text = String::from_utf8_lossy(&bytes);
    let mut lines = Vec::new();
    for line in text.lines() {
        if line.len() > MINIFIED_LINE_CHARS && line.chars().count() > MINIFIED_LINE_CHARS {
            return None;
        }
        lines.push(line.chars().take(MAX_LINE_CHARS).collect());
    }
    Some(lines)
}

fn line_range(file_id: i64) -> (i64, i64) {
    let start = file_id << LINE_BITS;
    (start, start | LINE_MASK)
}

/// 목록과 색인을 맞춘다. 수정 시각·크기가 같은 파일은 다시 읽지 않는다.
pub(crate) fn sync_index(
    conn: &mut Connection,
    targets: &[IndexTarget],
) -> rusqlite::Result<SyncStats> {
    let mut existing: HashMap<String, (i64, u64, i64)> = HashMap::new();
    {
        let mut stmt =
            conn.prepare("SELECT id, path, size_bytes, modified_at_ms FROM code_files")?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(1)?,
                (row.get(0)?, row.get::<_, i64>(2)? as u64, row.get(3)?),
            ))
        })?;
        for row in rows {
            let (path, meta) = row?;
            existing.insert(path, meta);
        }
    }

    let mut stats = SyncStats {
        files: targets.len(),
        ..SyncStats::default()
    };
    let mut seen: HashSet<&str> = HashSet::with_capacity(targets.len());
    let mut tx = conn.transaction()?;
    let mut pending = 0;
    for target in targets {
        if !seen.insert(target.path.as_str()) {
            continue;
        }
        if let Some(&(_, size, modified)) = existing.get(&target.path)
            && size == target.size_bytes
            && modified == target.modified_at_ms
        {
            continue;
        }
        let lines = read_lines(Path::new(&target.path), target.size_bytes);
        let file_id: i64 = tx.query_row(
            "INSERT INTO code_files (path, size_bytes, modified_at_ms, skipped)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(path) DO UPDATE SET
                 size_bytes = excluded.size_bytes,
                 modified_at_ms = excluded.modified_at_ms,
                 skipped = excluded.skipped
             RETURNING id",
            params![
                target.path,
                target.size_bytes as i64,
                target.modified_at_ms,
                lines.is_none()
            ],
            |row| row.get(0),
        )?;
        let (start, end) = line_range(file_id);
        tx.execute(
            "DELETE FROM code_lines WHERE rowid BETWEEN ?1 AND ?2",
            params![start, end],
        )?;
        if let Some(lines) = lines {
            let mut insert =
                tx.prepare_cached("INSERT INTO code_lines (rowid, text) VALUES (?1, ?2)")?;
            for (index, line) in lines.iter().enumerate().take(LINE_MASK as usize) {
                // 3글자 미만인 줄(빈 줄, 닫는 괄호 등)은 찾을 수 없으므로 저장하지 않는다. 줄 번호는 rowid에 들어 있다.
                if line.trim().chars().count() < MIN_CONTENT_QUERY_CHARS {
                    continue;
                }
                insert.execute(params![start + index as i64 + 1, line])?;
            }
        }
        stats.read += 1;
        pending += 1;
        if pending >= COMMIT_EVERY_FILES {
            tx.commit()?;
            tx = conn.transaction()?;
            pending = 0;
        }
    }

    for (path, (file_id, _, _)) in &existing {
        if seen.contains(path.as_str()) {
            continue;
        }
        let (start, end) = line_range(*file_id);
        tx.execute(
            "DELETE FROM code_lines WHERE rowid BETWEEN ?1 AND ?2",
            params![start, end],
        )?;
        tx.execute("DELETE FROM code_files WHERE id = ?1", params![file_id])?;
        stats.removed += 1;
    }
    stats.skipped = tx.query_row(
        "SELECT COUNT(*) FROM code_files WHERE skipped = 1",
        [],
        |row| row.get::<_, i64>(0),
    )? as usize;
    tx.commit()?;
    Ok(stats)
}

fn is_identifier_char(c: char) -> bool {
    c.is_alphanumeric() || c == '_' || c == '$'
}

/// 검색어 전체가 식별자 경계에서 시작하고 끝나는지 본다. (`index`는 `index.ts`에서 맞고 `reindex`에서는 아니다)
fn contains_as_word(haystack: &str, needle: &str) -> bool {
    haystack.match_indices(needle).any(|(start, _)| {
        let before = haystack[..start].chars().next_back();
        let after = haystack[start + needle.len()..].chars().next();
        !before.is_some_and(is_identifier_char) && !after.is_some_and(is_identifier_char)
    })
}

fn line_tier(text: &str, query: &str, tokens: &[&str]) -> Option<u8> {
    let lower = text.to_lowercase();
    if !tokens.iter().all(|token| lower.contains(token)) {
        return None;
    }
    Some(if contains_as_word(&lower, query) {
        0
    } else if lower.contains(query) {
        1
    } else {
        2
    })
}

/// FTS5 MATCH 식. 색인을 줄이려고 위치 정보 없이(detail=none) 저장하므로 구(phrase) 검색을 쓸 수 없다.
/// 그래서 단어를 3글자 조각으로 나눠 모두 포함(AND)하는 줄을 후보로 받고, 실제 포함 여부는 line_tier가 확인한다.
/// 조각은 따옴표로 감싸 연산자로 해석되지 않게 한다.
fn match_expression(tokens: &[&str]) -> Option<String> {
    let mut terms: Vec<String> = Vec::new();
    for token in tokens {
        let chars: Vec<char> = token.chars().collect();
        for window in chars.windows(MIN_CONTENT_QUERY_CHARS) {
            let term = format!(
                "\"{}\"",
                window.iter().collect::<String>().replace('"', "\"\"")
            );
            if !terms.contains(&term) {
                terms.push(term);
            }
        }
    }
    (!terms.is_empty()).then(|| terms.join(" AND "))
}

/// 내용이 일치하는 줄을 찾아 파일별로 묶는다. 줄 순위는 단어 단위 일치 > 검색어 전체 포함 > 모든 단어 포함이고,
/// 같은 단계에서는 얕은 경로, 경로, 줄 번호 순이다. 파일 순서는 각 파일의 가장 좋은 줄을 따르며,
/// 묶음의 첫 줄이 그 줄이다. 파일은 limit개, 파일마다 MAX_LINES_PER_FILE줄까지 돌려준다.
pub(crate) fn search_lines(
    conn: &Connection,
    query: &str,
    limit: usize,
) -> rusqlite::Result<Vec<Vec<LineMatch>>> {
    let query = query.trim().nfc().collect::<String>().to_lowercase();
    let tokens: Vec<&str> = query.split_whitespace().collect();
    let Some(expression) = match_expression(&tokens) else {
        return Ok(Vec::new());
    };
    let query = tokens.join(" ");

    let mut stmt = conn.prepare_cached(
        "SELECT l.rowid, l.text, f.path, f.size_bytes, f.modified_at_ms
         FROM code_lines l JOIN code_files f ON f.id = (l.rowid >> 24)
         WHERE code_lines MATCH ?1
         LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![expression, MAX_CANDIDATE_LINES as i64], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, i64>(3)?,
            row.get::<_, i64>(4)?,
        ))
    })?;

    let mut matches = Vec::new();
    for row in rows {
        let (rowid, text, path, size_bytes, modified_at_ms) = row?;
        let Some(tier) = line_tier(&text, &query, &tokens) else {
            continue;
        };
        matches.push(LineMatch {
            path,
            line: (rowid & LINE_MASK) as u32,
            text,
            size_bytes: size_bytes as u64,
            modified_at_ms,
            tier,
        });
    }
    matches.sort_by(|a, b| {
        a.tier
            .cmp(&b.tier)
            .then_with(|| {
                a.path
                    .matches('/')
                    .count()
                    .cmp(&b.path.matches('/').count())
            })
            .then_with(|| a.path.cmp(&b.path))
            .then_with(|| a.line.cmp(&b.line))
    });

    // 정렬된 순서대로 묶으므로 파일마다 처음 나온 줄이 가장 좋은 줄이다.
    let mut groups: Vec<Vec<LineMatch>> = Vec::new();
    let mut group_of: HashMap<String, usize> = HashMap::new();
    for item in matches {
        if let Some(&index) = group_of.get(&item.path) {
            if groups[index].len() < MAX_LINES_PER_FILE {
                groups[index].push(item);
            }
        } else if groups.len() < limit {
            group_of.insert(item.path.clone(), groups.len());
            groups.push(vec![item]);
        }
    }
    Ok(groups)
}

/// 검색할 때 쓴다. 색인이 아직 없으면 만들지 않고 None을 돌려준다.
pub(crate) fn search_index(
    app: &AppHandle,
    query: &str,
    limit: usize,
) -> Result<Vec<Vec<LineMatch>>, String> {
    let path = index_path(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let conn = open_at(&path).map_err(|e| format!("코드 색인 열기 실패: {e}"))?;
    search_lines(&conn, query, limit).map_err(|e| format!("코드 내용 검색 실패: {e}"))
}

/// "검색 데이터 초기화"에서 호출한다. 다음에 코드 모드에 들어오면 처음부터 다시 만든다.
pub(crate) fn delete_index(app: &AppHandle) -> Result<(), String> {
    let path = index_path(app)?;
    for suffix in ["", "-wal", "-shm"] {
        let file = PathBuf::from(format!("{}{suffix}", path.display()));
        if file.exists() {
            std::fs::remove_file(&file).map_err(|e| format!("코드 색인 삭제 실패: {e}"))?;
        }
    }
    Ok(())
}

fn emit_state(app: &AppHandle, building: bool, stats: Option<SyncStats>) {
    let _ = app.emit(CODE_INDEX_EVENT, CodeIndexEvent { building, stats });
}

/// 코드 모드에 들어올 때 호출한다. 이미 색인 중이면 false를 돌려주고 아무것도 하지 않는다.
/// 끝나면 code-index-state 이벤트(building: false)를 보낸다.
#[tauri::command]
pub fn sync_code_index(app: AppHandle) -> bool {
    let state = app.state::<CodeIndexState>();
    if state.building.swap(true, Ordering::SeqCst) {
        return false;
    }
    emit_state(&app, true, None);
    std::thread::spawn(move || {
        let started = Instant::now();
        let result = (|| {
            let targets = crate::code_search::index_targets(&app)?;
            let path = index_path(&app)?;
            if let Some(dir) = path.parent() {
                std::fs::create_dir_all(dir)
                    .map_err(|e| format!("앱 데이터 디렉터리 생성 실패: {e}"))?;
            }
            let mut conn = open_at(&path).map_err(|e| format!("코드 색인 열기 실패: {e}"))?;
            sync_index(&mut conn, &targets).map_err(|e| format!("코드 색인 실패: {e}"))
        })();
        let stats = match result {
            Ok(stats) => {
                log::info!("[CodeIndex] {stats:?} in {:?}", started.elapsed());
                Some(stats)
            }
            Err(error) => {
                log::warn!("[CodeIndex] {error}");
                None
            }
        };
        app.state::<CodeIndexState>()
            .building
            .store(false, Ordering::SeqCst);
        emit_state(&app, false, stats);
    });
    true
}

#[tauri::command]
pub fn is_code_index_building(app: AppHandle) -> bool {
    app.state::<CodeIndexState>()
        .building
        .load(Ordering::SeqCst)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_dir(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("nookive-code-index-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write(dir: &Path, name: &str, content: &[u8], modified_at_ms: i64) -> IndexTarget {
        let path = dir.join(name);
        fs::write(&path, content).unwrap();
        IndexTarget {
            path: path.to_string_lossy().to_string(),
            size_bytes: content.len() as u64,
            modified_at_ms,
        }
    }

    fn found(conn: &Connection, query: &str) -> Vec<(String, u32)> {
        search_lines(conn, query, 50)
            .unwrap()
            .into_iter()
            .flatten()
            .map(|item| {
                let name = Path::new(&item.path)
                    .file_name()
                    .unwrap()
                    .to_string_lossy()
                    .to_string();
                (name, item.line)
            })
            .collect()
    }

    #[test]
    fn finds_substrings_and_split_identifiers_with_line_numbers() {
        let dir = temp_dir("match");
        let mut conn = open_at(&dir.join(INDEX_FILE)).unwrap();
        let targets = vec![write(
            &dir,
            "status.ts",
            b"import x from 'y';\n\nexport function getIndexStatus() {\n  throw new Error(\"Index not ready\");\n}\nconst index_status = 1;\n",
            1,
        )];
        sync_index(&mut conn, &targets).unwrap();

        assert_eq!(found(&conn, "IndexStat"), vec![("status.ts".into(), 3)]);
        assert_eq!(
            found(&conn, "index status"),
            vec![("status.ts".into(), 3), ("status.ts".into(), 6)]
        );
        assert_eq!(found(&conn, "not ready"), vec![("status.ts".into(), 4)]);
        // 3글자 미만 검색어는 내용을 찾지 않는다.
        assert!(found(&conn, "x").is_empty());
        // FTS 연산자 문자가 들어가도 오류 없이 문자 그대로 찾는다.
        assert_eq!(found(&conn, "\"Index"), vec![("status.ts".into(), 4)]);
    }

    #[test]
    fn groups_lines_by_file_in_best_line_order() {
        let dir = temp_dir("rank");
        let mut conn = open_at(&dir.join(INDEX_FILE)).unwrap();
        let many = "index\n".repeat(MAX_LINES_PER_FILE + 5);
        let targets = vec![
            write(&dir, "a.rs", b"fn reindex() {}\nfn reindex_all() {}\n", 1),
            write(&dir, "b.rs", b"// reindex\nmod index;\n", 1),
            write(&dir, "many.rs", many.as_bytes(), 1),
        ];
        sync_index(&mut conn, &targets).unwrap();

        let groups = search_lines(&conn, "index", 50).unwrap();
        let summary: Vec<(String, Vec<u32>)> = groups
            .iter()
            .map(|group| {
                let name = Path::new(&group[0].path)
                    .file_name()
                    .unwrap()
                    .to_string_lossy()
                    .to_string();
                (name, group.iter().map(|item| item.line).collect())
            })
            .collect();
        // 파일 순서와 묶음의 첫 줄은 가장 좋은 줄(단어 단위 일치)을 따른다.
        assert_eq!(summary[0], ("b.rs".into(), vec![2, 1]));
        assert_eq!(summary[1].0, "many.rs");
        assert_eq!(summary[1].1.len(), MAX_LINES_PER_FILE);
        assert_eq!(summary[2], ("a.rs".into(), vec![1, 2]));

        assert_eq!(search_lines(&conn, "index", 1).unwrap().len(), 1);
    }

    #[test]
    fn skips_large_binary_and_minified_files() {
        let dir = temp_dir("skip");
        let mut conn = open_at(&dir.join(INDEX_FILE)).unwrap();
        let long_line = format!("const needle = 1;{}\n", "x".repeat(MINIFIED_LINE_CHARS));
        let mut large = b"needle\n".to_vec();
        large.resize(MAX_INDEXED_FILE_BYTES as usize + 1, b' ');
        let targets = vec![
            write(&dir, "binary.js", b"needle\0\x01", 1),
            write(&dir, "app.min.js", long_line.as_bytes(), 1),
            write(&dir, "large.js", &large, 1),
            write(&dir, "ok.js", b"// needle\n", 1),
        ];
        let stats = sync_index(&mut conn, &targets).unwrap();

        assert_eq!(stats.skipped, 3);
        assert_eq!(found(&conn, "needle"), vec![("ok.js".into(), 1)]);
    }

    #[test]
    fn rereads_only_changed_files_and_removes_missing_ones() {
        let dir = temp_dir("sync");
        let mut conn = open_at(&dir.join(INDEX_FILE)).unwrap();
        let a = write(&dir, "a.py", b"old_name = 1\n", 1);
        let b = write(&dir, "b.py", b"keep_me = 2\n", 1);
        let first = sync_index(&mut conn, &[a.clone(), b.clone()]).unwrap();
        assert_eq!((first.read, first.removed), (2, 0));

        let unchanged = sync_index(&mut conn, &[a.clone(), b.clone()]).unwrap();
        assert_eq!(unchanged.read, 0);

        let a = write(&dir, "a.py", b"\nnew_name = 1\n", 2);
        let changed = sync_index(&mut conn, &[a]).unwrap();
        assert_eq!((changed.read, changed.removed), (1, 1));
        assert!(found(&conn, "old_name").is_empty());
        assert!(found(&conn, "keep_me").is_empty());
        assert_eq!(found(&conn, "new_name"), vec![("a.py".into(), 2)]);
    }

    #[test]
    fn truncates_long_lines() {
        let dir = temp_dir("truncate");
        let path = dir.join("long.ts");
        let line = format!("{}tail", "a".repeat(MAX_LINE_CHARS));
        fs::write(&path, &line).unwrap();
        let lines = read_lines(&path, line.len() as u64).unwrap();
        assert_eq!(lines[0].chars().count(), MAX_LINE_CHARS);
    }

    /// 색인 시간 측정. 실행: NOOKIVE_BENCH_DIR=<폴더> cargo test --release bench_ -- --ignored --nocapture
    #[test]
    #[ignore]
    fn bench_index_medium_project() {
        use crate::index::file_class::{FileClass, classify_extension, extension_of};
        let Ok(root) = std::env::var("NOOKIVE_BENCH_DIR") else {
            return;
        };
        let mut targets = Vec::new();
        for entry in ignore::WalkBuilder::new(&root)
            .standard_filters(false)
            .build()
            .flatten()
        {
            let path = entry.path();
            if targets.len() >= 10_000 || !path.is_file() {
                continue;
            }
            if extension_of(path).and_then(|ext| classify_extension(&ext)) != Some(FileClass::Code)
            {
                continue;
            }
            let metadata = entry.metadata().unwrap();
            targets.push(IndexTarget {
                path: path.to_string_lossy().to_string(),
                size_bytes: metadata.len(),
                modified_at_ms: 1,
            });
        }
        let dir = temp_dir("bench");
        let db = dir.join(INDEX_FILE);
        let mut conn = open_at(&db).unwrap();
        let started = Instant::now();
        let stats = sync_index(&mut conn, &targets).unwrap();
        let full = started.elapsed();
        let started = Instant::now();
        sync_index(&mut conn, &targets).unwrap();
        let unchanged = started.elapsed();
        conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
            .unwrap();
        let source: u64 = targets.iter().map(|target| target.size_bytes).sum();
        let size = fs::metadata(&db).unwrap().len();
        println!("{stats:?}\nfull: {full:?}, unchanged: {unchanged:?}");
        println!(
            "source: {:.1} MB, index: {:.1} MB",
            source as f64 / 1e6,
            size as f64 / 1e6
        );
        for query in ["useState", "function", "error message", "zz"] {
            let started = Instant::now();
            let count = search_lines(&conn, query, 50).unwrap().len();
            println!("query {query:?}: {count} lines in {:?}", started.elapsed());
        }
    }
}
