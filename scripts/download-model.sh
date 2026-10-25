#!/bin/bash
# scripts/download-model.sh
# EmbeddingGemma 2 GGUF 모델 다운로드 (텍스트 본체 + 멀티모달 mmproj 인코더)

set -e

MODELS_DIR="$(cd "$(dirname "$0")/.." && pwd)/models"
mkdir -p "$MODELS_DIR"

BASE_URL="https://huggingface.co/ggml-org/embeddinggemma-2-GGUF/resolve/main"

# 1) 텍스트 본체 (310MB)
MODEL_FILENAME="embeddinggemma-2-Q8_0.gguf"
MODEL_URL="$BASE_URL/embeddinggemma-2-Q8_0.gguf"

# 2) 멀티모달 인코더(mmproj): 이미지/오디오/영상 임베딩용 (555MB)
MMPROJ_FILENAME="mmproj-embeddinggemma-2-Q8_0.gguf"
MMPROJ_URL="$BASE_URL/mmproj-embeddinggemma-2-Q8_0.gguf"

download() {
    local url="$1"
    local out="$2"
    local label="$3"

    if [ -f "$out" ]; then
        echo "✅ 이미 존재: $out"
        return 0
    fi

    echo "⬇️  $label 다운로드 시작 → $out"
    if command -v curl >/dev/null 2>&1; then
        curl -L --progress-bar -o "$out" "$url"
    elif command -v wget >/dev/null 2>&1; then
        wget -O "$out" "$url"
    else
        echo "❌ curl 또는 wget이 설치되어 있지 않습니다."
        exit 1
    fi
    echo "✅ 완료: $out"
}

echo "=========================================================="
echo "🧠 EmbeddingGemma 2 GGUF 모델 다운로드 (텍스트 + 멀티모달 mmproj)"
echo "저장 경로: $MODELS_DIR"
echo "=========================================================="

download "$MODEL_URL" "$MODELS_DIR/$MODEL_FILENAME" "텍스트 본체 (310MB)"
download "$MMPROJ_URL" "$MODELS_DIR/$MMPROJ_FILENAME" "멀티모달 mmproj 인코더 (555MB)"

echo ""
echo "✅ 모든 모델 준비 완료!"
