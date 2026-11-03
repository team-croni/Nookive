// src/features/search/utils/currencyQuery.ts
// 검색어가 환율 변환인지 판단한다. 네트워크 없이 동작하고, 환율 계산은 받은 환율표로 한다.
// 예: "100 usd in krw", "$20 to eur", "50달러 원화로", "1000엔은 원으로", "100ドルは円で", "100美元等于多少人民币",
//     "(12+8) usd in eur", "1만 원을 달러로"
//
// - 통화는 ISO 코드(USD, krw), 기호($, €, ¥, ₩), 9개 언어의 흔한 이름(달러, 엔, 유로, dollar, 円, 美元)으로 쓴다.
// - "$", "dollar", "달러"처럼 여러 나라가 쓰는 말은 macOS 지역을 따른다. (캐나다면 CAD, 대만이면 TWD)
//   "¥"는 중국이면 CNY, 그 밖에는 JPY다.
// - 도착 통화가 없으면("100 usd") 결과를 내지 않는다.
//
// 이 파일의 한국어·중국어·일본어 단어는 번역 문구가 아니라 검색어를 알아보기 위한 입력 단어다.
import { calculate } from './calculator';

export interface CurrencyQuery {
  amount: number;
  /** ISO 4217 코드 */
  from: string;
  to: string;
}

export interface CurrencyParseOptions {
  /** macOS 지역 (예: "KR", "CA"). "$"·"달러" 같은 말을 정하는 데 쓴다. */
  region?: string;
}

/** 지역별 "달러"(그 나라의 달러) */
const LOCAL_DOLLAR: Record<string, string> = {
  CA: 'CAD', AU: 'AUD', NZ: 'NZD', SG: 'SGD', HK: 'HKD', TW: 'TWD', MX: 'MXN', AR: 'ARS', CL: 'CLP', CO: 'COP',
};
/** 지역별 "peso" */
const LOCAL_PESO: Record<string, string> = { MX: 'MXN', AR: 'ARS', CL: 'CLP', CO: 'COP', PH: 'PHP', UY: 'UYU' };

/** 지역에 따라 달라지는 말 */
const REGIONAL: Record<string, (region?: string) => string> = {
  dollar: (region) => (region && LOCAL_DOLLAR[region]) || 'USD',
  yen: (region) => (region === 'CN' ? 'CNY' : 'JPY'),
  yuan: (region) => (region === 'TW' ? 'TWD' : 'CNY'),
  peso: (region) => (region && LOCAL_PESO[region]) || 'MXN',
};

/** 이름·기호 → 통화. 값이 "dollar" 같은 키면 지역으로 정한다. */
const NAMES: Record<string, string> = {
  // 기호
  $: 'dollar', '€': 'EUR', '£': 'GBP', '¥': 'yen', '￥': 'yen', '₩': 'KRW', '₹': 'INR', '₽': 'RUB', '₺': 'TRY', '₫': 'VND',
  '₱': 'PHP', '฿': 'THB', '₪': 'ILS', 'us$': 'USD', 'c$': 'CAD', 'ca$': 'CAD', 'a$': 'AUD', 'au$': 'AUD', 'nz$': 'NZD',
  'hk$': 'HKD', 'nt$': 'TWD', 's$': 'SGD', 'r$': 'BRL', 'mx$': 'MXN',
  // 한국어
  원: 'KRW', 원화: 'KRW', 달러: 'dollar', 달러화: 'dollar', 미국달러: 'USD', '미국 달러': 'USD', 엔: 'JPY', 엔화: 'JPY',
  유로: 'EUR', 유로화: 'EUR', 위안: 'CNY', 위안화: 'CNY', 파운드: 'GBP', 대만달러: 'TWD', '대만 달러': 'TWD',
  홍콩달러: 'HKD', '홍콩 달러': 'HKD', 캐나다달러: 'CAD', '캐나다 달러': 'CAD', 호주달러: 'AUD', '호주 달러': 'AUD',
  싱가포르달러: 'SGD', '싱가포르 달러': 'SGD', 바트: 'THB', 동: 'VND', 루피: 'INR', 헤알: 'BRL', 페소: 'peso', 프랑: 'CHF',
  // 영어·유럽어
  dollar: 'dollar', dollars: 'dollar', 'us dollar': 'USD', 'us dollars': 'USD', buck: 'dollar', bucks: 'dollar',
  euro: 'EUR', euros: 'EUR', yen: 'yen', yuan: 'yuan', renminbi: 'CNY', rmb: 'CNY', won: 'KRW', pound: 'GBP',
  pounds: 'GBP', sterling: 'GBP', rupee: 'INR', rupees: 'INR', baht: 'THB', dong: 'VND', real: 'BRL', reais: 'BRL',
  peso: 'peso', pesos: 'peso', franc: 'CHF', francs: 'CHF', pfund: 'GBP', livre: 'GBP', livres: 'GBP', libra: 'GBP',
  libras: 'GBP', dólar: 'dollar', dólares: 'dollar', 'dólar estadounidense': 'USD',
  // 일본어
  円: 'JPY', ドル: 'dollar', 米ドル: 'USD', ユーロ: 'EUR', ウォン: 'KRW', 人民元: 'CNY', ポンド: 'GBP',
  // 중국어
  美元: 'USD', 美金: 'USD', 日元: 'JPY', 日圆: 'JPY', 日圓: 'JPY', 欧元: 'EUR', 歐元: 'EUR', 人民币: 'CNY', 人民幣: 'CNY',
  元: 'yuan', 韩元: 'KRW', 韓元: 'KRW', 韩币: 'KRW', 韓幣: 'KRW', 英镑: 'GBP', 英鎊: 'GBP', 台币: 'TWD', 台幣: 'TWD',
  新台币: 'TWD', 新台幣: 'TWD', 港币: 'HKD', 港幣: 'HKD', 港元: 'HKD',
};

/** 소문자로 써도 통화 코드로 보는 흔한 코드. (그 밖의 코드는 대문자로 써야 한다: "all", "cup" 같은 단어를 피한다) */
const COMMON_CODES = new Set([
  'usd', 'eur', 'jpy', 'krw', 'cny', 'gbp', 'twd', 'hkd', 'cad', 'aud', 'nzd', 'chf', 'inr', 'brl', 'mxn', 'vnd', 'thb',
  'sgd', 'php', 'idr', 'myr', 'sek', 'nok', 'dkk', 'pln', 'rub', 'zar', 'aed', 'sar', 'czk', 'huf', 'ils', 'ars', 'clp', 'cop',
]);

const ISO_CODES: Set<string> = (() => {
  try {
    return new Set(Intl.supportedValuesOf('currency'));
  } catch {
    return new Set([...COMMON_CODES].map((code) => code.toUpperCase()));
  }
})();

/** 통화 하나: 코드, 기호, 이름 */
function currencyOf(raw: string, options: CurrencyParseOptions): string | null {
  const text = raw.trim();
  if (!text) return null;
  if (/^[A-Z]{3}$/.test(text) && ISO_CODES.has(text)) return text;
  const lower = text.toLocaleLowerCase();
  if (COMMON_CODES.has(lower)) return lower.toUpperCase();
  const name = NAMES[lower] ?? NAMES[lower.replace(/\s+/g, '')];
  if (!name) return null;
  return REGIONAL[name] ? REGIONAL[name](options.region) : name;
}

/** "1,200", "1.5", "1만", "1만 5천", "3k", "(12+8)" */
function amountOf(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;
  const plain = /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$|^\d+(?:\.\d+)?$/.exec(text);
  if (plain) return Number(text.replace(/,/g, ''));
  const korean = /^(?:(\d+(?:\.\d+)?)\s*억)?\s*(?:(\d+(?:\.\d+)?)\s*만)?\s*(?:(\d+(?:\.\d+)?)\s*천)?\s*(\d+)?$/.exec(text);
  if (korean && (korean[1] || korean[2] || korean[3])) {
    return Number(korean[1] ?? 0) * 1e8 + Number(korean[2] ?? 0) * 1e4 + Number(korean[3] ?? 0) * 1e3 + Number(korean[4] ?? 0);
  }
  const short = /^(\d+(?:\.\d+)?)\s*([km])$/i.exec(text);
  if (short) return Number(short[1]) * (short[2].toLowerCase() === 'k' ? 1e3 : 1e6);
  // 식: "(12+8)", "15*3"
  const math = calculate(text);
  return math && !math.unit ? math.value : null;
}

/** 출발 쪽: 금액 + 통화 (기호가 앞이나 뒤, 이름·코드가 앞이나 뒤) */
function sourceOf(raw: string, options: CurrencyParseOptions): { amount: number; currency: string } | null {
  const text = raw.trim().replace(/(?:을|를|은|는|이|가|は|を|の)$/u, '').trim();
  const tries: Array<[string, string]> = [];
  let m = /^(us\$|c\$|ca\$|a\$|au\$|nz\$|hk\$|nt\$|s\$|r\$|mx\$|[$€£¥￥₩₹₽₺₫₱฿₪])\s*(.+)$/iu.exec(text);
  if (m) tries.push([m[2], m[1]]);
  m = /^(.+?)\s*([$€£¥￥₩₹₽₺₫₱฿₪])$/u.exec(text);
  if (m) tries.push([m[1], m[2]]);
  // 이름·코드가 뒤: "100 usd", "50달러", "1만 원", "100美元" (금액 쪽을 길게 잡아 "만"이 통화 이름에 붙지 않게 한다)
  m = /^([\d.,()+\-*/×÷\s만천억km]+)\s*([\p{L}][\p{L} ]*)$/iu.exec(text);
  if (m) tries.push([m[1], m[2]]);
  // 이름·코드가 앞: "usd 100", "EUR 20"
  m = /^([\p{L}]+)\s+([\d.,()+\-*/×÷\s]+)$/u.exec(text);
  if (m) tries.push([m[2], m[1]]);
  for (const [amountText, currencyText] of tries) {
    const currency = currencyOf(currencyText, options);
    const amount = currency ? amountOf(amountText) : null;
    if (currency && amount !== null && Number.isFinite(amount) && amount >= 0) return { amount, currency };
  }
  return null;
}

/** 도착 쪽에서 덧붙는 말을 뗀다: "원화로", "円で", "人民币是多少" */
const targetOf = (raw: string, options: CurrencyParseOptions) =>
  currencyOf(
    raw
      .trim()
      .replace(/\s*(?:얼마|환산|환전|바꾸면|계산|으로|로|でいくら|で|に|是多少|多少)$/u, '')
      .replace(/(?:으로|로|で|に)$/u, '')
      .trim(),
    options,
  );

const SEPARATORS: RegExp[] = [
  /^(.+?)\s*(?:→|->|=>|=)\s*(.+)$/u,
  /^(.+?)\s+(?:in|to|into|as|en|em|à|a|nach|in)\s+(.+)$/iu,
  // 한국어: "50달러 원화로", "1000엔은 원으로", "100달러를 원화로 환산"
  /^(.+?)\s+(\S+?(?:으로|로)(?:\s*(?:얼마|환산|환전|바꾸면|계산))?)$/u,
  // 일본어: "100ドルは円で", "100ドルを円に"
  /^(.+?(?:は|を))\s*(.+?(?:で|に)(?:いくら)?)$/u,
  // 중국어: "100美元等于多少人民币", "100美元换成人民币", "100美元兑人民币"
  /^(.+?)(?:等于多少|等於多少|换成|換成|兑换成?|兌換成?|兑|兌)(.+)$/u,
];

/** 환율 변환 검색어면 금액과 두 통화를, 아니면 null을 돌려준다. */
export function parseCurrencyQuery(input: string, options: CurrencyParseOptions = {}): CurrencyQuery | null {
  const text = input.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!text || text.length > 60) return null;
  for (const pattern of SEPARATORS) {
    const m = pattern.exec(text);
    if (!m) continue;
    const source = sourceOf(m[1], options);
    const to = source ? targetOf(m[2], options) : null;
    if (source && to && to !== source.currency) return { amount: source.amount, from: source.currency, to };
  }
  return null;
}

// ── 환율 계산 ────────────────────────────────────────────────────────

export interface RateTable {
  base: string;
  rates: Record<string, number>;
  /** 환율표가 만들어진 시각 (Unix 초) */
  updatedAt: number;
}

/** 1 from = ? to. 두 통화 중 하나라도 표에 없으면 null */
export function rateOf(table: RateTable, from: string, to: string): number | null {
  const fromRate = from === table.base ? 1 : table.rates[from];
  const toRate = to === table.base ? 1 : table.rates[to];
  return fromRate && toRate ? toRate / fromRate : null;
}

/** 통화의 소수 자리(원·엔은 0, 달러는 2) */
export function fractionDigitsOf(currency: string): number {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}
