// scripts/demo/build-demo-files.mjs
// README 시연 영상용 데모 파일을 만든다. 개인 파일 대신 이 폴더를 색인해 녹화한다.
//
// - 문서·PDF·팟캐스트·코드는 새로 작성한 가상의 영어 콘텐츠다. (PDF는 render-document.swift, 음성은 macOS `say`)
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
  // 결과 목록이 비어 보이지 않도록 더한 사진: 노을·바다, 개, 고양이, 음식, 산
  { file: "IMG_1663.jpg", key: "4d34d21663f55fa8", author: "jennifer gergen", url: "https://www.flickr.com/photos/b9punk/14136742388" },
  { file: "IMG_2941.jpg", key: "59564d9ec0b3d601", author: "Tristan Schmurr", url: "https://www.flickr.com/photos/kewl/8740724362" },
  { file: "IMG_1308.jpg", key: "5d800a8359db5326", author: "Rosa Menkman", url: "https://www.flickr.com/photos/r00s/9599614920" },
  { file: "IMG_1808.jpg", key: "6d5f3a67a72feba1", author: "Roman Filipkowski", url: "https://www.flickr.com/photos/filipkowski_roman/14748152841" },
  { file: "IMG_2333.jpg", key: "0f5f32f742a168ea", author: "Jerome Bon", url: "https://www.flickr.com/photos/girolame/3483558587" },
  { file: "IMG_1098.jpg", key: "1811e14afd9c17f7", author: "Alistair Young", url: "https://www.flickr.com/photos/ajy/5893078093" },
  { file: "IMG_1148.jpg", key: "1a156849a45ceb8f", author: "Nico Kaiser", url: "https://www.flickr.com/photos/nicokaiser/17825807520" },
  { file: "IMG_2681.jpg", key: "59604c064f2f96f8", author: "TrailmixHikes", url: "https://www.flickr.com/photos/90329428@N07/8207553244" },
  { file: "IMG_2097.jpg", key: "01f5c22d73bfed30", author: "Keng Susumpow", url: "https://www.flickr.com/photos/kengz/8169069750" },
  { file: "IMG_1192.jpg", key: "24f7e68bc3c4c614", author: "Roy Munson", url: "https://www.flickr.com/photos/kleqster/8127857193" },
  { file: "IMG_1748.jpg", key: "3b28fbcc74f71916", author: "Mikael Norling", url: "https://www.flickr.com/photos/phatzui/3567824276" },
  { file: "IMG_2193.jpg", key: "4afd86685cdd842e", author: "Marek Wylamowski", url: "https://www.flickr.com/photos/wylam/5970156513" },
  { file: "IMG_1118.jpg", key: "56a1e9f45b126934", author: "Juha Kettunen", url: "https://www.flickr.com/photos/juhakettunen/15561203635" },
  { file: "IMG_2863.jpg", key: "5e6d0525d1e50b49", author: "Kamil Antosiewicz Monika Powalisz", url: "https://www.flickr.com/photos/mononukleoza/4334613332" },
  { file: "IMG_2039.jpg", key: "897b96f7eb5410d8", author: "Jacob Bøtter", url: "https://www.flickr.com/photos/jakecaptive/5539850405" },
  { file: "IMG_1439.jpg", key: "f2fe9e88b1437bb6", author: "inyucho", url: "https://www.flickr.com/photos/inyucho/16144413592" },
  { file: "IMG_1076.jpg", key: "088c1587f47ff21a", author: "Linda Marklund", url: "https://www.flickr.com/photos/51226001@N03/11369387123" },
  { file: "IMG_1176.jpg", key: "09584f35827c9ff0", author: "Joselu Blanco", url: "https://www.flickr.com/photos/silverman68/7629848424" },
  { file: "IMG_1888.jpg", key: "291471b91ff1b6d7", author: "Peter Sejersen", url: "https://www.flickr.com/photos/psejersen/5063109856" },
  { file: "IMG_1856.jpg", key: "2b3e0f77fe71147a", author: "Karl Baron", url: "https://www.flickr.com/photos/kalleboo/6700233847" },
  { file: "IMG_1143.jpg", key: "0a833d0c929a5257", author: "Harry Lund", url: "https://www.flickr.com/photos/harald18/6828321255" },
  { file: "IMG_1492.jpg", key: "0c96676d3cc5df27", author: "Tewu", url: "https://www.flickr.com/photos/tewumero/6328134243" },
  { file: "IMG_1185.jpg", key: "111b8f9f49f2c6d2", author: "Peter", url: "https://www.flickr.com/photos/acidka/7902810782" },
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
  // 아래 노트는 결과 목록을 채운다. 회의·예산·여행·요리처럼 주제가 겹치게 두어 한 질문에 여러 개가 걸린다.
  "Meetings/Q4 Marketing Plan.md": `# Q4 Marketing Plan (draft)

- Proposed Q4 marketing budget: $140,000, up from $120,000 in Q3.
- Holiday campaign "Gift a Season" runs from November 15 to December 31.
- Shift $20,000 from events to creator partnerships after strong Q3 results.
`,
  "Meetings/Q3 Budget Review.md": `# Q3 Budget Review

**Date:** October 6, 2026

| Team | Budget | Spent |
| --- | --- | --- |
| Marketing | $120,000 | $114,300 |
| Sales | $95,000 | $97,800 |
| Design | $40,000 | $36,200 |

Sales went over budget because of the two new hires starting early. Marketing stayed under budget.
`,
  "Meetings/Weekly Standup 2026-10-12.md": `# Weekly Standup — October 12, 2026

- Dan: conversion tracking on the new landing page is live.
- Mei: creator contracts signed with 4 of 6 creators.
- Sara: holiday key visuals in review.
- Blocker: waiting on legal review for the partner agreement.
`,
  "Meetings/Overseas Expansion Kickoff.md": `# Overseas Expansion Kickoff

- Target markets for 2026: Singapore, Germany, and Japan.
- Hire a country manager in Singapore by Q1.
- Localize onboarding emails and the pricing page into German and Japanese.
- Overseas sales goal: 30% of new revenue by the end of 2026.
`,
  "Notes/Kyoto Trip Ideas.md": `# Kyoto Trip Ideas

- Fushimi Inari early in the morning before the crowds
- Arashiyama bamboo grove and the monkey park
- Nishiki Market for lunch
- Book a tea ceremony in Gion
`,
  "Notes/Packing List.md": `# Packing List

Passport, charger, travel adapter, sunscreen, swimsuit, sandals, light jacket, headphones
`,
  "Notes/Book Notes - Deep Work.md": `# Book Notes: focus and deep work

- Schedule blocks of focused time and protect them like meetings.
- Batch shallow tasks such as email into fixed windows.
- Track hours of focused work each week.
`,
  "Notes/Home Wi-Fi Setup.txt": `Home network notes

Router is in the hallway closet. Restart it by holding the reset button for 2 seconds (not 10, that resets everything).
Guest network is for visitors and smart plugs.
`,
  "Notes/Car Maintenance Log.txt": `Car maintenance log

2026-03-04  Oil change, 42,100 km
2026-06-18  New front tires
2026-09-30  Brake pads replaced, 48,900 km
`,
  "Recipes/Weeknight Pasta.md": `# Weeknight Tomato Pasta

Serves 2 · 20 minutes

1. Cook 200 g spaghetti in salted water.
2. Fry garlic in olive oil, add a can of crushed tomatoes and simmer for 10 minutes.
3. Toss with the pasta, fresh basil, and grated parmesan.
`,
  "Recipes/Banana Bread.md": `# Banana Bread

3 ripe bananas, 75 g melted butter, 150 g sugar, 1 egg, 1 tsp baking soda, 190 g flour.
Bake at 175°C for 60 minutes.
`,
  "Recipes/Greek Salad.md": `# Greek Salad

Tomatoes, cucumber, red onion, kalamata olives, a block of feta, oregano, and olive oil. No lettuce.
`,
};

// 코드 모드(Tab 또는 code:)에서 보이는 작은 프로젝트
const codeFiles = {
  "Projects/fernway-web/src/pricing.ts": `export type Plan = 'starter' | 'pro' | 'enterprise';

const MONTHLY_PRICE: Record<Plan, number> = { starter: 19, pro: 49, enterprise: 199 };

/** Yearly plans get two months free. */
export function yearlyPrice(plan: Plan): number {
  return MONTHLY_PRICE[plan] * 10;
}

export function formatPrice(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}
`,
  "Projects/fernway-web/src/signup.ts": `import { yearlyPrice } from './pricing';

export async function startTrial(email: string, plan: 'starter' | 'pro') {
  const response = await fetch('/api/trials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, plan, yearlyPrice: yearlyPrice(plan) }),
  });
  if (!response.ok) throw new Error('Could not start the trial');
  return response.json();
}
`,
  "Projects/fernway-web/README.md": `# fernway-web

Marketing site and sign-up flow for Fernway Labs.

npm install
npm run dev
`,
};


// `[[slnc ms]]`는 무음을 넣어 핵심 문장이 영상 속 특정 시점에 나오게 한다.
const podcasts = {
  "Podcasts/History Hour - Episode 12.m4a":
    "Welcome back to History Hour. Today we look back at the space race and the people behind it. [[slnc 2500]] On July 20th, 1969, Apollo 11 landed on the Moon, and Neil Armstrong became the first person to walk on its surface.",
  "Podcasts/Product Weekly - Episode 3.m4a":
    "This is Product Weekly. This week we talk about pricing pages, onboarding emails, and how small teams can run useful customer interviews.",
  "Podcasts/Night Sky - Episode 7.m4a":
    "Welcome to Night Sky. Tonight we follow the Artemis program, which plans to send astronauts back to the Moon, more than fifty years after the last Apollo mission.",
  "Podcasts/History Hour - Episode 13.m4a":
    "Welcome back to History Hour. In this episode we visit the Wright brothers at Kitty Hawk and the first powered flight in 1903.",
  "Podcasts/Kitchen Talk - Episode 21.m4a":
    "This is Kitchen Talk. Today we bake banana bread and talk about why overripe bananas make it sweeter.",
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
  for (const [relative, text] of Object.entries({ ...documents, ...codeFiles })) {
    fs.writeFileSync(target(relative), text, "utf-8");
  }

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
