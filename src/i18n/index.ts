import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import koCommon from './locales/ko/common.json';
import koSearch from './locales/ko/search.json';
import koPreview from './locales/ko/preview.json';
import koSettings from './locales/ko/settings.json';
import enCommon from './locales/en/common.json';
import enSearch from './locales/en/search.json';
import enPreview from './locales/en/preview.json';
import enSettings from './locales/en/settings.json';
import { additionalResources } from './additionalResources';

export const supportedLocales = ['ko', 'en', 'ja', 'zh-CN', 'zh-TW', 'es', 'fr', 'de', 'pt-BR'] as const;
export type SupportedLocale = (typeof supportedLocales)[number];

const resources = {
  ko: { common: koCommon, search: koSearch, preview: koPreview, settings: koSettings },
  en: { common: enCommon, search: enSearch, preview: enPreview, settings: enSettings },
  ja: { ...additionalResources.ja },
  'zh-CN': { ...additionalResources['zh-CN'] },
  'zh-TW': { ...additionalResources['zh-TW'] },
  es: { ...additionalResources.es },
  fr: { ...additionalResources.fr },
  de: { ...additionalResources.de },
  'pt-BR': { ...additionalResources['pt-BR'] },
} as const;

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
