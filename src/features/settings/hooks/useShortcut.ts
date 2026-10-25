// src/features/settings/hooks/useShortcut.ts
// 전역 검색 단축키 설정/녹음 로직.
import { useState, type KeyboardEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import i18n from '../../../i18n';

const SHORTCUT_STORAGE_KEY = 'nookive-shortcut';

const SHORTCUT_SYMBOLS: Record<string, string> = {
  Cmd: '⌘',
  CmdOrCtrl: '⌘',
  Option: '⌥',
  Alt: '⌥',
  Control: '⌃',
  Ctrl: '⌃',
  Shift: '⇧',
  Space: 'Space',
};

export function useShortcut() {
  const [shortcutMessage, setShortcutMessage] = useState<string | null>(null);
  const [isRecordingShortcut, setIsRecordingShortcut] = useState(false);
  const [shortcut, setShortcut] = useState(() =>
    (localStorage.getItem(SHORTCUT_STORAGE_KEY) ?? 'Alt+Space').replace('Option', 'Alt'),
  );

  const changeShortcut = async (nextShortcut: string) => {
    try {
      await invoke('set_search_shortcut', { shortcut: nextShortcut });
      setShortcut(nextShortcut);
      localStorage.setItem(SHORTCUT_STORAGE_KEY, nextShortcut);
      setShortcutMessage(i18n.t('messages.shortcutChanged', { ns: 'settings' }));
    } catch {
      setShortcutMessage(i18n.t('messages.shortcutFailed', { ns: 'settings' }));
    }
  };

  const shortcutLabel = shortcut
    .split('+')
    .map((part) => SHORTCUT_SYMBOLS[part] ?? part)
    .join(' ');

  const handleShortcutKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    if (['Meta', 'Control', 'Alt', 'Shift'].includes(event.key)) return;

    const key = event.key === ' ' ? 'Space' : event.key.length === 1 ? event.key.toUpperCase() : event.key;
    const modifiers: string[] = [];
    if (event.metaKey) modifiers.push('Cmd');
    if (event.ctrlKey) modifiers.push('Ctrl');
    if (event.altKey) modifiers.push('Alt');
    if (event.shiftKey) modifiers.push('Shift');
    if (modifiers.length === 0) {
      setShortcutMessage(i18n.t('messages.shortcutModifier', { ns: 'settings' }));
      return;
    }
    void changeShortcut([...modifiers, key].join('+'));
  };

  return {
    shortcutLabel,
    shortcutMessage,
    isRecordingShortcut,
    setIsRecordingShortcut,
    handleShortcutKeyDown,
  };
}
