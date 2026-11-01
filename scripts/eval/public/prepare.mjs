// scripts/eval/public/prepare.mjs
// 공개 검색 데이터셋을 내려받아 파일로 풀고, 실제 인덱서로 색인한 뒤 쿼리 벡터를 만든다.
// 결과는 저장소가 아니라 ~/Library/Caches/nookive-eval/datasets/<이름>/에 저장한다.
//
// 사용법: node scripts/eval/public/prepare.mjs <miracl|xm3600|mixed> [--queries N] [--distractors N] [--images N]
// 준비: `npm run sidecar`로 임베딩 서버(8080)를 띄운다. macOS 전용(인덱서가 sips/Vision을 사용).
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
const CACHE_DIR = path.join(os.homedir(), "Library/Caches/nookive-eval");
const DOWNLOAD_DIR = path.join(CACHE_DIR, "downloads");
const EMBED_URL = "http://127.0.0.1:8080";
// src/features/search/services/embeddingClient.ts의 SEARCH_QUERY_PREFIX와 같아야 한다.
const SEARCH_QUERY_PREFIX = "task: search result | query: ";
const VECTOR_DECIMALS = 4;
const PATH_PREFIX = "/public";

const MIRACL_BASE = "https://huggingface.co/datasets/miracl/miracl/resolve/main/miracl-v1.0-ko";
const MIRACL_CORPUS_BASE =
  "https://huggingface.co/datasets/miracl/miracl-corpus/resolve/main/miracl-corpus-v1.0-ko";
const MIRACL_SHARDS = ["docs-0.jsonl.gz", "docs-1.jsonl.gz", "docs-2.jsonl.gz"];
// 한국어 MIRACL 코퍼스의 대략적인 문단 수. 무작위 방해 문단 표본 비율을 정하는 데만 쓴다.
const MIRACL_CORPUS_SIZE = 1_500_000;
const XM3600_CAPTIONS = "https://google.github.io/crossmodal-3600/web-data/captions.zip";
const XM3600_IMAGES = "https://open-images-dataset.s3.amazonaws.com/crossmodal-3600/images.tgz";
const XM3600_ATTRIBUTIONS = "https://google.github.io/crossmodal-3600/web-data/image_attributions.csv";

function parseArgs(argv) {
  const [dataset, ...rest] = argv;
  const options = { queries: Infinity, distractors: 2000, images: 600 };
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i].replace(/^--/, "");
    if (!(key in options)) throw new Error(`알 수 없는 옵션: ${rest[i]}`);
    options[key] = Number(rest[i + 1]);
  }
  return { dataset, options };
}

/** 실행마다 같은 표본을 고르기 위한 결정적 해시 (0~1) */
function unitHash(value) {
  return parseInt(createHash("sha1").update(value).digest("hex").slice(0, 8), 16) / 0x100000000;
}

const splitOf = (id) => (unitHash(`split:${id}`) < 0.5 ? "dev" : "test");

function download(url, name) {
  const target = path.join(DOWNLOAD_DIR, name);
  if (fs.existsSync(target)) return target;
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  console.log(`다운로드: ${url}`);
  execFileSync("curl", ["-fL", "--retry", "3", "-o", `${target}.part`, url], { stdio: "inherit" });
  fs.renameSync(`${target}.part`, target);
  return target;
}

/**
 * gzip JSONL을 줄 단위로 읽는다. readline은 U+2028/U+2029에서도 줄을 나누는데,
 * 위키백과 본문에는 이 문자가 JSON 문자열 안에 그대로 들어 있어 직접 '\n'으로만 나눈다.
 */
async function* jsonLines(file) {
  let rest = "";
  // setEncoding은 청크 경계에서 잘린 UTF-8 문자를 다음 청크와 이어 붙여 디코딩한다.
  const stream = fs.createReadStream(file).pipe(zlib.createGunzip()).setEncoding("utf-8");
  for await (const chunk of stream) {
    const lines = (rest + chunk).split("\n");
    rest = lines.pop();
    for (const line of lines) if (line) yield line;
  }
  if (rest) yield rest;
}

function readTsv(file) {
  return fs
    .readFileSync(file, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t"));
}

async function prepareMiracl(datasetDir, corpusDir, options) {
  const topics = readTsv(download(`${MIRACL_BASE}/topics/topics.miracl-v1.0-ko-dev.tsv`, "miracl-ko-dev-topics.tsv"));
  const qrels = readTsv(download(`${MIRACL_BASE}/qrels/qrels.miracl-v1.0-ko-dev.tsv`, "miracl-ko-dev-qrels.tsv"));

  const judged = new Map();
  for (const [qid, , docid, rel] of qrels) {
    if (!judged.has(qid)) judged.set(qid, []);
    judged.get(qid).push({ docid, relevant: rel === "1" });
  }
  // 정답 문단이 있는 쿼리만 쓰고, 해시 순서로 정렬해 --queries N이 항상 같은 표본을 고르게 한다.
  const selected = topics
    .filter(([qid]) => judged.get(qid)?.some((item) => item.relevant))
    .sort(([a], [b]) => unitHash(`q:${a}`) - unitHash(`q:${b}`))
    .slice(0, options.queries);

  // 판정된 문단(정답 + 사람이 오답으로 판정한 어려운 후보)은 모두 넣는다.
  const needed = new Set(selected.flatMap(([qid]) => judged.get(qid).map((item) => item.docid)));
  const distractorRate = options.distractors / MIRACL_CORPUS_SIZE;
  const fileOf = (docid) => `miracl/${docid.replace("#", "-")}.txt`;
  let written = 0;
  let distractors = 0;

  for (const shard of MIRACL_SHARDS) {
    const file = download(`${MIRACL_CORPUS_BASE}/${shard}`, `miracl-ko-${shard}`);
    for await (const line of jsonLines(file)) {
      const { docid, title, text } = JSON.parse(line);
      const isNeeded = needed.has(docid);
      const isDistractor = !isNeeded && distractors < options.distractors
        && unitHash(`d:${docid}`) < distractorRate;
      if (!isNeeded && !isDistractor) continue;
      // 파일명은 문단 ID만 쓴다. 제목을 파일명에 넣으면 파일명 일치 가산점이 본문 검색 성능을 가린다.
      const target = path.join(corpusDir, fileOf(docid));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, `${title}\n\n${text}\n`, "utf-8");
      written += 1;
      if (isDistractor) distractors += 1;
    }
  }
  console.log(`MIRACL: 쿼리 ${selected.length}개, 문단 ${written}개 (방해 문단 ${distractors}개)`);

  return selected.map(([qid, query]) => ({
    query,
    tags: ["miracl", "semantic", "document", "ko"],
    split: splitOf(`miracl:${qid}`),
    relevant: judged
      .get(qid)
      .filter((item) => item.relevant)
      .map((item) => `${PATH_PREFIX}/${fileOf(item.docid)}`),
  }));
}

async function prepareXm3600(datasetDir, corpusDir, options) {
  const captionsZip = download(XM3600_CAPTIONS, "xm3600-captions.zip");
  const imagesTgz = download(XM3600_IMAGES, "xm3600-images.tgz");
  download(XM3600_ATTRIBUTIONS, "xm3600-image-attributions.csv");

  const captionsFile = path.join(DOWNLOAD_DIR, "captions.jsonl");
  if (!fs.existsSync(captionsFile)) {
    execFileSync("unzip", ["-o", "-q", captionsZip, "captions.jsonl", "-d", DOWNLOAD_DIR]);
  }
  const images = fs
    .readFileSync(captionsFile, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((entry) => entry.ko?.caption?.length && entry.en?.caption?.length)
    .sort((a, b) => unitHash(`i:${a["image/key"]}`) - unitHash(`i:${b["image/key"]}`))
    .slice(0, options.images);

  const members = execFileSync("tar", ["-tzf", imagesTgz], { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 })
    .split("\n")
    .filter((member) => /\.jpe?g$/i.test(member));
  const memberByKey = new Map(members.map((member) => [path.basename(member).replace(/\.jpe?g$/i, ""), member]));
  const wanted = images.map((entry) => memberByKey.get(entry["image/key"])).filter(Boolean);
  const extractDir = path.join(datasetDir, "extract");
  fs.rmSync(extractDir, { recursive: true, force: true });
  fs.mkdirSync(extractDir, { recursive: true });
  execFileSync("tar", ["-xzf", imagesTgz, "-C", extractDir, ...wanted]);

  const imageDir = path.join(corpusDir, "xm3600");
  fs.mkdirSync(imageDir, { recursive: true });
  const queries = [];
  for (const entry of images) {
    const key = entry["image/key"];
    const member = memberByKey.get(key);
    if (!member) continue;
    fs.renameSync(path.join(extractDir, member), path.join(imageDir, `${key}.jpg`));
    const relevant = [`${PATH_PREFIX}/xm3600/${key}.jpg`];
    const split = splitOf(`xm3600:${key}`);
    queries.push({ query: entry.ko.caption[0], tags: ["xm3600", "semantic", "image", "ko"], split, relevant });
    queries.push({ query: entry.en.caption[0], tags: ["xm3600", "semantic", "image", "en"], split, relevant });
  }
  fs.rmSync(extractDir, { recursive: true, force: true });
  console.log(`Crossmodal-3600: 이미지 ${queries.length / 2}장, 쿼리 ${queries.length}개`);
  return queries;
}

const round = (vector) => vector?.map((value) => Number(value.toFixed(VECTOR_DECIMALS)));

function indexCorpus(corpusDir, datasetDir) {
  const output = path.join(datasetDir, "index.json");
  execFileSync(process.execPath, [path.join(ROOT, "scripts/index-folder.mjs"), corpusDir], {
    stdio: "inherit",
    env: { ...process.env, NOOKIVE_INDEX_OUTPUT: output, NOOKIVE_ASR_URL: "" },
  });
  const records = JSON.parse(fs.readFileSync(output, "utf-8")).map((record) => {
    const relative = path.relative(corpusDir, record.file.path).split(path.sep).join("/");
    const fixturePath = `${PATH_PREFIX}/${relative}`;
    const file = { ...record.file, path: fixturePath };
    delete file.thumbnail;
    delete file.preview;
    return {
      ...record,
      id: record.id.replace(record.file.path, fixturePath),
      file,
      vector: round(record.vector),
      textVector: round(record.textVector),
    };
  });
  fs.rmSync(output);
  return records;
}

async function embedQueries(queries) {
  const vectors = {};
  for (const [index, { query }] of queries.entries()) {
    if (vectors[query]) continue;
    const response = await fetch(`${EMBED_URL}/v1/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: `${SEARCH_QUERY_PREFIX}${query}` }),
    });
    if (!response.ok) throw new Error(`쿼리 임베딩 실패 (${query}): ${response.status}`);
    vectors[query] = round((await response.json()).data[0].embedding);
    if ((index + 1) % 100 === 0) console.log(`쿼리 임베딩 ${index + 1}/${queries.length}`);
  }
  return vectors;
}

function writeDataset(name, records, queries, queryVectors) {
  const datasetDir = path.join(CACHE_DIR, "datasets", name);
  fs.mkdirSync(datasetDir, { recursive: true });
  fs.writeFileSync(path.join(datasetDir, "fixture.json"), JSON.stringify({ records, queryVectors }));
  fs.writeFileSync(path.join(datasetDir, "queries.json"), JSON.stringify({ queries }, null, 2));
  console.log(`저장: ${datasetDir} (레코드 ${records.length}개, 쿼리 ${queries.length}개)`);
}

const readDataset = (name) => {
  const datasetDir = path.join(CACHE_DIR, "datasets", name);
  const fixtureFile = path.join(datasetDir, "fixture.json");
  if (!fs.existsSync(fixtureFile)) throw new Error(`${name}을 먼저 준비하세요: npm run eval:public:prepare -- ${name}`);
  return {
    ...JSON.parse(fs.readFileSync(fixtureFile, "utf-8")),
    ...JSON.parse(fs.readFileSync(path.join(datasetDir, "queries.json"), "utf-8")),
  };
};

async function main() {
  const { dataset, options } = parseArgs(process.argv.slice(2));
  if (dataset === "mixed") {
    // 파일별 색인은 서로 독립이므로 두 데이터셋의 결과를 합치면 한 폴더에서 색인한 것과 같다.
    const parts = ["miracl", "xm3600"].map(readDataset);
    writeDataset(
      "mixed",
      parts.flatMap((part) => part.records),
      parts.flatMap((part) => part.queries),
      Object.assign({}, ...parts.map((part) => part.queryVectors)),
    );
    return;
  }
  const prepare = { miracl: prepareMiracl, xm3600: prepareXm3600 }[dataset];
  if (!prepare) throw new Error("데이터셋을 지정하세요: miracl | xm3600 | mixed");
  if (process.platform !== "darwin") throw new Error("공개 벤치마크 준비는 macOS에서만 가능합니다.");
  const health = await fetch(`${EMBED_URL}/health`).catch(() => null);
  if (!health?.ok) throw new Error("임베딩 서버(127.0.0.1:8080)가 꺼져 있습니다. `npm run sidecar`를 먼저 실행하세요.");

  const datasetDir = path.join(CACHE_DIR, "datasets", dataset);
  const corpusDir = path.join(datasetDir, "corpus");
  fs.rmSync(corpusDir, { recursive: true, force: true });
  fs.mkdirSync(corpusDir, { recursive: true });
  const queries = await prepare(datasetDir, corpusDir, options);
  const records = indexCorpus(corpusDir, datasetDir);
  writeDataset(dataset, records, queries, await embedQueries(queries));
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
