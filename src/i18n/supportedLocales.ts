// src/i18n/supportedLocales.ts
// 지원 언어 목록. 메뉴바 문구(src-tauri/src/tray_labels.rs)와 locales 폴더도 이 목록을 따른다.
export const supportedLocales = ['ko', 'en', 'ja', 'zh-CN', 'zh-TW', 'es', 'fr', 'de', 'pt-BR'] as const;
export type SupportedLocale = (typeof supportedLocales)[number];
