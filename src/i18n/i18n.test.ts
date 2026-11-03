// 다국어 회귀 테스트.
// 1. 모든 언어가 en과 같은 키를 갖는지 (빠진 키는 화면에 영어로 섞여 나온다)
// 2. 화면 코드에 한국어 문구가 직접 들어가 있지 않은지 (영어 등 다른 언어에서 그대로 노출된다)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const LOCALES_DIR = new URL('./locales/', import.meta.url).pathname;
const SRC_DIR = new URL('../', import.meta.url).pathname;
const NAMESPACES = ['common', 'search', 'preview', 'settings'];

// 화면 문구가 아닌 한국어 데이터를 다루는 파일
const ALLOWED_FILES = new Set([
  // 검색어 해석: 동의어, 파일 종류 힌트
  'features/search/services/textUtils.ts',
  'features/search/services/scoring.ts',
  // Rust의 저장 공간 부족 오류 문구를 알아보는 정규식
  'features/settings/indexingWorker.ts',
  // 검색 엔진의 현지 브랜드 이름(네이버). 번역 문구가 아니라 고유 명사다.
  'utils/webSearchEngines.ts',
  // 계산기가 알아듣는 한국어 단위 이름과 조사(킬로미터, 평, ~를 ~로). 화면 문구가 아니라 입력 해석 규칙이다.
  'features/search/utils/calculator.ts',
  // 날씨 검색어와 지명을 알아보는 한국어·중국어·일본어 단어(날씨, 내일, ~구). 화면 문구가 아니라 입력 해석 규칙이다.
  'features/search/utils/weatherQuery.ts',
  'features/search/utils/weatherPlaces.ts',
]);

const flatKeys = (value: unknown, prefix = ''): string[] =>
  typeof value === 'object' && value !== null
    ? Object.entries(value).flatMap(([key, child]) => flatKeys(child, prefix ? `${prefix}.${key}` : key))
    : [prefix];

const readLocale = (locale: string, namespace: string): unknown =>
  JSON.parse(readFileSync(join(LOCALES_DIR, locale, `${namespace}.json`), 'utf-8'));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'locales' || name === 'evaluation' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
  });
}

/** 주석과 console 로그를 뺀 줄에 한글이 남아 있으면 화면 문구로 본다. */
function hardcodedKorean(source: string): number[] {
  const withoutBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
  return withoutBlockComments.split('\n').flatMap((line, index) => {
    const code = line.replace(/\/\/.*$/, '');
    if (/console\.(log|warn|error|info|debug)\(/.test(code)) return [];
    return /[가-힣ㄱ-ㅎ]/.test(code) ? [index + 1] : [];
  });
}

describe('translations', () => {
  const locales = readdirSync(LOCALES_DIR).filter((name) => statSync(join(LOCALES_DIR, name)).isDirectory());

  it('includes every supported locale', async () => {
    const { supportedLocales } = await import('./supportedLocales');
    expect([...locales].sort()).toEqual([...supportedLocales].sort());
  });

  it.each(NAMESPACES)('has every English key in each locale (%s)', (namespace) => {
    const englishKeys = flatKeys(readLocale('en', namespace)).sort();
    for (const locale of locales) {
      const keys = new Set(flatKeys(readLocale(locale, namespace)));
      const missing = englishKeys.filter((key) => !keys.has(key));
      expect(missing, `${locale}/${namespace}.json is missing keys`).toEqual([]);
    }
  });

  // {{value}} 같은 자리표시자가 빠지거나 이름이 다르면 그 언어에서만 값이 보이지 않는다.
  it.each(NAMESPACES)('keeps the same placeholders as English (%s)', (namespace) => {
    const placeholders = (text: unknown) =>
      typeof text === 'string' ? [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((match) => match[1]).sort().join(',') : '';
    const english = readLocale('en', namespace);
    const valueAt = (root: unknown, key: string) =>
      key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], root);
    for (const locale of locales) {
      const translated = readLocale(locale, namespace);
      const mismatched = flatKeys(english).filter(
        (key) => placeholders(valueAt(english, key)) !== placeholders(valueAt(translated, key)),
      );
      expect(mismatched, `${locale}/${namespace}.json has different placeholders`).toEqual([]);
    }
  });

  it('keeps Korean text out of UI source files', () => {
    const offenders = sourceFiles(SRC_DIR)
      .map((path) => relative(SRC_DIR, path))
      .filter((path) => !ALLOWED_FILES.has(path))
      .flatMap((path) => hardcodedKorean(readFileSync(join(SRC_DIR, path), 'utf-8')).map((line) => `${path}:${line}`));
    expect(offenders, 'move these strings into src/i18n/locales').toEqual([]);
  });
});
