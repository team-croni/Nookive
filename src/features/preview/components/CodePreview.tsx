// src/features/preview/components/CodePreview.tsx
// 코드 검색 결과의 앞부분을 고정폭 글꼴로 보여준다. (색인하지 않고 선택했을 때만 읽는다)
import { useEffect, useState } from 'react';
import { readFileBytes } from '../../../utils/tauriBridge';
import styles from './PreviewPane.module.css';

const MAX_PREVIEW_BYTES = 1024 * 1024;
const MAX_PREVIEW_LINES = 400;

interface CodePreviewProps {
  path: string;
  sizeBytes: number;
  /** 읽지 못했거나 너무 큰 파일에서 대신 보여줄 텍스트 */
  fallback: string;
}

export function CodePreview({ path, sizeBytes, fallback }: CodePreviewProps) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 선택한 파일이 바뀌면 이전 내용을 지운다.
    setText(null);
    if (sizeBytes > MAX_PREVIEW_BYTES) {
      setText(fallback);
      return;
    }
    void readFileBytes(path)
      .then((bytes) => {
        const decoded = new TextDecoder('utf-8').decode(bytes);
        // NUL 문자가 있으면 텍스트가 아니라고 보고 경로만 보여준다.
        const content = decoded.includes('\0')
          ? fallback
          : decoded.split('\n').slice(0, MAX_PREVIEW_LINES).join('\n');
        if (active) setText(content);
      })
      .catch(() => {
        if (active) setText(fallback);
      });
    return () => {
      active = false;
    };
  }, [path, sizeBytes, fallback]);

  return <pre className={`${styles.textContent} ${styles.codeContent}`}>{text ?? ''}</pre>;
}
