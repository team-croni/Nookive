#!/bin/bash
# scripts/build-aligner.sh
# Qwen3-ForcedAligner용 qwen3-asr.cpp CLI를 빌드하고 모델/사전을 준비한다.
# (Apple Silicon Metal, C++17, 단어 단위 타임스탬프)
set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="${NOOKIVE_ALIGNER_BUILD_DIR:-${TMPDIR:-/tmp}/nookive-qwen3-asr}"
REPO_URL="https://github.com/femelo/qwen3-asr.cpp.git"
MODEL_URL="https://huggingface.co/OpenVoiceOS/qwen3-forced-aligner-0.6b-q8-0/resolve/main/qwen3-forced-aligner-0.6b-q8_0.gguf?download=true"

if [ ! -d "$BUILD_DIR/.git" ]; then
  echo "⬇️  qwen3-asr.cpp 클론: $BUILD_DIR"
  git clone --recursive "$REPO_URL" "$BUILD_DIR"
fi

cd "$BUILD_DIR"
git submodule update --init --recursive

if ! command -v cmake >/dev/null 2>&1; then
  echo "❌ cmake가 필요합니다. 'brew install cmake' 또는 'pip install --user cmake' 후 다시 실행하세요."
  exit 1
fi

mkdir -p build
cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
cmake --build . -j"$(sysctl -n hw.ncpu)"

echo "📦 CLI/라이브러리 복사"
cp qwen3-asr-cli "$PROJECT_DIR/bin/qwen3-asr-cli"
chmod +x "$PROJECT_DIR/bin/qwen3-asr-cli"
mkdir -p "$PROJECT_DIR/bin/qwen3-asr-libs"
# 배포에는 qwen3-asr-cli가 실제로 링크하는 ABI 이름만 필요하다.
# 빌드 시스템이 생성하는 중복 호환명(.dylib, .0.10.0.dylib 등)은 제외해
# 앱 번들 크기를 줄이고 런타임 로딩 경로를 명확하게 유지한다.
for runtime_lib in \
  "$BUILD_DIR/build/ggml/src/libggml.0.dylib" \
  "$BUILD_DIR/build/ggml/src/libggml-base.0.dylib" \
  "$BUILD_DIR/build/ggml/src/libggml-cpu.0.dylib" \
  "$BUILD_DIR/build/ggml/src/ggml-blas/libggml-blas.0.dylib" \
  "$BUILD_DIR/build/ggml/src/ggml-metal/libggml-metal.0.dylib"; do
  cp "$runtime_lib" "$PROJECT_DIR/bin/qwen3-asr-libs/"
done

echo "📖 한국어 사전 복사"
mkdir -p "$PROJECT_DIR/models/asr/assets"
cp "$BUILD_DIR/assets/korean_dict_jieba.dict" "$PROJECT_DIR/models/asr/assets/"

echo "⬇️  ForcedAligner 모델 다운로드"
mkdir -p "$PROJECT_DIR/models/asr"
if [ ! -s "$PROJECT_DIR/models/asr/qwen3-forced-aligner-0.6b-q8_0.gguf" ]; then
  curl -L --fail --retry 3 -C - \
    -o "$PROJECT_DIR/models/asr/qwen3-forced-aligner-0.6b-q8_0.gguf" \
    "$MODEL_URL"
fi

echo ""
echo "✅ ForcedAligner 준비 완료"
ls -lh "$PROJECT_DIR/bin/qwen3-asr-cli" "$PROJECT_DIR/models/asr/qwen3-forced-aligner-0.6b-q8_0.gguf"
