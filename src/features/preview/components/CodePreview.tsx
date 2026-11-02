// src/features/preview/components/CodePreview.tsx
// 코드 검색 결과를 에디터처럼 보여준다: 어두운 면, 줄 번호, 문법 강조, 줄바꿈 없는 가로 스크롤. (선택했을 때만 읽는다)
// 내용이 일치한 결과면 그 줄을 강조하고 미리보기 가운데로 스크롤한다.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { readFileBytes } from '../../../utils/tauriBridge';
import { scrollChildIntoView } from '../../../utils/scroll';
import { highlightCodeLines } from '../utils/codeHighlight';
import styles from './PreviewPane.module.css';

const MAX_PREVIEW_BYTES = 1024 * 1024;
const MAX_PREVIEW_LINES = 400;
/** 일치한 줄 아래로 더 보여줄 줄 수 */
const LINES_AFTER_MATCH = 200;

interface CodePreviewProps {
  path: string;
  extension: string;
  sizeBytes: number;
  /** 읽지 못했거나 너무 큰 파일에서 대신 보여줄 텍스트 */
  fallback: string;
  /** 가장 잘 맞는 줄 (1부터). 가운데로 스크롤한다. 이름/경로 결과면 없다. */
  line?: number;
  /** 같은 파일에서 일치한 줄 전체. line과 함께 강조한다. */
  matchLines?: number[];
  query: string;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 강조된 줄 안의 텍스트 노드에서 검색어를 찾아 <mark>로 감싼다. (토큰 경계를 넘는 일치는 표시하지 않는다) */
function markQuery(element: HTMLElement, query: string) {
  const keywords = query.trim().split(/\s+/).filter(Boolean).map(escapeRegExp);
  if (keywords.length === 0) return;
  const pattern = new RegExp(`(${keywords.join('|')})`, 'gi');
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    const parts = (node.nodeValue ?? '').split(pattern);
    if (parts.length < 2) continue;
    const fragment = document.createDocumentFragment();
    parts.forEach((part, index) => {
      if (!part) return;
      if (index % 2 === 1) {
        const mark = document.createElement('mark');
        mark.textContent = part;
        fragment.appendChild(mark);
      } else {
        fragment.appendChild(document.createTextNode(part));
      }
    });
    node.replaceWith(fragment);
  }
}

export function CodePreview({ path, extension, sizeBytes, fallback, line, matchLines, query }: CodePreviewProps) {
  const [lines, setLines] = useState<string[] | null>(null);
  const [html, setHtml] = useState<string[] | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 선택한 파일이 바뀌면 이전 내용을 지운다.
    setLines(null);
    setHtml(null);
    const show = (next: string[]) => {
      if (active) setLines(next);
    };
    if (sizeBytes > MAX_PREVIEW_BYTES) {
      show(fallback.split('\n'));
      return;
    }
    void readFileBytes(path)
      .then((bytes) => {
        const decoded = new TextDecoder('utf-8').decode(bytes);
        // NUL 문자가 있으면 텍스트가 아니라고 보고 경로만 보여준다.
        show(decoded.includes('\0') ? fallback.split('\n') : decoded.split(/\r?\n/));
      })
      .catch(() => show(fallback.split('\n')));
    return () => {
      active = false;
    };
  }, [path, sizeBytes, fallback]);

  const inRange = (value: number | undefined) =>
    value !== undefined && lines !== null && value >= 1 && value <= lines.length;
  // 이름으로 찾은 파일에 내용 일치도 있으면 첫 일치 줄로 간다.
  const matched = new Set((matchLines ?? []).filter(inRange));
  const target = [line, ...matched].find(inRange);
  const lastMatch = Math.max(target ?? 0, ...matched);
  const visibleCount = Math.max(MAX_PREVIEW_LINES, lastMatch + LINES_AFTER_MATCH);
  const visible = lines?.slice(0, visibleCount) ?? null;

  // 강조는 처음 보이는 줄부터 해야 여러 줄 주석·문자열이 맞게 칠해진다. 끝나기 전에는 일반 텍스트로 보여준다.
  useEffect(() => {
    if (!visible) return;
    let active = true;
    void highlightCodeLines(visible, extension).then((result) => {
      if (active) setHtml(result);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- visible은 lines와 visibleCount에서 만든다.
  }, [lines, visibleCount, extension]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !html) return;
    // 이미 표시한 줄은 건너뛴다. (검색어나 강조가 바뀌면 줄을 다시 만들어 표시가 지워진다)
    container.querySelectorAll<HTMLElement>('[data-match] code').forEach((code) => {
      if (!code.querySelector('mark')) markQuery(code, query);
    });
    if (!lineRef.current) return;
    // 줄바꿈하지 않으므로 검색어가 오른쪽에 가려져 있으면 보이도록 가로로 스크롤한다.
    const mark = lineRef.current.querySelector('mark');
    if (!mark) return;
    const markRight = mark.getBoundingClientRect().right;
    const visibleRight = container.getBoundingClientRect().right;
    container.scrollLeft = markRight > visibleRight ? container.scrollLeft + markRight - visibleRight + 48 : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 일치 줄 목록은 매 렌더 새 배열이라 문자열로 비교한다.
  }, [html, target, query, matchLines?.join(',')]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollLeft = 0;
    if (lineRef.current) scrollChildIntoView(container, lineRef.current, { block: 'center' });
    else container.scrollTop = 0;
  }, [lines, target]);

  const gutterStyle = { '--gutter-width': `${String(visible?.length ?? 1).length}ch` } as CSSProperties;

  return (
    <div ref={containerRef} className={styles.codeView} style={gutterStyle}>
      <div className={styles.codeLines}>
        {visible?.map((text, index) => {
          const number = index + 1;
          const isTarget = number === target;
          const isMatch = isTarget || matched.has(number);
          const lineHtml = html?.[index];
          return (
            <div
              // 강조 전후로 줄을 다시 만들어 이전에 넣은 <mark>가 남지 않게 한다.
              key={`${number}-${lineHtml === undefined ? 'plain' : 'html'}-${isMatch ? query : ''}`}
              ref={isTarget ? lineRef : undefined}
              data-match={isMatch || undefined}
              className={`${styles.codeLine} ${isTarget ? styles.codeMatchLine : isMatch ? styles.codeOtherMatchLine : ''}`}
            >
              <span className={styles.codeGutter}>{number}</span>
              {lineHtml === undefined ? (
                <code className={styles.codeText}>{text || ' '}</code>
              ) : (
                <code className={styles.codeText} dangerouslySetInnerHTML={{ __html: lineHtml || ' ' }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
