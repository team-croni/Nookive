import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
// 모든 언어의 번역은 locales/<언어>/<네임스페이스>.json에 둔다.
// 키 구성은 en과 같아야 하며 i18n.test.ts가 확인한다.
const localeFiles = import.meta.glob<{ default: Record<string, unknown> }>('./locales/*/*.json', { eager: true });

import { supportedLocales, type SupportedLocale } from './supportedLocales';

export { supportedLocales, type SupportedLocale };

const namespaces = ['common', 'search', 'preview', 'settings'] as const;

export const resources = Object.fromEntries(
  supportedLocales.map((locale) => [
    locale,
    Object.fromEntries(
      namespaces.map((namespace) => [namespace, localeFiles[`./locales/${locale}/${namespace}.json`].default]),
    ),
  ]),
) as Record<SupportedLocale, Record<(typeof namespaces)[number], Record<string, unknown>>>;

function getInitialLocale(): SupportedLocale {
  const saved = localStorage.getItem('nookive.locale');
  if ((supportedLocales as readonly string[]).includes(saved ?? '')) return saved as SupportedLocale;
  const browserLanguage = navigator.language.toLowerCase();
  if (browserLanguage.startsWith('ko')) return 'ko';
  if (browserLanguage.startsWith('ja')) return 'ja';
  if (browserLanguage === 'zh-tw' || browserLanguage === 'zh-hk') return 'zh-TW';
  if (browserLanguage.startsWith('zh')) return 'zh-CN';
  if (browserLanguage.startsWith('es')) return 'es';
  if (browserLanguage.startsWith('fr')) return 'fr';
  if (browserLanguage.startsWith('de')) return 'de';
  if (browserLanguage.startsWith('pt')) return 'pt-BR';
  return 'en';
}

void i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLocale(),
  fallbackLng: 'en',
  defaultNS: 'common',
  ns: ['common', 'search', 'preview', 'settings'],
  interpolation: { escapeValue: false },
  returnNull: false,
});

let applyingRemoteLocale = false;

i18n.on('languageChanged', (language) => {
  const locale = (supportedLocales as readonly string[]).includes(language)
    ? language as SupportedLocale
    : 'en';
  localStorage.setItem('nookive.locale', locale);
  document.documentElement.lang = locale;
  void invoke('set_tray_language', { language: locale }).catch(() => undefined);
  if (!applyingRemoteLocale) {
    void emit('nookive-locale-changed', locale).catch(() => undefined);
  }
});

void listen<string>('nookive-locale-changed', ({ payload }) => {
  if (!(supportedLocales as readonly string[]).includes(payload) || i18n.language === payload) return;
  applyingRemoteLocale = true;
  void i18n.changeLanguage(payload).finally(() => {
    applyingRemoteLocale = false;
  });
});

window.addEventListener('storage', (event) => {
  if (event.key !== 'nookive.locale' || !event.newValue || i18n.language === event.newValue) return;
  if (!(supportedLocales as readonly string[]).includes(event.newValue)) return;
  applyingRemoteLocale = true;
  void i18n.changeLanguage(event.newValue).finally(() => {
    applyingRemoteLocale = false;
  });
});

document.documentElement.lang = supportedLocales.includes(i18n.language as SupportedLocale) ? i18n.language : 'en';
void invoke('set_tray_language', { language: document.documentElement.lang }).catch(() => undefined);

export default i18n;
