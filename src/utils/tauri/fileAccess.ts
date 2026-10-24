// src/utils/tauri/fileAccess.ts
// 로컬 파일 접근(asset URL 변환, 바이트 읽기, OS 열기/표시, 창 숨기기).
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

// 경로→asset URL 변환 결과 캐시 (렌더마다 반복 변환/문자열 생성 방지)
const fileSrcCache = new Map<string, string>();

/**
 * 로컬 파일 경로를 Tauri Webview용 Asset URL로 변환
 */
export function getFileSrc(filePath: string): string {
  const cached = fileSrcCache.get(filePath);
  if (cached !== undefined) return cached;
  try {
    const src = convertFileSrc(filePath);
    fileSrcCache.set(filePath, src);
    return src;
  } catch (err) {
    console.warn('[Tauri] convertFileSrc 실패:', err);
    return filePath;
  }
}

/**
 * 로컬 파일을 raw 바이트로 읽기 (pdf.js 등 인라인 미리보기용)
 * asset:// 프로토콜 fetch가 막히는 환경을 우회하기 위해 Rust 커맨드를 사용
 */
export async function readFileBytes(path: string): Promise<Uint8Array> {
  const result = await invoke<ArrayBuffer | Uint8Array | number[]>('read_file_bytes', {
    path,
  });
  if (result instanceof Uint8Array) return result;
  if (result instanceof ArrayBuffer) return new Uint8Array(result);
  if (Array.isArray(result)) return Uint8Array.from(result);
  throw new Error(
    `readFileBytes: 예상치 못한 응답 형식 (${Object.prototype.toString.call(result)})`,
  );
}

/**
 * OS 기본 연결 프로그램으로 파일 열기
 */
export async function openFileInOS(path: string): Promise<void> {
  try {
    await invoke('open_file', { path });
  } catch (err) {
    console.warn('[Tauri] open_file invoke 실패:', err);
  }
}

/** 파일이 있는 위치를 OS 파일 관리자에서 표시 */
export async function revealFileInOS(path: string): Promise<void> {
  try {
    await invoke('reveal_file', { path });
  } catch (err) {
    console.warn('[Tauri] reveal_file invoke 실패:', err);
  }
}

/**
 * 데스크톱 윈도우 숨기기 (배경 클릭 또는 ESC 시)
 */
export async function hideDesktopWindow(): Promise<void> {
  try {
    const win = getCurrentWindow();
    await win.hide();
  } catch {
    try {
      await invoke('hide_window');
    } catch (err) {
      console.warn('[Tauri] hideDesktopWindow 실패:', err);
    }
  }
}

/** 메인 검색창 표시 */
export async function showSearchWindow(): Promise<void> {
  try {
    await invoke('show_search_window');
  } catch (err) {
    console.warn('[Tauri] showSearchWindow 실패:', err);
  }
}

/** 설정 창 숨기기 */
export async function hideSettingsWindow(): Promise<void> {
  try {
    await invoke('hide_settings_window');
  } catch {
    try {
      const win = getCurrentWindow();
      await win.hide();
    } catch (err) {
      console.warn('[Tauri] hideSettingsWindow 실패:', err);
    }
  }
}

/** 설치 창 숨기기 (다운로드 취소 없이 창만 숨김 — 백그라운드 계속 진행) */
export async function hideInstallerWindow(): Promise<void> {
  try {
    await invoke('hide_installer_window');
  } catch {
    try {
      const win = getCurrentWindow();
      await win.hide();
    } catch (err) {
      console.warn('[Tauri] hideInstallerWindow 실패:', err);
    }
  }
}

/** 트레이 메뉴를 설치 모드로 전환 */
export async function setTrayInstalling(language: string, percent: number): Promise<void> {
  try {
    await invoke('set_tray_installing', { language, percent: Math.round(percent) });
  } catch (err) {
    console.warn('[Tauri] setTrayInstalling 실패:', err);
  }
}

/** 트레이 메뉴를 일반 모드로 복원 */
export async function restoreTrayMenu(language: string): Promise<void> {
  try {
    await invoke('restore_tray_menu', { language });
  } catch (err) {
    console.warn('[Tauri] restoreTrayMenu 실패:', err);
  }
}

/** 트레이 메뉴를 모델 설치 전 상태로 전환 */
export async function setTrayInstallRequired(language: string): Promise<void> {
  try {
    await invoke('set_tray_install_required', { language });
  } catch (err) {
    console.warn('[Tauri] setTrayInstallRequired 실패:', err);
  }
}

