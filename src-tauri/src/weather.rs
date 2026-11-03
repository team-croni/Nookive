// src-tauri/src/weather.rs
// 날씨 검색 커맨드. 키가 필요 없는 공개 API 두 곳만 쓰며, 요청 주소는 여기서만 만든다.
// - weather_places: 지명 → 좌표 후보. Photon(OpenStreetMap) 또는 Open-Meteo 지명 검색에 묻는다.
//   Photon은 구·군 같은 행정구역을 잘 찾고, Open-Meteo는 다른 언어로 쓴 외국 도시(파리, 도쿄)를 잘 찾는다.
//   어느 후보를 쓸지는 프론트엔드(weatherPlaces.ts)가 고른다.
// - weather_forecast: 좌표 → Open-Meteo 예보(현재, 48시간, 16일).
// 보내는 것은 지명 또는 좌표뿐이다. 검색어 전체나 사용자의 위치는 보내지 않는다.
use std::sync::OnceLock;
use std::time::Duration;

use serde::Serialize;

const USER_AGENT: &str = concat!(
    "Nookive/",
    env!("CARGO_PKG_VERSION"),
    " (+https://github.com/team-croni/Nookive)"
);
/// 지명은 짧다. 긴 입력은 지명이 아니므로 보내지 않는다.
const MAX_PLACE_CHARS: usize = 60;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeatherPlace {
    /// "photon" | "openMeteo"
    source: &'static str,
    name: String,
    /// 상위 지역 (예: 서울특별시, 경기도, Île-de-France)
    region: Option<String>,
    country: Option<String>,
    country_code: Option<String>,
    latitude: f64,
    longitude: f64,
    /// Photon: city, district, county, locality / Open-Meteo: GeoNames 지물 코드(PPLC, PPLA …)
    kind: String,
    population: Option<u64>,
    /// IANA 시간대 (Open-Meteo만 준다. Photon 결과는 place_timezone으로 따로 묻는다)
    timezone: Option<String>,
}

/// URL 쿼리 컴포넌트용 퍼센트 인코딩 (web.rs와 같은 규칙)
fn encode_component(input: &str) -> String {
    let mut out = String::with_capacity(input.len() * 3);
    for byte in input.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*byte as char)
            }
            b' ' => out.push('+'),
            _ => out.push_str(&format!("%{:02X}", byte)),
        }
    }
    out
}

/// 언어 코드의 앞부분만 쓴다 (zh-TW → zh). 그 밖의 값은 영어로 본다.
fn base_language(language: Option<&str>) -> &str {
    let code = language.unwrap_or("en").split('-').next().unwrap_or("en");
    if (2..=3).contains(&code.len()) && code.chars().all(|c| c.is_ascii_lowercase()) {
        code
    } else {
        "en"
    }
}

fn photon_url(query: &str, language: &str) -> String {
    // Photon이 번역 이름을 주는 언어는 영어·독일어·프랑스어뿐이다. 그 밖에는 현지 이름(default)을 받는다.
    let lang = match language {
        "en" | "de" | "fr" => language,
        _ => "default",
    };
    // 역·건물 대신 행정구역이 나오도록 지역 종류로 거른다.
    format!(
        "https://photon.komoot.io/api/?q={}&limit=8&lang={lang}&layer=city&layer=district&layer=county&layer=locality",
        encode_component(query)
    )
}

fn open_meteo_geocoding_url(query: &str, language: &str) -> String {
    format!(
        "https://geocoding-api.open-meteo.com/v1/search?name={}&count=8&language={language}&format=json",
        encode_component(query)
    )
}

fn forecast_url(latitude: f64, longitude: f64) -> String {
    // 좌표는 소수 둘째 자리(약 1km)까지만 보낸다. 날씨에는 충분하고 캐시도 잘 맞는다.
    format!(
        "https://api.open-meteo.com/v1/forecast?latitude={latitude:.2}&longitude={longitude:.2}\
&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m\
&hourly=temperature_2m,weather_code,precipitation_probability,is_day\
&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max\
&timezone=auto&forecast_days=16&forecast_hours=48"
    )
}

fn text(value: &serde_json::Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_string)
}

fn parse_photon(json: &serde_json::Value) -> Vec<WeatherPlace> {
    let Some(features) = json.get("features").and_then(|v| v.as_array()) else {
        return Vec::new();
    };
    features
        .iter()
        .filter_map(|feature| {
            let props = feature.get("properties")?;
            let coords = feature.get("geometry")?.get("coordinates")?.as_array()?;
            let longitude = coords.first()?.as_f64()?;
            let latitude = coords.get(1)?.as_f64()?;
            let name = text(props, "name")?;
            // 상위 지역: 시(구의 상위) 다음 도·주. 이름과 같은 값은 뺀다.
            let mut region_parts: Vec<String> = Vec::new();
            for key in ["city", "state"] {
                if let Some(part) = text(props, key)
                    && part != name
                    && !region_parts.contains(&part)
                {
                    region_parts.push(part);
                }
            }
            Some(WeatherPlace {
                source: "photon",
                name,
                region: (!region_parts.is_empty()).then(|| region_parts.join(", ")),
                country: text(props, "country"),
                country_code: text(props, "countrycode").map(|code| code.to_uppercase()),
                latitude,
                longitude,
                kind: text(props, "type").unwrap_or_default(),
                population: None,
                timezone: None,
            })
        })
        .collect()
}

fn parse_open_meteo_places(json: &serde_json::Value) -> Vec<WeatherPlace> {
    let Some(results) = json.get("results").and_then(|v| v.as_array()) else {
        return Vec::new();
    };
    results
        .iter()
        .filter_map(|item| {
            let name = text(item, "name")?;
            Some(WeatherPlace {
                source: "openMeteo",
                region: text(item, "admin1").filter(|region| *region != name),
                name,
                country: text(item, "country"),
                country_code: text(item, "country_code").map(|code| code.to_uppercase()),
                latitude: item.get("latitude")?.as_f64()?,
                longitude: item.get("longitude")?.as_f64()?,
                kind: text(item, "feature_code").unwrap_or_default(),
                population: item.get("population").and_then(|v| v.as_u64()),
                timezone: text(item, "timezone").filter(|zone| is_time_zone_name(zone)),
            })
        })
        .collect()
}

/// 연결을 다시 쓰는 HTTP 클라이언트. 서버가 멀어(유럽) 요청마다 TLS 연결을 새로 맺으면 0.3~0.5초가 더 든다.
fn client() -> &'static reqwest::blocking::Client {
    static CLIENT: OnceLock<reqwest::blocking::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::blocking::Client::builder()
            .user_agent(USER_AGENT)
            .timeout(Duration::from_secs(6))
            .pool_idle_timeout(Duration::from_secs(90))
            .build()
            .expect("HTTP 클라이언트 생성 실패")
    })
}

fn fetch_json(url: &str) -> Result<serde_json::Value, String> {
    let response = client()
        .get(url)
        .send()
        .map_err(|e| format!("날씨 요청 실패: {e}"))?;
    let status = response.status();
    let body = response
        .text()
        .map_err(|e| format!("날씨 응답 읽기 실패: {e}"))?;
    if !status.is_success() {
        return Err(format!("날씨 요청 실패 (status {status})"));
    }
    serde_json::from_str(&body).map_err(|e| format!("날씨 응답 파싱 실패: {e}"))
}

/// 지명 후보. source는 "photon" 또는 "openMeteo"다.
/// 두 서비스는 응답 속도가 크게 달라(Photon 2~3초, Open-Meteo 약 1초) 프론트엔드가 따로 물어
/// 빠른 쪽의 답으로 충분하면 느린 쪽을 기다리지 않는다.
#[tauri::command]
pub async fn weather_places(
    query: String,
    language: Option<String>,
    source: String,
) -> Result<Vec<WeatherPlace>, String> {
    let trimmed = query.trim().to_string();
    if trimmed.is_empty() || trimmed.chars().count() > MAX_PLACE_CHARS {
        return Ok(Vec::new());
    }
    let language = base_language(language.as_deref()).to_string();
    let (url, parse): (String, fn(&serde_json::Value) -> Vec<WeatherPlace>) = match source.as_str()
    {
        "photon" => (photon_url(&trimmed, &language), parse_photon),
        "openMeteo" => (
            open_meteo_geocoding_url(&trimmed, &language),
            parse_open_meteo_places,
        ),
        _ => return Err(format!("지원하지 않는 지명 검색: {source}")),
    };
    tauri::async_runtime::spawn_blocking(move || fetch_json(&url).map(|json| parse(&json)))
        .await
        .map_err(|e| format!("지명 요청 스레드 실패: {e}"))?
}

/// IANA 시간대 이름만 받는다. (예: "Asia/Seoul", "America/Argentina/Buenos_Aires", "UTC")
fn is_time_zone_name(zone: &str) -> bool {
    (1..=64).contains(&zone.len())
        && zone
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '/' | '_' | '-' | '+'))
}

fn timezone_url(latitude: f64, longitude: f64) -> String {
    // 날씨 변수 없이 부르면 좌표의 시간대만 돌려준다.
    format!(
        "https://api.open-meteo.com/v1/forecast?latitude={latitude:.2}&longitude={longitude:.2}&timezone=auto&forecast_days=1"
    )
}

/// 좌표의 IANA 시간대. 세계 시각에서 Photon으로 찾은 곳(시간대를 주지 않는다)에 쓴다.
#[tauri::command]
pub async fn place_timezone(latitude: f64, longitude: f64) -> Result<String, String> {
    if !(-90.0..=90.0).contains(&latitude) || !(-180.0..=180.0).contains(&longitude) {
        return Err("좌표가 범위를 벗어났습니다".to_string());
    }
    let url = timezone_url(latitude, longitude);
    let json = tauri::async_runtime::spawn_blocking(move || fetch_json(&url))
        .await
        .map_err(|e| format!("시간대 요청 스레드 실패: {e}"))??;
    text(&json, "timezone")
        .filter(|zone| is_time_zone_name(zone))
        .ok_or_else(|| "시간대 응답이 없습니다".to_string())
}

/// 좌표의 예보. Open-Meteo 응답 JSON을 그대로 돌려주고, 해석은 프론트엔드가 한다.
#[tauri::command]
pub async fn weather_forecast(latitude: f64, longitude: f64) -> Result<serde_json::Value, String> {
    if !(-90.0..=90.0).contains(&latitude) || !(-180.0..=180.0).contains(&longitude) {
        return Err("좌표가 범위를 벗어났습니다".to_string());
    }
    let url = forecast_url(latitude, longitude);
    tauri::async_runtime::spawn_blocking(move || fetch_json(&url))
        .await
        .map_err(|e| format!("예보 요청 스레드 실패: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_urls_for_fixed_hosts_only() {
        let url = photon_url("구로 & x", "ko");
        assert!(url.starts_with("https://photon.komoot.io/api/?q=%EA%B5%AC%EB%A1%9C+%26+x&"));
        assert!(url.contains("lang=default"));
        assert!(photon_url("Paris", "fr").contains("lang=fr"));
        assert!(open_meteo_geocoding_url("파리", "ko").starts_with(
            "https://geocoding-api.open-meteo.com/v1/search?name=%ED%8C%8C%EB%A6%AC&"
        ));
        let forecast = forecast_url(37.26543, 127.0);
        assert!(forecast.starts_with(
            "https://api.open-meteo.com/v1/forecast?latitude=37.27&longitude=127.00&"
        ));
        assert_eq!(base_language(Some("zh-TW")), "zh");
        assert_eq!(base_language(Some("ko&x=1")), "en");
        assert_eq!(base_language(None), "en");
    }

    #[test]
    fn parses_photon_features() {
        let json: serde_json::Value = serde_json::from_str(
            r#"{"features":[{"geometry":{"coordinates":[126.88,37.49]},"properties":{"name":"구로구","city":"서울특별시","country":"대한민국","countrycode":"kr","type":"district"}},{"properties":{"name":"no geometry"}}]}"#,
        )
        .unwrap();
        let places = parse_photon(&json);
        assert_eq!(places.len(), 1);
        assert_eq!(places[0].name, "구로구");
        assert_eq!(places[0].region.as_deref(), Some("서울특별시"));
        assert_eq!(places[0].country_code.as_deref(), Some("KR"));
        assert_eq!(places[0].kind, "district");
        assert_eq!(places[0].latitude, 37.49);
    }

    #[test]
    fn accepts_only_time_zone_names() {
        assert!(is_time_zone_name("Asia/Seoul"));
        assert!(is_time_zone_name("America/Argentina/Buenos_Aires"));
        assert!(is_time_zone_name("Etc/GMT+9"));
        assert!(!is_time_zone_name("Asia/Seoul; rm"));
        assert!(!is_time_zone_name(""));
        assert!(timezone_url(37.5, 127.0).contains("timezone=auto"));
    }

    #[test]
    fn parses_open_meteo_places() {
        let json: serde_json::Value = serde_json::from_str(
            r#"{"results":[{"name":"파리","admin1":"일드프랑스","country":"프랑스","country_code":"FR","latitude":48.85,"longitude":2.35,"feature_code":"PPLC","population":2138551,"timezone":"Europe/Paris"}]}"#,
        )
        .unwrap();
        let places = parse_open_meteo_places(&json);
        assert_eq!(places[0].source, "openMeteo");
        assert_eq!(places[0].kind, "PPLC");
        assert_eq!(places[0].population, Some(2138551));
        assert_eq!(places[0].timezone.as_deref(), Some("Europe/Paris"));
        assert!(parse_open_meteo_places(&serde_json::json!({})).is_empty());
    }
}
