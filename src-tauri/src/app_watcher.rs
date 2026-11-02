// src-tauri/src/app_watcher.rs
// 앱 폴더(/Applications, ~/Applications)를 감시해 앱이 설치·삭제·이름 변경되면 검색 창에 알린다.
// 앱 업데이트는 번들 안의 파일 수천 개를 바꾸므로 번들 안쪽 이벤트는 무시하고, 조용해진 뒤
// 번들 목록을 이전과 비교해 실제로 달라졌을 때만 알린다.
use std::collections::BTreeSet;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::sync::mpsc::{RecvTimeoutError, channel};
use std::time::{Duration, Instant};

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, Manager};

use crate::applications::user_application_roots;

pub(crate) const APPLICATIONS_CHANGED_EVENT: &str = "applications-changed";
const DEBOUNCE: Duration = Duration::from_secs(2);
/// 앱 목록과 같은 깊이까지만 본다. (예: /Applications/Utilities/Terminal.app, 제조사 폴더 안의 앱)
const MAX_FOLDER_DEPTH: usize = 3;

#[derive(Default)]
pub struct AppWatcherState {
    watcher: Mutex<Option<RecommendedWatcher>>,
}

/// 이벤트 경로가 번들 자체(또는 번들을 담을 수 있는 폴더)의 변경인지 본다. 번들 안쪽 파일이면 false.
fn is_bundle_change(path: &Path, roots: &[PathBuf]) -> bool {
    let Some(relative) = roots.iter().find_map(|root| path.strip_prefix(root).ok()) else {
        return false;
    };
    let names: Vec<&str> = relative
        .components()
        .filter_map(|component| match component {
            Component::Normal(name) => name.to_str(),
            _ => None,
        })
        .collect();
    if names.is_empty() || names.iter().any(|name| name.starts_with('.')) {
        return false;
    }
    match names.iter().position(|name| name.ends_with(".app")) {
        // 번들 경로 그 자체만 본다. 번들 안의 Contents/… 는 앱 업데이트다.
        Some(index) => index == names.len() - 1 && index <= MAX_FOLDER_DEPTH,
        // 번들이 아닌 폴더가 옮겨지거나 지워지면 안의 앱도 바뀐 것이다.
        None => names.len() <= MAX_FOLDER_DEPTH,
    }
}

fn collect_bundles(dir: &Path, depth: usize, out: &mut BTreeSet<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        if !entry.file_type().is_ok_and(|kind| kind.is_dir()) {
            continue;
        }
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        if name.starts_with('.') {
            continue;
        }
        if name.ends_with(".app") {
            out.insert(path);
        } else if depth < MAX_FOLDER_DEPTH {
            collect_bundles(&path, depth + 1, out);
        }
    }
}

/// 설치된 앱 번들 경로 목록. Info.plist는 읽지 않아 가볍다.
fn bundle_snapshot(roots: &[PathBuf]) -> BTreeSet<PathBuf> {
    let mut bundles = BTreeSet::new();
    for root in roots {
        collect_bundles(root, 0, &mut bundles);
    }
    bundles
}

pub fn start_application_watcher(app: AppHandle) {
    let roots: Vec<PathBuf> = user_application_roots()
        .into_iter()
        .filter(|root| root.is_dir())
        .collect();
    if roots.is_empty() {
        return;
    }
    let (tx, rx) = channel::<()>();
    let event_roots = roots.clone();
    let mut watcher = match notify::recommended_watcher(move |result: notify::Result<Event>| {
        let Ok(event) = result else {
            return;
        };
        if !matches!(
            event.kind,
            EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
        ) {
            return;
        }
        if event
            .paths
            .iter()
            .any(|path| is_bundle_change(path, &event_roots))
        {
            let _ = tx.send(());
        }
    }) {
        Ok(watcher) => watcher,
        Err(error) => {
            log::warn!("앱 폴더 감시자를 시작하지 못했습니다: {error}");
            return;
        }
    };
    for root in &roots {
        if let Err(error) = watcher.watch(root, RecursiveMode::Recursive) {
            log::warn!("앱 폴더 감시 실패 ({}): {error}", root.display());
        }
    }
    if let Ok(mut slot) = app.state::<AppWatcherState>().watcher.lock() {
        *slot = Some(watcher);
    }

    std::thread::spawn(move || {
        let mut known = bundle_snapshot(&roots);
        let mut pending: Option<Instant> = None;
        loop {
            match rx.recv_timeout(Duration::from_millis(500)) {
                Ok(()) => pending = Some(Instant::now()),
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => break,
            }
            if !pending.is_some_and(|at| at.elapsed() >= DEBOUNCE) {
                continue;
            }
            pending = None;
            let current = bundle_snapshot(&roots);
            if current != known {
                log::info!(
                    "[Apps] 앱 목록 변경: {}개 → {}개",
                    known.len(),
                    current.len()
                );
                known = current;
                let _ = app.emit(APPLICATIONS_CHANGED_EVENT, ());
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn ignores_files_inside_bundles() {
        let roots = vec![PathBuf::from("/Applications")];
        let changed = |path: &str| is_bundle_change(Path::new(path), &roots);
        assert!(changed("/Applications/Slack.app"));
        assert!(changed("/Applications/Utilities/Terminal.app"));
        assert!(changed("/Applications/Adobe Photoshop 2026"));
        // 앱 업데이트는 번들 안의 파일을 바꾼다.
        assert!(!changed("/Applications/Slack.app/Contents/Info.plist"));
        assert!(!changed(
            "/Applications/Slack.app/Contents/Frameworks/Electron.framework/Versions/A/x"
        ));
        assert!(!changed("/Applications/.DS_Store"));
        assert!(!changed("/Applications/.Slack.app.tmp"));
        assert!(!changed("/Applications"));
        assert!(!changed("/Users/me/Downloads/Slack.app"));
        assert!(!changed("/Applications/a/b/c/d/Deep.app"));
    }

    #[test]
    fn snapshot_lists_bundles_and_detects_installs_and_removals() {
        let root = std::env::temp_dir().join(format!("nookive-apps-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("One.app/Contents")).unwrap();
        fs::create_dir_all(root.join("Utilities/Two.app")).unwrap();
        fs::create_dir_all(root.join(".hidden/Three.app")).unwrap();
        let roots = vec![root.clone()];

        let before = bundle_snapshot(&roots);
        assert_eq!(
            before,
            BTreeSet::from([root.join("One.app"), root.join("Utilities/Two.app")])
        );

        // 번들 안의 변경(업데이트)은 목록을 바꾸지 않는다.
        fs::write(root.join("One.app/Contents/Info.plist"), "x").unwrap();
        assert_eq!(bundle_snapshot(&roots), before);

        fs::create_dir_all(root.join("New.app")).unwrap();
        fs::remove_dir_all(root.join("Utilities/Two.app")).unwrap();
        assert_eq!(
            bundle_snapshot(&roots),
            BTreeSet::from([root.join("New.app"), root.join("One.app")])
        );
        let _ = fs::remove_dir_all(&root);
    }
}
