import { useTranslation } from 'react-i18next';
import i18n, { supportedLocales, type SupportedLocale } from '../../../i18n';
import { OptionPicker } from './OptionPicker';

export function LanguagePicker() {
  const { t } = useTranslation(['settings', 'common']);
  const locale = supportedLocales.includes(i18n.language as SupportedLocale)
    ? i18n.language as SupportedLocale
    : 'en';

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

  return (
    <OptionPicker
      options={supportedLocales.map((option) => ({ value: option, label: languageLabels[option] }))}
      value={locale}
      onChange={(next) => void i18n.changeLanguage(next)}
      ariaLabel={t('language.label', { ns: 'common' })}
    />
  );
}
