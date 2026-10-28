#!/usr/bin/env bash
# 배포용 Tauri 리소스 준비.
# 설치본은 사용자의 Node.js/프로젝트 경로에 의존하지 않도록 Node 런타임을
# 앱 번들에 함께 넣는다. 모델은 첫 실행 시 앱 데이터 디렉터리로
# 다운로드하므로 DMG에 포함하지 않는다. 함께 배포하는 제3자 구성요소의
# 라이선스 전문은 bin/licenses/에 생성해 앱 리소스로 동봉한다.

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

# 함께 배포하는 Node.js 런타임의 라이선스. 공식 배포본/nvm/Homebrew는 실행 파일
# 상위 디렉터리에 LICENSE를 두며, 없으면 같은 버전 태그의 업스트림 파일을 받는다.
NODE_VERSION="$("$NODE_BIN" --version)"
NODE_REAL="$("$NODE_BIN" -p 'require("fs").realpathSync(process.execPath)')"
NODE_LICENSE_DIR="$PROJECT_DIR/bin/licenses/upstream/node"
rm -rf "$NODE_LICENSE_DIR"
mkdir -p "$NODE_LICENSE_DIR"
NODE_LICENSE=""
for candidate in \
    "${NOOKIVE_NODE_LICENSE:-}" \
    "$(dirname "$NODE_REAL")/../LICENSE" \
    "$(dirname "$NODE_REAL")/../share/doc/node/LICENSE"; do
    if [ -n "$candidate" ] && [ -f "$candidate" ]; then
        NODE_LICENSE="$candidate"
        break
    fi
done
if [ -n "$NODE_LICENSE" ]; then
    cp "$NODE_LICENSE" "$NODE_LICENSE_DIR/LICENSE"
elif ! curl -fsSL "https://raw.githubusercontent.com/nodejs/node/$NODE_VERSION/LICENSE" -o "$NODE_LICENSE_DIR/LICENSE"; then
    echo "❌ Node.js $NODE_VERSION 라이선스를 찾지 못했습니다."
    echo "   NOOKIVE_NODE_LICENSE=/path/to/node/LICENSE npm run bundle:prepare"
    exit 1
fi
echo "$NODE_VERSION" > "$NODE_LICENSE_DIR/VERSION"

# 앱에 동봉할 제3자 라이선스 전문 생성 (누락 시 빌드 실패)
"$NODE_BIN" "$PROJECT_DIR/scripts/generate-licenses.mjs" --strict

echo "✅ 배포 리소스 준비 완료"
echo "   Node: $NODE_BIN"
echo "   모델: 첫 실행 시 앱 데이터 디렉터리로 다운로드"
echo "   실행 리소스: bin/llama-server, bin/media-cli, bin/vision-cli, bin/qwen3-asr-cli"
echo "   라이선스: bin/licenses/THIRD_PARTY_LICENSES.txt"
