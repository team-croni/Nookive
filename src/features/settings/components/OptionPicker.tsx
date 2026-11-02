// src/features/settings/components/OptionPicker.tsx
// 설정 카드의 드롭다운. 메뉴는 설정 페이지 안에 들어오도록 위치를 잡아 body에 띄운다.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  // 첫 그리기에서는 화면 밖에 두고 실제 크기를 잰 뒤 옮긴다.
  const [menuPosition, setMenuPosition] = useState({ top: -9999, left: -9999, width: 120 });
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

  // 메뉴를 그린 뒤 실제 높이로 위치를 잡는다. 아래 공간이 부족하면 위로 연다.
  // (추정 높이로 잡으면 항목 높이가 달라질 때 메뉴가 버튼을 덮는다)
  useLayoutEffect(() => {
    if (!isOpen) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    const page = triggerRef.current?.closest(`.${styles.page}`)?.getBoundingClientRect();
    const menu = menuRef.current;
    if (!rect || !page || !menu) return;
    const menuWidth = Math.max(rect.width, menu.offsetWidth, 120);
    const menuHeight = menu.offsetHeight;
    const inset = 8;
    const gap = 6;
    const opensBelow = rect.bottom + gap + menuHeight <= page.bottom - inset;
    const top = opensBelow
      ? rect.bottom + gap
      : Math.max(page.top + inset, rect.top - menuHeight - gap);
    const left = Math.min(
      Math.max(page.left + inset, rect.right - menuWidth),
      page.right - menuWidth - inset,
    );
    setMenuPosition({ top, left, width: rect.width });
  }, [isOpen, options.length]);

  const toggleMenu = () => setIsOpen((open) => !open);

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
