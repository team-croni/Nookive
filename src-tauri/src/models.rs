use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::Duration;

use reqwest::blocking::Client;
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};

fn cancel_flag() -> &'static AtomicBool {
    static FLAG: OnceLock<AtomicBool> = OnceLock::new();
    FLAG.get_or_init(|| AtomicBool::new(false))
}

fn pause_flag() -> &'static AtomicBool {
    static FLAG: OnceLock<AtomicBool> = OnceLock::new();
    FLAG.get_or_init(|| AtomicBool::new(false))
}

#[tauri::command]
pub fn cancel_model_download() {
    cancel_flag().store(true, Ordering::Relaxed);
}

#[tauri::command]
pub fn pause_model_download(app: AppHandle) {
    pause_flag().store(true, Ordering::Relaxed);
    crate::window::set_tray_download_paused(true);
    let _ = app.emit("model-download-state", "paused");
}

#[tauri::command]
pub fn resume_model_download(app: AppHandle) {
    pause_flag().store(false, Ordering::Relaxed);
    crate::window::set_tray_download_paused(false);
    let _ = app.emit("model-download-state", "running");
}

/// 사용자가 설치를 중단했을 때 다운로드된 모델과 임시 파일을 모두 제거한다.
/// 다운로드 잠금을 기다린 뒤 삭제하므로 백그라운드 다운로드와 경합하지 않는다.
#[tauri::command]
pub async fn reset_model_download(app: AppHandle) -> Result<(), String> {
    cancel_flag().store(true, Ordering::Relaxed);
    pause_flag().store(false, Ordering::Relaxed);
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = download_lock()
            .lock()
            .map_err(|_| "모델 다운로드 잠금을 획득하지 못했습니다.".to_string())?;
        let files = EMBEDDING_FILES.iter().chain(SPEECH_FILES.iter());
        for file in files {
            let target = file_path(&app, *file)?;
            let partial = PathBuf::from(format!("{}.part", target.display()));
            let marker = marker_path(&target);
            for path in [target, partial, marker] {
                if path.exists() {
                    fs::remove_file(&path)
                        .map_err(|error| format!("모델 파일 삭제 실패: {error}"))?;
                }
            }
        }
        let _ = app.emit("model-download-state", "cancelled");
        Ok(())
    })
    .await
    .map_err(|error| format!("모델 초기화 작업 실패: {error}"))?
}

#[derive(Debug, Serialize)]
pub struct ApplicationSearchResult {
    pub id: String,
    pub file: ApplicationFile,
    #[serde(rename = "similarityScore")]
    pub similarity_score: f64,
    #[serde(rename = "bestChunk")]
    pub best_chunk: ApplicationChunk,
    pub category: &'static str,
}

#[derive(Debug, Serialize)]
pub struct ApplicationFile {
    pub path: String,
    pub name: String,
    pub extension: &'static str,
    pub kind: &'static str,
    #[serde(rename = "bundleId", skip_serializing_if = "Option::is_none")]
    pub bundle_id: Option<String>,
    #[serde(rename = "sizeBytes")]
    pub size_bytes: u64,
    #[serde(rename = "modifiedAt")]
    pub modified_at: String,
}

#[derive(Debug, Serialize)]
pub struct ApplicationChunk {
    #[serde(rename = "chunkIndex")]
    pub chunk_index: u32,
    #[serde(rename = "textSnippet")]
    pub text_snippet: String,
}

#[derive(Debug, Serialize)]
pub struct FolderSearchResult {
    pub id: String,
    pub file: FolderFile,
    #[serde(rename = "similarityScore")]
    pub similarity_score: f64,
    #[serde(rename = "bestChunk")]
    pub best_chunk: ApplicationChunk,
    pub category: &'static str,
}

#[derive(Debug, Serialize)]
pub struct FolderFile {
    pub path: String,
    pub name: String,
    pub extension: &'static str,
    pub kind: &'static str,
    #[serde(rename = "sizeBytes")]
    pub size_bytes: u64,
    #[serde(rename = "modifiedAt")]
    pub modified_at: String,
}

#[derive(Clone, Copy)]
struct DownloadFile {
    relative: &'static str,
    url: &'static str,
    size: u64,
    sha256: &'static str,
}

const EMBEDDING_FILES: &[DownloadFile] = &[
    DownloadFile {
        relative: "embeddinggemma-2-Q8_0.gguf",
        url: "https://huggingface.co/ggml-org/embeddinggemma-2-GGUF/resolve/main/embeddinggemma-2-Q8_0.gguf",
        size: 309_855_456,
        sha256: "2188ac1deca4b77dffefd603c2776a9d76d9d74ec01841392982ebb840b09135",
    },
    DownloadFile {
        relative: "mmproj-embeddinggemma-2-Q8_0.gguf",
        url: "https://huggingface.co/ggml-org/embeddinggemma-2-GGUF/resolve/main/mmproj-embeddinggemma-2-Q8_0.gguf",
        size: 554_821_024,
        sha256: "c4a8a52691ecef40618438928bdf9e68379b854e24166f292592353db0aab64f",
    },
];

const SPEECH_FILES: &[DownloadFile] = &[
    DownloadFile {
        relative: "asr/Qwen3-ASR-0.6B-Q8_0.gguf",
        url: "https://huggingface.co/ggml-org/Qwen3-ASR-0.6B-GGUF/resolve/main/Qwen3-ASR-0.6B-Q8_0.gguf?download=true",
        size: 804_749_248,
        sha256: "bca259818b50ca7c4c05e9bdb35a5dc04fa039653a6d6f3f0f331f96f6aa1971",
    },
    DownloadFile {
        relative: "asr/mmproj-Qwen3-ASR-0.6B-Q8_0.gguf",
        url: "https://huggingface.co/ggml-org/Qwen3-ASR-0.6B-GGUF/resolve/main/mmproj-Qwen3-ASR-0.6B-Q8_0.gguf?download=true",
        size: 214_392_480,
        sha256: "41a342b5e4c514e968cb756de6cd1b7be39eff43c44c57a2ef5fc6522e36603d",
    },
    DownloadFile {
        relative: "asr/qwen3-forced-aligner-0.6b-q8_0.gguf",
        url: "https://huggingface.co/OpenVoiceOS/qwen3-forced-aligner-0.6b-q8-0/resolve/main/qwen3-forced-aligner-0.6b-q8_0.gguf?download=true",
        size: 994_404_608,
        sha256: "5de69a8cfc49c95a6520f50f2f15cfce9af35bc4723a10c56fc64e51dc966b3a",
    },
    DownloadFile {
        relative: "asr/assets/korean_dict_jieba.dict",
        url: "https://raw.githubusercontent.com/femelo/qwen3-asr.cpp/73295783e5c588139f0f15a17a18e8c7c161fc5f/assets/korean_dict_jieba.dict",
        size: 275_834,
        sha256: "cc157a9ab78f92bf11ed98a69b285768d6627cf5cd57a581e6c06693effce37d",
    },
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ModelBundleStatus {
    pub embedding_ready: bool,
    pub speech_ready: bool,
    pub embedding_bytes: u64,
    pub embedding_total: u64,
    pub speech_bytes: u64,
    pub speech_total: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ModelDownloadProgress {
    pub kind: String,
    pub file: String,
    pub completed: u64,
    pub total: u64,
    pub overall_completed: u64,
    pub overall_total: u64,
}

fn download_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

fn model_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("models"))
        .map_err(|error| format!("모델 저장 경로를 확인하지 못했습니다: {error}"))
}

fn file_path(app: &AppHandle, file: DownloadFile) -> Result<PathBuf, String> {
    Ok(model_root(app)?.join(file.relative))
}

fn marker_path(path: &Path) -> PathBuf {
    PathBuf::from(format!("{}.sha256", path.display()))
}

fn bundled_or_development_file(app: &AppHandle, file: DownloadFile) -> Result<PathBuf, String> {
    let installed = file_path(app, file)?;
    if installed.is_file() {
        return Ok(installed);
    }
    let source = crate::paths::bundled_resource_path(app, &format!("models/{}", file.relative));
    Ok(source)
}

fn file_ready(app: &AppHandle, file: DownloadFile) -> bool {
    let Ok(path) = bundled_or_development_file(app, file) else {
        return false;
    };
    let Ok(metadata) = fs::metadata(&path) else {
        return false;
    };
    if metadata.len() != file.size {
        return false;
    }

    // Source-tree models are accepted for development. Installed models must
    // have the marker written only after SHA-256 verification succeeds.
    if marker_path(&path).is_file() {
        return fs::read_to_string(marker_path(&path))
            .map(|value| value.trim() == file.sha256)
            .unwrap_or(false);
    }
    cfg!(debug_assertions)
}

fn bundle_ready(app: &AppHandle, files: &[DownloadFile]) -> bool {
    files.iter().all(|file| file_ready(app, *file))
}

fn bundle_bytes(app: &AppHandle, files: &[DownloadFile]) -> u64 {
    files
        .iter()
        .filter_map(|file| bundled_or_development_file(app, *file).ok())
        .filter_map(|path| fs::metadata(path).ok())
        .map(|metadata| metadata.len())
        .sum()
}

pub fn speech_ready(app: &AppHandle) -> bool {
    bundle_ready(app, SPEECH_FILES)
}

fn status(app: &AppHandle) -> ModelBundleStatus {
    ModelBundleStatus {
        embedding_ready: bundle_ready(app, EMBEDDING_FILES),
        speech_ready: bundle_ready(app, SPEECH_FILES),
        embedding_bytes: bundle_bytes(app, EMBEDDING_FILES),
        embedding_total: EMBEDDING_FILES.iter().map(|file| file.size).sum(),
        speech_bytes: bundle_bytes(app, SPEECH_FILES),
        speech_total: SPEECH_FILES.iter().map(|file| file.size).sum(),
    }
}

/// 설치가 끝난 뒤 사용자가 모델 파일을 직접 삭제하거나 손상시킨 경우를
/// 다음 UI 갱신까지 기다리지 않고 감지한다. 검색 서버가 이미 실행 중이어도
/// 모델 파일의 현재 상태를 기준으로 설치 필요 상태를 복원한다.
pub fn start_model_watcher(app: AppHandle) {
    thread::spawn(move || {
        let mut previous = status(&app);
        loop {
            thread::sleep(Duration::from_secs(5));
            let current = status(&app);
            if current == previous {
                continue;
            }

            let _ = app.emit("model-status-changed", &current);
            let was_ready = previous.embedding_ready && previous.speech_ready;
            let is_ready = current.embedding_ready && current.speech_ready;
            if was_ready && !is_ready {
                log::warn!("설치된 모델이 누락되거나 손상되었습니다. 재설치를 요청합니다.");
                if !current.embedding_ready {
                    let state = app.state::<crate::embedding::EmbeddingEngineState>();
                    crate::embedding::stop_embedding_server(state.inner());
                }
                let _ = crate::window::set_tray_install_required(app.clone(), "ko".to_string());
                crate::window::show_installer_window(&app);
            } else if is_ready {
                let _ = crate::window::restore_tray_menu(app.clone(), "ko".to_string());
            }
            previous = current;
        }
    });
}

fn sha256_file(path: &PathBuf) -> Result<String, String> {
    let mut file = File::open(path).map_err(|error| format!("파일 검증 실패: {error}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 1024 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("파일 해시 계산 실패: {error}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn download_file(
    app: &AppHandle,
    client: &Client,
    kind: &str,
    file: DownloadFile,
    overall_completed: &mut u64,
    overall_total: u64,
) -> Result<(), String> {
    let target = file_path(app, file)?;
    if file_ready(app, file) {
        *overall_completed += file.size;
        return Ok(());
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("모델 폴더 생성 실패: {error}"))?;
    }

    let partial = PathBuf::from(format!("{}.part", target.display()));
    let existing = fs::metadata(&partial)
        .map(|metadata| metadata.len())
        .unwrap_or(0);
    let mut completed = existing;
    let mut buffer = [0_u8; 1024 * 1024];
    loop {
        while pause_flag().load(Ordering::Relaxed) {
            if cancel_flag().load(Ordering::Relaxed) {
                return Err("다운로드가 취소되었습니다.".to_string());
            }
            thread::sleep(Duration::from_millis(100));
        }
        if cancel_flag().load(Ordering::Relaxed) {
            return Err("다운로드가 취소되었습니다.".to_string());
        }
        let mut request = client.get(file.url);
        if completed > 0 && completed < file.size {
            request = request.header(reqwest::header::RANGE, format!("bytes={completed}-"));
        }
        let mut response = request
            .send()
            .map_err(|error| format!("모델 다운로드 실패: {error}"))?;
        if !response.status().is_success() {
            return Err(format!(
                "모델 다운로드 서버 응답 오류: {}",
                response.status()
            ));
        }
        let append = completed > 0 && response.status() == reqwest::StatusCode::PARTIAL_CONTENT;
        if !append {
            completed = 0;
        }
        let mut output = if append {
            OpenOptions::new()
                .append(true)
                .open(&partial)
                .map_err(|error| format!("임시 모델 파일 열기 실패: {error}"))?
        } else {
            File::create(&partial).map_err(|error| format!("임시 모델 파일 생성 실패: {error}"))?
        };
        let _ = app.emit(
            "model-download-progress",
            ModelDownloadProgress {
                kind: kind.to_string(),
                file: file.relative.to_string(),
                completed,
                total: file.size,
                overall_completed: *overall_completed + completed,
                overall_total,
            },
        );
        let mut paused_during_download = false;
        loop {
            if cancel_flag().load(Ordering::Relaxed) {
                let _ = output.flush();
                return Err("다운로드가 취소되었습니다.".to_string());
            }
            if pause_flag().load(Ordering::Relaxed) {
                let _ = output.flush();
                paused_during_download = true;
                break;
            }
            let read = response
                .read(&mut buffer)
                .map_err(|error| format!("모델 다운로드 읽기 실패: {error}"))?;
            if read == 0 {
                break;
            }
            output
                .write_all(&buffer[..read])
                .map_err(|error| format!("모델 저장 실패: {error}"))?;
            completed += read as u64;
            let _ = app.emit(
                "model-download-progress",
                ModelDownloadProgress {
                    kind: kind.to_string(),
                    file: file.relative.to_string(),
                    completed,
                    total: file.size,
                    overall_completed: *overall_completed + completed,
                    overall_total,
                },
            );
        }
        output
            .flush()
            .map_err(|error| format!("모델 저장 마무리 실패: {error}"))?;
        if completed == file.size {
            break;
        }
        if paused_during_download {
            continue;
        }
        return Err(format!(
            "다운로드 크기가 예상과 다릅니다: {}",
            file.relative
        ));
    }
    let actual = sha256_file(&partial)?;
    if actual != file.sha256 {
        let _ = fs::remove_file(&partial);
        return Err(format!("모델 무결성 검증 실패: {}", file.relative));
    }
    fs::rename(&partial, &target).map_err(|error| format!("모델 파일 교체 실패: {error}"))?;
    fs::write(marker_path(&target), file.sha256)
        .map_err(|error| format!("모델 검증 기록 저장 실패: {error}"))?;
    *overall_completed += file.size;
    Ok(())
}

fn download_bundle_sync(app: &AppHandle, kind: &str) -> Result<ModelBundleStatus, String> {
    cancel_flag().store(false, Ordering::Relaxed);
    pause_flag().store(false, Ordering::Relaxed);
    let all_files: Vec<DownloadFile>;
    let files = match kind {
        "embedding" => EMBEDDING_FILES,
        "speech" => SPEECH_FILES,
        "all" => {
            all_files = EMBEDDING_FILES
                .iter()
                .chain(SPEECH_FILES.iter())
                .copied()
                .collect();
            &all_files[..]
        }
        _ => return Err("알 수 없는 모델 종류입니다.".to_string()),
    };
    let _guard = download_lock()
        .lock()
        .map_err(|_| "모델 다운로드 잠금을 획득하지 못했습니다.".to_string())?;
    let client = Client::builder()
        .user_agent("Nookive/0.1.0 model installer")
        .build()
        .map_err(|error| format!("모델 다운로드 클라이언트 생성 실패: {error}"))?;
    let overall_total: u64 = files.iter().map(|file| file.size).sum();
    let mut overall_completed = 0;
    for file in files {
        if cancel_flag().load(Ordering::Relaxed) {
            return Err("다운로드가 취소되었습니다.".to_string());
        }
        download_file(
            app,
            &client,
            kind,
            *file,
            &mut overall_completed,
            overall_total,
        )?;
    }
    Ok(status(app))
}

#[tauri::command]
pub fn get_model_status(app: AppHandle) -> ModelBundleStatus {
    status(&app)
}

#[tauri::command]
pub async fn download_model_bundle(
    app: AppHandle,
    kind: String,
) -> Result<ModelBundleStatus, String> {
    let app_handle = app.clone();
    let kind_clone = kind.clone();
    let status = tauri::async_runtime::spawn_blocking(move || {
        download_bundle_sync(&app_handle, &kind_clone)
    })
    .await
    .map_err(|error| format!("모델 다운로드 작업 실패: {error}"))??;

    if (kind == "embedding" || kind == "all") && status.embedding_ready {
        let embedding_state = app.state::<crate::embedding::EmbeddingEngineState>();
        crate::embedding::start_embedding_server(&app, embedding_state.inner());
    }

    Ok(status)
}
