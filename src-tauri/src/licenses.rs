// src-tauri/src/licenses.rs
// 앱에 동봉된 라이선스 문서 열기.
// - open_license_document: bin/licenses/의 라이선스 파일을 기본 텍스트 편집기로 연다.
//   번들 리소스가 없는 개발 빌드에서는 현재 버전 태그의 GitHub 문서를 연다.
#[cfg(target_os = "macos")]
use std::process::Command;
use tauri::AppHandle;

use crate::paths::bundled_resource_path;

const REPOSITORY_URL: &str = "https://github.com/team-croni/Nookive";

/// 문서 종류 → (번들 리소스 경로, 저장소 내 원본 경로)
fn license_document(kind: &str) -> Option<(&'static str, &'static str)> {
    match kind {
        "license" => Some(("bin/licenses/LICENSE.txt", "LICENSE")),
        "thirdPartyLicenses" => Some((
            "bin/licenses/THIRD_PARTY_LICENSES.txt",
            "THIRD_PARTY_NOTICES.md",
        )),
        "thirdPartyNotices" => Some((
            "bin/licenses/THIRD_PARTY_NOTICES.md",
            "THIRD_PARTY_NOTICES.md",
        )),
        _ => None,
    }
}

#[tauri::command]
pub fn open_license_document(app: AppHandle, kind: String) -> Result<(), String> {
    let (resource, repository_path) =
        license_document(&kind).ok_or_else(|| format!("알 수 없는 라이선스 문서: {kind}"))?;
    let local = bundled_resource_path(&app, resource);

    if local.is_file() {
        #[cfg(target_os = "macos")]
        {
            // -t: 파일 확장자와 관계없이 기본 텍스트 편집기로 연다.
            Command::new("open")
                .arg("-t")
                .arg(&local)
                .spawn()
                .map_err(|e| format!("라이선스 문서 열기 실패: {e}"))?;
            return Ok(());
        }
    }

    let url = format!(
        "{REPOSITORY_URL}/blob/v{}/{repository_path}",
        app.package_info().version
    );
    crate::web::open_url(url)
}
