import { describe, expect, it } from 'vitest';
import { expandKeywords, hangulCompletionPattern, nfc, tokenizeKeywords } from './textUtils';

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

describe('hangulCompletionPattern', () => {
  const matches = (keyword: string, name: string) => hangulCompletionPattern(keyword)?.test(name) ?? false;

  it('completes a trailing consonant into any syllable with that initial', () => {
    expect(matches('카카오ㅌ', '카카오톡')).toBe(true);
    expect(matches('카카오ㅌ', '카카오페이')).toBe(false);
  });

  it('completes a syllable that is still waiting for its final consonant', () => {
    expect(matches('카카오토', '카카오톡')).toBe(true);
    expect(matches('캘리', '캘린더')).toBe(true);
    expect(matches('카카오토', '카카오택시')).toBe(false);
  });

  it('moves a final consonant to the next syllable', () => {
    expect(matches('카카옽', '카카오톡')).toBe(true);
    expect(matches('카카옽', '카카옽')).toBe(true);
  });

  it('ignores keywords that are not being composed', () => {
    expect(hangulCompletionPattern('slack')).toBeNull();
    expect(hangulCompletionPattern('카카옭')).toBeNull();
  });
});
