// src-tauri/src/index/watcher.rs
// 등록된 검색 폴더를 감시하고, 변경이 감지되면 manifest를 동기화한 뒤
// 백그라운드에서 자동으로 pending 파일을 색인한다.
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{RecvTimeoutError, channel};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, Manager};

use super::manifest::{load_manifest, sync_index_manifest};
use super::media::{MediaIndexState, index_pending_media_sync};

const DEBOUNCE: Duration = Duration::from_secs(2);

#[derive(Default)]
pub struct IndexWatcherState {
    watcher: Mutex<Option<RecommendedWatcher>>,
    stop: Mutex<Arc<AtomicBool>>,
}

/// 자동 색인 옵션. 설정 창의 "정확한 시점 표시" 값을 반영한다.
pub struct IndexOptionsState {
    pub use_aligner: AtomicBool,
}

impl Default for IndexOptionsState {
    fn default() -> Self {
        Self {
            use_aligner: AtomicBool::new(true),
        }
    }
}

/// 수동 색인이 실행 중인지 표시한다. 자동 색인이 겹치지 않도록 막는다.
#[derive(Default)]
pub struct IndexingBusyState {
    manual: AtomicBool,
}

impl IndexingBusyState {
    pub fn set(&self, busy: bool) {
        self.manual.store(busy, Ordering::Relaxed);
    }

    pub fn try_acquire(&self) -> bool {
        self.manual
            .compare_exchange(false, true, Ordering::Acquire, Ordering::Relaxed)
            .is_ok()
    }
}

struct IndexingBusyGuard<'a>(&'a IndexingBusyState);

impl Drop for IndexingBusyGuard<'_> {
    fn drop(&mut self) {
        self.0.set(false);
    }
}

/// 저장된 검색 루트를 감시하는 워처를 (재)시작한다.
pub fn start_index_watcher(app: AppHandle) {
    let state = app.state::<IndexWatcherState>();

    // 기존 워처/스레드 종료
    if let Ok(slot) = state.stop.lock() {
        slot.store(true, Ordering::Relaxed);
    }
    if let Ok(mut watcher) = state.watcher.lock() {
        *watcher = None;
    }

    let stop = Arc::new(AtomicBool::new(false));
    let stop_for_thread = stop.clone();
    let (tx, rx) = channel::<()>();

    let mut watcher = match notify::recommended_watcher(move |result: notify::Result<Event>| {
        if let Ok(event) = result
            && matches!(
                event.kind,
                EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
            )
        {
            let _ = tx.send(());
        }
    }) {
        Ok(watcher) => watcher,
        Err(error) => {
            log::warn!("파일 감시자를 시작하지 못했습니다: {error}");
            return;
        }
    };

    let manifest = match load_manifest(&app) {
        Ok(manifest) => manifest,
        Err(error) => {
            log::warn!("감시할 검색 폴더를 읽지 못했습니다: {error}");
            return;
        }
    };

    for root in &manifest.roots {
        let path = PathBuf::from(root);
        if path.is_dir()
            && let Err(error) = watcher.watch(&path, RecursiveMode::Recursive)
        {
            log::warn!("검색 폴더 감시 실패 ({}): {error}", path.display());
        }
    }

    if let Ok(mut slot) = state.watcher.lock() {
        *slot = Some(watcher);
    }
    if let Ok(mut slot) = state.stop.lock() {
        *slot = stop;
    }

    // 앱이 꺼져 있는 동안 바뀐 파일도 다음 시작 시 한 번 반영한다.
    let startup_app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(3));
        auto_index(&startup_app);
    });

    std::thread::spawn(move || {
        let mut pending = false;
        let mut last_event = Instant::now();
        loop {
            if stop_for_thread.load(Ordering::Relaxed) {
                break;
            }
            match rx.recv_timeout(Duration::from_millis(500)) {
                Ok(()) => {
                    pending = true;
                    last_event = Instant::now();
                }
                Err(RecvTimeoutError::Timeout) => {
                    if pending && last_event.elapsed() >= DEBOUNCE {
                        pending = false;
                        auto_index(&app);
                    }
                }
                Err(RecvTimeoutError::Disconnected) => break,
            }
        }
    });
}

/// 검색 루트가 바뀌었을 때 워처를 다시 시작한다.
pub fn restart_index_watcher(app: AppHandle) {
    start_index_watcher(app);
}

fn auto_index(app: &AppHandle) {
    // 수동 색인 또는 다른 자동 색인이 실행 중이면 건너뛴다.
    let busy_state = app.state::<IndexingBusyState>();
    if !busy_state.try_acquire() {
        return;
    }
    if app.state::<MediaIndexState>().is_running() {
        busy_state.set(false);
        return;
    }
    let _busy_guard = IndexingBusyGuard(busy_state.inner());

    // 앱 시작 직후 임베딩 서버가 아직 준비되지 않았을 수 있다.
    if !crate::embedding::wait_until_ready(Duration::from_secs(60)) {
        log::warn!("임베딩 서버가 준비되지 않아 자동 색인을 건너뜁니다.");
        return;
    }

    let manifest = match load_manifest(app) {
        Ok(manifest) => manifest,
        Err(_) => return,
    };
    if manifest.roots.is_empty() {
        return;
    }

    // 새 파일/수정/삭제를 manifest에 반영한다.
    let status = match sync_index_manifest(app.clone(), manifest.roots.clone()) {
        Ok(status) => status,
        Err(error) => {
            log::warn!("자동 색인 전 manifest 동기화 실패: {error}");
            return;
        }
    };
    if status.pending_paths.is_empty() {
        return;
    }

    if let Ok(disk_space) = super::get_index_disk_space(app.clone())
        && disk_space.available_bytes < disk_space.minimum_required_bytes
    {
        let error = format!(
            "저장 공간이 부족합니다. {}바이트 이상 여유 공간이 필요합니다.",
            disk_space.minimum_required_bytes
        );
        super::set_last_index_error(app, error.clone());
        let _ = app.emit("index-auto-failed", &error);
        log::warn!("자동 색인을 시작하지 않음: {error}");
        return;
    }

    log::info!("자동 색인 시작: {}개 파일", status.pending_paths.len());
    let use_aligner = app
        .state::<IndexOptionsState>()
        .use_aligner
        .load(Ordering::Relaxed);
    let _ = app.emit("index-auto-started", &status);
    let run_id = format!(
        "auto-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_millis())
            .unwrap_or_default()
    );
    if let Err(error) =
        index_pending_media_sync(app.clone(), status.pending_paths, true, use_aligner, run_id)
    {
        super::set_last_index_error(app, error.clone());
        let _ = app.emit("index-auto-failed", &error);
        log::warn!("자동 색인 실패: {error}");
    } else {
        super::clear_last_index_error(app);
    }
    let _ = app.emit("index-updated", ());
}
