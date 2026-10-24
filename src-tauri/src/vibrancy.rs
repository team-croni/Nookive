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

use objc2::AllocAnyThread;
use objc2::rc::Retained;
use objc2_app_kit::{
    NSAutoresizingMaskOptions, NSImage, NSImageResizingMode, NSVisualEffectBlendingMode,
    NSVisualEffectMaterial, NSVisualEffectState, NSVisualEffectView, NSWindow,
    NSWindowOrderingMode,
};
use objc2_foundation::{MainThreadMarker, NSData, NSEdgeInsets, NSSize};

use crate::mask_png::rounded_mask_png;

/// 창 모서리 반경(pt). CSS `--radius-window`(18px)와 반드시 같아야 한다.
const CORNER_RADIUS_PT: u32 = 18;
/// 마스크를 3배 해상도로 만들어 Retina에서도 모서리가 부드럽게 보이게 한다.
const MASK_SCALE: u32 = 3;
/// NSImageResizingModeStretch
const RESIZING_MODE_STRETCH: isize = 1;

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

    let blur = NSVisualEffectView::new(mtm);
    blur.setFrame(content_view.bounds());
    blur.setMaterial(NSVisualEffectMaterial::HUDWindow);
    blur.setBlendingMode(NSVisualEffectBlendingMode::BehindWindow);
    blur.setState(NSVisualEffectState::FollowsWindowActiveState);
    blur.setAutoresizingMask(
        NSAutoresizingMaskOptions::ViewWidthSizable | NSAutoresizingMaskOptions::ViewHeightSizable,
    );
    let mask = rounded_mask_image()?;
    blur.setMaskImage(Some(&*mask));

    content_view.addSubview_positioned_relativeTo(&blur, NSWindowOrderingMode::Below, None);
    ns_window.invalidateShadow();
    Ok(())
}

/// 늘어나는 둥근 모서리 마스크 이미지를 만든다.
fn rounded_mask_image() -> Result<Retained<NSImage>, String> {
    let (size_px, png) = rounded_mask_png(CORNER_RADIUS_PT * MASK_SCALE, MASK_SCALE);
    let data = NSData::with_bytes(&png);
    let image = NSImage::initWithData(NSImage::alloc(), &data)
        .ok_or("마스크 PNG를 NSImage로 디코딩하지 못했습니다")?;

    // 픽셀은 3배 해상도지만 논리 크기(pt)를 지정해 @3x 이미지로 취급되게 한다.
    let size_pt = size_px as f64 / MASK_SCALE as f64;
    image.setSize(NSSize::new(size_pt, size_pt));

    let inset = CORNER_RADIUS_PT as f64;
    image.setCapInsets(NSEdgeInsets {
        top: inset,
        left: inset,
        bottom: inset,
        right: inset,
    });
    image.setResizingMode(NSImageResizingMode(RESIZING_MODE_STRETCH));
    Ok(image)
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
