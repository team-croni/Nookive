// src/hooks/useDebouncedValue.ts
import { useEffect, useState } from 'react';

/**
 * 값이 일정 시간 동안 변하지 않을 때(=입력이 멈췄을 때)만 갱신되는 디바운스 값.
 * 무거운 작업(이미지 디코딩 등)을 입력 중에는 미루고, 입력이 잠잠해진 뒤 수행할 때 사용.
 */
export function useDebouncedValue<T>(value: T, delay = 200): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
