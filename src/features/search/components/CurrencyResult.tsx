// src/features/search/components/CurrencyResult.tsx
// 환율 변환 결과. 결과 목록 맨 위의 줄과, 선택했을 때 미리보기 자리에 보이는 환율 정보.
import React from 'react';
import { Check, CloudOff, Coins, Copy, ExternalLink, LoaderCircle } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '../../../components/ui/Button/Button';
import type { CurrencyResult } from '../hooks/useCurrency';
import { useCurrencyText } from '../hooks/useCurrencyText';
import rowStyles from './AnswerRow.module.css';
import styles from './CurrencyResult.module.css';

/** ExchangeRate-API 공개 엔드포인트의 이용 조건: 이 문구와 링크로 출처를 밝힌다. */
const PROVIDER_URL = 'https://www.exchangerate-api.com';
const PROVIDER_LABEL = 'Rates By Exchange Rate API';

interface CurrencyRowProps {
  result: CurrencyResult;
  isActive: boolean;
  copied: boolean;
  onSelect: () => void;
  onCopy: () => void;
}

export const CurrencyRow: React.FC<CurrencyRowProps> = ({ result, isActive, copied, onSelect, onCopy }) => {
  const text = useCurrencyText();
  const { t } = text;
  let icon: React.ReactNode = <Coins size={18} aria-hidden="true" />;
  let title: string;
  let detail = '';
  if (result.status === 'ready') {
    title = text.title(result);
    detail = text.detail(result);
  } else if (result.status === 'loading') {
    icon = <LoaderCircle size={18} className={styles.spinner} aria-hidden="true" />;
    title = t('currency.loading');
  } else {
    icon = <CloudOff size={18} aria-hidden="true" />;
    title = t('currency.error.title');
    detail = t('currency.error.description');
  }
  return (
    <div className={`${rowStyles.row} ${isActive ? rowStyles.active : ''}`} onClick={onSelect} onDoubleClick={onCopy}>
      <span className={rowStyles.icon}>{icon}</span>
      <div className={rowStyles.text}>
        <span className={`${rowStyles.value} ${result.status === 'ready' ? '' : styles.mutedTitle}`}>{title}</span>
        {detail && <span className={rowStyles.interpretation}>{detail}</span>}
      </div>
      {result.status === 'ready' && (
        <span className={rowStyles.hint}>
          {copied ? (
            <>
              <Check size={13} aria-hidden="true" /> {t('calculator.copied')}
            </>
          ) : (
            t('calculator.copyHint')
          )}
        </span>
      )}
    </div>
  );
};

interface CurrencyPreviewProps {
  result: CurrencyResult;
  copied: boolean;
  onCopy: () => void;
  onOpenWeb: () => void;
}

export const CurrencyPreview: React.FC<CurrencyPreviewProps> = ({ result, copied, onCopy, onOpenWeb }) => {
  const text = useCurrencyText();
  const { t } = text;

  if (result.status !== 'ready') {
    return (
      <div className={styles.message}>
        {result.status === 'loading' ? (
          <LoaderCircle size={28} className={styles.spinner} aria-hidden="true" />
        ) : (
          <CloudOff size={28} aria-hidden="true" />
        )}
        <span>{result.status === 'loading' ? t('currency.loading') : t('currency.error.title')}</span>
      </div>
    );
  }

  const { query, rate, table, stale } = result;
  return (
    <div className={styles.preview}>
      <section className={styles.answer}>
        <span className={styles.value}>{text.money(result.value, query.to)}</span>
        <span className={styles.detail}>{text.money(query.amount, query.from)} → {query.to}</span>
      </section>
      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt>{t('currency.rate')}</dt>
          <dd>
            1 {query.from} = {text.rate(rate)} {query.to}
            <br />1 {query.to} = {text.rate(1 / rate)} {query.from}
          </dd>
        </div>
        <div className={styles.fact}>
          <dt>{t('currency.updated')}</dt>
          <dd>{text.updated(table.updatedAt)}</dd>
        </div>
      </dl>
      {stale && <p className={styles.note}>{t('currency.stale')}</p>}
      <p className={styles.note}>{t('currency.disclaimer')}</p>
      {/* 파일 미리보기처럼 동작 버튼은 아래 왼쪽에 두고, 출처는 그 오른쪽에 둔다. */}
      <footer className={styles.footer}>
        <Button variant="primary" size="xs" onClick={onCopy}>
          {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          <span>{t('calculator.copy')}</span>
        </Button>
        <Button variant="secondary" size="xs" onClick={onOpenWeb}>
          <ExternalLink size={14} aria-hidden="true" />
          <span>{t('weather.openWeb')}</span>
        </Button>
        <button
          type="button"
          className={styles.attribution}
          onClick={() => void invoke('open_url', { url: PROVIDER_URL }).catch(() => undefined)}
        >
          {PROVIDER_LABEL}
        </button>
      </footer>
    </div>
  );
};
