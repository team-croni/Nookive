import { describe, expect, it } from 'vitest';
import { isLowSignalQuery } from './rankQuery';

describe('isLowSignalQuery', () => {
  it.each(['ㅋㅋ', 'ㄱ', 'a', 'aaaa', 'zzzzzz', 'asdfgh', 'qwerty', '1234'])(
    'treats %s as low signal',
    (query) => {
      expect(isLowSignalQuery(query)).toBe(true);
    },
  );

  it.each(['회의록', 'invoice', '결제 실패 스크린샷', 'ab'])(
    'treats %s as a semantic query',
    (query) => {
      expect(isLowSignalQuery(query)).toBe(false);
    },
  );
});
