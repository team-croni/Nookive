---
date: 2026-10-26
version: 1.7.0
---

# Nookive - Documentation Index

Nookive의 공식 아키텍처, 디자인 시스템, 인덱싱 파이프라인 및 개발 표준 명세서 모음입니다.

---

## 📑 문서 인덱스 표 (Documentation Index)

| 문서 파일                                        |  버전  | 최종 수정일 | 주요 내용 요약                                                                                            |
| :----------------------------------------------- | :----: | :---------: | :-------------------------------------------------------------------------------------------------------- |
| [system-architecture.md](system-architecture.md) | v1.9.0 | 2026-10-26  | macOS Apple Silicon 전용 Tauri 쉘, 멀티모달 검색, PDF 실제 매칭 페이지 미리보기 구조 |
| [design-system.md](design-system.md)             | v1.7.0 | 2026-10-23  | 수동/시스템 테마 선택, 라이트/다크 색상 토큰과 파일 포맷 아이콘 규격 |
| [indexer-pipeline.md](indexer-pipeline.md)       | v1.4.0 | 2026-10-23  | macOS 네이티브 미디어 처리와 텍스트·이미지·오디오·비디오 색인 파이프라인 |
| [settings-and-menu-bar.md](settings-and-menu-bar.md) | v1.2.0 | 2026-10-23  | 메뉴바 상주 정책, 필수 AI 모델(임베딩+ASR) 전체 자동 설치 마법사 및 다운로드 안전 취소·이어받기, 설정 창 UX |
| [release-checklist.md](release-checklist.md) | v1.1.0 | 2026-10-26 | PDF 검색/미리보기 검증, macOS 파일 접근, DMG 배포 전 점검 |

---

## 🛠️ 개발 및 설계 원칙

1. **0ms 반응성**: 키 입력 시 프레임 드랍을 줄이는 순수 CSS Variables + CSS Modules 아키텍처. 무거운 프리뷰/썸네일은 지연(`useDeferredValue`, 디바운스, IntersectionObserver) 처리.
2. **현재 지원 범위 고정**: 현재 릴리즈는 Apple Silicon macOS만 지원합니다. Windows/Linux는 향후 별도 포팅 범위이며 현재 배포 대상이 아닙니다.
3. **테마 선택 지원**: 설정에서 라이트모드·다크모드·시스템을 선택할 수 있습니다. 시스템 모드는 `prefers-color-scheme`를 따르며, 색상은 반드시 토큰(`var(--*)`)으로만 사용.
4. **온디바이스 프라이버시**: AI 임베딩과 파일 인덱싱은 로컬에서 처리하며, 선택적인 모델 다운로드·Google 자동완성·웹 검색은 네트워크를 사용합니다.
5. **멀티모달 단일 임베딩 공간**: 텍스트·이미지·오디오를 동일한 768차원 공간에 임베딩하여 교차 모달 검색.
6. **PDF 검색 결과의 일관성**: 백그라운드 PDF 스캔과 선택된 미리보기의 실제 매칭 페이지를 공유하여 목록 뱃지와 미리보기 페이지가 같은 검색 결과를 가리키도록 합니다.
