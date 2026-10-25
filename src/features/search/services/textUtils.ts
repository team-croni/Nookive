// src/features/search/services/textUtils.ts
// 검색어 정규화/토큰화 및 동의어 확장.

// macOS는 파일명/경로를 NFD(분해형, 예: 흠)로 저장하는 반면 사용자는 NFC(흠)로 입력한다.
// 부분일치 비교 시 양쪽을 NFC로 정규화하지 않으면 "흠" 같은 한글 파일명이 매칭되지 않는다.
export const nfc = (s: string): string => (s || '').normalize('NFC');

// 키워드 매칭에서 제외할 영문 불용어: "the/in/and" 등이 모든 문서에 우연 매칭되어
// 시맨틱 매칭(오디오/이미지)을 밀어내는 노이즈를 방지한다.
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'as', 'it', 'its', 'this', 'that',
  'these', 'those', 'from', 'into', 'about', 'over', 'under', 'your', 'you', 'my', 'me',
  'we', 'our', 'us', 'they', 'them', 'their', 'he', 'she', 'his', 'her', 'so', 'if',
  'then', 'than', 'but', 'not', 'no', 'do', 'does', 'did', 'can', 'could', 'will',
  'would', 'should', 'may', 'might', 'how', 'what', 'when', 'where', 'which', 'who',
  'whom', 'why', 'i', 'up', 'out', 'all', 'any', 'some', 'more', 'most', 'very',
]);

// 쿼리를 키워드로 분해(불용어 제거). 전부 불용어면 원문 그대로 사용.
export function tokenizeKeywords(q: string): string[] {
  const all = nfc(q).toLowerCase().trim().split(/\s+/).filter(Boolean);
  const meaningful = all.filter((k) => !STOPWORDS.has(k));
  return meaningful.length > 0 ? meaningful : all;
}

// 한/영 혼용 인덱스 대응: 간단한 동의어 확장
const SYNONYMS: Record<string, string[]> = {
  빌딩: ['building', '건물', 'skyscraper', '고층'],
  건물: ['building', '빌딩', 'skyscraper'],
  고양이: ['cat'],
  강아지: ['dog', '개'],
  바다: ['sea', 'ocean', 'beach'],
  하늘: ['sky'],
  자동차: ['car', 'vehicle'],
  사람: ['person', 'people'],
};

/** 기본 키워드에 동의어를 더해 중복 제거한 확장 키워드 목록을 만든다. */
export function expandKeywords(baseKeywords: string[]): string[] {
  return Array.from(
    new Set(baseKeywords.flatMap((kw) => [kw, ...(SYNONYMS[kw] ?? [])])),
  );
}
