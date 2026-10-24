// src/features/search/hooks/useKeyboardNav.ts
import { useEffect, useRef } from 'react';

interface UseKeyboardNavProps {
  itemCount: number;
  selectedIndex: number;
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
  onEnter?: (index: number) => void;
  onEscape?: () => void;
}

export function useKeyboardNav({
  itemCount,
  selectedIndex,
  setSelectedIndex,
  onEnter,
  onEscape,
}: UseKeyboardNavProps) {
  // 최신 값/콜백을 ref로 보관해 keydown 리스너를 단 한 번만 등록한다.
  // (매 렌더마다 리스너를 해제/재등록하면 방향키 연타 시 불필요한 churn 발생)
  const stateRef = useRef({ itemCount, selectedIndex, onEnter, onEscape });
  stateRef.current = { itemCount, selectedIndex, onEnter, onEscape };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const { itemCount, selectedIndex, onEnter, onEscape } = stateRef.current;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (itemCount > 0 ? (prev + 1) % itemCount : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (itemCount > 0 ? (prev - 1 + itemCount) % itemCount : 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (onEnter && itemCount > 0) {
          onEnter(selectedIndex);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (onEscape) {
          onEscape();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setSelectedIndex]);
}
