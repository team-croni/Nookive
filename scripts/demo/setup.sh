#!/bin/bash
# scripts/demo/setup.sh
# 데모 전용 macOS 계정에서 한 번 실행한다. 공유 폴더(/Users/Shared/NookiveDemo)에 준비한
# 앱·모델·데모 파일을 이 계정에 설치하고, ~/Documents를 검색 폴더로 등록한 뒤 Nookive를 연다.
set -euo pipefail

DEMO=/Users/Shared/NookiveDemo
APP_SUPPORT="$HOME/Library/Application Support/com.nookive.search"

for required in "$DEMO/Nookive.app" "$DEMO/models" "$DEMO/Documents"; do
  [ -e "$required" ] || { echo "❌ $required 가 없습니다. 메인 계정에서 준비 단계를 먼저 실행하세요."; exit 1; }
done

pkill -x Nookive 2>/dev/null || true

echo "• Nookive를 ~/Applications에 설치합니다."
mkdir -p "$HOME/Applications"
rm -rf "$HOME/Applications/Nookive.app"
cp -R "$DEMO/Nookive.app" "$HOME/Applications/"

echo "• 모델(2.7GB)은 복사하지 않고 공유 폴더를 연결합니다."
mkdir -p "$APP_SUPPORT"
rm -rf "$APP_SUPPORT/models"
ln -s "$DEMO/models" "$APP_SUPPORT/models"

echo "• 데모 파일을 ~/Documents에 복사합니다."
cp -R "$DEMO/Documents/." "$HOME/Documents/"

echo "• ~/Documents를 검색 폴더로 등록합니다. (앱이 시작되면 자동으로 색인합니다)"
cat > "$APP_SUPPORT/index-manifest.json" <<JSON
{
  "schema_version": 1,
  "model_version": "embeddinggemma-2-Q8_0",
  "roots": ["$HOME/Documents"],
  "directories": [],
  "files": [],
  "pending_paths": [],
  "last_sync_at_ms": null
}
JSON

open "$HOME/Applications/Nookive.app"
cat <<'MSG'

✅ 설치 완료. 다음을 확인하세요.
  1. "Nookive가 문서 폴더에 접근하려고 합니다" 창이 뜨면 [허용]을 누릅니다.
  2. 1~2분 기다리면 색인이 끝납니다. (메뉴바 Nookive 아이콘 → Settings에서 진행 상황 확인)
  3. ⌥Space로 검색창을 열어 "sunset at the beach"가 사진을 찾는지 확인합니다.
  4. 확인되면 record.sh로 녹화합니다.
MSG
