// scripts/eval/corpus.mjs
// 검색 평가용 합성 코퍼스 정의. 모든 내용은 평가를 위해 새로 작성한 가상의 데이터다.
// 파일 경로는 코퍼스 루트 기준 상대 경로이며, fixture에는 `/eval/<상대 경로>`로 기록된다.

const researchLog = Array.from({ length: 60 }, (_, index) => {
  const line = index + 1;
  if (line === 45) return `${line}. 양자 컴퓨팅 오류 정정 실험: 표면 코드로 논리 큐비트 오류율을 절반으로 낮춤`;
  return `${line}. 주간 연구 기록 ${line}: 장비 점검, 데이터 백업, 팀 회의 메모 정리`;
}).join("\n");

export const documents = [
  {
    path: "Work/회의록_2026_3분기_마케팅.md",
    text: `# 2026년 3분기 마케팅 회의록

- 참석자: 마케팅팀 4명, 디자인팀 2명
- 3분기 마케팅 예산은 1억 2천만 원으로 확정했다.
- 가을 캠페인은 9월 첫째 주에 시작하고 SNS 광고 비중을 60%로 늘린다.
- 신규 고객 유입 목표는 전 분기 대비 15% 증가.
- 다음 회의에서 인플루언서 협업 후보를 검토한다.
`,
  },
  {
    path: "Work/회의록_2026_2분기_영업.md",
    text: `# 2026년 2분기 영업 회의록

- 2분기 영업 실적은 목표의 92%를 달성했다.
- 대리점 계약 갱신 일정과 재고 관리 이슈를 논의했다.
- 하반기 영업 인력 충원은 두 명으로 결정했다.
`,
  },
  {
    path: "Personal/제주도_여행_일정.md",
    text: `# 제주도 3박 4일 여행 일정

1일차: 공항 도착, 렌터카 수령, 협재 해수욕장 산책, 흑돼지 저녁
2일차: 성산일출봉 일출, 우도 자전거 일주
3일차: 한라산 영실 코스 등반, 서귀포 올레시장
4일차: 카페 투어 후 오후 비행기로 귀가
`,
  },
  {
    path: "Personal/김치찌개_레시피.txt",
    text: `김치찌개 레시피 (2인분)

재료: 잘 익은 김치 300g, 돼지고기 앞다리살 200g, 두부 반 모, 대파, 고춧가루, 다진 마늘
1. 냄비에 돼지고기를 볶다가 김치를 넣고 5분간 더 볶는다.
2. 물 500ml와 고춧가루, 다진 마늘을 넣고 15분 끓인다.
3. 두부와 대파를 넣고 5분 더 끓이면 완성.
`,
  },
  {
    path: "Personal/이사_체크리스트.md",
    text: `# 이사 준비 체크리스트

- 이사 업체 견적 세 곳 비교하기
- 전입신고와 확정일자 받기
- 인터넷, 가스, 전기 주소 이전 신청
- 냉장고 비우기와 짐 박스 라벨 붙이기
`,
  },
  {
    path: "Work/onboarding-guide.md",
    text: `# New Employee Onboarding Guide

Welcome to the team. During your first week:

- Pick up your laptop from IT and enroll it in device management.
- Set up the VPN client before accessing internal dashboards. Use your SSO account to sign in.
- Join the engineering chat channels and read the code review guidelines.
- Schedule a one-on-one with your manager.
`,
  },
  {
    path: "Work/incident-postmortem-db-outage.md",
    text: `# Postmortem: Primary database outage

Summary: The primary database became unreachable for 42 minutes. Clients reported ERR_CONN_TIMEOUT and HTTP 504 errors.

Root cause: A connection pool misconfiguration exhausted available connections after a deploy.

Action items: add pool saturation alerts, load-test connection limits before deploys, document the failover runbook.
`,
  },
  {
    path: "Personal/reading-notes-habits.txt",
    text: `Reading notes: building small daily habits

Start with a habit so small it is hard to skip, like one push-up or one page of reading.
Attach the new habit to an existing routine, such as after morning coffee.
Track streaks on a paper calendar and forgive missed days quickly.
`,
  },
  {
    path: "Work/연구_기록_2026.md",
    text: researchLog,
  },
];

export const pdfs = [
  {
    path: "Documents/2025_연간_보고서.pdf",
    pages: [
      "2025 연간 보고서\n회사 개요와 대표 인사말\n올해의 주요 성과를 요약합니다.",
      "국내 사업 실적\n국내 매출은 전년 대비 8% 성장했다.\n신규 매장 12곳을 열었다.",
      "해외 사업 실적\n해외 매출은 전년 대비 35% 증가했다.\n동남아시아와 유럽 시장 진출이 성장을 이끌었다.",
      "2026 전망\n신제품 출시와 물류 자동화 투자 계획",
    ],
  },
  {
    path: "Documents/임대차_계약서.pdf",
    pages: [
      "주택 임대차 계약서\n임대인과 임차인은 아래 주택에 대해 임대차 계약을 체결한다.\n계약 기간은 2년으로 한다.",
      "보증금 반환\n임대인은 계약 종료일에 임차인에게 보증금 전액을 반환한다.\n미납 관리비가 있으면 공제 후 반환한다.",
      "특약 사항\n반려동물 동반 입주를 허용한다.\n벽면 못 사용은 사전 협의한다.",
    ],
  },
  {
    path: "Documents/invoice-1042.pdf",
    pages: [
      "Invoice #1042\nBilled to: Northwind Studio\nWebsite redesign - 40 hours\nTotal due: 3,200 USD\nPayment terms: net 30 days",
    ],
  },
];

const white = [1, 1, 1];
const dark = [0.12, 0.12, 0.14];

export const images = [
  {
    path: "Screenshots/payment-error.png",
    image: {
      width: 800,
      height: 500,
      background: [0.96, 0.96, 0.97],
      rects: [
        { x: 150, y: 120, width: 500, height: 260, color: white },
        { x: 150, y: 120, width: 500, height: 70, color: [0.86, 0.2, 0.2] },
      ],
      texts: [
        { text: "결제 실패 Payment failed", x: 175, y: 140, size: 30, color: white, bold: true },
        { text: "Your card was declined.", x: 175, y: 220, size: 24 },
        { text: "카드 승인이 거절되었습니다.", x: 175, y: 260, size: 24 },
        { text: "Error code: CARD_DECLINED", x: 175, y: 310, size: 20, color: [0.4, 0.4, 0.4] },
      ],
    },
  },
  {
    path: "Receipts/cafe-receipt.png",
    image: {
      width: 420,
      height: 640,
      background: [0.99, 0.98, 0.94],
      texts: [
        { text: "카페 봄날 영수증", x: 90, y: 40, size: 30, bold: true },
        { text: "아메리카노 2   9,000원", x: 40, y: 140, size: 24 },
        { text: "카페라테 1     5,000원", x: 40, y: 190, size: 24 },
        { text: "크루아상 1     4,200원", x: 40, y: 240, size: 24 },
        { text: "합계          18,200원", x: 40, y: 330, size: 26, bold: true },
        { text: "카드 결제 승인", x: 40, y: 400, size: 22 },
      ],
    },
  },
  {
    path: "Work/quarterly-revenue-chart.png",
    image: {
      width: 800,
      height: 500,
      background: white,
      rects: [
        { x: 120, y: 300, width: 100, height: 140, color: [0.26, 0.47, 0.85] },
        { x: 280, y: 250, width: 100, height: 190, color: [0.26, 0.47, 0.85] },
        { x: 440, y: 180, width: 100, height: 260, color: [0.26, 0.47, 0.85] },
        { x: 600, y: 110, width: 100, height: 330, color: [0.26, 0.47, 0.85] },
        { x: 90, y: 440, width: 650, height: 3, color: dark },
      ],
      texts: [
        { text: "Quarterly Revenue 2026", x: 230, y: 30, size: 32, bold: true },
        { text: "Q1", x: 150, y: 455, size: 22 },
        { text: "Q2", x: 310, y: 455, size: 22 },
        { text: "Q3", x: 470, y: 455, size: 22 },
        { text: "Q4", x: 630, y: 455, size: 22 },
      ],
    },
  },
  {
    path: "Photos/sunset-beach.png",
    image: {
      width: 800,
      height: 500,
      background: [0.98, 0.55, 0.2],
      gradientTo: [0.55, 0.2, 0.45],
      rects: [
        { x: 340, y: 210, width: 120, height: 60, color: [1, 0.85, 0.3] },
        { x: 0, y: 270, width: 800, height: 140, color: [0.15, 0.35, 0.6] },
        { x: 0, y: 410, width: 800, height: 90, color: [0.93, 0.82, 0.6] },
      ],
    },
  },
  {
    path: "Photos/night-city.png",
    image: {
      width: 800,
      height: 500,
      background: [0.03, 0.04, 0.12],
      rects: [
        { x: 40, y: 200, width: 110, height: 300, color: [0.15, 0.15, 0.2] },
        { x: 170, y: 120, width: 90, height: 380, color: [0.18, 0.18, 0.24] },
        { x: 280, y: 240, width: 130, height: 260, color: [0.14, 0.14, 0.2] },
        { x: 430, y: 80, width: 100, height: 420, color: [0.2, 0.2, 0.26] },
        { x: 560, y: 180, width: 120, height: 320, color: [0.16, 0.16, 0.22] },
        { x: 190, y: 150, width: 12, height: 16, color: [1, 0.85, 0.4] },
        { x: 220, y: 200, width: 12, height: 16, color: [1, 0.85, 0.4] },
        { x: 450, y: 120, width: 12, height: 16, color: [1, 0.85, 0.4] },
        { x: 490, y: 180, width: 12, height: 16, color: [1, 0.85, 0.4] },
        { x: 580, y: 220, width: 12, height: 16, color: [1, 0.85, 0.4] },
        { x: 70, y: 260, width: 12, height: 16, color: [1, 0.85, 0.4] },
      ],
    },
  },
  {
    path: "Work/sprint-whiteboard.png",
    image: {
      width: 800,
      height: 500,
      background: [0.97, 0.97, 0.95],
      rects: [
        { x: 60, y: 120, width: 180, height: 120, color: [1, 0.93, 0.5] },
        { x: 300, y: 120, width: 180, height: 120, color: [0.7, 0.9, 1] },
        { x: 540, y: 120, width: 180, height: 120, color: [0.75, 0.95, 0.75] },
      ],
      texts: [
        { text: "Sprint Planning", x: 250, y: 40, size: 36, bold: true },
        { text: "To do", x: 110, y: 160, size: 24 },
        { text: "In progress", x: 325, y: 160, size: 24 },
        { text: "Done", x: 600, y: 160, size: 24 },
      ],
    },
  },
];

// say 음성으로 만든 녹음. `[[slnc ms]]`는 무음 구간을 넣어 키워드 시점을 뒤로 민다.
export const audio = [
  {
    path: "Recordings/장보기_음성메모.m4a",
    voice: "Yuna",
    text: "내일 장 볼 목록입니다. 우유 두 개, 계란 한 판, 식빵, 사과 다섯 개를 사야 합니다.",
  },
  {
    path: "Recordings/podcast-intro-ai.m4a",
    voice: "Samantha",
    text: "Welcome back to the show. Today we talk about large language models and how on-device search keeps your files private.",
  },
  {
    path: "Recordings/역사_강의_조선.m4a",
    voice: "Yuna",
    text: "오늘 강의는 조선 시대의 문화에 대한 내용입니다. 먼저 당시의 생활 모습을 살펴보겠습니다. [[slnc 4000]] 세종대왕은 백성을 위해 훈민정음을 창제했습니다. 이것이 오늘날 한글의 시작입니다.",
  },
  {
    path: "Recordings/dentist-reminder.m4a",
    voice: "Samantha",
    text: "Reminder: your dentist appointment is on Thursday at three p.m. Please arrive ten minutes early.",
  },
];

export const videos = [
  {
    path: "Videos/nookive-product-demo.mp4",
    voice: "Samantha",
    narration: "In this demo we open the settings window and add a folder to search. [[slnc 1500]] Then we type a question and the results appear instantly.",
    frames: [
      { seconds: 4, image: { width: 640, height: 360, background: [0.1, 0.12, 0.2], texts: [{ text: "Nookive Demo", x: 170, y: 150, size: 44, color: white, bold: true }] } },
      { seconds: 4, image: { width: 640, height: 360, background: [0.95, 0.95, 0.97], texts: [{ text: "Settings · Add folder", x: 120, y: 150, size: 36 }] } },
      { seconds: 4, image: { width: 640, height: 360, background: white, texts: [{ text: "Search results", x: 170, y: 150, size: 40 }] } },
    ],
  },
  {
    path: "Videos/김치찌개_요리_브이로그.mp4",
    voice: "Yuna",
    narration: "오늘은 김치찌개를 끓여 보겠습니다. 돼지고기와 김치를 먼저 볶고, 물을 붓고 두부를 넣으면 완성입니다.",
    frames: [
      { seconds: 4, image: { width: 640, height: 360, background: [0.95, 0.45, 0.2], texts: [{ text: "김치찌개 만들기", x: 140, y: 150, size: 44, color: white, bold: true }] } },
      { seconds: 4, image: { width: 640, height: 360, background: [0.8, 0.3, 0.15], texts: [{ text: "완성!", x: 260, y: 150, size: 48, color: white, bold: true }] } },
    ],
  },
  {
    path: "Videos/city-timelapse.mp4",
    frames: [
      { seconds: 4, image: images.find((image) => image.path === "Photos/night-city.png").image },
      { seconds: 4, image: { ...images.find((image) => image.path === "Photos/night-city.png").image, background: [0.05, 0.06, 0.18] } },
    ],
  },
];

// 파일 내용 없이 이름/경로로만 검색되는 레코드. 실제 앱의 list_indexed_folders/list_applications 형식과 같다.
export const folders = ["Work", "Personal", "Receipts", "세금 서류"];

export const applications = [
  { name: "Slack", bundleId: "com.tinyspeck.slackmacgap" },
  { name: "Safari", bundleId: "com.apple.Safari" },
  { name: "메모", bundleId: "com.apple.Notes" },
  { name: "캘린더", bundleId: "com.apple.iCal" },
  { name: "Visual Studio Code", bundleId: "com.microsoft.VSCode" },
  { name: "카카오톡", bundleId: "com.kakao.KakaoTalkMac" },
  { name: "시스템 설정", bundleId: "com.apple.systempreferences" },
  { name: "Finder", bundleId: "com.apple.finder" },
];
