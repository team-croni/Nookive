---
date: 2026-10-23
version: 1.8.0
---

# System Architecture Specification

## 1. 아키텍처 개요 (Overview)

Nookive는 사용자가 선택한 로컬 폴더의 문서/파일을 시맨틱(의미 기반)으로 탐색하는 Apple Silicon macOS 전용 온디바이스 데스크톱 검색 애플리케이션입니다. 현재 Windows와 Linux는 지원하지 않습니다.

화면(UI)의 자유로운 커스터마이징과 반응성을 위해 **React 19 + TypeScript + CSS Modules**를 채택하고, 가벼운 데스크톱 쉘로 **Tauri 2.0 (Rust)**을 사용합니다. 무거운 AI 연산은 C++ 기반의 **`llama-server` (EmbeddingGemma 2)** 사이드카 바이너리가 담당합니다.

```mermaid
flowchart TB
    subgraph UI_Layer ["🖥️ 프론트엔드 UI 레이어 (React 19 + Vite)"]
        SearchBar["검색창 (Search Input)"]
        ResultList["결과 목록 (Virtual List)"]
        PreviewPane["실시간 파일 프리뷰 패널"]
    end

    subgraph Shell_Layer ["📦 데스크톱 쉘 (Tauri 2.0 Rust)"]
        ShortcutMgr["전역 핫키 관리자 (Opt+Space / Alt+Space)"]
        WindowEffects["macOS Vibrancy 블러 처리"]
        SidecarSupervisor["llama-server 프로세스 수명주기 관리자"]
        FileWatcher["로컬 파일 변경 감시자 (notify crate)"]
    end

    subgraph Core_Engine ["⚙️ 로컬 AI & 검색 엔진 (멀티모달)"]
        Sidecar["llama-server (C++)<br/>EmbeddingGemma 2 (GGUF) + mmproj<br/>텍스트·이미지·오디오 768-dim 공통 공간"]
        MediaReaders["미디어 리더<br/>sips / afconvert / media-cli(AVFoundation)"]
        VectorDB["sqlite-vec (로컬 search_index.db)"]
    end

    AppCatalog["macOS 앱 카탈로그\n이름 + Bundle ID"]

    SearchBar -->|1. 쿼리 텍스트| Sidecar
    Sidecar -->|2. 768차원 질의 벡터| Shell_Layer
    Shell_Layer -->|3. 코사인 유사도 쿼리| VectorDB
    VectorDB -->|4. Top-K 문서 청크 및 경로| ResultList
    AppCatalog -->|앱 메타데이터 exact 검색| ResultList
    ResultList -->|5. 선택 항목 변경 시 본문 로드| PreviewPane
```

---

## 2. 계층별 책임 및 분리 원칙 (Separation of Concerns)

### 2.1. 프론트엔드 레이어 (`src/`)

- **역할**: 사용자 인터랙션 수신, 키보드 네비게이션, 글래스모피즘 렌더링, 파일 프리뷰.
- **제약**: 무거운 I/O 및 파싱 로직을 직접 수행하지 않고 비동기 API/Tauri IPC로 위임.
- **통신**:
  - AI 임베딩 요청: `http://127.0.0.1:8080/v1/embeddings` (로컬 사이드카 직접 호출)
  - 파일 읽기/열기: Tauri `invoke('open_file_in_os', { path })`

### 2.2. 데스크톱 쉘 레이어 (`src-tauri/`)

- **역할**:
  1. 무테두리/투명 플로팅 윈도우 생성 및 OS 네이티브 블러(`hudWindow`, `acrylic`) 주입.
  2. 전역 단축키 등록 및 포커스 분실(`blur`) 시 윈도우 숨김(`hide`).
  3. 앱 실행 시 `llama-server` 자동 실행, 앱 종료 시 자식 프로세스 자동 파살(Kill).
  4. 로컬 파일 디스크 I/O 및 SQLite 트랜잭션 관리.
  5. macOS 앱 카탈로그(`/Applications`, `/System/Applications`, `~/Applications`)를 런타임에 수집.

### 2.3. AI 추론 및 벡터 엔진 (멀티모달)

- **모델**: `ggml-org/embeddinggemma-2-GGUF`
  - 텍스트 본체: Application Support의 `models/embeddinggemma-2-Q8_0.gguf` (≈310MB)
  - **멀티모달 인코더(mmproj)**: Application Support의 `models/mmproj-embeddinggemma-2-Q8_0.gguf` (≈555MB, 이미지·오디오)
  - DMG에는 모델을 포함하지 않으며 첫 실행 시 앱 UI에서 자동 다운로드·SHA-256 검증한다.
- **임베딩 공간**: 768차원 **단일 공간**(텍스트·이미지·오디오 상호 비교 가능)
- **서버**: `llama-server --mmproj ... -c 2048 -b 1024 -ub 1024 -np 1` (멀티모달 오디오 윈도우 기본값; 필요하면 환경변수로 하향)
- **엔드포인트**: `POST /v1/embeddings`
  - 텍스트: `{ input: "..." }`
  - 이미지: `{ input: [{ content: [{ type: "image_url", image_url: { url: "data:image/jpeg;base64,..." } }] }] }`
  - 오디오: `{ input: [{ content: [{ type: "input_audio", input_audio: { data: "<wav b64>", format: "wav" } }] }] }`
- **미디어 리더**: `sips`(이미지→JPEG 1024px), `afconvert`(오디오→16k mono WAV 30초 윈도우), `bin/media-cli`(비디오 프레임, AVFoundation)
- **저장소**: SQLite + `sqlite-vec` 확장 (단일 로컬 파일로 백업/이동 간편)

앱 카탈로그는 파일 내용 임베딩 대상이 아니다. 앱 이름과 Bundle ID는 별도 메타데이터 레코드로 exact 검색하고,
실행은 macOS `open`으로 위임한다. 설치/삭제 변경은 앱 시작 시 재스캔하며, 장기적으로는 파일 변경 감시 이벤트로
카탈로그만 갱신한다.

### 2.4. 미디어 세그먼트 & 이동

- 인덱스에 위치 메타데이터 저장: PDF `pageNumber`, 텍스트/코드 `lineStart`, 오디오/비디오 `timestampSeconds`.
- 프론트엔드 미리보기에서 오디오/비디오는 검색된 **시점으로 자동 seek**, PDF는 해당 페이지/하이라이트 표시.
