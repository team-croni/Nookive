// src/features/search/services/textUtils.ts
// 검색어 정규화/토큰화 및 동의어 확장.

// macOS는 파일명/경로를 NFD(분해형, 예: 흠)로 저장하는 반면 사용자는 NFC(흠)로 입력한다.
// 부분일치 비교 시 양쪽을 NFC로 정규화하지 않으면 "흠" 같은 한글 파일명이 매칭되지 않는다.
export const nfc = (s: string): string => (s || '').normalize('NFC');

/**
 * 이름 비교용: NFC로 맞추고 모든 공백 문자를 일반 공백으로 바꾼다.
 * macOS 앱 이름에는 줄바꿈 없는 공백(U+00A0)이 들어 있기도 해서("나의\u00a0찾기")
 * 키보드로 친 공백과 같은 글자로 보이게 한다.
 */
export const nfcName = (s: string): string => nfc(s).replace(/\s/g, ' ');

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

// ── 한글 입력 중간 상태 ─────────────────────────────────────────────
// "카카오톡"을 입력하면 검색창에는 "카카오ㅌ" → "카카오토" → "카카오톡"이 차례로 들어온다.
// 마지막 글자가 아직 조합 중이면 그 글자가 될 수 있는 완성형까지 이름 매칭에서 인정한다.
const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;
const JUNGSEONG_COUNT = 21;
const JONGSEONG_COUNT = 28;
const SYLLABLES_PER_CHOSEONG = JUNGSEONG_COUNT * JONGSEONG_COUNT;
// 호환용 자모 → 초성 순서 (ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ)
const CHOSEONG = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
// 종성 순서 (0은 받침 없음). 겹받침은 다음 글자로 옮겨 가지 않으므로 빈 칸으로 둔다.
const JONGSEONG = ' ㄱㄲ ㄴ  ㄷㄹ       ㅁㅂ ㅅㅆㅇㅈㅊㅋㅌㅍㅎ';

const syllable = (choseong: number, jungseong: number, jongseong = 0): string =>
  String.fromCharCode(
    HANGUL_BASE + choseong * SYLLABLES_PER_CHOSEONG + jungseong * JONGSEONG_COUNT + jongseong,
  );

/** 초성이 같은 모든 완성형 글자 범위 (예: ㅌ → [타-팋]) */
const choseongRange = (choseong: number): string =>
  `[${syllable(choseong, 0)}-${syllable(choseong, JUNGSEONG_COUNT - 1, JONGSEONG_COUNT - 1)}]`;

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 키워드의 마지막 글자가 조합 중인 한글이면, 완성될 수 있는 형태까지 받는 정규식을 만든다.
 * - "카카오ㅌ" → "카카오" + ㅌ으로 시작하는 글자
 * - "카카오토" → "카카오" + "토"에 받침이 붙은 글자(토, 톡, 톤 …)
 * - "카카옽"   → "카카옽" 또는 "카카오" + ㅌ으로 시작하는 글자 (입력기가 자음을 받침으로 붙인 경우)
 * 조합 중이 아니면 null을 돌려준다.
 */
export function hangulCompletionPattern(keyword: string): RegExp | null {
  if (!keyword) return null;
  const prefix = escapeRegExp(keyword.slice(0, -1));
  const last = keyword.charAt(keyword.length - 1);
  const choseong = CHOSEONG.indexOf(last);
  if (choseong >= 0) return new RegExp(`${prefix}${choseongRange(choseong)}`);

  const code = last.charCodeAt(0);
  if (code < HANGUL_BASE || code > HANGUL_LAST) return null;
  const offset = code - HANGUL_BASE;
  const lead = Math.floor(offset / SYLLABLES_PER_CHOSEONG);
  const vowel = Math.floor((offset % SYLLABLES_PER_CHOSEONG) / JONGSEONG_COUNT);
  const tail = offset % JONGSEONG_COUNT;
  if (tail === 0) {
    return new RegExp(`${prefix}[${syllable(lead, vowel, 0)}-${syllable(lead, vowel, JONGSEONG_COUNT - 1)}]`);
  }
  const movable = CHOSEONG.indexOf(JONGSEONG.charAt(tail));
  if (movable < 0) return null;
  return new RegExp(`${prefix}(?:${escapeRegExp(last)}|${syllable(lead, vowel, 0)}${choseongRange(movable)})`);
}
