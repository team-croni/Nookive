// src/features/settings/components/WeatherSection.tsx
// 날씨 검색 켜고 끄기와 기본 지역. 기본 지역은 "오늘 날씨"처럼 지역 없이 물을 때 쓴다.
// 지역은 검색 창과 같은 지명 검색(weather_places)으로 찾아 고른다. 위치 권한은 쓰지 않는다.
import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/Button/Button';
import { searchWeatherPlaces } from '../../search/services/weatherClient';
import { countryForLanguage, weatherPlaceDetail, type WeatherPlace } from '../../search/utils/weatherPlaces';
import {
  getWeatherEnabled,
  getWeatherLocation,
  setWeatherEnabled,
  setWeatherLocation,
  subscribeWeatherPreference,
} from '../../../utils/weatherPreference';
import { getSystemLocale, loadSystemLocale } from '../../../utils/systemLocale';
import { InfoTip } from './InfoTip';
import styles from '../SettingsApp.module.css';

const SEARCH_DEBOUNCE_MS = 400;

type SearchState = { status: 'idle' | 'searching' | 'error' } | { status: 'done'; places: WeatherPlace[] };

export function WeatherSection() {
  const { t, i18n } = useTranslation('settings');
  const language = i18n.resolvedLanguage ?? i18n.language;
  const [enabled, setEnabled] = useState(getWeatherEnabled);
  const [location, setLocation] = useState(getWeatherLocation);
  const [isPicking, setIsPicking] = useState(false);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState<SearchState>({ status: 'idle' });

  useEffect(
    () =>
      subscribeWeatherPreference(() => {
        setEnabled(getWeatherEnabled());
        setLocation(getWeatherLocation());
      }),
    [],
  );

  useEffect(() => {
    const query = input.trim();
    if (!isPicking || !query) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setSearch({ status: 'searching' });
      loadSystemLocale()
        .then(() => searchWeatherPlaces(query, language, getSystemLocale().region ?? countryForLanguage(language)))
        .then((places) => {
          if (!cancelled) setSearch({ status: 'done', places: places.slice(0, 5) });
        })
        .catch(() => {
          if (!cancelled) setSearch({ status: 'error' });
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [input, isPicking, language]);

  const handleEnabledChange = (next: boolean) => {
    setEnabled(next);
    setWeatherEnabled(next);
  };

  const startPicking = () => {
    setInput('');
    setSearch({ status: 'idle' });
    setIsPicking(true);
  };

  const choose = (place: WeatherPlace) => {
    setWeatherLocation(place);
    setLocation(getWeatherLocation());
    setIsPicking(false);
  };

  const clear = () => {
    setWeatherLocation(null);
    setLocation(null);
  };

  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <h2>{t('weather.title')}</h2>
          <p>{t('weather.description')}</p>
        </div>
      </div>
      <div className={styles.optionGroup}>
        <div className={styles.webSearchRow}>
          <span className={styles.webSearchOptionLabel}>
            <span>{t('weather.option')}</span>
            <InfoTip id="weather-privacy-tooltip" text={t('weather.privacyNotice')} />
          </span>
          <label className={styles.switch}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => handleEnabledChange(event.target.checked)}
              aria-label={t('weather.option')}
            />
            <span className={styles.switchTrack} aria-hidden="true" />
          </label>
        </div>
        {enabled && (
          <div className={styles.webSearchRow}>
            <span className={styles.webSearchOptionLabel}>{t('weather.location')}</span>
            <span className={styles.weatherLocationValue}>
              <span className={styles.weatherLocationName}>
                {location ? [location.name, location.region].filter(Boolean).join(', ') : t('weather.locationNone')}
              </span>
              {!isPicking && (
                <Button size="xs" variant="secondary" onClick={startPicking}>
                  {t(location ? 'weather.change' : 'weather.choose')}
                </Button>
              )}
              {location && !isPicking && (
                <Button size="xs" variant="ghost" onClick={clear}>
                  {t('weather.clear')}
                </Button>
              )}
            </span>
          </div>
        )}
        {enabled && isPicking && (
          <div className={styles.weatherPicker}>
            <div className={styles.weatherSearchRow}>
              <input
                className={styles.weatherSearchInput}
                type="search"
                value={input}
                autoFocus
                placeholder={t('weather.searchPlaceholder')}
                aria-label={t('weather.searchPlaceholder')}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setIsPicking(false);
                  if (event.key === 'Enter' && search.status === 'done' && search.places[0]) choose(search.places[0]);
                }}
              />
              <Button size="xs" variant="ghost" onClick={() => setIsPicking(false)}>
                {t('weather.cancel')}
              </Button>
            </div>
            {input.trim() && search.status === 'searching' && <p className={styles.weatherPickerNote}>{t('weather.searching')}</p>}
            {input.trim() && search.status === 'error' && <p className={styles.weatherPickerNote}>{t('weather.searchError')}</p>}
            {input.trim() && search.status === 'done' && search.places.length === 0 && (
              <p className={styles.weatherPickerNote}>{t('weather.noResults')}</p>
            )}
            {input.trim() && search.status === 'done' && search.places.length > 0 && (
              <ul className={styles.weatherPlaceList}>
                {search.places.map((place) => (
                  <li key={`${place.source}-${place.latitude}-${place.longitude}`}>
                    <button type="button" className={styles.weatherPlaceButton} onClick={() => choose(place)}>
                      <MapPin size={14} aria-hidden="true" />
                      <span className={styles.weatherPlaceName}>{place.name}</span>
                      <span className={styles.weatherPlaceDetail}>{weatherPlaceDetail(place)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
