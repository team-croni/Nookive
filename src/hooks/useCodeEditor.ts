// src/hooks/useCodeEditor.ts
// 코드 파일을 열 에디터 설정과 설치된 에디터 목록. 설정 창과 검색 창이 함께 쓴다.
import { useEffect, useState } from 'react';
import { listCodeEditors, type CodeEditor } from '../utils/tauriBridge';
import { getCodeEditor, subscribeCodeEditor } from '../utils/codeSearchPreference';

export function useCodeEditor() {
  const [preference, setPreference] = useState(getCodeEditor);
  const [editors, setEditors] = useState<CodeEditor[]>([]);

  useEffect(() => {
    let active = true;
    void listCodeEditors().then((list) => {
      if (active) setEditors(list);
    });
    const unsubscribe = subscribeCodeEditor(setPreference);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  // 실제로 열릴 에디터. 자동이면 첫 번째로 찾은 에디터이고, 고른 에디터가 지워졌거나 기본 앱이면 없다.
  const editor = preference === 'auto'
    ? editors[0]
    : editors.find((item) => item.id === preference);

  return { preference, editors, editor };
}
