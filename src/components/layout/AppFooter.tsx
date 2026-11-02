// src/components/layout/AppFooter.tsx
import { Button } from '../ui/Button/Button';
import { KeyHint } from '../ui/KeyHint/KeyHint';
import { useTranslation } from 'react-i18next';

interface AppFooterProps {
  canOpen: boolean;
  canCopyPath: boolean;
  openLabel?: string;
  onOpen: () => void;
  onCopyPath: () => void;
  /** 다음 검색 모드로 넘어가는 Tab 안내. 넘어갈 모드가 없으면 숨긴다. */
  modeHint?: { label: string; onClick: () => void };
}

export function AppFooter({
  canOpen,
  canCopyPath,
  openLabel,
  onOpen,
  onCopyPath,
  modeHint,
}: AppFooterProps) {
  const { t } = useTranslation('common');
  const resolvedOpenLabel = openLabel ?? t('actions.open');
  return (
    <div className="app-footer">
      <Button
        variant="ghost"
        size="xs"
        className="footer-action"
        onClick={onOpen}
        disabled={!canOpen}
        title={resolvedOpenLabel}
      >
        <KeyHint label="Enter" />
        <span>{resolvedOpenLabel}</span>
      </Button>
      <Button
        variant="ghost"
        size="xs"
        className="footer-action"
        onClick={onCopyPath}
        disabled={!canCopyPath}
        title={t('actions.copyPath')}
      >
        <KeyHint label="C" glyph="⌘" />
        <span>{t('actions.copyPath')}</span>
      </Button>
      {modeHint && (
        <Button
          variant="ghost"
          size="xs"
          className="footer-action footer-action-end"
          onClick={modeHint.onClick}
          // 클릭해도 검색 입력의 포커스를 유지해 Tab 전환이 계속 동작하게 한다.
          onMouseDown={(event) => event.preventDefault()}
          title={modeHint.label}
        >
          <KeyHint label="Tab" />
          <span>{modeHint.label}</span>
        </Button>
      )}
    </div>
  );
}
