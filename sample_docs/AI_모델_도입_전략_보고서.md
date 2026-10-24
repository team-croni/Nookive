# 2026 차세대 AI 모델 도입 전략 및 온디바이스 아키텍처

## 1. 개요
클라우드 API(OpenAI, Claude) 기반의 프라이버시 이슈 및 비용 증가에 대응하기 위해 사내 문서 검색(Enterprise Search) 시스템을 완전 온디바이스(On-Device) 로컬 추론 체계로 전환합니다.

## 2. 임베딩 모델 비교
* **기존 모델**: multilingual-e5-large (512 토큰 제한, 1024차원)
* **신규 모델**: Google DeepMind **EmbeddingGemma 2** (8,192 토큰 컨텍스트, 768차원 멀티모달)
* **도입 효과**: 
  - 8K 컨텍스트 지원으로 긴 약관 문서의 내용 절삭 방지
  - Matryoshka Representation Learning(MRL)을 통한 벡터 저장소 크기 50% 절감
  - C++ `llama.cpp` 엔진 및 Apple Silicon Metal 가속으로 지연시간 25ms 미만 달성

## 3. 크로스플랫폼 배포 전략
Tauri 2.0 쉘을 통해 단일 React 프론트엔드로 macOS 및 Windows 배포 파이프라인을 구축합니다.
