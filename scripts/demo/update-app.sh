#!/bin/bash
# scripts/demo/update-app.sh
# 데모 계정에서 실행한다. 공유 폴더의 새 빌드로 Nookive만 교체한다. (색인 데이터는 그대로 둔다)
set -euo pipefail
DEMO=/Users/Shared/NookiveDemo
pkill -x Nookive 2>/dev/null || true
sleep 1
rm -rf "$HOME/Applications/Nookive.app"
cp -R "$DEMO/Nookive.app" "$HOME/Applications/"
open "$HOME/Applications/Nookive.app"
echo "✅ Nookive를 새 빌드로 교체했습니다."
