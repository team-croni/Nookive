// scripts/demo/build-demo-files.mjs
// README 시연 영상용 데모 파일을 만든다. 개인 파일 대신 이 폴더를 색인해 녹화한다.
//
// - 문서·PDF·팟캐스트는 새로 작성한 가상의 영어 콘텐츠다. (PDF는 render-document.swift, 음성은 macOS `say`)
// - 사진은 Crossmodal-3600의 CC BY 2.0 사진을 쓴다. 출처는 README에 표기한다.
//   (`npm run eval:public:prepare -- xm3600`로 받은 캐시를 재사용한다.)
//
// 사용법: node scripts/demo/build-demo-files.mjs [출력 폴더]   (기본: /Users/Shared/NookiveDemo/Documents)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { documents as pdfDocuments } from "./documents.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.resolve(process.argv[2] ?? "/Users/Shared/NookiveDemo/Documents");
const XM3600_IMAGES = path.join(os.homedir(), "Library/Caches/nookive-eval/downloads/xm3600-images.tgz");

// 사진: 파일명은 카메라 기본 이름처럼 두어 "파일명이 아니라 내용으로 찾는다"는 점이 보이게 한다.
export const photos = [
  { file: "IMG_2041.jpg", key: "e0ec5647b1ff6731", author: "McKay Savage", url: "https://www.flickr.com/photos/mckaysavage/7012759923" },
  { file: "IMG_2456.jpg", key: "6a02e6ce19f7a925", author: "準建築人手札網站 Forgemind ArchiMedia", url: "https://www.flickr.com/photos/eager/5686015449/" },
  { file: "IMG_1187.jpg", key: "16207a8b9ad43c91", author: "Milton Jung", url: "https://www.flickr.com/photos/cbnsp/8376607033" },
  { file: "IMG_1532.jpg", key: "05ab8cb823b8df06", author: "Horia Varlan", url: "https://www.flickr.com/photos/horiavarlan/5287329233" },
  { file: "IMG_1764.jpg", key: "b9f8d67381e59dea", author: "Centrilobular", url: "https://www.flickr.com/photos/centrilobular/15150208716" },
  { file: "IMG_2210.jpg", key: "0275e655b6ab124d", author: "Allie_Caulfield", url: "https://www.flickr.com/photos/wm_archiv/21008357245" },
  { file: "IMG_2318.jpg", key: "059bbdbdb843af6a", author: "moedusa", url: "https://www.flickr.com/photos/moedusa/7056941345" },
];

const documents = {
  "Meetings/Q3 Marketing Meeting Notes.md": `# Q3 Marketing Meeting Notes

**Date:** July 8, 2026 · **Attendees:** Priya (Marketing lead), Dan, Mei, Jonas, Sara (Design), Leo (Design)

## Agenda
1. Q3 budget
2. Fall campaign plan
3. Partnerships

## Decisions
- **Q3 marketing budget approved at $120,000** — $72,000 for social ads, $30,000 for creator partnerships, $18,000 for events.
- The fall campaign "Open Late" launches in the first week of September.
- Goal: grow new sign-ups by 15% over Q2 while keeping cost per sign-up under $38.

## Action items
- [ ] Mei — draft the creator shortlist by July 15
- [ ] Sara — campaign key visuals for review on July 22
- [ ] Dan — set up conversion tracking for the new landing page
`,
  "Meetings/Q2 Sales Review.md": `# Q2 Sales Review

- Q2 sales reached 92% of target.
- Discussed distributor contract renewals and inventory issues.
- Two additional sales hires approved for the second half.
`,
  "Notes/Lisbon Trip Plan.md": `# Lisbon Trip Plan (4 days)

Day 1: Arrive, tram 28 through Alfama, dinner in Bairro Alto
Day 2: Belém Tower and pastéis de Belém
Day 3: Day trip to Sintra palaces
Day 4: LX Factory, flight home in the evening
`,
  "Notes/Onboarding Checklist.md": `# New Hire Onboarding Checklist

- Pick up your laptop from IT and enroll it in device management.
- Set up the VPN client before opening internal dashboards.
- Join the team chat channels and read the code review guide.
- Book a one-on-one with your manager.
`,
  "Notes/Weekly Groceries.txt": `Weekly groceries

Milk, eggs, sourdough bread, apples, spinach, chicken thighs, coffee beans
`,
};


// `[[slnc ms]]`는 무음을 넣어 핵심 문장이 영상 속 특정 시점에 나오게 한다.
const podcasts = {
  "Podcasts/History Hour - Episode 12.m4a":
    "Welcome back to History Hour. Today we look back at the space race and the people behind it. [[slnc 2500]] On July 20th, 1969, Apollo 11 landed on the Moon, and Neil Armstrong became the first person to walk on its surface.",
  "Podcasts/Product Weekly - Episode 3.m4a":
    "This is Product Weekly. This week we talk about pricing pages, onboarding emails, and how small teams can run useful customer interviews.",
};

function target(relative) {
  const file = path.join(OUTPUT, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return file;
}

function main() {
  if (!fs.existsSync(XM3600_IMAGES)) {
    throw new Error("Crossmodal-3600 이미지가 없습니다. 먼저 `npm run eval:public:prepare -- xm3600`를 실행하세요.");
  }
  fs.rmSync(OUTPUT, { recursive: true, force: true });
  for (const [relative, text] of Object.entries(documents)) fs.writeFileSync(target(relative), text, "utf-8");

  const work = fs.mkdtempSync(path.join(os.tmpdir(), "nookive-demo-"));
  try {
    const jobs = Object.entries(pdfDocuments).map(([relative, document]) => ({ ...document, output: target(relative) }));
    const jobsFile = path.join(work, "documents.json");
    fs.writeFileSync(jobsFile, JSON.stringify(jobs));
    execFileSync("swift", [path.join(__dirname, "render-document.swift"), jobsFile], { stdio: "inherit" });

    for (const [relative, text] of Object.entries(podcasts)) {
      const aiff = path.join(work, `${path.basename(relative)}.aiff`);
      execFileSync("say", ["-v", "Samantha", "-o", aiff, text]);
      execFileSync("afconvert", ["-f", "m4af", "-d", "aac", aiff, target(relative)]);
    }

    execFileSync("tar", ["-xzf", XM3600_IMAGES, "-C", work, ...photos.map((photo) => `${photo.key}.jpg`)]);
    for (const photo of photos) {
      fs.copyFileSync(path.join(work, `${photo.key}.jpg`), target(`Photos/${photo.file}`));
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
  // 다른 사용자 계정(데모 계정)이 읽을 수 있게 권한을 연다.
  execFileSync("chmod", ["-R", "a+rX", path.dirname(OUTPUT)]);
  console.log(`데모 파일 생성: ${OUTPUT}`);
}

main();
