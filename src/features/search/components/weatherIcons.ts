// src/features/search/components/weatherIcons.ts
// 날씨 상태별 아이콘. Meteocons(@bybas/weather-icons, MIT)의 색이 있는 fill 아이콘을 쓴다.
// - 큰 아이콘(결과 줄, 미리보기 머리)은 원래 애니메이션을 그대로 둔다.
// - 작은 아이콘(시간별, 일별)은 수십 개가 함께 움직이면 산만해서 애니메이션을 뺀 정지 그림을 쓴다.
//   정지 그림에서는 빗방울·눈송이를 구름 아래로 내려 비·눈이 바로 보이게 한다.
// - 라이트 모드에서는 흰 구름·옅은 회색 안개가 밝은 배경에 묻히므로 그 색만 진하게 바꾼다.
// - 다크 모드에서는 짙은 파란 빗방울이 어두운 배경에 묻히므로 빗방울 색만 밝게 바꾼다. (해·달 색은 그대로)
// - 정지 그림은 data URL 이미지로 그린다. 움직이는 그림은 macOS 웹뷰(WKWebView)가 <img> 안의 SVG 애니메이션을
//   첫 장면에서 멈추므로 인라인 SVG로 넣고, 내부 id(그라데이션)가 다른 아이콘과 겹치지 않게 접두어를 붙인다.
import clearDay from '@bybas/weather-icons/production/fill/all/clear-day.svg?raw';
import clearNight from '@bybas/weather-icons/production/fill/all/clear-night.svg?raw';
import partlyCloudyDay from '@bybas/weather-icons/production/fill/all/partly-cloudy-day.svg?raw';
import partlyCloudyNight from '@bybas/weather-icons/production/fill/all/partly-cloudy-night.svg?raw';
import cloudy from '@bybas/weather-icons/production/fill/all/cloudy.svg?raw';
import fogDay from '@bybas/weather-icons/production/fill/all/fog-day.svg?raw';
import fogNight from '@bybas/weather-icons/production/fill/all/fog-night.svg?raw';
import drizzle from '@bybas/weather-icons/production/fill/all/drizzle.svg?raw';
import rain from '@bybas/weather-icons/production/fill/all/rain.svg?raw';
import snow from '@bybas/weather-icons/production/fill/all/snow.svg?raw';
import thunderstormsDayRain from '@bybas/weather-icons/production/fill/all/thunderstorms-day-rain.svg?raw';
import thunderstormsNightRain from '@bybas/weather-icons/production/fill/all/thunderstorms-night-rain.svg?raw';
import type { WeatherCondition } from '../utils/weatherForecast';

const SOURCES: Record<WeatherCondition, { day: string; night: string }> = {
  clear: { day: clearDay, night: clearNight },
  partlyCloudy: { day: partlyCloudyDay, night: partlyCloudyNight },
  cloudy: { day: cloudy, night: cloudy },
  fog: { day: fogDay, night: fogNight },
  drizzle: { day: drizzle, night: drizzle },
  rain: { day: rain, night: rain },
  snow: { day: snow, night: snow },
  thunderstorm: { day: thunderstormsDayRain, night: thunderstormsNightRain },
};

/** 라이트 모드용 색 바꾸기: 구름 그라데이션·테두리, 안개 줄 */
const LIGHT_COLORS: Record<string, string> = {
  '#f3f7fe': '#e6ecf4',
  '#deeafb': '#bcc8d8',
  '#e6effc': '#93a2b6',
  '#d4d7dd': '#9ca3af',
  '#bec1c6': '#6b7280',
};
/** 다크 모드용 색 바꾸기: 빗방울 그라데이션 */
const DARK_COLORS: Record<string, string> = {
  '#0950bc': '#3b82f6',
  '#4286ee': '#93c5fd',
};
const recolor = (svg: string, colors: Record<string, string>) =>
  svg.replace(/#[0-9a-f]{6}\b/gi, (color) => colors[color.toLowerCase()] ?? color);

const toDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const ANIMATION_TAG = /<animate(?:Transform|Motion)?\b[^>]*\/>|<animate(?:Transform|Motion)?\b[^>]*>[\s\S]*?<\/animate(?:Transform|Motion)?>/g;
/** 정지 그림에서 빗방울·눈송이를 둘 위치: 떨어지는 움직임의 가운데쯤 (구름 아래로 나온 모습) */
const STILL_FALL_PROGRESS = 0.6;

/**
 * 애니메이션을 빼고 한 장면으로 멈춘다.
 * 빗방울·눈송이는 처음 위치가 구름 뒤에 걸쳐 있어 그대로 멈추면 비가 거의 보이지 않으므로,
 * 아래로 떨어지는 이동(translate, 세로로 내려감)은 가운데쯤 위치로 옮겨 두고 빗줄기·눈송이도 굵게 한다.
 */
function stillFrame(svg: string): string {
  const shifts = new Map<number, string>();
  const stack: number[] = [];
  for (const match of svg.matchAll(/<\/?[a-zA-Z][^>]*>/g)) {
    const tag = match[0];
    const index = match.index;
    if (tag.startsWith('</')) {
      stack.pop();
      continue;
    }
    const selfClosing = tag.endsWith('/>');
    const falling = /^<animateTransform\b/.test(tag) && /type="translate"/.test(tag)
      ? /values="\s*(-?[\d.]+)\s+(-?[\d.]+)\s*;\s*(-?[\d.]+)\s+(-?[\d.]+)\s*"/.exec(tag)
      : null;
    if (falling && stack.length > 0) {
      const [x1, y1, x2, y2] = falling.slice(1).map(Number);
      if (y2 - y1 >= 8) {
        const x = x1 + (x2 - x1) * STILL_FALL_PROGRESS;
        const y = y1 + (y2 - y1) * STILL_FALL_PROGRESS;
        shifts.set(stack[stack.length - 1], `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
      }
    }
    if (!selfClosing) stack.push(index);
  }
  // 뒤에서부터 넣어야 앞쪽 위치가 바뀌지 않는다.
  let out = svg;
  for (const index of [...shifts.keys()].sort((a, b) => b - a)) {
    const end = out.indexOf('>', index);
    let open = out.slice(index, end);
    // 작은 크기에서도 보이게 빗줄기(굵기 2)와 눈송이(굵기 없음, 기본 1)를 굵게 한다.
    open = /stroke-width="/.test(open) ? open.replace(/stroke-width="2"/, 'stroke-width="3"') : `${open} stroke-width="1.8"`;
    out = `${out.slice(0, index)}${open} transform="${shifts.get(index)}"${out.slice(end)}`;
  }
  return out.replace(ANIMATION_TAG, '');
}

const cache = new Map<string, string>();

function iconSvg(condition: WeatherCondition, isDay: boolean, animated: boolean, light: boolean): string {
  let svg = SOURCES[condition][isDay ? 'day' : 'night'];
  if (!animated) svg = stillFrame(svg);
  return recolor(svg, light ? LIGHT_COLORS : DARK_COLORS);
}

/** 정지 그림 이미지 주소 (animated는 테스트와 비교용) */
export function weatherIconUrl(condition: WeatherCondition, isDay: boolean, animated: boolean, light = false): string {
  const key = `${condition}-${isDay}-${animated}-${light}`;
  let url = cache.get(key);
  if (!url) {
    url = toDataUrl(iconSvg(condition, isDay, animated, light));
    cache.set(key, url);
  }
  return url;
}

/** 움직이는 그림을 인라인으로 넣을 SVG 문자열. id와 그 참조에 prefix를 붙여 한 문서 안의 다른 아이콘과 겹치지 않게 한다. */
export function animatedWeatherIconSvg(condition: WeatherCondition, isDay: boolean, light: boolean, prefix: string): string {
  return iconSvg(condition, isDay, true, light)
    .replace(/\bid="([^"]+)"/g, `id="${prefix}$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${prefix}$1)`)
    .replace(/((?:xlink:)?href)="#([^"]+)"/g, `$1="#${prefix}$2"`);
}
