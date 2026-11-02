// src/utils/webSearchEngines.ts
// 웹 검색에 쓸 수 있는 검색 엔진. 자동완성 요청 주소는 Rust(web.rs)의 같은 id 목록에서 만든다.
//
// - 이름은 번역하지 않는 고유 명사다. 다만 자국 브랜드는 그 언어에서 공식으로 쓰는 이름을 보여준다. (네이버, 百度)
// - 메뉴는 Google, 지금 언어에서 많이 쓰는 엔진, 나머지 순서다.
// - 기본은 Google이고, 간체 중국어만 Baidu다. (중국 본토에서는 Google에 접속할 수 없다)
export type WebSearchEngineId = 'google' | 'bing' | 'duckduckgo' | 'brave' | 'ecosia' | 'naver' | 'baidu';

export interface WebSearchEngine {
  id: WebSearchEngineId;
  /** 기본 이름 */
  name: string;
  /** 언어별 이름. 키는 언어 코드나 그 앞부분(예: "zh"는 zh-CN, zh-TW 모두) */
  localNames?: Record<string, string>;
  /** 이 엔진을 Google 다음에 올릴 언어 */
  regionalLanguages?: readonly string[];
  searchUrl: (query: string, language: string) => string;
}

const q = encodeURIComponent;

export const WEB_SEARCH_ENGINES: readonly WebSearchEngine[] = [
  { id: 'google', name: 'Google', searchUrl: (query, language) => `https://www.google.com/search?q=${q(query)}&hl=${q(language)}` },
  { id: 'bing', name: 'Bing', searchUrl: (query) => `https://www.bing.com/search?q=${q(query)}` },
  { id: 'duckduckgo', name: 'DuckDuckGo', searchUrl: (query) => `https://duckduckgo.com/?q=${q(query)}` },
  { id: 'brave', name: 'Brave Search', searchUrl: (query) => `https://search.brave.com/search?q=${q(query)}` },
  { id: 'ecosia', name: 'Ecosia', searchUrl: (query) => `https://www.ecosia.org/search?q=${q(query)}` },
  {
    id: 'naver',
    name: 'Naver',
    localNames: { ko: '네이버' },
    regionalLanguages: ['ko'],
    searchUrl: (query) => `https://search.naver.com/search.naver?query=${q(query)}`,
  },
  {
    id: 'baidu',
    name: 'Baidu',
    localNames: { zh: '百度' },
    regionalLanguages: ['zh'],
    searchUrl: (query) => `https://www.baidu.com/s?wd=${q(query)}`,
  },
];

/** "zh-CN"은 "zh-CN", "zh" 순서로 찾는다. */
function languageKeys(language: string): string[] {
  const base = language.split('-')[0];
  return base === language ? [language] : [language, base];
}

export function webSearchEngineName(engine: WebSearchEngine, language: string): string {
  for (const key of languageKeys(language)) {
    const local = engine.localNames?.[key];
    if (local) return local;
  }
  return engine.name;
}

/** 메뉴 순서: Google, 지금 언어의 지역 엔진, 나머지(목록 순서). */
export function sortedWebSearchEngines(language: string): WebSearchEngine[] {
  const keys = languageKeys(language);
  const isRegional = (engine: WebSearchEngine) =>
    engine.regionalLanguages?.some((code) => keys.includes(code)) ?? false;
  const google = WEB_SEARCH_ENGINES.filter((engine) => engine.id === 'google');
  const regional = WEB_SEARCH_ENGINES.filter((engine) => engine.id !== 'google' && isRegional(engine));
  const rest = WEB_SEARCH_ENGINES.filter((engine) => engine.id !== 'google' && !isRegional(engine));
  return [...google, ...regional, ...rest];
}

/** 사용자가 아직 고르지 않았을 때의 엔진 */
export function defaultWebSearchEngineId(language: string): WebSearchEngineId {
  return language === 'zh-CN' ? 'baidu' : 'google';
}

/** 저장된 값이 목록에 없으면(고르지 않았거나 지워진 엔진) 언어별 기본 엔진을 돌려준다. */
export function findWebSearchEngine(id: string | null | undefined, language: string): WebSearchEngine {
  const fallback = defaultWebSearchEngineId(language);
  return WEB_SEARCH_ENGINES.find((engine) => engine.id === id)
    ?? WEB_SEARCH_ENGINES.find((engine) => engine.id === fallback)!;
}
