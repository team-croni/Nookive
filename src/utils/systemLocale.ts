// macOS 시스템 설정 > 일반 > 언어 및 지역의 값(Rust get_system_locale).
// 웹뷰의 navigator.language는 선호 언어 목록이라 사는 지역·단위·24시간 표시를 알 수 없다.
// 창이 열릴 때 한 번 읽고, 읽기 전이나 읽지 못하면 빈 값(언어로 짐작)을 쓴다.
import { useSyncExternalStore } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface SystemLocale {
  /** 지역 코드 (예: "KR", "US") */
  region?: string | null;
  temperatureUnit?: 'celsius' | 'fahrenheit' | null;
  metric?: boolean | null;
  /** 시스템에서 24시간/12시간을 직접 고른 경우만 값이 있다. */
  uses24Hour?: boolean | null;
}

let current: SystemLocale = {};
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

export function loadSystemLocale(): Promise<void> {
  loading ??= invoke<SystemLocale>('get_system_locale')
    .then((value) => {
      current = value ?? {};
      listeners.forEach((listener) => listener());
    })
    .catch((err) => {
      console.warn('[Locale] 시스템 지역 설정을 읽지 못했습니다:', err);
    });
  return loading;
}

export function getSystemLocale(): SystemLocale {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  void loadSystemLocale();
  return () => listeners.delete(listener);
}

export function useSystemLocale(): SystemLocale {
  return useSyncExternalStore(subscribe, getSystemLocale);
}
