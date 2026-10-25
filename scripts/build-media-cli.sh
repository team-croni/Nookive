#!/bin/bash
# scripts/build-media-cli.sh
# 비디오 프레임 추출기(media-cli) Swift 빌드 스크립트
set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$PROJECT_DIR/scripts/media-cli.swift"
OUT="$PROJECT_DIR/bin/media-cli"

echo "🔨 media-cli 빌드: $OUT"
swiftc -O "$SRC" -o "$OUT" \
    -framework AVFoundation \
    -framework CoreMedia \
    -framework CoreGraphics \
    -framework ImageIO \
    -framework UniformTypeIdentifiers

echo "✅ 완료: $OUT"
