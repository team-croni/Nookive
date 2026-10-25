#!/bin/bash
# scripts/download-asr-model.sh
# Qwen3-ASR-0.6B Q8_0 + mmproj 다운로드 (한국어 포함 30개 언어, llama.cpp GGUF)
set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MODEL_DIR="$PROJECT_DIR/models/asr"
BASE_URL="https://huggingface.co/ggml-org/Qwen3-ASR-0.6B-GGUF/resolve/main"

mkdir -p "$MODEL_DIR"

FILES=(
  "Qwen3-ASR-0.6B-Q8_0.gguf"
  "mmproj-Qwen3-ASR-0.6B-Q8_0.gguf"
)

for file in "${FILES[@]}"; do
  target="$MODEL_DIR/$file"
  if [ -s "$target" ]; then
    echo "✅ 이미 존재: $file ($(du -h "$target" | cut -f1))"
    continue
  fi
  echo "⬇️  다운로드: $file"
  curl -L --fail --retry 3 -C - -o "$target" "$BASE_URL/$file?download=true"
done

echo ""
echo "✅ Qwen3-ASR 모델 준비 완료: $MODEL_DIR"
ls -lh "$MODEL_DIR"
