#!/bin/bash
# scripts/demo/record.sh
# 데모 계정에서 실행한다. 콘티를 한 번 미리 돌려 캐시를 데운 뒤, 같은 콘티를 녹화한다.
# 필요한 권한(시스템 설정 → 개인정보 보호 및 보안): 화면 기록, 손쉬운 사용 → 터미널 허용
set -euo pipefail

DEMO=/Users/Shared/NookiveDemo
STORYBOARD="$DEMO/storyboard.applescript"
OUT_DIR="$DEMO/recordings"
DURATION=${DURATION:-55}
mkdir -p "$OUT_DIR"
TAKE="$OUT_DIR/take-$(date +%Y%m%d-%H%M%S).mov"

# 녹화는 메인 디스플레이(메뉴바가 있는 화면)만 찍고, 검색창은 마우스가 있는 화면에 뜬다.
echo "• 마우스를 메인 디스플레이(메뉴바가 있는 화면)로 옮겨 두세요."
echo "• 5초 뒤 터미널을 숨기고 시작합니다. 끝날 때까지 키보드와 마우스를 건드리지 마세요."
sleep 5
# 터미널 창이 영상에 찍히지 않도록 숨긴다. (끝나면 Dock에서 다시 열 수 있다)
osascript -e 'tell application "System Events" to set visible of (first process whose frontmost is true) to false'
sleep 1

echo "• 리허설: 캐시를 데웁니다."
osascript "$STORYBOARD"
sleep 2

echo "• 녹화 시작 (${DURATION}초)"
screencapture -v -V "$DURATION" -x "$TAKE" &
RECORDER=$!
sleep 1.5
osascript "$STORYBOARD"
wait "$RECORDER"
chmod a+r "$TAKE"
echo "✅ 저장: $TAKE"
