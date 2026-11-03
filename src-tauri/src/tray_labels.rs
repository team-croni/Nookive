// src-tauri/src/tray_labels.rs
// 메뉴바(트레이) 메뉴 문구. 트레이는 프론트엔드보다 먼저 만들어지므로 번역을 Rust에 둔다.
// 지원 언어는 src/i18n/index.ts의 supportedLocales와 같다.

pub struct TrayLabels {
    pub open_search: &'static str,
    pub settings: &'static str,
    pub quit: &'static str,
    /// `{percent}`를 진행률로 바꿔 쓴다.
    pub installing: &'static str,
    pub pause_installation: &'static str,
    pub resume_installation: &'static str,
    pub cancel_installation: &'static str,
    pub installation_required: &'static str,
    pub start_installation: &'static str,
}

const KO: TrayLabels = TrayLabels {
    open_search: "검색 열기",
    settings: "설정…",
    quit: "Nookive 종료",
    installing: "설치 중… ({percent}%)",
    pause_installation: "설치 일시정지",
    resume_installation: "설치 재개",
    cancel_installation: "설치 중단",
    installation_required: "설치 필요",
    start_installation: "설치 시작",
};

const EN: TrayLabels = TrayLabels {
    open_search: "Open search",
    settings: "Settings…",
    quit: "Quit Nookive",
    installing: "Installing… ({percent}%)",
    pause_installation: "Pause installation",
    resume_installation: "Resume installation",
    cancel_installation: "Cancel installation",
    installation_required: "Installation required",
    start_installation: "Start installation",
};

const JA: TrayLabels = TrayLabels {
    open_search: "検索を開く",
    settings: "設定…",
    quit: "Nookive を終了",
    installing: "インストール中… ({percent}%)",
    pause_installation: "インストールを一時停止",
    resume_installation: "インストールを再開",
    cancel_installation: "インストールを中止",
    installation_required: "インストールが必要です",
    start_installation: "インストールを開始",
};

const ZH_CN: TrayLabels = TrayLabels {
    open_search: "打开搜索",
    settings: "设置…",
    quit: "退出 Nookive",
    installing: "正在安装… ({percent}%)",
    pause_installation: "暂停安装",
    resume_installation: "继续安装",
    cancel_installation: "取消安装",
    installation_required: "需要安装",
    start_installation: "开始安装",
};

const ZH_TW: TrayLabels = TrayLabels {
    open_search: "開啟搜尋",
    settings: "設定…",
    quit: "結束 Nookive",
    installing: "正在安裝… ({percent}%)",
    pause_installation: "暫停安裝",
    resume_installation: "繼續安裝",
    cancel_installation: "取消安裝",
    installation_required: "需要安裝",
    start_installation: "開始安裝",
};

const ES: TrayLabels = TrayLabels {
    open_search: "Abrir búsqueda",
    settings: "Ajustes…",
    quit: "Salir de Nookive",
    installing: "Instalando… ({percent}%)",
    pause_installation: "Pausar instalación",
    resume_installation: "Reanudar instalación",
    cancel_installation: "Cancelar instalación",
    installation_required: "Instalación necesaria",
    start_installation: "Iniciar instalación",
};

const FR: TrayLabels = TrayLabels {
    open_search: "Ouvrir la recherche",
    settings: "Réglages…",
    quit: "Quitter Nookive",
    installing: "Installation… ({percent} %)",
    pause_installation: "Suspendre l’installation",
    resume_installation: "Reprendre l’installation",
    cancel_installation: "Annuler l’installation",
    installation_required: "Installation requise",
    start_installation: "Lancer l’installation",
};

const DE: TrayLabels = TrayLabels {
    open_search: "Suche öffnen",
    settings: "Einstellungen…",
    quit: "Nookive beenden",
    installing: "Wird installiert… ({percent} %)",
    pause_installation: "Installation pausieren",
    resume_installation: "Installation fortsetzen",
    cancel_installation: "Installation abbrechen",
    installation_required: "Installation erforderlich",
    start_installation: "Installation starten",
};

const PT_BR: TrayLabels = TrayLabels {
    open_search: "Abrir busca",
    settings: "Ajustes…",
    quit: "Sair do Nookive",
    installing: "Instalando… ({percent}%)",
    pause_installation: "Pausar instalação",
    resume_installation: "Retomar instalação",
    cancel_installation: "Cancelar instalação",
    installation_required: "Instalação necessária",
    start_installation: "Iniciar instalação",
};

/// 언어 코드(예: "ko", "zh-TW", "pt-BR", "en-US")에 맞는 문구. 모르는 언어는 영어를 쓴다.
pub fn tray_labels(language: &str) -> &'static TrayLabels {
    let language = language.to_ascii_lowercase();
    if language.starts_with("ko") {
        &KO
    } else if language.starts_with("ja") {
        &JA
    } else if language == "zh-tw" || language == "zh-hk" || language.starts_with("zh-hant") {
        &ZH_TW
    } else if language.starts_with("zh") {
        &ZH_CN
    } else if language.starts_with("es") {
        &ES
    } else if language.starts_with("fr") {
        &FR
    } else if language.starts_with("de") {
        &DE
    } else if language.starts_with("pt") {
        &PT_BR
    } else {
        &EN
    }
}

pub fn installing_label(language: &str, percent: u32) -> String {
    tray_labels(language)
        .installing
        .replace("{percent}", &percent.to_string())
}

#[cfg(test)]
mod tests {
    use super::{installing_label, tray_labels};

    #[test]
    fn picks_labels_by_language() {
        assert_eq!(tray_labels("ko-KR").quit, "Nookive 종료");
        assert_eq!(tray_labels("zh-TW").open_search, "開啟搜尋");
        assert_eq!(tray_labels("zh-CN").open_search, "打开搜索");
        assert_eq!(tray_labels("pt-BR").settings, "Ajustes…");
        assert_eq!(tray_labels("it").quit, "Quit Nookive");
    }

    #[test]
    fn translates_every_label_in_every_language() {
        let en = tray_labels("en");
        for language in ["ko", "ja", "zh-CN", "zh-TW", "es", "fr", "de", "pt-BR"] {
            let labels = tray_labels(language);
            // 일시정지와 재개는 같은 항목의 두 상태라 문구가 달라야 한다.
            assert_ne!(
                labels.pause_installation, labels.resume_installation,
                "{language}"
            );
            // 영어 문구가 그대로 남은 항목이 없어야 한다.
            for (label, english) in [
                (labels.open_search, en.open_search),
                (labels.pause_installation, en.pause_installation),
                (labels.resume_installation, en.resume_installation),
                (labels.cancel_installation, en.cancel_installation),
                (labels.installation_required, en.installation_required),
                (labels.start_installation, en.start_installation),
            ] {
                assert_ne!(label, english, "{language}");
            }
        }
    }

    #[test]
    fn fills_in_installation_progress() {
        assert_eq!(installing_label("en", 42), "Installing… (42%)");
        assert_eq!(installing_label("ja", 7), "インストール中… (7%)");
    }
}
