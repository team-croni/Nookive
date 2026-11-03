// src/features/search/components/WeatherResult.tsx
// 날씨 결과. 결과 목록 맨 위의 줄과, 선택했을 때 미리보기 자리에 보이는 예보.
import React, { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { ChevronLeft, ChevronRight, CloudOff, ExternalLink, LoaderCircle, MapPin, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/Button/Button';
import type { WeatherResult } from '../hooks/useWeather';
import {
  displayTemperature,
  selectPeriod,
  formatUtcOffset,
  regionOf,
  weatherUnits,
  type WeatherCondition,
  type WeatherDay,
} from '../utils/weatherForecast';
import { weatherPlaceDetail } from '../utils/weatherPlaces';
import rowStyles from './AnswerRow.module.css';
import styles from './WeatherResult.module.css';
import { animatedWeatherIconSvg, weatherIconUrl } from './weatherIcons';
import { useSystemLocale } from '../../../utils/systemLocale';

/** 지금 화면이 라이트 모드인지. 수동 선택(data-theme)이 시스템 설정보다 우선한다. */
const darkQuery = typeof window === 'undefined' ? null : window.matchMedia('(prefers-color-scheme: dark)');
const isLightTheme = () => {
  const theme = document.documentElement.dataset.theme;
  return theme ? theme === 'light' : !darkQuery?.matches;
};
function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  darkQuery?.addEventListener('change', onChange);
  return () => {
    observer.disconnect();
    darkQuery?.removeEventListener('change', onChange);
  };
}

/** 큰 아이콘(결과 줄, 미리보기 머리)만 움직인다. 라이트 모드에서는 구름·안개 색을 진하게 쓴다. */
const reducedMotionQuery = typeof window === 'undefined' ? null : window.matchMedia('(prefers-reduced-motion: reduce)');
const prefersReducedMotion = () => Boolean(reducedMotionQuery?.matches);
function subscribeReducedMotion(onChange: () => void) {
  reducedMotionQuery?.addEventListener('change', onChange);
  return () => reducedMotionQuery?.removeEventListener('change', onChange);
}

/**
 * 큰 아이콘(결과 줄, 미리보기 머리)만 움직인다. 라이트 모드에서는 구름·안개 색을 진하게 쓴다.
 * 움직이는 그림은 인라인 SVG로 넣는다. (WKWebView는 <img> 안의 SVG 애니메이션을 재생하지 않는다)
 * 시스템의 "동작 줄이기"가 켜져 있으면 정지 그림을 쓴다.
 */
function ConditionIcon({ condition, isDay = true, size, animated = false }: { condition: WeatherCondition; isDay?: boolean; size: number; animated?: boolean }) {
  const light = useSyncExternalStore(subscribeTheme, isLightTheme);
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion);
  const prefix = `wi${useId().replace(/[^a-zA-Z0-9]/g, '')}-`;
  if (animated && !reducedMotion) {
    return (
      <span
        className={styles.conditionIcon}
        style={{ width: size, height: size }}
        aria-hidden="true"
        // 앱에 들어 있는 아이콘 SVG(Meteocons)만 넣는다. 사용자 입력이나 네트워크 응답은 들어가지 않는다.
        dangerouslySetInnerHTML={{ __html: animatedWeatherIconSvg(condition, isDay, light, prefix) }}
      />
    );
  }
  return <img className={styles.conditionIcon} src={weatherIconUrl(condition, isDay, false, light)} width={size} height={size} alt="" draggable={false} />;
}

/** lucide Droplet과 같은 모양 */
const DROP_PATH = 'M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z';

/**
 * 강수 확률 물방울. 확률에 따라 세 단계로 채운다: 30% 미만은 빈 물방울, 30~59%는 아래 절반, 60% 이상은 가득.
 * 숫자를 읽지 않아도 비 올 가능성이 큰 날이 바로 보이게 한다.
 */
function RainDrop({ probability }: { probability: number }) {
  const clipId = `drop${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const level = probability >= 60 ? 'full' : probability >= 30 ? 'half' : 'empty';
  return (
    <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinejoin="round" aria-hidden="true">
      {level !== 'empty' && (
        <>
          <clipPath id={clipId}>
            <rect x="0" y={level === 'full' ? 0 : 13} width="24" height="24" />
          </clipPath>
          <path d={DROP_PATH} fill="currentColor" stroke="none" clipPath={`url(#${clipId})`} />
        </>
      )}
      <path d={DROP_PATH} />
    </svg>
  );
}

/** 예보의 현지 날짜·시각을 그대로 보여준다. (Mac의 시간대로 바꾸지 않는다) */
const localDate = (value: string) => new Date(`${value.length === 10 ? `${value}T00:00` : value}:00Z`);

/**
 * 화면 문구와 단위. 온도·풍속 단위와 24시간 표시는 macOS 언어 및 지역 설정을 따르고,
 * 고르지 않은 값은 사는 지역의 관례를 쓴다. (영어를 쓰며 한국에 살면 섭씨, 미국에 살면 화씨)
 */
function useWeatherText() {
  const { t, i18n } = useTranslation('search');
  const language = i18n.resolvedLanguage ?? i18n.language;
  const system = useSystemLocale();
  const region = regionOf(system, typeof navigator === 'undefined' ? language : navigator.language);
  const units = weatherUnits(system, language, region);
  const number = new Intl.NumberFormat(language, { maximumFractionDigits: 0 });
  // 퍼센트는 언어 관례를 따른다. (프랑스어·독일어·스페인어는 "41 %")
  const percentFormat = new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 0 });
  const hourFormat = new Intl.DateTimeFormat(language, { hour: 'numeric', hourCycle: units.hourCycle, timeZone: 'UTC' });
  const weekdayFormat = new Intl.DateTimeFormat(language, { weekday: 'short', timeZone: 'UTC' });
  const dayName = (day: WeatherDay, index: number) =>
    index === 0 ? t('weather.periods.today') : index === 1 ? t('weather.periods.tomorrow') : weekdayFormat.format(localDate(day.date));
  return {
    t,
    degrees: (celsius: number) => `${displayTemperature(celsius, units.fahrenheit)}°`,
    /** 강수 확률. 값이 없으면 줄표로 보인다. */
    percent: (value: number | null) => (value === null ? '–' : percentFormat.format(value / 100)),
    wind: (kmh: number) => (units.mph ? `${number.format(kmh / 1.609)} mph` : `${number.format(kmh)} km/h`),
    condition: (condition: WeatherCondition) => t(`weather.conditions.${condition}`),
    // "오후 11시"의 "오후"(dayPeriod)는 작게 그려 숫자가 먼저 읽히게 한다.
    hour: (time: string) =>
      hourFormat.formatToParts(localDate(time)).map((part, index) =>
        part.type === 'dayPeriod'
          ? <span key={index} className={styles.hourPeriod}>{part.value}</span>
          : part.value,
      ),
    dayName,
  };
}

/** 줄과 미리보기 머리에 함께 쓰는 요약. */
function summarize(result: Extract<WeatherResult, { status: 'ready' }>, text: ReturnType<typeof useWeatherText>) {
  const { forecast, query } = result;
  const selection = selectPeriod(forecast, query.period);
  const periodLabel = text.t(`weather.periods.${query.period ?? 'now'}`);
  if (selection.showsCurrent) {
    const { current } = forecast;
    return {
      selection,
      periodLabel,
      condition: current.condition,
      isDay: current.isDay,
      title: `${text.degrees(current.temperature)} ${text.condition(current.condition)}`,
    };
  }
  const days = selection.days;
  const first = days[0];
  if (!first) {
    return { selection, periodLabel, condition: 'cloudy' as const, isDay: true, title: text.t('weather.unavailable') };
  }
  const max = Math.max(...days.map((day) => day.max));
  const min = Math.min(...days.map((day) => day.min));
  return {
    selection,
    periodLabel,
    condition: first.condition,
    isDay: true,
    title: `${text.condition(first.condition)} ${text.degrees(max)} / ${text.degrees(min)}`,
  };
}

const placeTitle = (result: WeatherResult) =>
  result.status === 'error' || result.status === 'ready' ? result.place?.name ?? '' : '';

interface WeatherRowProps {
  result: WeatherResult;
  isActive: boolean;
  onSelect: () => void;
  onOpen: () => void;
}

export const WeatherRow: React.FC<WeatherRowProps> = ({ result, isActive, onSelect, onOpen }) => {
  const text = useWeatherText();
  const { t } = text;
  let icon: React.ReactNode;
  let title: string;
  let detail: string;
  let hint: string;
  if (result.status === 'ready') {
    const summary = summarize(result, text);
    icon = <ConditionIcon condition={summary.condition} isDay={summary.isDay} size={34} animated />;
    title = summary.title;
    detail = [summary.periodLabel, result.place.name, weatherPlaceDetail(result.place)].filter(Boolean).join(' · ');
    hint = t('weather.openWebHint');
  } else if (result.status === 'loading') {
    icon = <LoaderCircle size={18} className={styles.spinner} aria-hidden="true" />;
    title = t('weather.loading', { place: result.placeName });
    detail = t(`weather.periods.${result.query.period ?? 'now'}`);
    hint = t('weather.openWebHint');
  } else if (result.status === 'needsLocation') {
    icon = <MapPin size={18} aria-hidden="true" />;
    title = t('weather.needsLocation.title');
    detail = t('weather.needsLocation.description');
    hint = t('weather.needsLocation.hint');
  } else {
    icon = <CloudOff size={18} aria-hidden="true" />;
    title = t('weather.error.title');
    detail = [placeTitle(result), t('weather.error.description')].filter(Boolean).join(' · ');
    hint = t('weather.openWebHint');
  }
  return (
    <div className={`${rowStyles.row} ${isActive ? rowStyles.active : ''}`} onClick={onSelect} onDoubleClick={onOpen}>
      <span className={`${rowStyles.icon} ${result.status === 'ready' ? styles.rowIconImage : ''}`}>{icon}</span>
      <div className={rowStyles.text}>
        <span className={`${rowStyles.value} ${result.status === 'loading' ? styles.rowLoadingText : ''}`}>{title}</span>
        <span className={rowStyles.interpretation}>{detail}</span>
      </div>
      <span className={rowStyles.hint}>{hint}</span>
    </div>
  );
};

/** 시간별 줄 가장자리의 흐림 폭. CSS(.fadeStart, .fadeEnd)와 같은 값이다. */
const HOUR_FADE_PX = 40;

/**
 * 시간별 예보 줄. 스크롤바 없이 양 끝의 화살표 버튼으로 한 화면씩 넘긴다.
 * (트랙패드 가로 스크롤도 그대로 된다) 넘길 곳이 없는 쪽의 버튼은 숨긴다.
 */
function HourStrip({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation('search');
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  useEffect(() => {
    const strip = ref.current;
    if (!strip) return;
    const update = () => {
      const max = strip.scrollWidth - strip.clientWidth;
      setEdges({ start: strip.scrollLeft <= 1, end: strip.scrollLeft >= max - 1 });
    };
    update();
    strip.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(strip);
    return () => {
      strip.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, []);

  // 한 화면씩 넘기되, 가장자리에서 흐리게 가려지던 시간이 새 화면의 흐림 바깥에 오도록 시간 칸 단위로 맞춘다.
  const page = (direction: 1 | -1) => {
    const strip = ref.current;
    if (!strip) return;
    const items = Array.from(strip.children) as HTMLElement[];
    const left = strip.scrollLeft;
    const right = left + strip.clientWidth;
    let target: number;
    if (direction === 1) {
      // 오른쪽 흐림에 걸린 첫 칸을 왼쪽 흐림 바로 바깥으로 옮긴다.
      const next = items.find((item) => item.offsetLeft + item.offsetWidth > right - HOUR_FADE_PX);
      target = next ? next.offsetLeft - HOUR_FADE_PX : right;
    } else {
      // 왼쪽 흐림에 걸린 마지막 칸을 오른쪽 흐림 바로 바깥으로 옮긴다.
      const previous = [...items].reverse().find((item) => item.offsetLeft < left + HOUR_FADE_PX);
      target = previous ? previous.offsetLeft + previous.offsetWidth + HOUR_FADE_PX - strip.clientWidth : left - strip.clientWidth;
    }
    strip.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  };

  return (
    <div className={styles.hourStrip}>
      <div
        ref={ref}
        className={`${styles.hours} ${edges.start ? '' : styles.fadeStart} ${edges.end ? '' : styles.fadeEnd}`}
      >
        {children}
      </div>
      {/* 버튼은 늘 두고 넘길 곳이 없을 때만 투명하게 해, 나타나고 사라질 때 부드럽게 바뀐다. */}
      <button
        type="button"
        className={`${styles.hourNav} ${styles.hourNavPrev} ${edges.start ? styles.hourNavHidden : ''}`}
        onClick={() => page(-1)}
        aria-label={t('weather.previousHours')}
        aria-hidden={edges.start}
        tabIndex={edges.start ? -1 : 0}
      >
        <ChevronLeft size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={`${styles.hourNav} ${styles.hourNavNext} ${edges.end ? styles.hourNavHidden : ''}`}
        onClick={() => page(1)}
        aria-label={t('weather.nextHours')}
        aria-hidden={edges.end}
        tabIndex={edges.end ? -1 : 0}
      >
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

interface WeatherPreviewProps {
  result: WeatherResult;
  onOpenWeb: () => void;
  onOpenSettings: () => void;
}

export const WeatherPreview: React.FC<WeatherPreviewProps> = ({ result, onOpenWeb, onOpenSettings }) => {
  const text = useWeatherText();
  // Mac의 지금 UTC 오프셋(초). 미리보기가 열릴 때 한 번 읽는다.
  const [macUtcOffset] = useState(() => -new Date().getTimezoneOffset() * 60);
  const { t } = text;

  if (result.status === 'loading') {
    return (
      <div className={styles.message}>
        <LoaderCircle size={28} className={styles.spinner} aria-hidden="true" />
        <span>{t('weather.loading', { place: result.placeName })}</span>
      </div>
    );
  }

  if (result.status !== 'ready') {
    const needsLocation = result.status === 'needsLocation';
    return (
      <div className={styles.message}>
        {needsLocation ? <MapPin size={28} aria-hidden="true" /> : <CloudOff size={28} aria-hidden="true" />}
        <strong>{t(needsLocation ? 'weather.needsLocation.title' : 'weather.error.title')}</strong>
        <span>{t(needsLocation ? 'weather.needsLocation.description' : 'weather.error.description')}</span>
        <div className={styles.actions}>
          {needsLocation ? (
            <Button variant="primary" size="xs" onClick={onOpenSettings}>
              <Settings size={14} aria-hidden="true" />
              <span>{t('weather.needsLocation.action')}</span>
            </Button>
          ) : (
            <Button variant="secondary" size="xs" onClick={onOpenWeb}>
              <ExternalLink size={14} aria-hidden="true" />
              <span>{t('weather.openWeb')}</span>
            </Button>
          )}
        </div>
      </div>
    );
  }

  const { forecast, place } = result;
  const summary = summarize(result, text);
  const { selection } = summary;
  const { current } = forecast;
  const highlighted = new Set(selection.days.map((day) => day.date));
  // 일별 목록은 7일을 보이되, 물어본 날(주말 등)이 그 뒤면 거기까지 보인다.
  const lastIndex = Math.max(6, ...selection.days.map((day) => forecast.daily.findIndex((item) => item.date === day.date)));
  const days = forecast.daily.slice(0, lastIndex + 1);
  const firstDay = selection.days[0];
  // 일별 기온 막대는 보이는 날들 전체의 최저~최고 안에서 그날의 범위를 보여준다.
  const rangeMin = Math.min(...days.map((day) => day.min));
  const rangeSpan = Math.max(1, Math.max(...days.map((day) => day.max)) - rangeMin);

  return (
    <div className={styles.preview}>
      <header className={styles.header}>
        <div className={styles.place}>
          <strong>{place.name}</strong>
          <span>{weatherPlaceDetail(place)}</span>
        </div>
        <span className={styles.period}>{summary.periodLabel}</span>
      </header>

      <section className={styles.now}>
        <span className={styles.nowIcon}>
          <ConditionIcon condition={summary.condition} isDay={summary.isDay} size={104} animated />
        </span>
        <div className={styles.nowText}>
          {selection.showsCurrent ? (
            <>
              <span className={styles.temperature}>{text.degrees(current.temperature)}</span>
              <span className={styles.condition}>{text.condition(current.condition)}</span>
              <span className={styles.facts}>
                {[
                  current.apparentTemperature !== null && t('weather.feelsLike', { value: text.degrees(current.apparentTemperature) }),
                  current.humidity !== null && t('weather.humidity', { value: Math.round(current.humidity) }),
                  current.windSpeed !== null && t('weather.wind', { value: text.wind(current.windSpeed) }),
                ].filter(Boolean).join(' · ')}
              </span>
            </>
          ) : firstDay ? (
            <>
              <span className={styles.temperature}>
                {text.degrees(Math.max(...selection.days.map((day) => day.max)))}
                <span className={styles.temperatureLow}> / {text.degrees(Math.min(...selection.days.map((day) => day.min)))}</span>
              </span>
              <span className={styles.condition}>{text.condition(firstDay.condition)}</span>
              {firstDay.precipitationProbability !== null && (
                <span className={styles.facts}>
                  {t('weather.precipitation', { value: Math.max(...selection.days.map((day) => day.precipitationProbability ?? 0)) })}
                </span>
              )}
            </>
          ) : (
            <span className={styles.condition}>{t('weather.unavailable')}</span>
          )}
        </div>
      </section>

      {selection.hours.length > 0 && (
        <section className={styles.section} aria-label={t('weather.hourly')}>
          {/* Mac과 시간대가 다른 지역이면 시각이 그 지역 기준임을 알린다. (서울에서 파리 날씨를 볼 때 "13시"는 파리 시각) */}
          {forecast.utcOffsetSeconds !== null && forecast.utcOffsetSeconds !== macUtcOffset && (
            <p className={styles.localTime}>{t('weather.localTime', { offset: formatUtcOffset(forecast.utcOffsetSeconds) })}</p>
          )}
          <HourStrip key={`${place.latitude},${place.longitude},${result.query.period}`}>
            {selection.hours.map((hour, index) => {
              // 자정(0시)에는 시각 대신 그날 이름("내일", "목")을 두고 앞에 옅은 세로선을 그어 날짜가 바뀐 곳을 알린다.
              const date = hour.time.slice(0, 10);
              const dayIndex = forecast.daily.findIndex((day) => day.date === date);
              const startsDay = index > 0 && hour.time.endsWith('T00:00') && dayIndex >= 0;
              return (
                <div key={hour.time} className={`${styles.hour} ${startsDay ? styles.hourNewDay : ''}`}>
                  <span className={`${styles.hourTime} ${startsDay ? styles.hourDayName : ''}`}>
                    {startsDay ? text.dayName(forecast.daily[dayIndex], dayIndex) : text.hour(hour.time)}
                  </span>
                  <ConditionIcon condition={hour.condition} isDay={hour.isDay} size={28} />
                  <span className={styles.hourTemp}>{text.degrees(hour.temperature)}</span>
                  {/* 강수 확률은 0%도 보여 모든 시간의 칸 모양을 같게 한다. 0%는 흐리게 둔다. */}
                  <span className={`${styles.hourRain} ${(hour.precipitationProbability ?? 0) > 0 ? '' : styles.hourRainNone}`}>
                    {text.percent(hour.precipitationProbability)}
                  </span>
                </div>
              );
            })}
          </HourStrip>
        </section>
      )}

      <section className={styles.section} aria-label={t('weather.daily')}>
        <ul className={styles.days}>
          {days.map((day, index) => (
            <li key={day.date} className={`${styles.day} ${highlighted.has(day.date) && days.length > 1 ? styles.dayActive : ''}`}>
              <span className={styles.dayName}>{text.dayName(day, index)}</span>
              <ConditionIcon condition={day.condition} size={24} />
              <span className={styles.dayRain} title={t('weather.precipitationLabel')}>
                {(day.precipitationProbability ?? 0) > 0 && (
                  <>
                    <RainDrop probability={day.precipitationProbability ?? 0} />
                    {text.percent(day.precipitationProbability)}
                  </>
                )}
              </span>
              <span className={styles.dayMin} title={t('weather.lowLabel')}>{text.degrees(day.min)}</span>
              <span className={styles.rangeTrack} aria-hidden="true">
                <span
                  className={styles.rangeFill}
                  style={{
                    left: `${((day.min - rangeMin) / rangeSpan) * 100}%`,
                    right: `${100 - ((day.max - rangeMin) / rangeSpan) * 100}%`,
                  }}
                />
              </span>
              <span className={styles.dayMax} title={t('weather.highLabel')}>{text.degrees(day.max)}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* 파일 미리보기처럼 동작 버튼은 아래 왼쪽에 두고, 출처는 그 오른쪽에 작게 둔다. */}
      <footer className={styles.footer}>
        <Button variant="primary" size="xs" className={styles.footerButton} onClick={onOpenWeb}>
          <ExternalLink size={14} aria-hidden="true" />
          <span>{t('weather.openWeb')}</span>
        </Button>
        {/* 출처는 "·" 단위로만 줄을 바꾼다. (단어 가운데나 "©" 뒤에서 끊기지 않게) */}
        <span className={styles.attribution}>
          {t('weather.attribution').split(' · ').map((part, index, parts) => (
            <span key={part} className={styles.attributionPart}>
              {part}
              {index < parts.length - 1 ? ' ·' : ''}
            </span>
          ))}
        </span>
      </footer>
    </div>
  );
};
