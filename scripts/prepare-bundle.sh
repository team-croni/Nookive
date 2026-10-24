#!/usr/bin/env bash
# 배포용 Tauri 리소스 준비.
# 설치본은 사용자의 Node.js/프로젝트 경로에 의존하지 않도록 Node 런타임을
# 앱 번들에 함께 넣는다. 모델은 첫 실행 시 앱 데이터 디렉터리로
# 다운로드하므로 DMG에 포함하지 않는다.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="${NOOKIVE_NODE_BIN:-$(command -v node || true)}"

if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN" ]; then
    echo "❌ 배포 번들에 넣을 Node.js 런타임을 찾을 수 없습니다."
    echo "   NOOKIVE_NODE_BIN=/path/to/node npm run bundle:prepare"
    exit 1
fi

# 이전 빌드 또는 마운트로 남아 있는 DMG 가상 볼륨 자동 정리
for vol in /Volumes/Nookive* /Volumes/dmg.*; do
    if [ -d "$vol" ]; then
        hdiutil detach "$vol" -force 2>/dev/null || true
    fi
done
sleep 1
rm -f "$PROJECT_DIR"/src-tauri/target/release/bundle/macos/rw.*.dmg 2>/dev/null || true
rm -f "$PROJECT_DIR"/src-tauri/target/release/bundle/dmg/rw.*.dmg 2>/dev/null || true

required_files=(
    "$PROJECT_DIR/bin/llama-server"
    "$PROJECT_DIR/bin/media-cli"
    "$PROJECT_DIR/bin/vision-cli"
    "$PROJECT_DIR/scripts/index-folder.mjs"
    "$PROJECT_DIR/node_modules/pdf-parse/package.json"
    "$PROJECT_DIR/node_modules/@napi-rs/canvas/package.json"
    "$PROJECT_DIR/bin/qwen3-asr-cli"
    "$PROJECT_DIR/bin/qwen3-asr-libs"
)

for required in "${required_files[@]}"; do
    if [ ! -e "$required" ]; then
        echo "❌ 배포 리소스가 없습니다: $required"
        exit 1
    fi
done

cp "$NODE_BIN" "$PROJECT_DIR/bin/node"
chmod 755 "$PROJECT_DIR/bin/node" "$PROJECT_DIR/bin/llama-server" "$PROJECT_DIR/bin/media-cli" "$PROJECT_DIR/bin/vision-cli"

echo "✅ 배포 리소스 준비 완료"
echo "   Node: $NODE_BIN"
echo "   모델: 첫 실행 시 앱 데이터 디렉터리로 다운로드"
echo "   실행 리소스: bin/llama-server, bin/media-cli, bin/vision-cli, bin/qwen3-asr-cli"
