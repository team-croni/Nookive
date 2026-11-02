// src/utils/tauri/loginItem.ts
// 로그인 시 열기(SMAppService.mainApp) Tauri IPC 래퍼. 상태는 매번 macOS에서 읽는다.
import { invoke } from '@tauri-apps/api/core';

export type LoginItemStatus = 'unsupported' | 'enabled' | 'disabled' | 'requiresApproval';

export async function getLaunchAtLogin(): Promise<LoginItemStatus> {
  try {
    return await invoke<LoginItemStatus>('get_launch_at_login');
  } catch (err) {
    console.warn('[Tauri] get_launch_at_login 실패:', err);
    return 'unsupported';
  }
}

/** 바뀐 뒤의 상태를 돌려준다. 실패하면 현재 상태를 다시 읽고 failed를 표시한다. */
export async function setLaunchAtLogin(enabled: boolean): Promise<{ status: LoginItemStatus; failed: boolean }> {
  try {
    return { status: await invoke<LoginItemStatus>('set_launch_at_login', { enabled }), failed: false };
  } catch (err) {
    console.warn('[Tauri] set_launch_at_login 실패:', err);
    return { status: await getLaunchAtLogin(), failed: true };
  }
}

export async function openLoginItemsSettings(): Promise<void> {
  try {
    await invoke('open_login_items_settings');
  } catch (err) {
    console.warn('[Tauri] open_login_items_settings 실패:', err);
  }
}

const INITIALIZED_KEY = 'nookive.launchAtLoginInitialized';

/**
 * 기본값(켜짐)을 처음 한 번만 적용한다. 온보딩을 마칠 때 부른다.
 * 이후에는 사용자가 끈 설정을 존중해 다시 등록하지 않는다.
 */
export async function applyLaunchAtLoginDefault(): Promise<void> {
  try {
    if (localStorage.getItem(INITIALIZED_KEY)) return;
    localStorage.setItem(INITIALIZED_KEY, 'true');
  } catch {
    return;
  }
  if ((await getLaunchAtLogin()) === 'disabled') await setLaunchAtLogin(true);
}
