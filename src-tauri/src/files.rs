// src-tauri/src/files.rs
// 로컬 파일 읽기/열기/탐색기 표시 커맨드.
use std::process::Command;

use crate::paths::resolve_home;

#[derive(Debug)]
pub struct NativePdfPage {
    pub width: usize,
    pub height: usize,
    pub pixels: Vec<u8>,
}

#[tauri::command]
pub fn render_pdf_page_native(
    path: String,
    page_number: usize,
    scale: f64,
) -> Result<tauri::ipc::Response, String> {
    #[cfg(target_os = "macos")]
    {
        let page = render_pdf_page_core_graphics(&resolve_home(&path), page_number, scale)?;
        // base64 인코딩/디코딩 비용을 없애기 위해 [width u32 LE][height u32 LE][RGBA]로
        // 원시 바이트를 그대로 전송한다.
        let mut bytes = Vec::with_capacity(8 + page.pixels.len());
        bytes.extend_from_slice(&(page.width as u32).to_le_bytes());
        bytes.extend_from_slice(&(page.height as u32).to_le_bytes());
        bytes.extend_from_slice(&page.pixels);
        return Ok(tauri::ipc::Response::new(bytes));
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (path, page_number, scale);
        Err("네이티브 PDF 렌더러는 macOS에서만 사용할 수 있습니다.".to_string())
    }
}

#[cfg(target_os = "macos")]
fn render_pdf_page_core_graphics(
    path: &str,
    page_number: usize,
    scale: f64,
) -> Result<NativePdfPage, String> {
    use std::ffi::c_void;
    use std::ptr;

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct CGSize {
        width: f64,
        height: f64,
    }
    #[repr(C)]
    #[derive(Clone, Copy)]
    struct CGRect {
        origin: CGPoint,
        size: CGSize,
    }
    #[repr(C)]
    #[derive(Clone, Copy)]
    struct CGPoint {
        x: f64,
        y: f64,
    }
    #[repr(C)]
    struct CGPDFDocument {
        _private: [u8; 0],
    }
    #[repr(C)]
    struct CGPDFPage {
        _private: [u8; 0],
    }
    #[repr(C)]
    struct CGContext {
        _private: [u8; 0],
    }
    #[repr(C)]
    struct CGColorSpace {
        _private: [u8; 0],
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    unsafe extern "C" {
        fn CFURLCreateFromFileSystemRepresentation(
            _: *const c_void,
            _: *const u8,
            _: isize,
            _: bool,
        ) -> *const c_void;
        fn CFRelease(_: *const c_void);
    }
    #[link(name = "CoreGraphics", kind = "framework")]
    unsafe extern "C" {
        fn CGPDFDocumentCreateWithURL(_: *const c_void) -> *mut CGPDFDocument;
        fn CGPDFDocumentGetNumberOfPages(_: *const CGPDFDocument) -> usize;
        fn CGPDFDocumentGetPage(_: *const CGPDFDocument, _: usize) -> *mut CGPDFPage;
        fn CGPDFPageGetBoxRect(_: *const CGPDFPage, _: u32) -> CGRect;
        fn CGColorSpaceCreateDeviceRGB() -> *mut CGColorSpace;
        fn CGColorSpaceRelease(_: *mut CGColorSpace);
        fn CGBitmapContextCreate(
            _: *mut c_void,
            _: usize,
            _: usize,
            _: usize,
            _: usize,
            _: *mut CGColorSpace,
            _: u32,
        ) -> *mut CGContext;
        fn CGContextRelease(_: *mut CGContext);
        fn CGContextSetRGBFillColor(_: *mut CGContext, _: f64, _: f64, _: f64, _: f64);
        fn CGContextFillRect(_: *mut CGContext, _: CGRect);
        fn CGContextSaveGState(_: *mut CGContext);
        fn CGContextRestoreGState(_: *mut CGContext);
        fn CGContextTranslateCTM(_: *mut CGContext, _: f64, _: f64);
        fn CGContextScaleCTM(_: *mut CGContext, _: f64, _: f64);
        fn CGContextDrawPDFPage(_: *mut CGContext, _: *const CGPDFPage);
    }

    let path_bytes = path.as_bytes();
    let url = unsafe {
        CFURLCreateFromFileSystemRepresentation(
            ptr::null(),
            path_bytes.as_ptr(),
            path_bytes.len() as isize,
            false,
        )
    };
    if url.is_null() {
        return Err("PDF URL을 만들 수 없습니다.".to_string());
    }
    let document = unsafe { CGPDFDocumentCreateWithURL(url) };
    unsafe {
        CFRelease(url);
    }
    if document.is_null() {
        return Err("macOS PDF 문서를 열 수 없습니다.".to_string());
    }

    let page_count = unsafe { CGPDFDocumentGetNumberOfPages(document) };
    if page_number == 0 || page_number > page_count {
        unsafe {
            CFRelease(document.cast());
        }
        return Err("PDF 페이지 번호가 올바르지 않습니다.".to_string());
    }
    let page = unsafe { CGPDFDocumentGetPage(document, page_number) };
    if page.is_null() {
        unsafe {
            CFRelease(document.cast());
        }
        return Err("PDF 페이지를 읽을 수 없습니다.".to_string());
    }
    let rect = unsafe { CGPDFPageGetBoxRect(page, 1) };
    // 배율은 프런트엔드가 캔버스 예산(MAX_CANVAS_DIM)을 고려해 결정한다.
    // 여기서 임의로 클램프하면 실제 렌더 크기와 화면에 그리는
    // 하이라이트 좌표가 어긋나므로 요청 배율을 그대로 사용한다.
    let render_scale = if scale.is_finite() && scale > 0.0 {
        scale.max(0.01)
    } else {
        1.0
    };
    let width = ((rect.size.width * render_scale).ceil() as usize).max(1);
    let height = ((rect.size.height * render_scale).ceil() as usize).max(1);
    let bytes_per_row = width * 4;
    let mut pixels = vec![255u8; bytes_per_row * height];
    let color_space = unsafe { CGColorSpaceCreateDeviceRGB() };
    let context = unsafe {
        CGBitmapContextCreate(
            pixels.as_mut_ptr().cast(),
            width,
            height,
            8,
            bytes_per_row,
            color_space,
            1,
        )
    };
    if !color_space.is_null() {
        unsafe {
            CGColorSpaceRelease(color_space);
        }
    }
    if context.is_null() {
        unsafe {
            CFRelease(document.cast());
        }
        return Err("PDF 이미지 컨텍스트를 만들 수 없습니다.".to_string());
    }

    unsafe {
        CGContextSetRGBFillColor(context, 1.0, 1.0, 1.0, 1.0);
        CGContextFillRect(
            context,
            CGRect {
                origin: CGPoint { x: 0.0, y: 0.0 },
                size: CGSize {
                    width: width as f64,
                    height: height as f64,
                },
            },
        );
        CGContextSaveGState(context);
        CGContextTranslateCTM(context, 0.0, height as f64);
        CGContextScaleCTM(context, render_scale, -render_scale);
        // 크롭 박스 원점이 (0,0)이 아닌 PDF도 pdf.js 좌표계와 일치하도록
        // 원점만큼 이동시킨 뒤 그린다.
        CGContextTranslateCTM(context, -rect.origin.x, -rect.origin.y);
        CGContextDrawPDFPage(context, page);
        CGContextRestoreGState(context);
        CGContextRelease(context);
        CFRelease(document.cast());
    }

    Ok(NativePdfPage {
        width,
        height,
        pixels,
    })
}

/// PDF 등 미리보기용: 로컬 파일을 raw 바이트로 읽어 IPC로 반환
#[tauri::command]
pub fn read_file_bytes(path: String) -> Result<tauri::ipc::Response, String> {
    let resolved_path = resolve_home(&path);
    let bytes = std::fs::read(&resolved_path)
        .map_err(|e| format!("파일 읽기 실패 ({}): {}", resolved_path, e))?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// 미리보기를 시작하기 전에 원본 파일에 접근할 수 있는지 확인한다.
/// macOS 보호 폴더인 경우 이 호출에서 시스템 권한 안내가 표시될 수 있다.
#[tauri::command]
pub fn check_file_access(path: String) -> Result<(), String> {
    let resolved_path = resolve_home(&path);
    std::fs::File::open(&resolved_path)
        .map(|_| ())
        .map_err(|e| {
            format!(
                "파일 접근 권한을 확인하지 못했습니다 ({}): {}",
                resolved_path, e
            )
        })
}

#[tauri::command]
pub fn open_file(path: String) -> Result<(), String> {
    let resolved_path = resolve_home(&path);

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&resolved_path)
            .spawn()
            .map_err(|e| format!("파일 열기 실패: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", &resolved_path])
            .spawn()
            .map_err(|e| format!("파일 열기 실패: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub fn reveal_file(path: String) -> Result<(), String> {
    let resolved_path = resolve_home(&path);

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-R", &resolved_path])
            .spawn()
            .map_err(|e| format!("Finder에서 파일 표시 실패: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .args(["/select,", &resolved_path])
            .spawn()
            .map_err(|e| format!("탐색기에서 파일 표시 실패: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        let parent = std::path::Path::new(&resolved_path)
            .parent()
            .ok_or_else(|| "파일의 상위 폴더를 찾을 수 없습니다".to_string())?;
        Command::new("xdg-open")
            .arg(parent)
            .spawn()
            .map_err(|e| format!("파일 관리자에서 파일 표시 실패: {}", e))?;
    }

    Ok(())
}
