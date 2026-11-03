// src-tauri/src/currency.rs
// 환율 변환에 쓰는 환율표. ExchangeRate-API의 공개 엔드포인트(키 없음, 하루 한 번 갱신, 출처 표시 필요)에서
// 미국 달러 기준 환율표 하나만 받는다. 어떤 통화를 바꾸는지는 보내지 않고, 두 통화 사이 환율은 프론트엔드가 계산한다.
// 요청 주소는 여기서만 만든다. (weather.rs와 같은 연결 재사용 클라이언트를 쓴다)
use std::collections::BTreeMap;

use serde::Serialize;

const RATES_URL: &str = "https://open.er-api.com/v6/latest/USD";

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrencyRates {
    /// 기준 통화 ("USD")
    base: String,
    /// 1 기준 통화당 각 통화의 값
    rates: BTreeMap<String, f64>,
    /// 환율표가 만들어진 시각 (Unix 초)
    updated_at: i64,
    /// 다음 갱신 예정 시각 (Unix 초). 그 전에는 다시 받지 않는다.
    next_update_at: Option<i64>,
}

fn parse_rates(json: &serde_json::Value) -> Option<CurrencyRates> {
    if json.get("result").and_then(|v| v.as_str()) != Some("success") {
        return None;
    }
    let base = json.get("base_code")?.as_str()?.to_string();
    let rates: BTreeMap<String, f64> = json
        .get("rates")?
        .as_object()?
        .iter()
        .filter(|(code, _)| code.len() == 3 && code.chars().all(|c| c.is_ascii_uppercase()))
        .filter_map(|(code, value)| {
            let rate = value.as_f64()?;
            (rate.is_finite() && rate > 0.0).then(|| (code.clone(), rate))
        })
        .collect();
    if rates.is_empty() {
        return None;
    }
    Some(CurrencyRates {
        base,
        rates,
        updated_at: json.get("time_last_update_unix")?.as_i64()?,
        next_update_at: json.get("time_next_update_unix").and_then(|v| v.as_i64()),
    })
}

#[tauri::command]
pub async fn currency_rates() -> Result<CurrencyRates, String> {
    let json = tauri::async_runtime::spawn_blocking(|| crate::weather::fetch_json(RATES_URL))
        .await
        .map_err(|e| format!("환율 요청 스레드 실패: {e}"))??;
    parse_rates(&json).ok_or_else(|| "환율 응답을 해석하지 못했습니다".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_the_rate_table() {
        let json: serde_json::Value = serde_json::from_str(
            r#"{"result":"success","base_code":"USD","time_last_update_unix":1793664151,"time_next_update_unix":1793752141,"rates":{"USD":1,"KRW":1344.12,"TWD":32.59,"bad":5,"XXX":-1}}"#,
        )
        .unwrap();
        let rates = parse_rates(&json).unwrap();
        assert_eq!(rates.base, "USD");
        assert_eq!(rates.rates.get("KRW"), Some(&1344.12));
        assert!(!rates.rates.contains_key("bad"));
        assert!(!rates.rates.contains_key("XXX"));
        assert_eq!(rates.next_update_at, Some(1793752141));
    }

    #[test]
    fn rejects_errors() {
        let json: serde_json::Value =
            serde_json::from_str(r#"{"result":"error","error-type":"unsupported-code"}"#).unwrap();
        assert!(parse_rates(&json).is_none());
    }
}
