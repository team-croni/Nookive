// src/features/settings/components/CodeSearchSection.tsx
// 코드 검색(검색창의 Tab / "code:") 켜고 끄기와, 코드 결과를 열 에디터 선택.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getCodeSearchEnabled, setCodeEditor, setCodeSearchEnabled } from '../../../utils/codeSearchPreference';
import { useCodeEditor } from '../../../hooks/useCodeEditor';
import { OptionPicker } from './OptionPicker';
import styles from '../SettingsApp.module.css';

export function CodeSearchSection() {
  const { t } = useTranslation('settings');
  const [enabled, setEnabled] = useState(getCodeSearchEnabled);
  const { preference, editors } = useCodeEditor();

  const handleChange = (nextEnabled: boolean) => {
    setEnabled(nextEnabled);
    setCodeSearchEnabled(nextEnabled);
  };

  // 자동은 실제로 열릴 에디터 이름을 함께 보여준다. 고른 에디터가 지워졌으면 자동으로 보인다.
  const editorOptions = [
    {
      value: 'auto',
      label: editors[0]
        ? t('codeSearch.editorAutoWith', { app: editors[0].name })
        : t('codeSearch.editorAuto'),
    },
    ...editors.map((editor) => ({ value: editor.id, label: editor.name })),
    { value: 'default', label: t('codeSearch.editorDefault') },
  ];

  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <h2>{t('codeSearch.title')}</h2>
          <p>{t('codeSearch.description')}</p>
        </div>
      </div>
      <div className={styles.optionGroup}>
        <div className={styles.webSearchRow}>
          <span className={styles.webSearchOptionLabel}>{t('codeSearch.option')}</span>
          <label className={styles.switch}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => handleChange(event.target.checked)}
              aria-label={t('codeSearch.option')}
            />
            <span className={styles.switchTrack} aria-hidden="true" />
          </label>
        </div>
        {enabled && (
          <div className={styles.webSearchRow}>
            <span className={styles.webSearchOptionLabel}>{t('codeSearch.editor')}</span>
            <OptionPicker
              options={editorOptions}
              value={editorOptions.some((option) => option.value === preference) ? preference : 'auto'}
              onChange={setCodeEditor}
              ariaLabel={t('codeSearch.editor')}
            />
          </div>
        )}
      </div>
    </section>
  );
}
