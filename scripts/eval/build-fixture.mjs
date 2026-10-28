// scripts/eval/build-fixture.mjs
// 검색 평가 fixture를 다시 만든다.
//
// 1. scripts/eval/corpus.mjs의 합성 코퍼스를 임시 폴더에 생성한다. (say/afconvert/Swift 렌더러, macOS 전용)
// 2. 실제 인덱서(scripts/index-folder.mjs)로 색인해 벡터를 만든다. (ASR·강제 정렬 포함)
// 3. 평가 쿼리 벡터를 만들고, 경로를 정규화해 src/features/search/evaluation/fixture.json에 저장한다.
//
// 준비: `npm run sidecar`로 임베딩 서버(8080)를 띄운다. ASR 서버(8081)는 없으면 이 스크립트가 띄웠다가 끈다.
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applications,
  audio,
  documents,
  folders,
  images,
  pdfs,
  videos,
} from "./corpus.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const EVAL_DIR = path.join(ROOT, "src/features/search/evaluation");
const FIXTURE_PATH = path.join(EVAL_DIR, "fixture.json");
const QUERIES_PATH = path.join(EVAL_DIR, "queries.json");
const EMBED_URL = "http://127.0.0.1:8080";
const ASR_URL = "http://127.0.0.1:8081";
// src/features/search/services/embeddingClient.ts의 SEARCH_QUERY_PREFIX와 같아야 한다.
const SEARCH_QUERY_PREFIX = "task: search result | query: ";
const MODEL_VERSION = "embeddinggemma-2-Q8_0";
const FIXTURE_PATH_PREFIX = "/eval";
const VECTOR_DECIMALS = 4;

async function isUp(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(1000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitUntilUp(baseUrl, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isUp(baseUrl)) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

function writeCorpus(corpusDir) {
  fs.rmSync(corpusDir, { recursive: true, force: true });
  const target = (relative) => {
    const fullPath = path.join(corpusDir, relative);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    return fullPath;
  };
  for (const document of documents) {
    fs.writeFileSync(target(document.path), document.text, "utf-8");
  }

  const speechDir = path.join(corpusDir, ".speech");
  fs.mkdirSync(speechDir, { recursive: true });
  const speak = (voice, text, name) => {
    const aiff = path.join(speechDir, `${name}.aiff`);
    execFileSync("say", ["-v", voice, "-o", aiff, text]);
    return aiff;
  };
  audio.forEach((clip, index) => {
    const aiff = speak(clip.voice, clip.text, `audio-${index}`);
    execFileSync("afconvert", ["-f", "m4af", "-d", "aac", aiff, target(clip.path)]);
  });

  const jobs = [
    ...pdfs.map((pdf) => ({ type: "pdf", output: target(pdf.path), pages: pdf.pages })),
    ...images.map((image) => ({ type: "image", output: target(image.path), image: image.image })),
    ...videos.map((video, index) => ({
      type: "video",
      output: target(video.path),
      frames: video.frames,
      audio: video.narration ? speak(video.voice, video.narration, `video-${index}`) : undefined,
    })),
  ];
  const jobsPath = path.join(speechDir, "jobs.json");
  fs.writeFileSync(jobsPath, JSON.stringify(jobs));
  execFileSync("swift", [path.join(__dirname, "render-media.swift"), jobsPath], {
    stdio: "inherit",
  });
  // 점으로 시작하는 폴더는 인덱서가 건너뛰지만, 코퍼스에 남기지 않도록 지운다.
  fs.rmSync(speechDir, { recursive: true, force: true });
}

function runIndexer(corpusDir, outputPath) {
  execFileSync(process.execPath, [path.join(ROOT, "scripts/index-folder.mjs"), corpusDir], {
    stdio: "inherit",
    env: {
      ...process.env,
      NOOKIVE_INDEX_OUTPUT: outputPath,
      NOOKIVE_ASR_URL: ASR_URL,
    },
  });
}

const round = (vector) =>
  vector?.map((value) => Number(value.toFixed(VECTOR_DECIMALS)));

/** 기기마다 다른 절대 경로·캐시 경로·시각을 지워 fixture diff를 안정적으로 만든다. */
function normalizeRecord(record, corpusDir) {
  const relative = path.relative(corpusDir, record.file.path).split(path.sep).join("/");
  const fixturePath = `${FIXTURE_PATH_PREFIX}/${relative}`;
  const file = { ...record.file, path: fixturePath, modifiedAt: "2026-01-01 00:00" };
  delete file.thumbnail;
  delete file.preview;
  return {
    ...record,
    id: record.id.replace(record.file.path, fixturePath),
    file,
    vector: round(record.vector),
    textVector: round(record.textVector),
  };
}

function metadataRecords() {
  const folderRecords = folders.map((name) => ({
    id: `folder:${FIXTURE_PATH_PREFIX}/${name}`,
    file: {
      path: `${FIXTURE_PATH_PREFIX}/${name}`,
      name,
      extension: "folder",
      kind: "folder",
      sizeBytes: 0,
      modifiedAt: "폴더",
    },
    similarityScore: 0,
    bestChunk: { chunkIndex: 0, textSnippet: `macOS folder: ${name}` },
    category: "document",
  }));
  const applicationRecords = applications.map(({ name, bundleId }) => ({
    id: `application:/Applications/${name}.app`,
    file: {
      path: `/Applications/${name}.app`,
      name,
      extension: "app",
      kind: "application",
      bundleId,
      sizeBytes: 0,
      modifiedAt: "설치된 앱",
    },
    similarityScore: 0,
    bestChunk: {
      chunkIndex: 0,
      textSnippet: `macOS application: ${name}; bundle id: ${bundleId}`,
    },
    category: "application",
  }));
  return [...folderRecords, ...applicationRecords];
}

async function embedQueries(queries) {
  const vectors = {};
  for (const { query } of queries) {
    const response = await fetch(`${EMBED_URL}/v1/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: `${SEARCH_QUERY_PREFIX}${query}` }),
    });
    if (!response.ok) throw new Error(`쿼리 임베딩 실패 (${query}): ${response.status}`);
    const json = await response.json();
    vectors[query] = round(json.data[0].embedding);
  }
  return vectors;
}

async function main() {
  if (process.platform !== "darwin") {
    throw new Error("평가 fixture 생성은 macOS(say/afconvert/AVFoundation)에서만 가능합니다.");
  }
  if (!(await isUp(EMBED_URL))) {
    throw new Error("임베딩 서버(127.0.0.1:8080)가 꺼져 있습니다. `npm run sidecar`를 먼저 실행하세요.");
  }

  let asrProcess = null;
  if (!(await isUp(ASR_URL))) {
    console.log("ASR 서버를 시작합니다...");
    asrProcess = spawn("bash", [path.join(ROOT, "scripts/run-asr.sh")], { stdio: "ignore" });
    if (!(await waitUntilUp(ASR_URL, 120_000))) {
      asrProcess.kill();
      throw new Error("ASR 서버(127.0.0.1:8081)를 시작하지 못했습니다. `npm run asr:download`를 확인하세요.");
    }
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "nookive-eval-"));
  const corpusDir = path.join(workDir, "corpus");
  const outputPath = path.join(workDir, "index.json");
  try {
    writeCorpus(corpusDir);
    runIndexer(corpusDir, outputPath);
    const indexed = JSON.parse(fs.readFileSync(outputPath, "utf-8"));
    const { queries } = JSON.parse(fs.readFileSync(QUERIES_PATH, "utf-8"));
    const records = [
      ...indexed.map((record) => normalizeRecord(record, corpusDir)),
      ...metadataRecords(),
    ].sort((a, b) => a.id.localeCompare(b.id));
    const queryVectors = await embedQueries(queries);
    fs.writeFileSync(
      FIXTURE_PATH,
      `${JSON.stringify({ modelVersion: MODEL_VERSION, records, queryVectors })}\n`,
    );
    console.log(`\n평가 fixture 저장: ${path.relative(ROOT, FIXTURE_PATH)} (레코드 ${records.length}개, 쿼리 ${queries.length}개)`);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
    asrProcess?.kill();
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
