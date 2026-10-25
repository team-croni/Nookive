#!/bin/bash
# scripts/run-asr.sh
# Qwen3-ASR-0.6B llama-server (포트 8081). 인덱싱 중에만 기동하고 끝나면 종료한다.
set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BIN_PATH="$PROJECT_DIR/bin/llama-server"
MODEL_PATH="${NOOKIVE_ASR_MODEL:-$PROJECT_DIR/models/asr/Qwen3-ASR-0.6B-Q8_0.gguf}"
MMPROJ_PATH="${NOOKIVE_ASR_MMPROJ:-$PROJECT_DIR/models/asr/mmproj-Qwen3-ASR-0.6B-Q8_0.gguf}"
PORT="${NOOKIVE_ASR_PORT:-8081}"
CTX_SIZE="${NOOKIVE_ASR_CTX_SIZE:-2048}"
PARALLEL_SLOTS="${NOOKIVE_ASR_PARALLEL:-1}"

if [ ! -x "$BIN_PATH" ]; then
  echo "❌ llama-server를 찾을 수 없습니다: $BIN_PATH"
  exit 1
fi
if [ ! -s "$MODEL_PATH" ]; then
  echo "❌ ASR 모델이 없습니다: $MODEL_PATH"
  echo "   먼저 'npm run asr:download'를 실행하세요."
  exit 1
fi
if [ ! -s "$MMPROJ_PATH" ]; then
  echo "❌ ASR mmproj가 없습니다: $MMPROJ_PATH"
  echo "   먼저 'npm run asr:download'를 실행하세요."
  exit 1
fi

# macOS 동적 라이브러리 경로 보장
export DYLD_LIBRARY_PATH="$PROJECT_DIR/bin:${DYLD_LIBRARY_PATH:-}"

echo "🎙️  Qwen3-ASR 기동: http://127.0.0.1:$PORT"
exec "$BIN_PATH" \
  -m "$MODEL_PATH" \
  --mmproj "$MMPROJ_PATH" \
  --host 127.0.0.1 \
  --port "$PORT" \
  -c "$CTX_SIZE" \
  -np "$PARALLEL_SLOTS"
