import { describe, expect, it } from 'vitest';
import { animatedWeatherIconSvg, weatherIconUrl } from './weatherIcons';

const svgOf = (url: string) => decodeURIComponent(url.slice(url.indexOf(',') + 1));

describe('weatherIconUrl', () => {
  it('keeps animation only for large icons', () => {
    for (const condition of ['clear', 'partlyCloudy', 'cloudy', 'fog', 'drizzle', 'rain', 'snow', 'thunderstorm'] as const) {
      for (const isDay of [true, false]) {
        const still = svgOf(weatherIconUrl(condition, isDay, false));
        expect(still.startsWith('<svg'), condition).toBe(true);
        expect(still, condition).not.toMatch(/<animate/);
      }
    }
    expect(svgOf(weatherIconUrl('rain', true, true))).toMatch(/<animate/);
  });

  it('darkens white clouds and fog for light mode', () => {
    const dark = svgOf(weatherIconUrl('cloudy', true, false));
    const light = svgOf(weatherIconUrl('cloudy', true, false, true));
    expect(dark).toMatch(/#f3f7fe/i);
    expect(light).not.toMatch(/#f3f7fe|#deeafb|#e6effc/i);
    expect(svgOf(weatherIconUrl('fog', true, false, true))).not.toMatch(/#d4d7dd|#bec1c6/i);
    // 해 색은 그대로 둔다.
    expect(svgOf(weatherIconUrl('clear', true, false, true))).toMatch(/#fbbf24/i);
  });

  it('brightens raindrops for dark mode', () => {
    const dark = svgOf(weatherIconUrl('rain', true, false));
    expect(dark).not.toMatch(/#0950bc|#4286ee/i);
    expect(dark).toMatch(/#93c5fd/i);
  });

  it('shows rain and snow below the cloud in still icons', () => {
    const rain = svgOf(weatherIconUrl('rain', true, false));
    expect(rain.match(/transform="translate\(/g)).toHaveLength(3);
    expect(rain).toMatch(/stroke-width="3"/);
    expect(svgOf(weatherIconUrl('snow', true, false)).match(/transform="translate\(/g)).toHaveLength(3);
    // 해의 회전처럼 떨어지지 않는 움직임은 옮기지 않는다.
    expect(svgOf(weatherIconUrl('clear', true, false))).not.toMatch(/transform="translate/);
  });

  it('prefixes ids in inline animated icons', () => {
    const svg = animatedWeatherIconSvg('rain', true, false, 'w1-');
    expect(svg).toMatch(/<animate/);
    expect(svg).not.toMatch(/id="(?!w1-)/);
    expect(svg).not.toMatch(/url\(#(?!w1-)/);
    expect(svg).not.toMatch(/href="#(?!w1-)/);
  });
});
