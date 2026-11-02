// src-tauri/src/login_item.rs
// 로그인할 때 Nookive를 여는 설정. macOS 13+의 SMAppService.mainApp으로 등록해 시스템 설정 >
// 일반 > 로그인 항목의 "로그인 시 열기"에 앱 이름과 아이콘으로 보이게 한다. 상태는 따로 저장하지 않고
// 매번 macOS에서 읽으므로, 사용자가 시스템 설정에서 바꾼 값을 덮어쓰지 않는다.
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum LoginItemStatus {
    /// macOS 13 미만이라 설정을 숨긴다.
    Unsupported,
    Enabled,
    Disabled,
    /// 등록했지만 시스템 설정에서 사용자의 허용이 필요하다.
    RequiresApproval,
}

#[cfg(target_os = "macos")]
mod platform {
    use super::LoginItemStatus;
    use objc2::runtime::AnyClass;
    use objc2_service_management::{SMAppService, SMAppServiceStatus};

    /// SMAppService는 macOS 13에 추가됐다. 클래스가 없으면 부르지 않는다.
    fn is_available() -> bool {
        AnyClass::get(c"SMAppService").is_some()
    }

    pub fn status() -> LoginItemStatus {
        if !is_available() {
            return LoginItemStatus::Unsupported;
        }
        // SAFETY: macOS 13+에서만 부르며, 인자 없는 클래스/인스턴스 메서드다.
        let status = unsafe { SMAppService::mainAppService().status() };
        // 한 번도 등록하지 않은 앱은 NotFound로 나온다. 꺼진 것과 같으므로 켤 수 있게 둔다.
        // (번들이 아닌 개발 빌드처럼 실제로 등록할 수 없으면 켤 때 오류로 알린다)
        match status {
            SMAppServiceStatus::Enabled => LoginItemStatus::Enabled,
            SMAppServiceStatus::RequiresApproval => LoginItemStatus::RequiresApproval,
            _ => LoginItemStatus::Disabled,
        }
    }

    pub fn set(enabled: bool) -> Result<LoginItemStatus, String> {
        if !is_available() {
            return Ok(LoginItemStatus::Unsupported);
        }
        // SAFETY: macOS 13+에서만 부른다. 실패하면 NSError를 돌려받는다.
        let result = unsafe {
            let service = SMAppService::mainAppService();
            if enabled {
                service.registerAndReturnError()
            } else {
                service.unregisterAndReturnError()
            }
        };
        result.map_err(|error| format!("로그인 항목 변경 실패: {error:?}"))?;
        Ok(status())
    }

    pub fn open_settings() {
        if is_available() {
            // SAFETY: macOS 13+에서만 부른다.
            unsafe { SMAppService::openSystemSettingsLoginItems() };
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod platform {
    use super::LoginItemStatus;

    pub fn status() -> LoginItemStatus {
        LoginItemStatus::Unsupported
    }

    pub fn set(_enabled: bool) -> Result<LoginItemStatus, String> {
        Ok(LoginItemStatus::Unsupported)
    }

    pub fn open_settings() {}
}

#[tauri::command]
pub fn get_launch_at_login() -> LoginItemStatus {
    platform::status()
}

/// 바뀐 뒤의 상태를 돌려준다. 끌 때 이미 꺼져 있으면 오류 없이 현재 상태를 돌려준다.
#[tauri::command]
pub fn set_launch_at_login(enabled: bool) -> Result<LoginItemStatus, String> {
    let current = platform::status();
    if !enabled && current == LoginItemStatus::Disabled {
        return Ok(current);
    }
    platform::set(enabled)
}

/// 허용이 필요할 때 시스템 설정 > 일반 > 로그인 항목을 연다.
#[tauri::command]
pub fn open_login_items_settings() {
    platform::open_settings();
}
