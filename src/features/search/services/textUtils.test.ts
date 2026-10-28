import { describe, expect, it } from 'vitest';
import { expandKeywords, nfc, tokenizeKeywords } from './textUtils';

describe('nfc', () => {
  it('composes decomposed Hangul from macOS file names', () => {
    const decomposed = '흠'.normalize('NFD');
    expect(decomposed).not.toBe('흠');
    expect(nfc(decomposed)).toBe('흠');
  });
});

describe('tokenizeKeywords', () => {
  it('lowercases, splits on whitespace and drops stopwords', () => {
    expect(tokenizeKeywords('  The Quarterly   REPORT of 2026 ')).toEqual([
      'quarterly',
      'report',
      '2026',
    ]);
  });

  it('keeps the original words when every word is a stopword', () => {
    expect(tokenizeKeywords('what is this')).toEqual(['what', 'is', 'this']);
  });
});

describe('expandKeywords', () => {
  it('adds synonyms without duplicates', () => {
    expect(expandKeywords(['고양이', 'cat'])).toEqual(['고양이', 'cat']);
    expect(expandKeywords(['바다'])).toEqual(['바다', 'sea', 'ocean', 'beach']);
  });
});
