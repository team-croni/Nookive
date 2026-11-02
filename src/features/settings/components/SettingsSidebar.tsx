// src/features/settings/components/SettingsSidebar.tsx
// 설정 창 왼쪽의 분류 목록. 위아래 방향키로 옮겨 다닐 수 있다. 설정이 늘어나면 항목을 더한다.
import type { KeyboardEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import { settingsPanelId, settingsTabId } from '../settingsTabIds';
import styles from '../SettingsApp.module.css';

export interface SettingsSidebarItem<T extends string> {
  id: T;
  label: string;
  icon: LucideIcon;
}

interface SettingsSidebarProps<T extends string> {
  items: readonly SettingsSidebarItem<T>[];
  active: T;
  onChange: (item: T) => void;
  ariaLabel: string;
}

export function SettingsSidebar<T extends string>({ items, active, onChange, ariaLabel }: SettingsSidebarProps<T>) {
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const index = items.findIndex((item) => item.id === active);
    const next = items[(index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length];
    onChange(next.id);
    document.getElementById(settingsTabId(next.id))?.focus();
  };

  return (
    <nav className={styles.sidebar} aria-label={ariaLabel}>
      <div role="tablist" aria-orientation="vertical" onKeyDown={handleKeyDown}>
        {items.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            id={settingsTabId(id)}
            type="button"
            role="tab"
            aria-selected={id === active}
            aria-controls={settingsPanelId(id)}
            tabIndex={id === active ? 0 : -1}
            className={styles.sidebarItem}
            onClick={() => onChange(id)}
          >
            <Icon size={15} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
