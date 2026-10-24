// src-tauri/src/embedding.rs
// EmbeddingGemma sidecar(llama-server) 프로세스 수명주기와 상태 조회.
use std::fs::OpenOptions;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, State};

use crate::paths::{bundled_resource_path, model_path as resolve_model_path};

pub const EMBEDDING_SERVER_PORT: u16 = 8080;

#[derive(Default)]
pub struct EmbeddingEngineState {
    child: Mutex<Option<Child>>,
    launch_error: Mutex<Option<String>>,
}

#[derive(Debug, serde::Serialize)]
pub struct EmbeddingEngineStatus {
    ready: bool,
    starting: bool,
    message: String,
}

/// 임베딩 서버가 준비될 때까지 기다린다. 자동 색인 시작 전에 사용한다.
pub(crate) fn wait_until_ready(timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if embedding_server_ready() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    false
}

fn embedding_server_ready() -> bool {
    let address = SocketAddr::from(([127, 0, 0, 1], EMBEDDING_SERVER_PORT));
    let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(250)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
    let _ =
        stream.write_all(b"GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n");
    let mut response = String::new();
    let _ = stream.read_to_string(&mut response);
    response.starts_with("HTTP/1.1 200") && response.contains("\"status\":\"ok\"")
}

fn set_embedding_launch_error(state: &EmbeddingEngineState, message: Option<String>) {
    if let Ok(mut error) = state.launch_error.lock() {
        *error = message;
    }
}

pub fn start_embedding_server(app: &AppHandle, state: &EmbeddingEngineState) {
    if embedding_server_ready() {
        set_embedding_launch_error(state, None);
        return;
    }

    if let Ok(mut child_guard) = state.child.lock() {
        if let Some(child) = child_guard.as_mut() {
            match child.try_wait() {
                Ok(None) => return,
                Ok(Some(status)) => {
                    set_embedding_launch_error(
                        state,
                        Some(format!("EmbeddingGemma sidecar가 종료되었습니다: {status}")),
                    );
                    *child_guard = None;
                }
                Err(error) => {
                    set_embedding_launch_error(
                        state,
                        Some(format!("sidecar 상태 확인 실패: {error}")),
                    );
                    *child_guard = None;
                }
            }
        }
    }

    let server_path = bundled_resource_path(app, "bin/llama-server");
    let model_path = resolve_model_path(app, "embeddinggemma-2-Q8_0.gguf")
        .unwrap_or_else(|_| bundled_resource_path(app, "models/embeddinggemma-2-Q8_0.gguf"));
    let mmproj_path = resolve_model_path(app, "mmproj-embeddinggemma-2-Q8_0.gguf")
        .unwrap_or_else(|_| bundled_resource_path(app, "models/mmproj-embeddinggemma-2-Q8_0.gguf"));
    let Some(bin_dir) = server_path.parent() else {
        set_embedding_launch_error(
            state,
            Some("sidecar 실행 디렉터리를 찾을 수 없습니다.".into()),
        );
        return;
    };

    for (label, path) in [
        ("llama-server", &server_path),
        ("EmbeddingGemma 모델", &model_path),
        ("멀티모달 mmproj", &mmproj_path),
    ] {
        if !path.is_file() {
            set_embedding_launch_error(
                state,
                Some(format!("{label} 리소스가 없습니다: {}", path.display())),
            );
            return;
        }
    }

    let log_dir = app
        .path()
        .app_log_dir()
        .or_else(|_| app.path().app_data_dir())
        .unwrap_or_else(|_| std::env::temp_dir().join("nookive"));
    if let Err(error) = std::fs::create_dir_all(&log_dir) {
        set_embedding_launch_error(
            state,
            Some(format!("sidecar 로그 디렉터리 생성 실패: {error}")),
        );
        return;
    }
    let log_path = log_dir.join("embedding-sidecar.log");
    let Ok(stdout) = OpenOptions::new().create(true).append(true).open(&log_path) else {
        set_embedding_launch_error(
            state,
            Some(format!(
                "sidecar 로그 파일을 열 수 없습니다: {}",
                log_path.display()
            )),
        );
        return;
    };
    let Ok(stderr) = stdout.try_clone() else {
        set_embedding_launch_error(
            state,
            Some("sidecar 로그 스트림을 복제할 수 없습니다.".into()),
        );
        return;
    };

    let child = Command::new(&server_path)
        .args([
            "-m",
            model_path.to_string_lossy().as_ref(),
            "--mmproj",
            mmproj_path.to_string_lossy().as_ref(),
            "-c",
            "2048",
            "-ub",
            "1024",
            "-b",
            "1024",
            "-np",
            "1",
            "--port",
            "8080",
            "--embedding",
            "--host",
            "127.0.0.1",
            "--no-ui",
            "--gpu-layers",
            "all",
        ])
        .current_dir(bin_dir)
        .env("DYLD_LIBRARY_PATH", bin_dir)
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr))
        .spawn();

    match child {
        Ok(child) => {
            if let Ok(mut child_guard) = state.child.lock() {
                *child_guard = Some(child);
            }
            set_embedding_launch_error(state, None);
            log::info!(
                "EmbeddingGemma sidecar 자동 시작: {}",
                server_path.display()
            );
        }
        Err(error) => {
            set_embedding_launch_error(
                state,
                Some(format!("EmbeddingGemma sidecar 시작 실패: {error}")),
            );
        }
    }
}

pub fn stop_embedding_server(state: &EmbeddingEngineState) {
    if let Ok(mut child_guard) = state.child.lock() {
        if let Some(mut child) = child_guard.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

fn embedding_status(state: &EmbeddingEngineState) -> EmbeddingEngineStatus {
    if embedding_server_ready() {
        return EmbeddingEngineStatus {
            ready: true,
            starting: false,
            message: "EmbeddingGemma 준비 완료".into(),
        };
    }

    let starting = state
        .child
        .lock()
        .ok()
        .and_then(|mut child| {
            child
                .as_mut()
                .map(|process| matches!(process.try_wait(), Ok(None)))
        })
        .unwrap_or(false);
    let message = state
        .launch_error
        .lock()
        .ok()
        .and_then(|error| error.clone())
        .unwrap_or_else(|| "EmbeddingGemma 응답을 기다리는 중입니다.".into());
    EmbeddingEngineStatus {
        ready: false,
        starting,
        message,
    }
}

#[tauri::command]
pub fn get_embedding_status(state: State<'_, EmbeddingEngineState>) -> EmbeddingEngineStatus {
    embedding_status(state.inner())
}

#[tauri::command]
pub async fn wait_for_embedding_server(
    app: AppHandle,
    timeout_ms: Option<u64>,
) -> EmbeddingEngineStatus {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<EmbeddingEngineState>();
        let timeout = Duration::from_millis(timeout_ms.unwrap_or(120_000).clamp(1_000, 300_000));
        let deadline = Instant::now() + timeout;
        start_embedding_server(&app, state.inner());
        while Instant::now() < deadline {
            let status = embedding_status(state.inner());
            if status.ready || !status.starting {
                return status;
            }
            std::thread::sleep(Duration::from_millis(250));
        }
        embedding_status(state.inner())
    })
    .await
    .unwrap_or_else(|error| EmbeddingEngineStatus {
        ready: false,
        starting: false,
        message: format!("EmbeddingGemma 준비 대기 실패: {error}"),
    })
}
