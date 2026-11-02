import { describe, expect, it } from 'vitest';
import { cycleSearchMode, nextSearchModeForKey, parseModePrefix } from './searchModes';

const key = (key: string, extra: Partial<Parameters<typeof nextSearchModeForKey>[0]> = {}) => ({
  key,
  shiftKey: false,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  isComposing: false,
  ...extra,
});

describe('parseModePrefix', () => {
  it('detects an available mode prefix and strips following spaces', () => {
    expect(parseModePrefix('code:', ['code'])).toEqual({ mode: 'code', rest: '' });
    expect(parseModePrefix('code: useSearch', ['code'])).toEqual({ mode: 'code', rest: 'useSearch' });
    expect(parseModePrefix('CODE:main.rs', ['code'])).toEqual({ mode: 'code', rest: 'main.rs' });
  });

  it('ignores unavailable modes and text without the prefix', () => {
    expect(parseModePrefix('code: main', [])).toBeNull();
    expect(parseModePrefix('code', ['code'])).toBeNull();
    expect(parseModePrefix('my code: notes', ['code'])).toBeNull();
    expect(parseModePrefix(' code:x', ['code'])).toBeNull();
  });
});

describe('cycleSearchMode', () => {
  it('cycles through available modes and back to all', () => {
    expect(cycleSearchMode('all', ['code'])).toBe('code');
    expect(cycleSearchMode('code', ['code'])).toBe('all');
    expect(cycleSearchMode('all', ['code'], true)).toBe('code');
  });

  it('stays on all when no mode is available and leaves a disabled mode', () => {
    expect(cycleSearchMode('all', [])).toBe('all');
    expect(cycleSearchMode('code', [])).toBe('all');
  });
});

describe('nextSearchModeForKey', () => {
  it('moves with Tab and Shift+Tab', () => {
    expect(nextSearchModeForKey(key('Tab'), 'all', ['code'], '')).toBe('code');
    expect(nextSearchModeForKey(key('Tab'), 'code', ['code'], 'main')).toBe('all');
    expect(nextSearchModeForKey(key('Tab', { shiftKey: true }), 'code', ['code'], '')).toBe('all');
    expect(nextSearchModeForKey(key('Tab'), 'all', [], '')).toBeNull();
  });

  it('returns to all with Backspace only when the input is empty', () => {
    expect(nextSearchModeForKey(key('Backspace'), 'code', ['code'], '')).toBe('all');
    expect(nextSearchModeForKey(key('Backspace'), 'code', ['code'], 'a')).toBeNull();
    expect(nextSearchModeForKey(key('Backspace'), 'all', ['code'], '')).toBeNull();
  });

  it('leaves modifier shortcuts and IME composition alone', () => {
    for (const extra of [{ metaKey: true }, { ctrlKey: true }, { altKey: true }, { isComposing: true }]) {
      expect(nextSearchModeForKey(key('Tab', extra), 'all', ['code'], '')).toBeNull();
    }
    expect(nextSearchModeForKey(key('a'), 'all', ['code'], '')).toBeNull();
  });
});
