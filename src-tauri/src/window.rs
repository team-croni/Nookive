// src-tauri/src/window.rs
// 메인/설정 창 표시·배치, 트레이, 전역 단축키 관리.
use crate::models;
use std::sync::{Mutex, OnceLock};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
#[cfg(not(target_os = "macos"))]
use tauri::window::{Effect, EffectState, EffectsBuilder};
use tauri::{
    AppHandle, LogicalSize, Manager, PhysicalPosition, Position, Size, WebviewUrl,
    WebviewWindowBuilder,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

/// 설치 중 트레이 상태 아이템을 저장: set_text로 라벨만 교체해 메뉴가 닫히는 것을 방지한다.
fn installing_status_item() -> &'static Mutex<Option<MenuItem<tauri::Wry>>> {
    static ITEM: OnceLock<Mutex<Option<MenuItem<tauri::Wry>>>> = OnceLock::new();
    ITEM.get_or_init(|| Mutex::new(None))
}

fn installing_pause_item() -> &'static Mutex<Option<MenuItem<tauri::Wry>>> {
    static ITEM: OnceLock<Mutex<Option<MenuItem<tauri::Wry>>>> = OnceLock::new();
    ITEM.get_or_init(|| Mutex::new(None))
}

fn installing_cancel_item() -> &'static Mutex<Option<MenuItem<tauri::Wry>>> {
    static ITEM: OnceLock<Mutex<Option<MenuItem<tauri::Wry>>>> = OnceLock::new();
    ITEM.get_or_init(|| Mutex::new(None))
}

/// 메인 검색 창의 논리 크기. CSS 토큰(`--window-width`, `--window-height`,
/// `--window-compact-height`)과 반드시 동일하게 유지한다.
pub const MAIN_WINDOW_WIDTH: f64 = 780.0;
pub const MAIN_WINDOW_EXPANDED_HEIGHT: f64 = 520.0;
pub const MAIN_WINDOW_COMPACT_HEIGHT: f64 = 60.0;

pub fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        // 창을 다시 표시할 때도 네이티브 floating 레벨을 재확인한다.
        // macOS에서 다른 데스크톱 앱이 활성화된 뒤에는 설정 파일의
        // alwaysOnTop만으로 창 레벨이 복원되지 않는 경우가 있다.
        center_search_window(&window);
        let _ = window.set_always_on_top(true);
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn show_settings_window_with_mode(app: &AppHandle, onboarding: bool) {
    let window_width = if onboarding { 760.0 } else { 688.0 };
    let window_height = if onboarding { 760.0 } else { 648.0 };
    if let Some(window) = app.get_webview_window("settings") {
        // macOS에서는 동적으로 생성한 창의 그림자가 첫 표시 때 누락될 수 있어
        // 표시 직전에 네이티브 그림자 속성을 다시 적용한다.
        let _ = window.set_size(Size::Logical(LogicalSize::new(window_width, window_height)));
        let _ = window.set_shadow(false);
        let _ = window.show();
        let _ = window.set_shadow(false);
        let _ = window.unminimize();
        let _ = window.set_focus();
        return;
    }

    let _ = WebviewWindowBuilder::new(
        app,
        "settings",
        WebviewUrl::App(
            if onboarding {
                "index.html?window=settings&onboarding=true"
            } else {
                "index.html?window=settings"
            }
            .into(),
        ),
    )
    .title("Nookive 설정")
    .inner_size(window_width, window_height)
    .resizable(false)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .visible(false)
    .build()
    .map(|window| {
        // 먼저 숨긴 상태로 네이티브 그림자를 적용한 뒤 표시해야
        // 첫 표시 프레임부터 그림자가 누락되지 않는다.
        let _ = window.set_shadow(false);
        let _ = window.show();
        let _ = window.set_shadow(false);
        let _ = window.set_focus();
    });
}

pub fn show_settings_window(app: &AppHandle) {
    show_settings_window_with_mode(app, false);
}

pub fn show_installer_window(app: &AppHandle) {
    show_settings_window_with_mode(app, true);
}

fn build_tray_menu<M: Manager<tauri::Wry>>(
    app: &M,
    language: &str,
) -> tauri::Result<Menu<tauri::Wry>> {
    let is_korean = language.starts_with("ko");
    let search_item = MenuItem::with_id(
        app,
        "show-search",
        if is_korean {
            "검색 열기"
        } else {
            "Open search"
        },
        true,
        Some("CmdOrCtrl+Shift+Space"),
    )?;
    let settings_item = MenuItem::with_id(
        app,
        "show-settings",
        if is_korean {
            "설정…"
        } else {
            "Settings…"
        },
        true,
        None::<&str>,
    )?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(
        app,
        "quit",
        if is_korean {
            "Nookive 종료"
        } else {
            "Quit Nookive"
        },
        true,
        None::<&str>,
    )?;
    Menu::with_items(app, &[&search_item, &settings_item, &separator, &quit_item])
}

/// 설치 중 트레이 메뉴를 최초 1회 빌드하고, 상태 아이템을 전역에 저장한다.
/// 이후 퍼센트 업데이트는 set_text만 호출해 메뉴 교체 없이 라벨만 바꾼다.
pub fn build_and_store_installing_menu(
    app: &AppHandle,
    language: &str,
    percent: u32,
) -> tauri::Result<Menu<tauri::Wry>> {
    let is_korean = language.starts_with("ko");
    let label = if is_korean {
        format!("설치 중… ({percent}%)")
    } else {
        format!("Installing… ({percent}%)")
    };
    let status_item = MenuItem::with_id(app, "installing-status", &label, false, None::<&str>)?;
    let pause_item = MenuItem::with_id(
        app,
        "installing-pause",
        if is_korean {
            "설치 일시정지"
        } else {
            "Pause installation"
        },
        true,
        None::<&str>,
    )?;
    let cancel_item = MenuItem::with_id(
        app,
        "installing-cancel",
        if is_korean {
            "설치 중단"
        } else {
            "Cancel installation"
        },
        true,
        None::<&str>,
    )?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(
        app,
        "quit",
        if is_korean {
            "Nookive 종료"
        } else {
            "Quit Nookive"
        },
        true,
        None::<&str>,
    )?;
    let menu = Menu::with_items(
        app,
        &[
            &status_item,
            &pause_item,
            &cancel_item,
            &separator,
            &quit_item,
        ],
    )?;
    // 상태 아이템을 저장해두어 이후에는 set_text로만 라벨을 변경한다.
    if let Ok(mut guard) = installing_status_item().lock() {
        *guard = Some(status_item);
    }
    if let Ok(mut guard) = installing_pause_item().lock() {
        *guard = Some(pause_item);
    }
    if let Ok(mut guard) = installing_cancel_item().lock() {
        *guard = Some(cancel_item);
    }
    Ok(menu)
}

/// 모델이 없는 상태의 트레이 메뉴를 표시한다.
pub fn build_install_required_menu(
    app: &AppHandle,
    language: &str,
) -> tauri::Result<Menu<tauri::Wry>> {
    let is_korean = language.starts_with("ko");
    let status_item = MenuItem::with_id(
        app,
        "installation-required",
        if is_korean {
            "설치 필요"
        } else {
            "Installation required"
        },
        false,
        None::<&str>,
    )?;
    let start_item = MenuItem::with_id(
        app,
        "installing-start",
        if is_korean {
            "설치 시작"
        } else {
            "Start installation"
        },
        true,
        None::<&str>,
    )?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(
        app,
        "quit",
        if is_korean {
            "Nookive 종료"
        } else {
            "Quit Nookive"
        },
        true,
        None::<&str>,
    )?;
    Menu::with_items(app, &[&status_item, &start_item, &separator, &quit_item])
}

#[tauri::command]
pub fn set_tray_install_required(app: AppHandle, language: String) -> Result<(), String> {
    // 이전 설치 메뉴의 아이템 참조를 먼저 비워야 다음 설치 시작 시
    // 새 메뉴가 정상적으로 생성되고 액션이 새 아이템에 연결된다.
    if let Ok(mut guard) = installing_status_item().lock() {
        *guard = None;
    }
    if let Ok(mut guard) = installing_pause_item().lock() {
        *guard = None;
    }
    if let Ok(mut guard) = installing_cancel_item().lock() {
        *guard = None;
    }
    let menu = build_install_required_menu(&app, &language).map_err(|error| error.to_string())?;
    let tray = app
        .tray_by_id("main")
        .ok_or_else(|| "tray icon is not available".to_string())?;
    tray.set_menu(Some(menu)).map_err(|error| error.to_string())
}

/// 설치 메뉴의 일시정지 액션을 현재 다운로드 상태에 맞게 바꾼다.
pub fn set_tray_download_paused(paused: bool) {
    if let Ok(guard) = installing_pause_item().lock()
        && let Some(item) = guard.as_ref()
    {
        let is_english = item
            .text()
            .map(|text| text.contains("Pause") || text.contains("Resume"))
            .unwrap_or(false);
        let label = if is_english {
            if paused {
                "Resume installation"
            } else {
                "Pause installation"
            }
        } else if paused {
            "설치 재개"
        } else {
            "설치 일시정지"
        };
        let _ = item.set_text(label);
    }
}

pub fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let menu = build_tray_menu(app, "ko")?;

    let mut builder = TrayIconBuilder::with_id("main")
        .menu(&menu)
        .tooltip("Nookive")
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show-search" => show_main_window(app),
            "show-settings" => show_settings_window(app),
            "installing-start" => show_installer_window(app),
            "installing-pause" => {
                // 메뉴 라벨로 현재 상태를 판별해 같은 항목으로 일시정지/재개한다.
                let paused = if let Ok(guard) = installing_pause_item().lock() {
                    guard
                        .as_ref()
                        .and_then(|item| item.text().ok())
                        .map(|text| text.contains("재개") || text.contains("Resume"))
                        .unwrap_or(false)
                } else {
                    false
                };
                if paused {
                    models::resume_model_download(app.clone());
                } else {
                    models::pause_model_download(app.clone());
                }
            }
            "installing-cancel" => {
                // 트레이에서 중단해도 설치 창의 중단 버튼과 동일하게
                // 부분 파일을 삭제하고 설치 전 상태로 되돌린다.
                let handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = models::reset_model_download(handle.clone()).await;
                    let _ = set_tray_install_required(handle.clone(), "ko".to_string());
                });
            }
            "quit" => app.exit(0),
            _ => {}
        });
    #[cfg(target_os = "macos")]
    {
        // Menu bar icons should be simple monochrome template glyphs. The
        // full-color Nookive mark remains reserved for the Dock/app bundle.
        let icon =
            tauri::image::Image::from_bytes(include_bytes!("../icons/menu-bar-template.png"))?;
        builder = builder.icon(icon).icon_as_template(true);
    }
    #[cfg(not(target_os = "macos"))]
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

#[tauri::command]
pub fn set_tray_language(app: AppHandle, language: String) -> Result<(), String> {
    let menu = build_tray_menu(&app, &language).map_err(|error| error.to_string())?;
    let tray = app
        .tray_by_id("main")
        .ok_or_else(|| "tray icon is not available".to_string())?;
    tray.set_menu(Some(menu)).map_err(|error| error.to_string())
}

/// 트레이 설치 상태 라벨만 갱신한다 (메뉴 교체 없음 → 열려 있는 메뉴가 닫히지 않음).
#[tauri::command]
pub fn set_tray_installing(app: AppHandle, language: String, percent: u32) -> Result<(), String> {
    // 이미 저장된 상태 아이템이 있으면 set_text로 라벨만 업데이트한다.
    if let Ok(guard) = installing_status_item().lock()
        && let Some(item) = guard.as_ref()
    {
        let is_korean = language.starts_with("ko");
        let label = if is_korean {
            format!("설치 중… ({percent}%)")
        } else {
            format!("Installing… ({percent}%)")
        };
        let _ = item.set_text(&label);
        return Ok(());
    }
    // 아직 설치 메뉴가 없으면 처음으로 빌드하고 트레이에 적용한다.
    let menu =
        build_and_store_installing_menu(&app, &language, percent).map_err(|e| e.to_string())?;
    let tray = app
        .tray_by_id("main")
        .ok_or_else(|| "tray icon is not available".to_string())?;
    tray.set_menu(Some(menu)).map_err(|e| e.to_string())
}

/// 트레이 메뉴를 일반 모드로 복원하고 저장된 설치 아이템을 해제한다.
#[tauri::command]
pub fn restore_tray_menu(app: AppHandle, language: String) -> Result<(), String> {
    // 설치 아이템 참조 해제
    if let Ok(mut guard) = installing_status_item().lock() {
        *guard = None;
    }
    if let Ok(mut guard) = installing_pause_item().lock() {
        *guard = None;
    }
    if let Ok(mut guard) = installing_cancel_item().lock() {
        *guard = None;
    }
    set_tray_language(app, language)
}

#[tauri::command]
pub fn hide_window(window: tauri::Window) -> Result<(), String> {
    window.hide().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn hide_settings_window(window: tauri::WebviewWindow) -> Result<(), String> {
    crate::models::cancel_model_download();
    window.hide().map_err(|e| e.to_string())
}

/// 설치 창을 닫을 때: 다운로드를 취소하지 않고 창만 숨긴다.
/// 모델 다운로드는 백그라운드에서 계속 진행되며 트레이에서 진행률을 확인할 수 있다.
#[tauri::command]
pub fn hide_installer_window(window: tauri::WebviewWindow) -> Result<(), String> {
    window.hide().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn resize_main_window(window: tauri::WebviewWindow, compact: bool) -> Result<(), String> {
    let height = if compact {
        MAIN_WINDOW_COMPACT_HEIGHT
    } else {
        MAIN_WINDOW_EXPANDED_HEIGHT
    };

    // macOS에서는 set_size와 set_position을 따로 호출하면 창 서버가
    // 중간 프레임(위로 커진 상태)을 잠깐 그려 검색바가 튀어 보인다.
    // NSWindow.setFrame으로 origin/size를 한 번에 바꿔 top-left를 보존한다.
    #[cfg(target_os = "macos")]
    {
        resize_window_keeping_top_left(&window, height)?;
        // 투명 창의 네이티브 그림자는 리사이즈 후에도 이전 모양으로 남을 수 있어 다시 계산시킨다.
        crate::vibrancy::refresh_shadow(&window);
        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    {
        let position = window.outer_position().ok();
        window
            .set_size(Size::Logical(LogicalSize::new(MAIN_WINDOW_WIDTH, height)))
            .map_err(|e| e.to_string())?;
        if let Some(position) = position {
            let _ = window.set_position(Position::Physical(position));
        }
        Ok(())
    }
}

/// macOS: 창의 top-left를 고정한 채 높이만 원자적으로 변경한다.
#[cfg(target_os = "macos")]
fn resize_window_keeping_top_left(
    window: &tauri::WebviewWindow,
    height: f64,
) -> Result<(), String> {
    use objc2_app_kit::NSWindow;
    use objc2_foundation::{NSPoint, NSRect, NSSize};

    let window_for_closure = window.clone();
    window
        .run_on_main_thread(move || {
            let Ok(ptr) = window_for_closure.ns_window() else {
                return;
            };
            if ptr.is_null() {
                return;
            }

            // NSWindow의 frame은 화면 좌표(origin이 좌하단) 기준이다.
            // top-left를 유지하려면 origin.y를 (기존 높이 - 새 높이)만큼 보정한다.
            let ns_window = unsafe { &*(ptr as *mut NSWindow) };
            let frame = ns_window.frame();
            let new_frame = NSRect::new(
                NSPoint::new(frame.origin.x, frame.origin.y + frame.size.height - height),
                NSSize::new(frame.size.width, height),
            );
            ns_window.setFrame_display_animate(new_frame, true, false);
        })
        .map_err(|e| e.to_string())
}

/// 🖥️ 멀티 모니터 대응: 현재 마우스 커서가 위치한 활성 모니터를 찾는다.
fn active_monitor(window: &tauri::WebviewWindow) -> Option<tauri::Monitor> {
    // 1. 현재 마우스 커서 좌표를 포함하는 모니터 탐색
    let target_monitor = if let Ok(cursor_pos) = window.cursor_position() {
        if let Ok(monitors) = window.available_monitors() {
            monitors.into_iter().find(|m| {
                let m_pos = m.position();
                let m_size = m.size();
                cursor_pos.x >= m_pos.x as f64
                    && cursor_pos.x < (m_pos.x + m_size.width as i32) as f64
                    && cursor_pos.y >= m_pos.y as f64
                    && cursor_pos.y < (m_pos.y + m_size.height as i32) as f64
            })
        } else {
            None
        }
    } else {
        None
    };

    // 2. 타겟 모니터 또는 fallback (current_monitor -> primary_monitor)
    target_monitor
        .or_else(|| window.current_monitor().ok().flatten())
        .or_else(|| window.primary_monitor().ok().flatten())
}

/// 접힌 창의 top-left를 "확장 창이 중앙에 놓였을 때의 top"에 맞춘다.
/// 이렇게 해야 검색어 입력으로 창이 확장될 때 검색바가 화면에서 움직이지 않는다.
fn align_top_on_active_monitor(window: &tauri::WebviewWindow) {
    if let Some(monitor) = active_monitor(window) {
        let scale = window.scale_factor().unwrap_or(1.0);
        let width = (MAIN_WINDOW_WIDTH * scale).round() as i32;
        let expanded_height = (MAIN_WINDOW_EXPANDED_HEIGHT * scale).round() as i32;
        let m_pos = monitor.position();
        let m_size = monitor.size();
        let x = m_pos.x + (m_size.width as i32 - width) / 2;
        let y = m_pos.y + (m_size.height as i32 - expanded_height) / 2;
        let _ = window.set_position(Position::Physical(PhysicalPosition::new(x, y)));
    }
}

pub fn toggle_search_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let is_visible = window.is_visible().unwrap_or(false);
        if is_visible {
            let _ = window.hide();
        } else {
            center_search_window(&window);
            let _ = window.set_always_on_top(true);
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }
}

pub fn center_search_window(window: &tauri::WebviewWindow) {
    // 접힌 상태에서도 확장 창의 top에 맞춰 두어, 검색어 입력 시
    // 검색바가 위아래로 튀지 않고 그 자리에서 창만 아래로 확장되게 한다.
    align_top_on_active_monitor(window);
}

/// 검색 창 배경 블러 적용.
/// macOS는 window-vibrancy의 private `setCornerRadius:` 대신 문서화된 `maskImage`로
/// 둥근 모서리를 만든다. (리사이즈 때 모서리가 가끔 각지던 문제 방지 — src/vibrancy.rs 참고)
pub fn apply_search_window_effect(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    #[cfg(target_os = "macos")]
    {
        crate::vibrancy::install(window)
    }

    #[cfg(not(target_os = "macos"))]
    {
        window.set_effects(
            EffectsBuilder::new()
                .effect(Effect::HudWindow)
                .state(EffectState::FollowsWindowActiveState)
                .radius(18.0)
                .build(),
        )
    }
}

#[tauri::command]
pub fn show_search_window(app: AppHandle) {
    show_main_window(&app);
}

#[tauri::command]
pub fn set_search_shortcut(app: AppHandle, shortcut: String) -> Result<(), String> {
    if shortcut.trim().is_empty() {
        return Err("바로가기 키가 비어 있습니다".to_string());
    }
    app.global_shortcut()
        .unregister_all()
        .map_err(|e| e.to_string())?;
    app.global_shortcut()
        .on_shortcut(shortcut.as_str(), |app, _, event| {
            if event.state == ShortcutState::Pressed {
                toggle_search_window(app);
            }
        })
        .map_err(|e| e.to_string())?;
    Ok(())
}
