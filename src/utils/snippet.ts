// src/utils/snippet.ts

/**
 * 검색 키워드가 위치한 문맥을 중심으로 앞뒤 내용을 적절히 잘라내는 스마트 스니펫 추출기
 */
export function createSmartSnippet(text: string, query: string, maxLength = 130): string {
  if (!text) return '';
  const trimmed = query.trim().toLowerCase();
  
  if (!trimmed) {
    return text.length > maxLength ? text.slice(0, maxLength).trim() + '...' : text;
  }

  const keywords = trimmed.split(/\s+/).filter(Boolean);
  if (keywords.length === 0) {
    return text.length > maxLength ? text.slice(0, maxLength).trim() + '...' : text;
  }

  // 1. 가장 먼저 등장하는 키워드의 인덱스 탐색
  const lowerText = text.toLowerCase();
  let firstMatchIdx = -1;

  for (const kw of keywords) {
    const idx = lowerText.indexOf(kw);
    if (idx !== -1 && (firstMatchIdx === -1 || idx < firstMatchIdx)) {
      firstMatchIdx = idx;
    }
  }

  // 본문에 키워드가 없으면(파일명만 일치한 경우 등) 앞부분부터 표시
  if (firstMatchIdx === -1) {
    return text.length > maxLength ? text.slice(0, maxLength).trim() + '...' : text;
  }

  // 2. 키워드 중심 윈도우 계산 (키워드 앞 약 32자 확보)
  const prefixLength = 32;
  let start = Math.max(0, firstMatchIdx - prefixLength);
  let end = Math.min(text.length, start + maxLength);

  // 앞쪽 단어가 잘리지 않도록 첫 공백 위치 보정 (start > 0 일 때)
  if (start > 0) {
    const nextSpace = text.indexOf(' ', start);
    if (nextSpace !== -1 && nextSpace < firstMatchIdx) {
      start = nextSpace + 1;
    }
  }

  let snippet = text.slice(start, end).trim();
  if (start > 0) {
    snippet = '...' + snippet;
  }
  if (end < text.length) {
    snippet = snippet + '...';
  }

  return snippet;
}
