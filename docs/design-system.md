---
date: 2026-10-23
version: 1.7.0
---

# Design System Specification

## 1. 디자인 철학 (Design Philosophy)

Nookive는 macOS의 **Raycast**, **Spotlight** 및 미니멀 프리미엄 툴들의 감성을 지향합니다.

1. **0초 반응성(Instant Interaction)**: 입력과 동시에 즉각 반응하며 런타임 CSS 계산 부하가 없습니다.
2. **Glassmorphism & Depth**: 투명 배경에 깊은 블러(Vibrancy)와 1px 미세 림 라이트(Rim Border)를 결합하여 데스크톱 환경 위에 자연스럽게 녹아듭니다.
3. **Keyboard-First**: 마우스 조작 없이 모든 기능을 키보드로 탐색 및 제어할 수 있습니다.

---

## 2. 디자인 토큰 명세 (Design Tokens)

### 2.0. 테마 (라이트 / 다크)

설정의 화면 모드에서 **라이트모드**, **다크모드**, **시스템**을 선택할 수 있습니다. 기본값은 시스템이며, 시스템 모드는 macOS 외관 설정을 `prefers-color-scheme` 미디어 쿼리로 추종합니다. 선택값은 `localStorage`의 `nookive.theme`에 저장됩니다.

- 모든 색상 토큰은 [`src/styles/tokens.css`](../src/styles/tokens.css)에 정의합니다. `:root`는 **라이트** 기본값, `@media (prefers-color-scheme: dark)` 블록은 **시스템 모드의 다크** 값을 제공하며, `:root[data-theme="light"]`와 `:root[data-theme="dark"]`가 수동 선택을 우선 적용합니다.
- 컴포넌트 CSS/TSX에는 색상(hex/rgba)을 **하드코딩하지 않고** 반드시 `var(--token)`을 사용합니다. 새 색상이 필요하면 토큰을 라이트/다크 양쪽에 추가합니다.
- 라인/UI 아이콘(lucide SVG)은 색상 속성 대신 `style={{ color: 'var(--icon-*)' }}`로 지정합니다.
- **파일 포맷 아이콘은 색상이 내장된 PNG 에셋**을 사용하므로 토큰 색을 적용하지 않습니다(§2.3 참고).
- 흰 종이 느낌의 문서 미리보기(`--surface-doc`, `--text-on-doc`)와 PDF 캔버스는 의도적으로 두 테마 모두 밝은 배경을 유지합니다.
- `color-scheme`과 `data-theme`을 함께 반영해 스크롤바/폼 컨트롤 등 네이티브 요소도 선택한 외관에 맞춥니다.

### 2.1. 컬러 & 서피스 (Surfaces & Glass)

| 토큰명                 | 라이트                          | 다크                                  | 설명                           |
| :--------------------- | :------------------------------ | :------------------------------------ | :----------------------------- |
| `--glass-bg-base`      | `rgba(246, 246, 248, 0.78)`     | `rgba(22, 22, 26, 0.78)`              | 윈도우 메인 반투명 배경        |
| `--glass-bg-panel`     | `rgba(255, 255, 255, 0.55)`     | `rgba(15, 15, 18, 0.55)`              | 미리보기 패널 배경             |
| `--glass-bg-hover`     | `rgba(0, 0, 0, 0.045)`          | `rgba(255, 255, 255, 0.05)`           | 리스트 아이템 호버/포커스 배경 |
| `--glass-bg-active`    | `rgba(0, 0, 0, 0.08)`           | `rgba(255, 255, 255, 0.08)`           | 현재 선택된(Active) 항목 배경  |
| `--rim-border-window`  | `1px solid rgba(0, 0, 0, 0.14)` | `1px solid rgba(255, 255, 255, 0.14)` | 창 외곽 반사 테두리            |
| `--rim-border-divider` | `1px solid rgba(0, 0, 0, 0.08)` | `1px solid rgba(255, 255, 255, 0.07)` | 검색창 및 패널 구분선          |
| `--text-primary`       | `#1d1d1f`                       | `#f5f5f7`                             | 기본 텍스트                    |
| `--text-secondary`     | `rgba(29, 29, 31, 0.68)`        | `rgba(245, 245, 247, 0.65)`           | 보조 텍스트                    |
| `--text-tertiary`      | `rgba(29, 29, 31, 0.45)`        | `rgba(245, 245, 247, 0.38)`           | 3차 텍스트                     |

기타 보조 토큰(칩/키캡 `--surface-chip*`, 아이콘 `--icon-*`, 에러 `--error-*`, 그림자 `--shadow-*`, 스크롤바 `--scrollbar-thumb*`, 하이라이트 `--highlight-bg`)도 동일하게 라이트/다크 쌍으로 정의되어 있습니다.

### 2.2. 액션 버튼 (Action Buttons)

- **Primary**: 가장 중요한 행동에만 `--button-primary` 배경과 흰색 텍스트를 사용하고, hover에는 `--button-primary-hover`를 사용합니다. 현재 미리보기 패널의 `열기`가 해당합니다.
- **Secondary**: 보조 행동은 테두리 없이 `--button-secondary` 배경을 사용하고, hover에는 `--button-secondary-hover`를 사용합니다. 현재 `Finder에서 보기`가 해당합니다.
- 버튼 높이는 30px, 모서리 반경은 6px, 좌우 패딩은 12px로 통일합니다. Secondary hover에서는 배경을 `--glass-bg-hover`로 전환해 상태만 가볍게 강조합니다.
- 라이트/다크 테마 모두 컴포넌트에 색상을 직접 쓰지 않고 `src/styles/tokens.css`의 버튼 상태 토큰을 사용합니다. 버튼 상태 토큰은 `--button-primary`, `--button-primary-hover`, `--button-secondary`, `--button-secondary-hover`로 구분하며, Secondary는 border를 투명하게 유지합니다.

### 2.3. 타이포그래피 (Typography)

- 기본 폰트 패밀리: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Pretendard Variable", sans-serif`
- 검색 인풋: `20px / 1.3`, Weight 400, Tracking `-0.3px`
- 결과 제목: `14px / 1.4`, Weight 500, `var(--text-primary)`
- 스니펫 텍스트: `12px / 1.5`, Weight 400, `var(--text-secondary)`

### 2.4. 파일 아이콘 에셋 (File Type Icons)

- **위치**: `public/icons/file-types/<ext>.png` (포맷별), `public/icons/sections/<name>.png` (섹션 폴백: documents/image/video/audio/code/excel/folder)
- **선정 스타일**: `public/icons/file-types/`에 타입별 표준 파일명(`pdf.png`, `txt.png` 등)으로 배치한 Outline + Color 세트(다크/라이트 모두 대비 확보). 런타임에는 선정된 아이콘만 포함합니다.

## 브랜드 임시 자산

최종 로고가 확정되기 전까지 다음 교체 가능한 임시 자산을 사용합니다.

- `public/nookive-mark.svg`: 앱 마크 및 favicon용
- `public/nookive-wordmark.svg`: 문서·웹·소개 화면용 워드마크
- `public/favicon.svg`: 현재 웹뷰 favicon. 최종 마크 확정 시 함께 교체합니다.

마크는 로컬 탐색 경로와 의미 검색 결과를 상징하는 두 개의 연결된 궤도와
노드로 구성했습니다. 최종 브랜드 자산으로 교체할 때는 이 파일들과
`src-tauri/icons/`의 플랫폼 아이콘 세트를 함께 갱신합니다.
- **해상도**: 96×96으로 리샘플링(표시 크기 ~24–28px 대비 선명도·용량 최적화).
- **렌더링**: [`renderFileIcon(ext, className, size)`](../src/utils/fileType.tsx)가 확장자→아이콘을 매핑하고, 없으면 섹션 아이콘으로 폴백. `<img>`로 렌더하며 `objectFit: contain`.
- **페이드 예외**: 파일 아이콘은 리마운트 시 깜빡임 방지를 위해 전역 이미지 페이드인에서 제외(`.no-fade`).
- **결과 아이템 레이아웃**: 1행 = 파일명 + 위치 뱃지(`p.{n}` / `L{n}` / `m:ss`), 2행 = (텍스트/코드는 스니펫 하이라이트, 그 외는 축약 경로).
- **섹션 헤더**: 결과를 문서 → 이미지 → 비디오 → 오디오 → 코드 순으로 그룹화(헤더에 라벨 + 개수).

---

## 3. 키보드 인터랙션 규격 (Keyboard Map)

- `↑` / `↓`: 결과 리스트 이전/다음 탐색 (자동 스크롤)
- `Enter`: 기본 액션 (OS 기본 프로그램으로 파일 열기)
- `Cmd/Ctrl + Enter`: 파일 위치 Finder/탐색기에서 표시
- `Tab`: 본문 미리보기 패널로 포커스 이동
- `Esc`: 검색어 지우기 또는 창 닫기
