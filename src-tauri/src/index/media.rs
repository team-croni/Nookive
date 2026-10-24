// src-tauri/src/index/media.rs
// 멀티모달 Node 인덱서 브리지 및 폴더 선택기.
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::io::{BufRead, BufReader, Read};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

use super::manifest::{IndexSyncStatus, get_index_status, load_manifest, save_manifest};
use super::runtime::{load_runtime_records, save_runtime_records};
use crate::paths::{bundled_resource_path, model_path, resolve_home};

#[derive(Debug, Serialize)]
pub struct BatchIndexResult {
    status: IndexSyncStatus,
    indexed_files: usize,
    records: usize,
}

/// 현재 실행 중인 미디어 인덱서(Node) PID. 중지 버튼이 이 프로세스를 종료한다.
#[derive(Default)]
pub struct MediaIndexState {
    pid: Mutex<Option<u32>>,
}

impl MediaIndexState {
    /// 현재 미디어 인덱서가 실행 중인지 확인한다. (자동 색인 중복 방지)
    pub fn is_running(&self) -> bool {
        self.pid.lock().map(|pid| pid.is_some()).unwrap_or(false)
    }
}

struct PidGuard<'a> {
    state: &'a MediaIndexState,
}

impl Drop for PidGuard<'_> {
    fn drop(&mut self) {
        if let Ok(mut pid) = self.state.pid.lock() {
            *pid = None;
        }
    }
}

/// 실행 중인 미디어 인덱서를 중지한다. (중지할 작업이 없으면 성공으로 처리)
pub(crate) fn cancel_media_indexing(state: tauri::State<MediaIndexState>) -> Result<(), String> {
    let pid = state
        .pid
        .lock()
        .map_err(|_| "인덱서 상태를 확인하지 못했습니다.".to_string())?
        .take();
    if let Some(pid) = pid {
        let status = Command::new("/bin/kill")
            .arg("-TERM")
            .arg(pid.to_string())
            .status()
            .map_err(|error| format!("인덱서 중지 실패: {error}"))?;
        if !status.success() {
            return Err("인덱서 프로세스를 중지하지 못했습니다.".to_string());
        }
    }
    Ok(())
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct MediaIndexProgress {
    #[serde(rename = "runId")]
    #[serde(default)]
    run_id: String,
    completed: usize,
    total: usize,
    path: String,
    indexed: bool,
}

/// ASR 서버가 함수 종료 시 함께 정리되도록 보장한다.
/// (이미 실행 중이던 서버는 `None`이라 건드리지 않는다)
struct AsrChildGuard(Option<Child>);

impl Drop for AsrChildGuard {
    fn drop(&mut self) {
        if let Some(mut child) = self.0.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

fn is_asr_ready() -> bool {
    let addr: SocketAddr = match "127.0.0.1:8081".parse() {
        Ok(addr) => addr,
        Err(_) => return false,
    };
    TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok()
}

/// Qwen3-ASR 사이드카를 필요할 때만 기동한다.
/// 이미 8081 포트에 서버가 있으면 그대로 사용하고 `None`을 반환한다.
fn start_asr_server(app: &AppHandle) -> Result<Option<Child>, String> {
    if is_asr_ready() {
        return Ok(None);
    }

    let bin = bundled_resource_path(app, "bin/llama-server");
    let model = model_path(app, "asr/Qwen3-ASR-0.6B-Q8_0.gguf")?;
    let mmproj = model_path(app, "asr/mmproj-Qwen3-ASR-0.6B-Q8_0.gguf")?;

    if !bin.is_file() {
        return Err(format!(
            "ASR 실행 파일을 찾을 수 없습니다: {}",
            bin.display()
        ));
    }
    if !model.is_file() || !mmproj.is_file() {
        return Err("음성 검색 구성 요소를 찾을 수 없습니다. 앱을 다시 설치해 주세요.".to_string());
    }

    let bin_dir = bin.parent().unwrap_or(Path::new("."));
    let log_dir = app
        .path()
        .app_log_dir()
        .or_else(|_| app.path().app_data_dir())
        .unwrap_or_else(|_| std::env::temp_dir().join("nookive"));
    std::fs::create_dir_all(&log_dir)
        .map_err(|error| format!("ASR 로그 디렉터리 생성 실패: {error}"))?;
    let log_path = log_dir.join("asr-sidecar.log");
    let stdout = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|error| format!("ASR 로그 파일 열기 실패: {error}"))?;
    let stderr = stdout
        .try_clone()
        .map_err(|error| format!("ASR 로그 스트림 복제 실패: {error}"))?;

    let mut child = Command::new(&bin)
        .arg("-m")
        .arg(&model)
        .arg("--mmproj")
        .arg(&mmproj)
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg("8081")
        .arg("-c")
        .arg("2048")
        .arg("-np")
        .arg("1")
        .env("DYLD_LIBRARY_PATH", bin_dir)
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr))
        .spawn()
        .map_err(|error| format!("ASR 서버 실행 실패: {error}"))?;

    let deadline = Instant::now() + Duration::from_secs(60);
    while Instant::now() < deadline {
        if is_asr_ready() {
            return Ok(Some(child));
        }
        if let Ok(Some(status)) = child.try_wait() {
            return Err(format!("ASR 서버가 준비 중 종료되었습니다: {status}"));
        }
        std::thread::sleep(Duration::from_millis(300));
    }

    let _ = child.kill();
    let _ = child.wait();
    Err("ASR 서버가 60초 안에 준비되지 않았습니다.".to_string())
}

/// 기존 멀티모달 Node 인덱서를 선택된 pending 파일에 한정해 실행한다.
/// 설정 창의 증분 큐와 일괄 인덱서의 이미지/오디오/비디오 처리 경로를 연결하는 브리지다.
pub(crate) async fn index_pending_media(
    app: AppHandle,
    paths: Vec<String>,
    use_asr: bool,
    use_aligner: bool,
    run_id: String,
) -> Result<BatchIndexResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        index_pending_media_sync(app, paths, use_asr, use_aligner, run_id)
    })
    .await
    .map_err(|error| format!("멀티모달 인덱서 작업 실패: {error}"))?
}

pub(crate) fn index_pending_media_sync(
    app: AppHandle,
    paths: Vec<String>,
    use_asr: bool,
    use_aligner: bool,
    run_id: String,
) -> Result<BatchIndexResult, String> {
    if paths.is_empty() {
        return Ok(BatchIndexResult {
            status: get_index_status(app)?,
            indexed_files: 0,
            records: 0,
        });
    }

    let script = bundled_resource_path(&app, "scripts/index-folder.mjs");
    if !script.is_file() {
        return Err(format!(
            "멀티모달 인덱서 스크립트를 찾을 수 없습니다: {}",
            script.display()
        ));
    }

    let node = {
        let bundled = bundled_resource_path(&app, "bin/node");
        if bundled.is_file() {
            bundled
        } else {
            PathBuf::from("node")
        }
    };

    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("앱 데이터 디렉터리 확인 실패: {e}"))?;
    std::fs::create_dir_all(&app_data).map_err(|e| format!("앱 데이터 디렉터리 생성 실패: {e}"))?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let output_path = app_data.join(format!("media-index-{stamp}.json"));
    let resolved_paths: Vec<String> = paths.iter().map(|path| resolve_home(path)).collect();

    let model_dir = app
        .path()
        .app_data_dir()
        .map(|path| path.join("models"))
        .unwrap_or_else(|_| PathBuf::from("models"));

    // STT를 켠 경우에만 ASR 서버를 기동한다. 함수가 끝나면 guard가 자동 종료한다.
    // Speech models are optional. Without them, audio/video still receive
    // multimodal embeddings; transcription is simply skipped until the user
    // installs the optional speech bundle from Settings.
    let speech_available = crate::models::speech_ready(&app);
    let (asr_enabled, asr_child) = if use_asr && (speech_available || is_asr_ready()) {
        if speech_available {
            match start_asr_server(&app) {
                Ok(child) => (true, child),
                Err(error) => {
                    // 음성 전사는 선택 기능이다. ASR을 시작하지 못해도 이미지·PDF·
                    // 오디오 임베딩 색인은 계속 진행하고, 상세 원인은 로그에 남긴다.
                    log::warn!(
                        "ASR 서버를 시작하지 못해 전사 없이 미디어 색인을 계속합니다: {error}"
                    );
                    (false, None)
                }
            }
        } else {
            (true, None)
        }
    } else {
        (false, None)
    };
    let _asr_guard = AsrChildGuard(asr_child);

    let mut command = Command::new(&node);
    command
        .arg(&script)
        .args(&resolved_paths)
        .env("NOOKIVE_INDEX_OUTPUT", &output_path)
        .env(
            "NODE_PATH",
            script
                .parent()
                .unwrap_or(Path::new("."))
                .join("../node_modules"),
        )
        .env("NOOKIVE_MODEL_DIR", &model_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if asr_enabled {
        command.env("NOOKIVE_ASR_URL", "http://127.0.0.1:8081");
    }
    command.env(
        "NOOKIVE_ALIGNER",
        if asr_enabled && use_aligner { "1" } else { "0" },
    );
    let mut child = command.spawn().map_err(|e| {
        format!("멀티모달 인덱서 실행 실패: {e}. 앱 리소스가 손상되지 않았는지 확인해 주세요.")
    })?;

    // 중지 버튼이 이 PID를 종료할 수 있도록 상태에 기록한다.
    let media_state = app.state::<MediaIndexState>();
    if let Ok(mut pid) = media_state.pid.lock() {
        *pid = Some(child.id());
    }
    let _pid_guard = PidGuard {
        state: media_state.inner(),
    };
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "멀티모달 인덱서 stdout을 열 수 없습니다.".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "멀티모달 인덱서 stderr를 열 수 없습니다.".to_string())?;
    let stderr_reader = std::thread::spawn(move || {
        let mut output = String::new();
        let mut reader = BufReader::new(stderr);
        let _ = reader.read_to_string(&mut output);
        output
    });
    let mut stdout_output = String::new();
    for line in BufReader::new(stdout).lines() {
        let line = line.map_err(|e| format!("멀티모달 인덱서 출력 읽기 실패: {e}"))?;
        if let Some(payload) = line.strip_prefix("NOOKIVE_PROGRESS:") {
            if let Ok(mut progress) = serde_json::from_str::<MediaIndexProgress>(payload) {
                progress.run_id = run_id.clone();
                let _ = app.emit("index-progress", progress);
            }
        }
        stdout_output.push_str(&line);
        stdout_output.push('\n');
    }
    let status = child
        .wait()
        .map_err(|e| format!("멀티모달 인덱서 상태 확인 실패: {e}"))?;
    let stderr_output = stderr_reader
        .join()
        .map_err(|_| "멀티모달 인덱서 stderr 수집 실패".to_string())?;
    if !status.success() {
        let stderr = stderr_output;
        let stdout = stdout_output;
        let _ = std::fs::remove_file(&output_path);
        let error = format!(
            "멀티모달 인덱서가 실패했습니다: {}{}",
            stderr.trim(),
            if stderr.trim().is_empty() {
                stdout.trim()
            } else {
                ""
            }
        );
        log::warn!("{error}");
        return Err(error);
    }

    // Node가 예외를 삼키거나 결과 저장 전에 종료되더라도, 성공으로
    // 처리하지 않고 stdout/stderr를 포함해 원인을 보존한다.
    if !output_path.is_file() {
        let error = format!(
            "멀티모달 인덱서 결과 파일이 생성되지 않았습니다. stderr: {} stdout: {}",
            stderr_output.trim(),
            stdout_output.trim()
        );
        log::warn!("{error}");
        return Err(error);
    }

    let bytes =
        std::fs::read(&output_path).map_err(|e| format!("멀티모달 인덱스 결과 읽기 실패: {e}"))?;
    let _ = std::fs::remove_file(&output_path);
    let records: Vec<serde_json::Value> = serde_json::from_slice(&bytes)
        .map_err(|e| format!("멀티모달 인덱스 결과 파싱 실패: {e}"))?;
    let ready_paths: HashSet<String> = records
        .iter()
        .filter_map(|record| {
            record
                .get("file")
                .and_then(|file| file.get("path"))
                .and_then(serde_json::Value::as_str)
                .map(ToOwned::to_owned)
        })
        .collect();

    let replace_paths: HashSet<&str> = paths.iter().map(String::as_str).collect();
    let mut runtime_records = load_runtime_records(&app)?;
    runtime_records.retain(|record| {
        record
            .get("file")
            .and_then(|file| file.get("path"))
            .and_then(serde_json::Value::as_str)
            .is_none_or(|path| !replace_paths.contains(path))
    });
    runtime_records.extend(records.iter().cloned());
    save_runtime_records(&app, &runtime_records)?;

    let mut manifest = load_manifest(&app)?;
    for file in &mut manifest.files {
        if ready_paths.contains(&file.path) {
            file.status = "ready".to_string();
        }
    }
    manifest
        .pending_paths
        .retain(|path| !ready_paths.contains(path));
    save_manifest(&app, &manifest)?;
    // PID guard가 app을 빌린 상태이므로, app을 move하기 전에 명시적으로 해제한다.
    drop(_pid_guard);
    let status = get_index_status(app)?;
    Ok(BatchIndexResult {
        status,
        indexed_files: ready_paths.len(),
        records: records.len(),
    })
}
