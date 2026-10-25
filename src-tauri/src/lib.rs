// src-tauri/src/lib.rs
// 앱 진입점: 모듈 구성, Tauri 빌더 설정, 커맨드 등록.
mod applications;
mod embedding;
mod files;
mod folders;
mod index;
#[cfg(target_os = "macos")]
mod mask_png;
mod models;
mod paths;
#[cfg(target_os = "macos")]
mod vibrancy;
mod web;
mod window;

use tauri::{LogicalSize, Manager, RunEvent, Size};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

use embedding::{EmbeddingEngineState, start_embedding_server, stop_embedding_server};
use index::{IndexOptionsState, IndexWatcherState, IndexingBusyState, MediaIndexState};
use window::{
    MAIN_WINDOW_COMPACT_HEIGHT, MAIN_WINDOW_WIDTH, apply_search_window_effect,
    center_search_window, setup_tray, toggle_search_window,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .manage(EmbeddingEngineState::default())
        .manage(MediaIndexState::default())
        .manage(IndexWatcherState::default())
        .manage(IndexOptionsState::default())
        .manage(IndexingBusyState::default())
        .manage(index::IndexErrorState::default())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Nookive is a menu-bar utility rather than a regular Dock app.
            // Accessory keeps the tray icon and its windows available while
            // removing the app from the Dock and Cmd-Tab application switcher.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            setup_tray(app)?;
            let model_status = models::get_model_status(app.handle().clone());
            if !model_status.embedding_ready {
                // A model-less DMG opens the setup window once so installation
                // can happen in-app without asking the user to use a terminal.
                window::show_installer_window(app.handle());
                window::set_tray_install_required(app.handle().clone(), "ko".to_string())?;
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_size(Size::Logical(LogicalSize::new(
                    MAIN_WINDOW_WIDTH,
                    MAIN_WINDOW_COMPACT_HEIGHT,
                )));
                center_search_window(&window);
                let _ = apply_search_window_effect(&window);
                let _ = window.set_shadow(true);
                let _ = window.set_always_on_top(true);
                if model_status.embedding_ready {
                    window::show_main_window(app.handle());
                }
            }
            let embedding_state = app.state::<EmbeddingEngineState>();
            start_embedding_server(app.handle(), embedding_state.inner());
            models::start_model_watcher(app.handle().clone());
            // 등록된 검색 폴더를 감시해 변경 시 자동으로 색인한다.
            index::watcher::start_index_watcher(app.handle().clone());
            let _ = app
                .global_shortcut()
                .on_shortcut("Alt+Space", |app, _, event| {
                    if event.state == ShortcutState::Pressed {
                        toggle_search_window(app);
                    }
                });

            Ok(())
        })
        // 🍎 Spotlight / Raycast 핵심: 창 바깥을 클릭하여 포커스를 잃으면 즉시 창 숨김
        .on_window_event(|window, event| {
            if window.label() == "main" && matches!(event, tauri::WindowEvent::Focused(false)) {
                let _ = window.hide();
            }
            if window.label() == "settings"
                && matches!(
                    event,
                    tauri::WindowEvent::CloseRequested { .. } | tauri::WindowEvent::Destroyed
                )
            {
                models::cancel_model_download();
            }
        })
        .invoke_handler(tauri::generate_handler![
            files::open_file,
            files::reveal_file,
            files::read_file_bytes,
            files::check_file_access,
            files::render_pdf_page_native,
            web::google_suggest,
            web::open_url,
            window::hide_window,
            window::hide_settings_window,
            window::hide_installer_window,
            window::show_search_window,
            window::resize_main_window,
            window::set_search_shortcut,
            window::set_tray_language,
            window::set_tray_installing,
            window::set_tray_install_required,
            window::restore_tray_menu,
            applications::list_applications,
            applications::get_application_icon,
            folders::list_indexed_folders,
            folders::get_folder_icon,
            embedding::get_embedding_status,
            embedding::wait_for_embedding_server,
            index::sync_index_manifest,
            index::sync_saved_index_manifest,
            index::get_index_status,
            index::get_index_error,
            index::clear_index_error,
            index::load_runtime_index,
            index::upsert_runtime_index,
            index::mark_index_files_ready,
            index::reset_index,
            index::index_pending_media,
            index::cancel_media_indexing,
            index::set_index_options,
            index::set_indexing_busy,
            index::get_index_disk_space,
            index::delete_app_data,
            models::get_model_status,
            models::download_model_bundle,
            models::cancel_model_download,
            models::pause_model_download,
            models::resume_model_download,
            models::reset_model_download,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if matches!(event, RunEvent::Exit) {
            models::cancel_model_download();
            stop_embedding_server(app_handle.state::<EmbeddingEngineState>().inner());
        }
    });
}
