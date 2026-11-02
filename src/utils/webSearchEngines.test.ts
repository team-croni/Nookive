import { describe, expect, it } from 'vitest';
import {
  defaultWebSearchEngineId,
  findWebSearchEngine,
  sortedWebSearchEngines,
  webSearchEngineName,
} from './webSearchEngines';

const ids = (language: string) => sortedWebSearchEngines(language).map((engine) => engine.id);

describe('webSearchEngines', () => {
  it('shows local brand names only in their own language', () => {
    const naver = findWebSearchEngine('naver', 'en');
    const baidu = findWebSearchEngine('baidu', 'en');
    expect(webSearchEngineName(naver, 'ko')).toBe('네이버');
    expect(webSearchEngineName(naver, 'en')).toBe('Naver');
    expect(webSearchEngineName(baidu, 'zh-CN')).toBe('百度');
    expect(webSearchEngineName(baidu, 'zh-TW')).toBe('百度');
    expect(webSearchEngineName(baidu, 'ja')).toBe('Baidu');
    expect(webSearchEngineName(findWebSearchEngine('google', 'ko'), 'ko')).toBe('Google');
  });

  it('puts Google first, then engines for the current language', () => {
    expect(ids('ko').slice(0, 2)).toEqual(['google', 'naver']);
    expect(ids('zh-CN').slice(0, 2)).toEqual(['google', 'baidu']);
    expect(ids('en')).toEqual(['google', 'bing', 'duckduckgo', 'brave', 'ecosia', 'naver', 'baidu']);
  });

  it('defaults to Baidu only for Simplified Chinese and keeps a saved choice', () => {
    expect(defaultWebSearchEngineId('zh-CN')).toBe('baidu');
    expect(defaultWebSearchEngineId('zh-TW')).toBe('google');
    expect(findWebSearchEngine(null, 'zh-CN').id).toBe('baidu');
    expect(findWebSearchEngine('removed-engine', 'ko').id).toBe('google');
    expect(findWebSearchEngine('bing', 'zh-CN').id).toBe('bing');
  });
});
