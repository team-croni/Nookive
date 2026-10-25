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
}

export function AppFooter({
  canOpen,
  canCopyPath,
  openLabel,
  onOpen,
  onCopyPath,
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
    </div>
  );
}
