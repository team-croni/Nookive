// src/features/search/components/CalculatorResult.tsx
// 계산기·단위 변환 결과. 결과 목록 맨 위의 줄과, 선택했을 때 미리보기 자리에 크게 보이는 결과.
import React from 'react';
import { Calculator, Check, Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/Button/Button';
import { openFileInOS } from '../../../utils/tauriBridge';
import { formatCalculation, type Calculation } from '../utils/calculator';
import rowStyles from './AnswerRow.module.css';
import styles from './CalculatorResult.module.css';

interface CalculatorRowProps {
  result: Calculation;
  isActive: boolean;
  copied: boolean;
  onSelect: () => void;
  onCopy: () => void;
}

export const CalculatorRow: React.FC<CalculatorRowProps> = ({ result, isActive, copied, onSelect, onCopy }) => {
  const { t, i18n } = useTranslation('search');
  return (
    <div
      className={`${rowStyles.row} ${isActive ? rowStyles.active : ''}`}
      onClick={onSelect}
      onDoubleClick={onCopy}
    >
      <span className={rowStyles.icon} aria-hidden="true">
        <Calculator size={18} />
      </span>
      <div className={rowStyles.text}>
        <span className={rowStyles.value}>= {formatCalculation(result, i18n.resolvedLanguage ?? i18n.language)}</span>
        <span className={rowStyles.interpretation}>{result.interpretation}</span>
      </div>
      <span className={rowStyles.hint}>
        {copied ? (
          <>
            <Check size={13} aria-hidden="true" /> {t('calculator.copied')}
          </>
        ) : (
          t('calculator.copyHint')
        )}
      </span>
    </div>
  );
};

const CALCULATOR_APP_PATH = '/System/Applications/Calculator.app';

interface CalculatorPreviewProps {
  result: Calculation;
  copied: boolean;
  onCopy: () => void;
}

export const CalculatorPreview: React.FC<CalculatorPreviewProps> = ({ result, copied, onCopy }) => {
  const { t, i18n } = useTranslation('search');
  return (
    <div className={styles.preview}>
      <span className={styles.previewInterpretation}>{result.interpretation}</span>
      <span className={styles.previewValue}>{formatCalculation(result, i18n.resolvedLanguage ?? i18n.language)}</span>
      {/* 미리보기의 열기 버튼과 같은 공용 버튼을 쓴다. */}
      <div className={styles.previewActions}>
        <Button variant="primary" size="xs" onClick={onCopy}>
          {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          {/* 글자는 그대로 두어 버튼 너비가 바뀌지 않게 하고, 아이콘만 잠깐 체크로 바꾼다. */}
          <span>{t('calculator.copy')}</span>
        </Button>
        {/* macOS 계산기는 식을 넘겨받는 방법이 없어 앱만 연다. 창은 포커스를 잃으면 저절로 숨는다. */}
        <Button variant="secondary" size="xs" onClick={() => void openFileInOS(CALCULATOR_APP_PATH)}>
          <Calculator size={14} aria-hidden="true" />
          <span>{t('calculator.openApp')}</span>
        </Button>
      </div>
    </div>
  );
};
