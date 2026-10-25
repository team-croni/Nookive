import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import i18n, { supportedLocales, type SupportedLocale } from '../../../i18n';
import styles from '../SettingsApp.module.css';

export function LanguagePicker() {
  const { t } = useTranslation(['settings', 'common']);
  const [isOpen, setIsOpen] = useState(false);
  const controlRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, width: 120 });
  const locale = supportedLocales.includes(i18n.language as SupportedLocale)
    ? i18n.language as SupportedLocale
    : 'en';

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

  const languageLabels: Record<SupportedLocale, string> = {
    ko: t('language.korean', { ns: 'common' }),
    en: t('language.english', { ns: 'common' }),
    ja: t('language.japanese', { ns: 'common' }),
    'zh-CN': t('language.chineseSimplified', { ns: 'common' }),
    'zh-TW': t('language.chineseTraditional', { ns: 'common' }),
    es: t('language.spanish', { ns: 'common' }),
    fr: t('language.french', { ns: 'common' }),
    de: t('language.german', { ns: 'common' }),
    'pt-BR': t('language.portuguese', { ns: 'common' }),
  };

  const choose = (nextLocale: SupportedLocale) => {
    void i18n.changeLanguage(nextLocale);
    setIsOpen(false);
  };

  const toggleMenu = () => {
    if (!isOpen) {
      const rect = triggerRef.current?.getBoundingClientRect();
      const page = triggerRef.current?.closest(`.${styles.page}`)?.getBoundingClientRect();
      if (rect && page) {
        const menuWidth = Math.max(rect.width, 120);
        const menuHeight = 220;
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
        aria-label={t('language.label', { ns: 'common' })}
        onClick={toggleMenu}
      >
        <span>{languageLabels[locale]}</span>
        <ChevronDown size={14} className={isOpen ? styles.languageChevronOpen : ''} aria-hidden="true" />
      </button>
      {isOpen && createPortal(
        <div
          className={styles.languageMenu}
          ref={menuRef}
          role="listbox"
          aria-label={t('language.label', { ns: 'common' })}
          style={{ top: menuPosition.top, left: menuPosition.left, minWidth: menuPosition.width }}
          onWheel={(event) => event.stopPropagation()}
        >
          {supportedLocales.map((option) => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={locale === option}
              className={styles.languageOption}
              onClick={() => choose(option)}
            >
              <span>{languageLabels[option]}</span>
              {locale === option && <Check size={14} aria-hidden="true" />}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
