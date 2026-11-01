-- scripts/demo/storyboard.applescript
-- README 시연 영상 콘티. record.sh가 실행한다. 시스템 설정 → 개인정보 보호 및 보안 →
-- 손쉬운 사용에서 터미널을 허용해야 키 입력을 보낼 수 있다.

-- 글자는 키 입력(keystroke) 대신 한 글자씩 붙여 넣는다. keystroke는 키보드 배열과
-- 자동 고침(스페이스 두 번 → 마침표 등)의 영향을 받아 글자가 빠지거나 바뀔 수 있다.
-- 단축키도 글자 대신 키 코드로 보낸다. (9 = V, 0 = A, ANSI 배열 기준 물리 키 위치)
-- 변수 이름 interval은 System Events의 속성과 겹치므로 쓰지 않는다.
on typeText(theText, gapSeconds)
	repeat with theChar in characters of theText
		set the clipboard to (theChar as text)
		tell application "System Events" to key code 9 using command down
		delay gapSeconds
	end repeat
end typeText

-- 방향키로 다음 결과를 선택한다. (미리보기가 바로 바뀐다)
on selectNext()
	tell application "System Events" to key code 125
end selectNext

-- 검색어를 지우지 않고 전체 선택만 해 둔다. 다음 입력이 덮어써서 창이 접혔다 펴지지 않는다.
on selectQuery()
	tell application "System Events" to key code 0 using command down
	delay 0.3
end selectQuery

-- 1. ⌥Space로 검색창 열기
tell application "System Events" to key code 49 using option down
delay 1.2

-- 2. 몇 글자로 앱 찾기
typeText("sys", 0.16)
delay 1.8

-- 3. 질문하듯 문서 찾기 (PDF 3페이지로 이동), 방향키로 작년 보고서도 확인
selectQuery()
typeText("how much did overseas sales grow last year", 0.045)
delay 3.6
selectNext()
delay 2.4

-- 4. 사진 내용으로 찾기, 방향키로 다음 사진
selectQuery()
typeText("sunset at the beach", 0.06)
delay 2.6
selectNext()
delay 2.0

-- 5. 녹음 속 순간 찾기 (0:10 지점부터 재생)
selectQuery()
typeText("apollo 11 moon landing", 0.06)
delay 4.5

-- 6. 한국어로 영어 문서 찾기. "Q3"로 시작하면 입력 도중에도 결과가 비지 않아
--    웹 검색 화면이 끼어들지 않는다. ("마케팅"만 입력한 순간에는 영어 문서와 일치하는 결과가 없다)
selectQuery()
typeText("Q3 마케팅 예산", 0.16)
delay 3.2

-- 7. 닫기 (첫 ESC는 검색어 지우기, 두 번째 ESC는 창 숨기기)
tell application "System Events" to key code 53
delay 0.6
tell application "System Events" to key code 53
delay 1.5
