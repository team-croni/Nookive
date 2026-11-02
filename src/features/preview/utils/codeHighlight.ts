// src/features/preview/utils/codeHighlight.ts
// 코드 미리보기의 문법 강조. highlight.js는 코드 결과를 처음 볼 때만 불러온다(별도 청크).
import type { HLJSApi, LanguageFn } from 'highlight.js';

type LanguageLoader = () => Promise<{ default: LanguageFn }>;

/** highlight.js 언어 이름 → 모듈. CODE_EXTS의 확장자를 모두 덮는다. */
const LANGUAGES: Record<string, LanguageLoader> = {
  typescript: () => import('highlight.js/lib/languages/typescript'),
  javascript: () => import('highlight.js/lib/languages/javascript'),
  python: () => import('highlight.js/lib/languages/python'),
  rust: () => import('highlight.js/lib/languages/rust'),
  go: () => import('highlight.js/lib/languages/go'),
  c: () => import('highlight.js/lib/languages/c'),
  cpp: () => import('highlight.js/lib/languages/cpp'),
  java: () => import('highlight.js/lib/languages/java'),
  xml: () => import('highlight.js/lib/languages/xml'),
  css: () => import('highlight.js/lib/languages/css'),
  scss: () => import('highlight.js/lib/languages/scss'),
  json: () => import('highlight.js/lib/languages/json'),
  yaml: () => import('highlight.js/lib/languages/yaml'),
  ini: () => import('highlight.js/lib/languages/ini'),
  bash: () => import('highlight.js/lib/languages/bash'),
  sql: () => import('highlight.js/lib/languages/sql'),
  swift: () => import('highlight.js/lib/languages/swift'),
  kotlin: () => import('highlight.js/lib/languages/kotlin'),
  ruby: () => import('highlight.js/lib/languages/ruby'),
  php: () => import('highlight.js/lib/languages/php'),
  csharp: () => import('highlight.js/lib/languages/csharp'),
  dart: () => import('highlight.js/lib/languages/dart'),
  lua: () => import('highlight.js/lib/languages/lua'),
  scala: () => import('highlight.js/lib/languages/scala'),
  objectivec: () => import('highlight.js/lib/languages/objectivec'),
  gradle: () => import('highlight.js/lib/languages/gradle'),
};

const EXTENSION_LANGUAGES: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  py: 'python', rs: 'rust', go: 'go',
  c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp',
  java: 'java', kt: 'kotlin', kts: 'kotlin', scala: 'scala', gradle: 'gradle',
  html: 'xml', xml: 'xml', vue: 'xml', svelte: 'xml',
  css: 'css', scss: 'scss',
  json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'ini',
  sh: 'bash', bash: 'bash', zsh: 'bash',
  sql: 'sql', swift: 'swift', rb: 'ruby', php: 'php', cs: 'csharp', dart: 'dart', lua: 'lua',
  m: 'objectivec', mm: 'objectivec',
};

let corePromise: Promise<HLJSApi> | null = null;

async function loadLanguage(name: string): Promise<HLJSApi> {
  corePromise ??= import('highlight.js/lib/core').then((module) => module.default);
  const hljs = await corePromise;
  if (!hljs.getLanguage(name)) hljs.registerLanguage(name, (await LANGUAGES[name]()).default);
  return hljs;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 강조된 HTML을 줄 단위로 나눈다. 여러 줄에 걸친 토큰(블록 주석, 여러 줄 문자열)은
 * 줄 끝에서 span을 닫고 다음 줄 앞에서 다시 연다. highlight.js는 본문의 `<`를 이스케이프하므로
 * `<`는 태그에만 나온다.
 */
export function splitHighlightedLines(html: string): string[] {
  const lines: string[] = [];
  const open: string[] = [];
  let current = '';
  let index = 0;
  while (index < html.length) {
    const char = html[index];
    if (char === '<') {
      const end = html.indexOf('>', index);
      const tag = html.slice(index, end + 1);
      if (tag.startsWith('</')) open.pop();
      else open.push(tag);
      current += tag;
      index = end + 1;
    } else if (char === '\n') {
      lines.push(current + '</span>'.repeat(open.length));
      current = open.join('');
      index += 1;
    } else {
      current += char;
      index += 1;
    }
  }
  lines.push(current);
  return lines;
}

/** 줄마다 강조된 HTML을 돌려준다. 언어를 모르거나 실패하면 이스케이프만 한다. */
export async function highlightCodeLines(lines: string[], extension: string): Promise<string[]> {
  const language = EXTENSION_LANGUAGES[extension.toLowerCase()];
  if (!language) return lines.map(escapeHtml);
  try {
    const hljs = await loadLanguage(language);
    const { value } = hljs.highlight(lines.join('\n'), { language, ignoreIllegals: true });
    return splitHighlightedLines(value);
  } catch {
    return lines.map(escapeHtml);
  }
}
