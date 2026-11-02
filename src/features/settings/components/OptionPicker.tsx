// src/features/settings/components/OptionPicker.tsx
// 설정 카드의 드롭다운. 메뉴는 설정 페이지 안에 들어오도록 위치를 잡아 body에 띄운다.
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { createPortal } from 'react-dom';
import styles from '../SettingsApp.module.css';

export interface PickerOption<T extends string> {
  value: T;
  label: string;
}

interface OptionPickerProps<T extends string> {
  options: readonly PickerOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}

export function OptionPicker<T extends string>({ options, value, onChange, ariaLabel }: OptionPickerProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const controlRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, width: 120 });
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!controlRef.current?.contains(target) && !menuRef.current?.contains(target)) setIsOpen(false);
    };
    const handleScroll = (event: Event) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setIsOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('scroll', handleScroll, true);
    };
  }, []);

  const choose = (next: T) => {
    onChange(next);
    setIsOpen(false);
  };

  const toggleMenu = () => {
    if (!isOpen) {
      const rect = triggerRef.current?.getBoundingClientRect();
      const page = triggerRef.current?.closest(`.${styles.page}`)?.getBoundingClientRect();
      if (rect && page) {
        const menuWidth = Math.max(rect.width, 120);
        const menuHeight = Math.min(220, options.length * 32 + 12);
        const inset = 8;
        const opensBelow = rect.bottom + 6 + menuHeight <= page.bottom - inset;
        const top = opensBelow
          ? rect.bottom + 6
          : Math.max(page.top + inset, rect.top - menuHeight - 6);
        const left = Math.min(
          Math.max(page.left + inset, rect.right - menuWidth),
          page.right - menuWidth - inset,
        );
        setMenuPosition({ top, left, width: menuWidth });
      }
    }
    setIsOpen((open) => !open);
  };

  return (
    <div className={styles.languageControl} ref={controlRef}>
      <button
        type="button"
        ref={triggerRef}
        className={styles.languageTrigger}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        onClick={toggleMenu}
      >
        <span>{selected?.label}</span>
        <ChevronDown size={14} className={isOpen ? styles.languageChevronOpen : ''} aria-hidden="true" />
      </button>
      {isOpen && createPortal(
        <div
          className={styles.languageMenu}
          ref={menuRef}
          role="listbox"
          aria-label={ariaLabel}
          style={{ top: menuPosition.top, left: menuPosition.left, minWidth: menuPosition.width }}
          onWheel={(event) => event.stopPropagation()}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={value === option.value}
              className={styles.languageOption}
              onClick={() => choose(option.value)}
            >
              <span>{option.label}</span>
              {value === option.value && <Check size={14} aria-hidden="true" />}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
