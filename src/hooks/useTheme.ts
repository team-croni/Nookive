import { useEffect, useState } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';

const THEME_STORAGE_KEY = 'nookive.theme';
const THEME_PREFERENCES: ThemePreference[] = ['light', 'dark', 'system'];

const isThemePreference = (value: string | null): value is ThemePreference =>
  value !== null && THEME_PREFERENCES.includes(value as ThemePreference);

export const getStoredThemePreference = (): ThemePreference => {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
};

const getSystemTheme = (): 'light' | 'dark' =>
  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

export const applyThemePreference = (preference: ThemePreference) => {
  const root = document.documentElement;
  if (preference === 'system') {
    delete root.dataset.theme;
    root.style.colorScheme = getSystemTheme();
  } else {
    root.dataset.theme = preference;
    root.style.colorScheme = preference;
  }
};

export const initializeTheme = () => {
  applyThemePreference(getStoredThemePreference());
};

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(getStoredThemePreference);

  useEffect(() => {
    applyThemePreference(preference);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, preference);
      window.dispatchEvent(new CustomEvent('nookive-theme-change', { detail: preference }));
    } catch {
      // Keep the selection active for this window when storage is unavailable.
    }
  }, [preference]);

  useEffect(() => {
    const updateFromStorage = () => setPreference(getStoredThemePreference());
    const updateFromSameWindow = (event: Event) => {
      const next = (event as CustomEvent<ThemePreference>).detail;
      if (isThemePreference(next)) setPreference(next);
    };
    window.addEventListener('storage', updateFromStorage);
    window.addEventListener('nookive-theme-change', updateFromSameWindow);
    return () => {
      window.removeEventListener('storage', updateFromStorage);
      window.removeEventListener('nookive-theme-change', updateFromSameWindow);
    };
  }, []);

  useEffect(() => {
    if (preference !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const updateSystemTheme = () => applyThemePreference('system');
    mediaQuery.addEventListener('change', updateSystemTheme);
    return () => mediaQuery.removeEventListener('change', updateSystemTheme);
  }, [preference]);

  return { preference, setPreference };
}
