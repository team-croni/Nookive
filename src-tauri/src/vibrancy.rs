// src-tauri/src/vibrancy.rs
// macOS 검색 창의 블러(NSVisualEffectView)와 둥근 모서리 마스크.
//
// window-vibrancy의 `radius` 옵션은 문서화되지 않은 private 메서드(`setCornerRadius:`)로
// 구현되어 있다. 이 마스크는 창이 리사이즈될 때(검색어 입력/삭제로 확장·축소)
// 갱신되지 않는 경우가 있어, 축소 직후 위/아래 모서리가 가끔 각지게 보였다.
//
// 여기서는 Apple이 문서화한 `NSVisualEffectView.maskImage`를 사용한다.
// 마스크 이미지는 capInsets + stretch 모드라서 창 크기가 바뀌어도 AppKit이
// 모서리 반경을 유지한 채 늘려주며, 창 그림자도 이 마스크 모양을 따른다.
use std::time::Duration;

use objc2_app_kit::{
    NSAutoresizingMaskOptions, NSVisualEffectBlendingMode, NSVisualEffectMaterial,
    NSVisualEffectState, NSVisualEffectView, NSWindow, NSWindowOrderingMode,
};
use objc2_foundation::MainThreadMarker;
use objc2_quartz_core::kCACornerCurveContinuous;

/// 창 모서리 반경(pt). CSS `--radius-window`(18px)와 반드시 같아야 한다.
const CORNER_RADIUS_PT: f64 = 18.0;

/// 블러 뷰를 만들어 창 콘텐츠 뷰 맨 아래(웹뷰 뒤)에 붙인다.
/// 어느 스레드에서 호출해도 되며 실제 작업은 메인 스레드에서 수행한다.
pub fn install(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    let target = window.clone();
    window.run_on_main_thread(move || {
        if let Err(error) = install_on_main_thread(&target) {
            log::warn!("검색 창 vibrancy 적용 실패: {error}");
        }
    })
}

fn install_on_main_thread(window: &tauri::WebviewWindow) -> Result<(), String> {
    let mtm = MainThreadMarker::new().ok_or("메인 스레드에서만 호출할 수 있습니다")?;
    let ns_window = ns_window_of(window)?;
    let content_view = ns_window
        .contentView()
        .ok_or("NSWindow.contentView가 없습니다")?;

    // CSS의 원형 border-radius와 PNG 마스크는 macOS 창의 continuous corner와
    // 곡선이 미세하게 달라 이중 외곽선처럼 보일 수 있다. 콘텐츠 전체를
    // AppKit의 continuous corner로 자른다. 외곽선과 그림자는 웹뷰의 CSS 토큰으로
    // 그리므로 native shadow와 별도의 경계가 생기지 않게 한다.
    content_view.setWantsLayer(true);
    let content_layer = content_view
        .layer()
        .ok_or("NSWindow.contentView layer가 없습니다")?;
    content_layer.setCornerRadius(CORNER_RADIUS_PT);
    content_layer.setCornerCurve(unsafe { kCACornerCurveContinuous });
    content_layer.setMasksToBounds(true);
    // 외곽선은 설정하지 않는다. CALayer border와 NSWindow shadow를 함께 사용하면
    // native 외곽선이 이중으로 보이므로, 이 레이어는 continuous clipping만 담당한다.
    content_layer.setBorderWidth(0.0);

    let blur = NSVisualEffectView::new(mtm);
    blur.setFrame(content_view.bounds());
    blur.setMaterial(NSVisualEffectMaterial::HUDWindow);
    blur.setBlendingMode(NSVisualEffectBlendingMode::BehindWindow);
    blur.setState(NSVisualEffectState::FollowsWindowActiveState);
    blur.setAutoresizingMask(
        NSAutoresizingMaskOptions::ViewWidthSizable | NSAutoresizingMaskOptions::ViewHeightSizable,
    );
    content_view.addSubview_positioned_relativeTo(&blur, NSWindowOrderingMode::Below, None);
    ns_window.invalidateShadow();
    Ok(())
}

/// 창 리사이즈 직후 네이티브 그림자를 다시 계산하게 한다.
/// 투명 창의 그림자는 크기 변경 후에도 이전 모양으로 남을 수 있어서,
/// 웹뷰가 새 크기로 다시 그려진 뒤까지 몇 차례 갱신한다.
pub fn refresh_shadow(window: &tauri::WebviewWindow) {
    let target = window.clone();
    std::thread::spawn(move || {
        for delay_ms in [0u64, 80, 120] {
            if delay_ms > 0 {
                std::thread::sleep(Duration::from_millis(delay_ms));
            }
            let inner = target.clone();
            if target
                .run_on_main_thread(move || {
                    if let Ok(ns_window) = ns_window_of(&inner) {
                        ns_window.invalidateShadow();
                    }
                })
                .is_err()
            {
                return;
            }
        }
    });
}

fn ns_window_of(window: &tauri::WebviewWindow) -> Result<&NSWindow, String> {
    let ptr = window.ns_window().map_err(|e| e.to_string())?;
    if ptr.is_null() {
        return Err("NSWindow 포인터가 null입니다".to_string());
    }
    // SAFETY: tauri가 돌려준 유효한 NSWindow 포인터이며, 호출자는 메인 스레드에서만 사용한다.
    // 창은 앱 수명 동안 유지되므로 이 참조가 쓰이는 짧은 구간 동안 해제되지 않는다.
    Ok(unsafe { &*(ptr as *const NSWindow) })
}
