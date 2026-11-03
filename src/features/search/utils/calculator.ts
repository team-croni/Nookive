// src/features/search/utils/calculator.ts
// 검색창 계산기와 단위 변환. 입력을 코드로 실행하지 않고(eval 없음) 작은 파서로 계산하며 네트워크를 쓰지 않는다.
//
// - 계산: + - * / ^, ×·÷, 괄호, 소수, 단항 부호, 뒤에 붙는 %(퍼센트), "15% of 80", 천 단위 쉼표(1,200)
// - 단위: "10 km in mi", "10km to mi", "100f → c", "10킬로미터를 마일로"
// - 계산이 아닌 입력(숫자만, 날짜, 버전, 일반 단어)에는 결과를 내지 않는다.

export interface Calculation {
  kind: 'math' | 'unit';
  value: number;
  /** 결과 단위 기호 (단위 변환만) */
  unit?: string;
  /** 사람이 읽는 입력 해석. 예: "12 × 7", "10 km → mi" */
  interpretation: string;
}

// ---------- 계산식 ----------

type Token = { type: 'num'; value: number } | { type: 'op'; value: string };

/** 천 단위 쉼표가 있는 숫자(1,200,000)와 일반 숫자(1200.5, .5) */
const NUMBER = /^(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+)/;

function tokenize(input: string): Token[] | null {
  const tokens: Token[] = [];
  let rest = input;
  while (rest.length > 0) {
    const space = /^\s+/.exec(rest);
    if (space) {
      rest = rest.slice(space[0].length);
      continue;
    }
    const number = NUMBER.exec(rest);
    if (number) {
      tokens.push({ type: 'num', value: Number(number[0].replace(/,/g, '')) });
      rest = rest.slice(number[0].length);
      continue;
    }
    const char = rest[0];
    const op = char === '×' ? '*' : char === '÷' ? '/' : char;
    if (!'+-*/^%()'.includes(op)) return null;
    tokens.push({ type: 'op', value: op });
    rest = rest.slice(1);
  }
  return tokens;
}

/** 재귀 하강 파서. 실패하면 null. */
function evaluateTokens(tokens: Token[]): number | null {
  let index = 0;
  const peek = () => tokens[index];
  const isOp = (value: string) => peek()?.type === 'op' && peek()?.value === value;

  function expression(): number | null {
    let left = term();
    while (left !== null && (isOp('+') || isOp('-'))) {
      const op = (tokens[index++] as { value: string }).value;
      const right = term();
      if (right === null) return null;
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function term(): number | null {
    let left = power();
    while (left !== null && (isOp('*') || isOp('/'))) {
      const op = (tokens[index++] as { value: string }).value;
      const right = power();
      if (right === null) return null;
      left = op === '*' ? left * right : left / right;
    }
    return left;
  }

  // 거듭제곱은 오른쪽 결합이고 단항 부호보다 먼저 묶인다. (-2^2 = -4)
  function power(): number | null {
    if (isOp('-') || isOp('+')) {
      const sign = (tokens[index++] as { value: string }).value === '-' ? -1 : 1;
      const value = power();
      return value === null ? null : sign * value;
    }
    const base = postfix();
    if (base === null) return null;
    if (isOp('^')) {
      index += 1;
      const exponent = power();
      return exponent === null ? null : base ** exponent;
    }
    return base;
  }

  function postfix(): number | null {
    let value = primary();
    while (value !== null && isOp('%')) {
      index += 1;
      value /= 100;
    }
    return value;
  }

  function primary(): number | null {
    const token = peek();
    if (!token) return null;
    if (token.type === 'num') {
      index += 1;
      return token.value;
    }
    if (token.value === '(') {
      index += 1;
      const value = expression();
      if (value === null || !isOp(')')) return null;
      index += 1;
      return value;
    }
    return null;
  }

  const result = expression();
  return result !== null && index === tokens.length ? result : null;
}

/** 날짜(2026-11-03, 11/3/2026)와 전화번호(010-1234-5678)처럼 생긴 입력 */
const DATE_OR_PHONE = /^\d+([-/.])\d+\1\d+$/;

function evaluateMath(input: string): Calculation | null {
  const trimmed = input.trim();
  if (DATE_OR_PHONE.test(trimmed)) return null;
  // "15% of 80" → 15% × 80
  const normalized = trimmed.replace(/(\d)\s*%\s*of\s+/gi, '$1% * ');
  const tokens = tokenize(normalized);
  if (!tokens || tokens.length === 0) return null;
  // 연산자가 하나도 없으면(숫자만) 계산이 아니다. 괄호만 있는 것도 마찬가지다.
  const hasOperator = tokens.some((token) => token.type === 'op' && token.value !== '(' && token.value !== ')');
  if (!hasOperator) return null;
  const value = evaluateTokens(tokens);
  if (value === null || !Number.isFinite(value)) return null;
  return {
    kind: 'math',
    value,
    interpretation: normalized.replace(/\s*\*\s*/g, ' × ').replace(/\s*\/\s*/g, ' ÷ ').replace(/\s+/g, ' ').trim(),
  };
}

// ---------- 단위 변환 ----------

type Category = 'length' | 'mass' | 'temperature' | 'area' | 'volume' | 'data' | 'time' | 'speed';

interface UnitDefinition {
  symbol: string;
  category: Category;
  /** 기준 단위로 바꾸는 배율 (온도는 쓰지 않는다) */
  factor: number;
  aliases: string[];
}

const UNITS: UnitDefinition[] = [
  // 길이 (m)
  { symbol: 'mm', category: 'length', factor: 0.001, aliases: ['millimeter', 'millimeters', 'millimetre', '밀리미터'] },
  { symbol: 'cm', category: 'length', factor: 0.01, aliases: ['centimeter', 'centimeters', 'centimetre', '센티미터', '센티'] },
  { symbol: 'm', category: 'length', factor: 1, aliases: ['meter', 'meters', 'metre', 'metres', '미터'] },
  { symbol: 'km', category: 'length', factor: 1000, aliases: ['kilometer', 'kilometers', 'kilometre', '킬로미터', '킬로'] },
  { symbol: 'in', category: 'length', factor: 0.0254, aliases: ['inch', 'inches', '"', '인치'] },
  { symbol: 'ft', category: 'length', factor: 0.3048, aliases: ['foot', 'feet', "'", '피트'] },
  { symbol: 'yd', category: 'length', factor: 0.9144, aliases: ['yard', 'yards', '야드'] },
  { symbol: 'mi', category: 'length', factor: 1609.344, aliases: ['mile', 'miles', '마일'] },
  { symbol: 'nmi', category: 'length', factor: 1852, aliases: ['nautical mile', 'nautical miles', '해리'] },
  // 무게 (kg)
  { symbol: 'mg', category: 'mass', factor: 1e-6, aliases: ['milligram', 'milligrams', '밀리그램'] },
  { symbol: 'g', category: 'mass', factor: 0.001, aliases: ['gram', 'grams', '그램'] },
  { symbol: 'kg', category: 'mass', factor: 1, aliases: ['kilogram', 'kilograms', 'kilo', 'kilos', '킬로그램'] },
  { symbol: 't', category: 'mass', factor: 1000, aliases: ['ton', 'tons', 'tonne', 'tonnes', '톤'] },
  { symbol: 'oz', category: 'mass', factor: 0.028349523125, aliases: ['ounce', 'ounces', '온스'] },
  { symbol: 'lb', category: 'mass', factor: 0.45359237, aliases: ['lbs', 'pound', 'pounds', '파운드'] },
  { symbol: 'st', category: 'mass', factor: 6.35029318, aliases: ['stone', 'stones', '스톤'] },
  // 온도
  { symbol: '°C', category: 'temperature', factor: 1, aliases: ['c', 'celsius', '°c', 'degc', '섭씨'] },
  { symbol: '°F', category: 'temperature', factor: 1, aliases: ['f', 'fahrenheit', '°f', 'degf', '화씨'] },
  { symbol: 'K', category: 'temperature', factor: 1, aliases: ['k', 'kelvin', '켈빈'] },
  // 넓이 (m²)
  { symbol: 'm²', category: 'area', factor: 1, aliases: ['m2', 'sqm', 'm^2', '㎡', '제곱미터'] },
  { symbol: 'km²', category: 'area', factor: 1e6, aliases: ['km2', 'km^2', '제곱킬로미터'] },
  { symbol: 'cm²', category: 'area', factor: 1e-4, aliases: ['cm2', 'cm^2'] },
  { symbol: 'ft²', category: 'area', factor: 0.09290304, aliases: ['ft2', 'sqft', 'ft^2'] },
  { symbol: 'acre', category: 'area', factor: 4046.8564224, aliases: ['acres', 'ac', '에이커'] },
  { symbol: 'ha', category: 'area', factor: 10000, aliases: ['hectare', 'hectares', '헥타르'] },
  { symbol: '평', category: 'area', factor: 400 / 121, aliases: ['pyeong'] },
  // 부피 (L)
  { symbol: 'mL', category: 'volume', factor: 0.001, aliases: ['ml', 'milliliter', 'milliliters', '밀리리터'] },
  { symbol: 'L', category: 'volume', factor: 1, aliases: ['l', 'liter', 'liters', 'litre', 'litres', '리터'] },
  { symbol: 'gal', category: 'volume', factor: 3.785411784, aliases: ['gallon', 'gallons', '갤런'] },
  { symbol: 'qt', category: 'volume', factor: 0.946352946, aliases: ['quart', 'quarts'] },
  { symbol: 'pt', category: 'volume', factor: 0.473176473, aliases: ['pint', 'pints'] },
  { symbol: 'cup', category: 'volume', factor: 0.2365882365, aliases: ['cups', '컵'] },
  { symbol: 'fl oz', category: 'volume', factor: 0.0295735295625, aliases: ['floz', 'fluid ounce', 'fluid ounces'] },
  // 용량 (byte). KB/MB/GB/TB는 1000 단위, KiB/MiB/GiB/TiB는 1024 단위
  { symbol: 'B', category: 'data', factor: 1, aliases: ['b', 'byte', 'bytes', '바이트'] },
  { symbol: 'KB', category: 'data', factor: 1e3, aliases: ['kb', 'kilobyte', 'kilobytes'] },
  { symbol: 'MB', category: 'data', factor: 1e6, aliases: ['mb', 'megabyte', 'megabytes'] },
  { symbol: 'GB', category: 'data', factor: 1e9, aliases: ['gb', 'gigabyte', 'gigabytes'] },
  { symbol: 'TB', category: 'data', factor: 1e12, aliases: ['tb', 'terabyte', 'terabytes'] },
  { symbol: 'KiB', category: 'data', factor: 1024, aliases: ['kib'] },
  { symbol: 'MiB', category: 'data', factor: 1024 ** 2, aliases: ['mib'] },
  { symbol: 'GiB', category: 'data', factor: 1024 ** 3, aliases: ['gib'] },
  { symbol: 'TiB', category: 'data', factor: 1024 ** 4, aliases: ['tib'] },
  // 시간 (s)
  { symbol: 'ms', category: 'time', factor: 0.001, aliases: ['millisecond', 'milliseconds', '밀리초'] },
  { symbol: 's', category: 'time', factor: 1, aliases: ['sec', 'secs', 'second', 'seconds', '초'] },
  { symbol: 'min', category: 'time', factor: 60, aliases: ['mins', 'minute', 'minutes', '분'] },
  { symbol: 'h', category: 'time', factor: 3600, aliases: ['hr', 'hrs', 'hour', 'hours', '시간'] },
  { symbol: 'd', category: 'time', factor: 86400, aliases: ['day', 'days', '일'] },
  { symbol: 'wk', category: 'time', factor: 604800, aliases: ['week', 'weeks', '주'] },
  // 속도 (m/s)
  { symbol: 'm/s', category: 'speed', factor: 1, aliases: ['mps'] },
  { symbol: 'km/h', category: 'speed', factor: 1 / 3.6, aliases: ['kmh', 'kph', 'kmph'] },
  { symbol: 'mph', category: 'speed', factor: 0.44704, aliases: [] },
  { symbol: 'kn', category: 'speed', factor: 0.514444, aliases: ['knot', 'knots', '노트'] },
];

/** 대소문자를 가리는 기호(MB와 mb는 같고, m과 M은 미터만 있다)는 소문자로 맞춰 찾는다. */
const UNIT_LOOKUP = new Map<string, UnitDefinition>();
for (const unit of UNITS) {
  for (const name of [unit.symbol, ...unit.aliases]) UNIT_LOOKUP.set(name.toLowerCase(), unit);
}

function findUnit(name: string): UnitDefinition | null {
  return UNIT_LOOKUP.get(name.trim().toLowerCase()) ?? null;
}

function toCelsius(value: number, unit: UnitDefinition): number {
  if (unit.symbol === '°F') return ((value - 32) * 5) / 9;
  if (unit.symbol === 'K') return value - 273.15;
  return value;
}

function fromCelsius(value: number, unit: UnitDefinition): number {
  if (unit.symbol === '°F') return (value * 9) / 5 + 32;
  if (unit.symbol === 'K') return value + 273.15;
  return value;
}

/** 단위 이름: 숫자가 아닌 글자로 시작하고(m2, km/h처럼 뒤에는 숫자도 올 수 있다) 두 단어까지(fl oz) */
const UNIT_NAME = String.raw`[^\d\s]\S*?(?:\s+[^\d\s]\S*?)?`;
/** "10 km in mi", "10km to mi", "100f → c", "10 km = mi" */
const CONVERSION_EN = new RegExp(String.raw`^(-?[\d.,]+)\s*(${UNIT_NAME})\s+(?:in|to|into|as|→|->|=)\s+(${UNIT_NAME})$`, 'i');
/** "10킬로미터를 마일로", "100f를 c로", "10km은 몇 마일" 같은 한국어 표현 */
const CONVERSION_KO = new RegExp(String.raw`^(-?[\d.,]+)\s*(${UNIT_NAME})(?:을|를|은|는|이|가)?\s+(?:몇\s*)?(${UNIT_NAME})(?:으로|로)?$`);

function convertUnits(input: string): Calculation | null {
  const trimmed = input.trim();
  const match = CONVERSION_EN.exec(trimmed) ?? CONVERSION_KO.exec(trimmed);
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ''));
  const from = findUnit(match[2]);
  const to = findUnit(match[3]);
  if (!Number.isFinite(amount) || !from || !to || from.category !== to.category || from === to) return null;
  const value = from.category === 'temperature'
    ? fromCelsius(toCelsius(amount, from), to)
    : (amount * from.factor) / to.factor;
  if (!Number.isFinite(value)) return null;
  return { kind: 'unit', value, unit: to.symbol, interpretation: `${amount} ${from.symbol} → ${to.symbol}` };
}

/** 계산식이나 단위 변환이면 결과를, 아니면 null을 돌려준다. */
export function calculate(input: string): Calculation | null {
  if (!input.trim()) return null;
  return convertUnits(input) ?? evaluateMath(input);
}

/** 화면 언어의 숫자 형식으로, 유효 숫자 10자리까지 보여준다. */
export function formatCalculation(result: Calculation, language: string): string {
  const number = new Intl.NumberFormat(language, { maximumSignificantDigits: 10 }).format(result.value);
  return result.unit ? `${number} ${result.unit}` : number;
}

/** 복사할 값: 단위 없이 숫자만, 천 단위 구분 없이 화면 언어의 소수점으로 */
export function copyTextForCalculation(result: Calculation, language: string): string {
  return new Intl.NumberFormat(language, { maximumSignificantDigits: 10, useGrouping: false }).format(result.value);
}
