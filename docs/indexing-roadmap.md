# Nookive 인덱싱 고도화 로드맵

## 목표

DigUp의 장점을 가져오되, Nookive는 검색 UX와 로컬 프라이버시를 우선한다.

- 파일 내용은 사용자 선택 루트만 읽는다.
- 앱은 `.app` 내용이 아니라 이름/Bundle ID 메타데이터만 검색한다.
- 임베딩은 로컬 llama-server에서만 생성한다.
- 변경된 파일만 재처리한다.
- 검색 중에는 인덱싱 작업이 UI와 모델 메모리를 독점하지 않는다.

## 현재 단계: manifest + 텍스트/멀티모달 증분 동기화

`sync_index_manifest(roots)`가 선택 루트를 스캔하고 다음 fingerprint를 저장한다.

```text
path + sizeBytes + modifiedAtMs + extension + status
```

상태는 `pending → processing → ready | failed`로 확장한다. 텍스트/코드는 React 증분 worker가 처리하고,
이미지/PDF/오디오/비디오는 Tauri `index_pending_media` 브리지가 기존 Node 멀티모달 인덱서를 호출해
`pending → ready`로 전환한다. 현재는 사용자별 `runtime-index.json`을 사용하며, 기존 샘플 인덱스와 분리해 회귀 위험을 낮춘다.

## 다음 단계: SQLite authoritative store

JSON은 전체 파일을 다시 읽어야 하므로 실제 제품에서는 SQLite를 source of truth로 바꾼다.

```sql
CREATE TABLE files (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,                 -- file | application
  extension TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  modified_at_ms INTEGER NOT NULL,
  content_hash TEXT,
  status TEXT NOT NULL,
  error TEXT,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE TABLE chunks (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  text_snippet TEXT NOT NULL,
  page_number INTEGER,
  line_start INTEGER,
  line_end INTEGER,
  timestamp_seconds REAL,
  UNIQUE(file_id, chunk_index)
);

CREATE TABLE embeddings (
  chunk_id TEXT PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
  model_version TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  vector_blob BLOB NOT NULL
);

CREATE VIRTUAL TABLE chunk_fts USING fts5(
  chunk_id UNINDEXED, file_name, text_snippet, tokenize='unicode61'
);
```

벡터 ANN 확장은 선택 사항이다. 초기에는 SQLite metadata + FTS5 + 메모리 cosine 검색으로 시작하고,
수만 청크 이상에서만 sqlite-vec/HNSW를 추가한다. 그래야 모델/벡터 확장 설치 실패가 파일 검색 전체를
망가뜨리지 않는다.

## 임베딩 worker

1. `pending` 파일을 priority queue에서 꺼낸다.
2. 안정성 확인: 수정 시각이 500ms 이상 변하지 않는지 확인한다.
3. 파일 reader가 페이지/라인/시간 위치가 있는 chunk를 생성한다.
4. 기존 vector가 같은 `content_hash + model_version`이면 임베딩을 재사용한다.
5. llama-server에 batch 단위로 전송한다.
6. 한 파일 단위 transaction으로 chunks/embeddings를 교체한다.
7. 성공 시 `ready`, 실패 시 재시도 횟수와 오류를 저장한다.

작업 우선순위는 다음 순서를 권장한다.

```text
사용자가 방금 검색한 파일 > 작은 텍스트 > PDF 첫 페이지 > 이미지 > 오디오/비디오
```

## watcher 정책

- 앱 시작: 전체 루트 재검증
- 실행 중: `notify` 이벤트를 300~800ms debounce해 한 파일 이벤트로 합침
- 저장 중인 파일: 안정성 확인 후 처리
- rename: inode/file identity가 가능하면 이동으로 처리하고, 아니면 삭제+추가
- 삭제: files/chunks/embeddings/FTS를 transaction으로 제거
- 대량 변경: 개별 이벤트 대신 root rescan으로 전환

## 검색 구조

```text
query
 ├─ exact/FTS 후보: 파일명·OCR·본문·Bundle ID
 ├─ dense 후보: EmbeddingGemma cosine/ANN
 ├─ RRF 또는 weighted fusion
 └─ 파일 단위 dedupe + 위치 메타데이터 보존
```

권장 초기 점수는 `0.65 dense + 0.35 lexical`이며, 숫자·에러 코드·앱 이름처럼 exact가 강해야 하는
쿼리는 lexical 결과를 상위로 강제한다. 앱 레코드는 dense 후보에 넣지 않고 lexical 전용으로 유지한다.

## 고도화 순서

### P0 — 제품 기반

- 사용자별 SQLite store
- manifest fingerprint와 pending queue 영속화
- 인덱싱 상태/중지/재시도 UI (텍스트·멀티모달 pending 목록)
- 선택 폴더 설정 및 권한 안내

### P1 — DigUp 수준

- PDF 페이지 단위, 이미지 native embedding, 오디오 30초 overlap, 비디오 frame+audio (현재 구현)
- 파일 변경 watcher
- 모델 버전별 재임베딩 migration
- 검색된 PDF 페이지/미디어 시점으로 열기

### P2 — 품질/성능

- FTS5 + dense hybrid retrieval
- ANN/sqlite-vec 도입 기준 측정
- embedding batch, GPU/CPU 자동 선택, thermal-aware throttling
- thumbnail/media cache quota 및 LRU
- 평가셋과 Recall@K/MRR/latency 회귀 테스트

### P3 — 제품 고도화

- 자연어 필터: `type:pdf`, `in:Downloads`, `before:2026-01-01`
- 앱별 deep link 및 최근 실행/즐겨찾기 랭킹
- OCR 언어 설정과 제외 폴더/파일 유형
- crash-safe resume, corrupt index rebuild, export/delete data
- 접근성, 키보드 탐색, 개인정보 감사 로그

## 운영 목표

- 검색 입력 후 결과 첫 표시: 100ms 이내(캐시된 lexical), 300ms 이내(dense)
- 새 텍스트 파일: 5초 이내 searchable
- 인덱싱 중 UI 입력 지연: p95 50ms 이하
- 임베딩 실패가 파일명/FTS 검색을 막지 않음
- 사용자 파일·벡터는 네트워크로 전송하지 않음 (선택적 웹 자동완성에는 입력한 검색어가 전송될 수 있음)
