// scripts/index-folder.mjs
// 로컬 디렉토리 전체 색인 엔진 (PDF, 문서/코드, 이미지, 오디오, 비디오)
// 멀티모달 EmbeddingGemma 2 (llama-server + mmproj)로 텍스트·이미지·오디오를 한 공간에 임베딩.

import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { execFile, execFileSync } from "child_process";
import { promisify } from "util";
import { PDFParse } from "pdf-parse";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VISION_CLI_PATH = path.resolve(__dirname, "../bin/vision-cli");
// 비디오 프레임 추출용 (AVFoundation). 없으면 프레임은 건너뛰고 오디오만 색인.
const FRAMES_CLI_PATH = path.resolve(__dirname, "../bin/media-cli");
const AF_CONVERT = "/usr/bin/afconvert";
const AFINFO = "/usr/bin/afinfo";
const SIPS = "/usr/bin/sips";

const LLAMA_EMBED_URL = "http://127.0.0.1:8080/v1/embeddings";
// Qwen3-ASR 사이드카 (선택). 설정된 경우에만 전사하고, 실패하면 오디오 벡터만 저장한다.
const ASR_URL = process.env.NOOKIVE_ASR_URL || "";
const ASR_TIMEOUT_MS = 60_000;
// Qwen3-ForcedAligner (선택). 전사 텍스트를 단어 단위 타임스탬프로 정렬한다.
const ALIGNER_BIN = path.resolve(__dirname, "../bin/qwen3-asr-cli");
const MODEL_DIR = process.env.NOOKIVE_MODEL_DIR || path.resolve(__dirname, "../models");
const ALIGNER_MODEL = path.join(MODEL_DIR, "asr/qwen3-forced-aligner-0.6b-q8_0.gguf");
const ALIGNER_LIBS = path.resolve(__dirname, "../bin/qwen3-asr-libs");
const ALIGNER_ENABLED =
  process.env.NOOKIVE_ALIGNER !== "0" &&
  fs.existsSync(ALIGNER_BIN) &&
  fs.existsSync(ALIGNER_MODEL);
// 📂 지원 확장자
const SUPPORTED_EXTS = [
  // 문서 및 코드
  ".md",
  ".txt",
  ".json",
  ".ts",
  ".tsx",
  ".js",
  ".py",
  ".rtf",
  ".pdf",
  // 이미지
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".heic",
  ".bmp",
  ".gif",
  // 오디오
  ".mp3",
  ".m4a",
  ".wav",
  ".flac",
  ".aac",
  ".ogg",
  ".wma",
  // 비디오
  ".mp4",
  ".mov",
  ".mkv",
  ".avi",
  ".webm",
  ".m4v",
];

const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;
const EMBEDDING_TIMEOUT_MS = 30_000;

// 오디오 윈도우 (겹치는 창). 기본 5초/2.5초로 두어 검색 결과 뱃지가
// "해당 내용이 있는 구간"을 2.5초 단위로 가리키게 한다.
// 3초 이하로 줄이면 Qwen3-ASR 전사 품질이 떨어지므로 5초를 하한으로 둔다.
// (모델 입력 상한은 30초이므로 30초까지 늘릴 수 있다.)
const AUDIO_WINDOW_SEC = Number(process.env.NOOKIVE_AUDIO_WINDOW_SEC) || 5;
const AUDIO_STEP_SEC = Number(process.env.NOOKIVE_AUDIO_STEP_SEC) || 2.5;
// 무음 구간은 벡터를 만들지 않는다 (≈ -54 dBFS). 인덱스 크기와 검색 노이즈를 줄인다.
const SILENCE_RMS = 0.002;

const IMAGE_EXTS = ["png", "jpg", "jpeg", "webp", "heic", "bmp", "gif"];
const AUDIO_EXTS = ["mp3", "m4a", "wav", "flac", "aac", "ogg", "wma"];
const VIDEO_EXTS = ["mp4", "mov", "mkv", "avi", "webm", "m4v"];

// ─────────────────────────────────────────────────────────────
// 임베딩 (텍스트 / 멀티모달)
// ─────────────────────────────────────────────────────────────

async function postEmbedding(body) {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, EMBEDDING_TIMEOUT_MS);
  try {
    return await fetch(LLAMA_EMBED_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (timedOut) {
      throw new Error(
        `EmbeddingGemma 응답 시간 초과 (${EMBEDDING_TIMEOUT_MS / 1000}초)`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// 1. 텍스트 임베딩
async function fetchEmbedding(text, title = "none") {
  const documentText = `title: ${title} | text: ${text}`;
  const res = await postEmbedding({ input: documentText });
  if (!res.ok) {
    throw new Error(`Embedding API Error: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  const vector = json.data?.[0]?.embedding;
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error("텍스트 임베딩 벡터가 비어 있습니다");
  }
  return vector; // 768차원
}

// 2. 멀티모달 임베딩 (이미지/오디오): OpenAI 호환 content 파트
async function fetchMultimodalEmbedding(parts) {
  try {
    const res = await postEmbedding({ input: [{ content: parts }] });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${txt.slice(0, 140)}`);
    }
    const json = await res.json();
    return json.data[0].embedding;
  } catch (err) {
    console.warn(`  ⚠️ 멀티모달 임베딩 실패: ${err.message}`);
    return null;
  }
}

async function embedImage(base64Jpeg) {
  const vec = await fetchMultimodalEmbedding([
    {
      type: "image_url",
      image_url: { url: `data:image/jpeg;base64,${base64Jpeg}` },
    },
  ]);
  if (!vec?.length) throw new Error("이미지 멀티모달 임베딩 실패");
  return vec;
}

async function embedAudioWav(wavBuffer) {
  const vec = await fetchMultimodalEmbedding([
    {
      type: "input_audio",
      input_audio: { data: wavBuffer.toString("base64"), format: "wav" },
    },
  ]);
  if (!vec?.length) throw new Error("오디오 멀티모달 임베딩 실패");
  return vec;
}

// Qwen3-ASR로 10초 WAV를 전사한다. ASR 서버가 없으면 null을 반환하고
// 인덱싱은 오디오 벡터만으로 계속 진행한다.
async function transcribeAudio(wavBuffer) {
  if (!ASR_URL) return null;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ASR_TIMEOUT_MS);
  try {
    const res = await fetch(`${ASR_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content: [
              {
                type: "input_audio",
                input_audio: {
                  data: wavBuffer.toString("base64"),
                  format: "wav",
                },
              },
            ],
          },
        ],
        temperature: 0,
        max_tokens: 512,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = await res.json();
    const content = json.choices?.[0]?.message?.content || "";
    // Qwen3-ASR은 "language Korean<asr_text>..." 형태로 반환한다.
    const languageMatch = content.match(/^language\s+([A-Za-z]+)/i);
    const language = languageMatch ? languageMatch[1].toLowerCase() : "english";
    const text = content.split("<asr_text>").pop().trim();
    return text ? { text, language } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Qwen3-ForcedAligner로 윈도우 전사 텍스트를 단어 단위 타임스탬프로 정렬한다.
// 반환값의 start/end는 윈도우 시작 기준 상대 시간(초)이다.
async function alignAudio(wavBuffer, transcript, language) {
  if (!ALIGNER_ENABLED || !transcript) return null;
  const wavPath = path.join(
    os.tmpdir(),
    `nookive_align_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`,
  );
  try {
    fs.writeFileSync(wavPath, wavBuffer);
    const { stdout } = await execFileAsync(
      ALIGNER_BIN,
      [
        "-m",
        ALIGNER_MODEL,
        "-f",
        wavPath,
        "--align",
        "--text",
        transcript,
        "--lang",
        language || "english",
      ],
      {
        encoding: "utf-8",
        timeout: 120_000,
        maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, DYLD_LIBRARY_PATH: ALIGNER_LIBS },
      },
    );
    const start = stdout.indexOf("{");
    const end = stdout.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    const parsed = JSON.parse(stdout.slice(start, end + 1));
    return Array.isArray(parsed.words) ? parsed.words : null;
  } catch (err) {
    console.warn(`  ⚠️ 단어 정렬 실패: ${err.message}`);
    return null;
  } finally {
    fs.rmSync(wavPath, { force: true });
  }
}

// ─────────────────────────────────────────────────────────────
// 이미지 전처리 (sips로 JPEG 1024px 변환 → mtmd가 확실히 읽도록)
// ─────────────────────────────────────────────────────────────

function preprocessImageToJpeg(fullPath) {
  const out = path.join(
    os.tmpdir(),
    `nookive_img_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`,
  );
  execFileSync(
    SIPS,
    ["-s", "format", "jpeg", "-Z", "1024", fullPath, "--out", out],
    {
      stdio: "ignore",
    },
  );
  return out;
}

// ─────────────────────────────────────────────────────────────
// 파생 이미지 생성 (sips) — 목록 썸네일(160px) + 미리보기(720px)
// 원본 풀해상도(수 MB, 12MP)를 목록/미리보기에서 그대로 로드하면
// 매번 대용량 디코딩이 발생해 렉이 걸린다. 인덱싱 시점에 두 크기를
// 미리 만들어 두고 화면은 이 경로만 사용한다.
//
// 파생 이미지는 "캐시"이므로 프로젝트/앱 번들이 아니라 OS 캐시 디렉터리에 둔다.
// (컴퓨터 전체를 색인해도 저장소가 오염되지 않도록)
//  - 콘텐츠 주소 지정: 경로+수정시각+크기 해시 → 파일이 바뀌면 새로 생성,
//    그대로면 재사용하므로 재색인해도 중복 파일이 쌓이지 않는다.
//  - 용량 상한(500MB) 초과 시 오래된 것부터 제거(LRU) → 무한 증가 방지.
// ─────────────────────────────────────────────────────────────

const CACHE_DIR = path.join(os.homedir(), "Library", "Caches", "nookive");
const THUMB_DIR = path.join(CACHE_DIR, "thumbnails");
const THUMB_MAX = 160; // 목록용 (34px 표시)
const PREVIEW_MAX = 720; // 미리보기용 (뷰포트 ~460×240, 레티나 대응)
const CACHE_MAX_BYTES = 500 * 1024 * 1024; // 500MB 상한

// maxDim 크기의 JPEG를 캐시에 생성(있으면 재사용)하고 절대 경로를 반환.
// fullPath는 변경 감지/캐시 키에 사용하는 원본 경로이고, sourcePath는 실제로
// sips가 읽을 래스터 이미지 경로다. 비디오는 원본 경로를 키로 유지하면서
// 추출된 임시 프레임을 변환한다.
function generateDerived(
  fullPath,
  mtimeMs,
  sizeBytes,
  maxDim,
  tag,
  sourcePath = fullPath,
) {
  try {
    if (!fs.existsSync(THUMB_DIR)) fs.mkdirSync(THUMB_DIR, { recursive: true });
    const hash = crypto
      .createHash("sha1")
      .update(`${fullPath}|${mtimeMs}|${sizeBytes}|${maxDim}|${tag}`)
      .digest("hex")
      .slice(0, 20);
    const out = path.join(THUMB_DIR, `${hash}_${tag}.jpg`);
    if (fs.existsSync(out)) return out; // 캐시 히트 → 재생성 생략
    execFileSync(
      SIPS,
      ["-s", "format", "jpeg", "-Z", String(maxDim), sourcePath, "--out", out],
      { stdio: "ignore" },
    );
    return out;
  } catch (err) {
    console.warn(
      `  ⚠️ 파생 이미지 생성 실패 (${path.basename(fullPath)}): ${err.message}`,
    );
    return null;
  }
}

// 캐시 상한 초과 시 오래된(접근 시각 기준) 파일부터 제거
function pruneThumbnailCache() {
  try {
    if (!fs.existsSync(THUMB_DIR)) return;
    const entries = fs.readdirSync(THUMB_DIR).map((name) => {
      const p = path.join(THUMB_DIR, name);
      const st = fs.statSync(p);
      return { p, size: st.size, atime: st.atimeMs };
    });
    let total = entries.reduce((s, e) => s + e.size, 0);
    if (total <= CACHE_MAX_BYTES) return;
    entries.sort((a, b) => a.atime - b.atime);
    let removed = 0;
    for (const e of entries) {
      if (total <= CACHE_MAX_BYTES) break;
      fs.rmSync(e.p, { force: true });
      total -= e.size;
      removed++;
    }
    if (removed > 0) {
      console.log(
        `🧹 이미지 캐시 정리: ${removed}개 제거 (상한 ${CACHE_MAX_BYTES / 1024 / 1024}MB)`,
      );
    }
  } catch (err) {
    console.warn(`  ⚠️ 이미지 캐시 정리 실패: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────
// 오디오: WAV(16k mono) 변환 → 30초 겹침 윈도우로 분할 → 각 구간 임베딩
// ─────────────────────────────────────────────────────────────

function convertToWav16kMono(inputPath) {
  const out = path.join(
    os.tmpdir(),
    `nookive_aud_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`,
  );
  execFileSync(
    AF_CONVERT,
    ["-f", "WAVE", "-d", "LEI16@16000", "-c", "1", inputPath, out],
    {
      stdio: "ignore",
    },
  );
  return out;
}

function parseWav(buf) {
  let pos = 12;
  let sampleRate = 16000;
  let channels = 1;
  let bits = 16;
  let dataOffset = 44;
  let dataLen = Math.max(0, buf.length - 44);
  while (pos + 8 <= buf.length) {
    const id = buf.toString("ascii", pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    if (id === "fmt ") {
      channels = buf.readUInt16LE(pos + 8 + 2);
      sampleRate = buf.readUInt32LE(pos + 8 + 4);
      bits = buf.readUInt16LE(pos + 8 + 14);
    } else if (id === "data") {
      dataOffset = pos + 8;
      dataLen = size;
      break;
    }
    pos += 8 + size + (size % 2);
  }
  return { sampleRate, channels, bits, dataOffset, dataLen };
}

function buildWav(pcm, sampleRate, channels, bits) {
  const blockAlign = (channels * bits) / 8;
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bits, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function fmtMmSs(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(Math.floor(sec % 60)).padStart(2, "0");
  return `${m}:${s}`;
}

// 16-bit PCM 버퍼의 RMS. 무음 윈도우를 걸러내는 데 쓴다.
function rmsInt16(buf) {
  const samples = Math.floor(buf.length / 2);
  if (samples === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples; i += 1) {
    const value = buf.readInt16LE(i * 2) / 32768;
    sum += value * value;
  }
  return Math.sqrt(sum / samples);
}

// afinfo로 미디어 길이(초)를 읽는다. 오디오 트랙이 없는 영상의 duration 보강용.
function probeDuration(inputPath) {
  try {
    const out = execFileSync(AFINFO, [inputPath], {
      encoding: "utf-8",
      timeout: 8000,
    });
    const match = out.match(/estimated duration:\s*([\d.]+)\s*sec/);
    return match ? Number.parseFloat(match[1]) : undefined;
  } catch {
    return undefined;
  }
}

// 파일에 오디오 트랙이 있는지 확인 (무음 영상은 afconvert가 실패하므로 먼저 걸러낸다)
function hasAudioTrack(inputPath) {
  try {
    execFileSync(AFINFO, [inputPath], { stdio: "ignore", timeout: 8000 });
    return true;
  } catch {
    return false;
  }
}

// 오디오/비디오의 사운드트랙 → 5초 윈도우 임베딩 + 30초 단위 ASR/정렬
// (각 청크에 timestampSeconds + vector + transcript + words, 반환값에 durationSeconds)
async function extractAudioChunks(inputPath) {
  // 오디오 트랙이 없으면(예: 무음 영상) 조용히 건너뛴다.
  if (!hasAudioTrack(inputPath)) {
    console.log("  ⏭️  오디오 트랙 없음, 사운드 색인 건너뜀");
    return null;
  }

  let wavPath = null;
  try {
    wavPath = convertToWav16kMono(inputPath);
    const buf = fs.readFileSync(wavPath);
    const { sampleRate, channels, bits, dataOffset, dataLen } = parseWav(buf);
    const bytesPerSec = sampleRate * channels * (bits / 8);
    const windowBytes = AUDIO_WINDOW_SEC * bytesPerSec;
    const stepBytes = AUDIO_STEP_SEC * bytesPerSec;
    const durationSeconds = dataLen / bytesPerSec;
    const pcmAll = buf.subarray(dataOffset, dataOffset + dataLen);

    // 1) 5초 윈도우 오디오 임베딩 (검색/뱃지 단위)
    const windows = [];
    for (let start = 0; start < dataLen; start += stepBytes) {
      const end = Math.min(start + windowBytes, dataLen);
      const pcm = pcmAll.subarray(start, end);
      if (pcm.length < bytesPerSec * 2) break; // 너무 짧은 꼬리 스킵
      const isLast = end >= dataLen;
      // 무음 윈도우는 임베딩하지 않는다. (DigUp과 동일한 노이즈 억제)
      if (rmsInt16(pcm) >= SILENCE_RMS) {
        const wav = buildWav(pcm, sampleRate, channels, bits);
        const vec = await embedAudioWav(wav);
        windows.push({
          startSec: Math.floor(start / bytesPerSec),
          endSec: Math.floor(end / bytesPerSec),
          vector: vec,
        });
      }
      if (isLast) break;
    }

    // 2) 30초 비겹침 ASR + 정렬
    //    윈도우(5초)마다 ASR/정렬을 반복하면 프로세스 시작 오버헤드가 커진다.
    //    30초 단위로 묶으면 1시간 오디오 기준 호출 수가 720 → 120으로 줄어든다.
    const allWords = [];
    if (ASR_URL) {
      const asrChunkBytes = 30 * bytesPerSec;
      for (let start = 0; start < dataLen; start += asrChunkBytes) {
        const end = Math.min(start + asrChunkBytes, dataLen);
        const pcm = pcmAll.subarray(start, end);
        if (pcm.length < bytesPerSec) break;
        const wav = buildWav(pcm, sampleRate, channels, bits);
        const asr = await transcribeAudio(wav);
        if (!asr?.text) continue;
        const words = await alignAudio(wav, asr.text, asr.language);
        if (words) {
          const offset = start / bytesPerSec;
          for (const word of words) {
            allWords.push({
              word: word.word,
              start: offset + word.start,
              end: offset + word.end,
            });
          }
        }
      }
    }

    // 3) 단어 타임스탬프를 5초 윈도우에 매핑
    const chunks = windows.map((w) => {
      const words = allWords.filter(
        (word) => word.start >= w.startSec && word.start < w.endSec,
      );
      const transcript = words
        .map((word) => word.word)
        .join(" ")
        .trim();
      if (process.env.NOOKIVE_DEBUG_AUDIO) {
        console.log(
          `  [debug] window ${w.startSec}-${w.endSec}s words=${words
            .slice(0, 3)
            .map((word) => `${word.word}@${word.start.toFixed(2)}`)
            .join(",")}`,
        );
      }
      return {
        text: `[오디오 구간 ${fmtMmSs(w.startSec)}~${fmtMmSs(w.endSec)}]`,
        timestampSeconds: w.startSec,
        vector: w.vector,
        ...(transcript ? { transcript } : {}),
        ...(words.length ? { words } : {}),
      };
    });

    return { chunks, durationSeconds };
  } catch (err) {
    console.warn(`  ⚠️ 오디오 처리 실패: ${err.message}`);
    return null;
  } finally {
    if (wavPath) fs.rmSync(wavPath, { force: true });
  }
}

// ─────────────────────────────────────────────────────────────
// 비디오 프레임 (AVFoundation media-cli가 있으면 사용)
// ─────────────────────────────────────────────────────────────

function extractVideoFrames(videoPath) {
  if (!fs.existsSync(FRAMES_CLI_PATH)) return [];
  const outDir = path.join(
    os.tmpdir(),
    `nookive_frames_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  );
  try {
    const out = execFileSync(FRAMES_CLI_PATH, [videoPath, outDir], {
      encoding: "utf-8",
      timeout: 180000,
      maxBuffer: 64 * 1024 * 1024,
    });
    return JSON.parse(out.trim() || "[]"); // [{ time, path }]
  } catch (err) {
    console.warn(`  ⚠️ 프레임 추출 실패: ${err.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// 텍스트 슬라이딩 윈도우 청킹
// ─────────────────────────────────────────────────────────────

function countLines(str, from, to) {
  let n = 0;
  for (let i = from; i < to; i++) {
    if (str.charCodeAt(i) === 10) n++;
  }
  return n;
}

function chunkText(content) {
  const chunks = [];
  let start = 0;
  while (start < content.length) {
    const end = Math.min(start + CHUNK_SIZE, content.length);
    const textChunk = content.slice(start, end).trim();
    if (textChunk.length > 15) {
      const lineStart = countLines(content, 0, start) + 1;
      const lineEnd = lineStart + countLines(textChunk, 0, textChunk.length);
      chunks.push({ text: textChunk, lineStart, lineEnd });
    }
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
}

// ─────────────────────────────────────────────────────────────
// 파일별 추출기 (텍스트 청크 또는 벡터가 포함된 미디어 세그먼트 반환)
// ─────────────────────────────────────────────────────────────

async function extractContentFromFile(file) {
  const ext = file.ext.toLowerCase();

  // ① PDF: 페이지별 텍스트
  if (ext === "pdf") {
    try {
      const buf = fs.readFileSync(file.fullPath);
      const uint8 = new Uint8Array(buf);
      const parser = new PDFParse(uint8);
      const res = await parser.getText();
      const pages = Array.isArray(res.pages) ? res.pages : [];
      const pageChunks = [];
      for (const page of pages) {
        const cleaned = (page.text || "").replace(/\s+/g, " ").trim();
        if (cleaned.length <= 20) continue;
        for (const c of chunkText(cleaned)) {
          pageChunks.push({ text: c.text, pageNumber: page.num });
        }
      }
      if (pageChunks.length > 0) return pageChunks;
      const rawText = typeof res === "string" ? res : res.text || "";
      const cleanedAll = rawText.replace(/\s+/g, " ").trim();
      if (cleanedAll.length > 20) return chunkText(cleanedAll);
    } catch (err) {
      console.warn(`  ⚠️ PDF 파싱 실패 (${file.name}): ${err.message}`);
    }
    return [
      {
        text: `[PDF 문서] 파일명: ${file.name}, 크기: ${(file.size / 1024).toFixed(1)}KB`,
      },
    ];
  }

  // ② 이미지: 네이티브 이미지 임베딩 (+ Vision 라벨/OCR 텍스트는 표시/키워드용)
  if (IMAGE_EXTS.includes(ext)) {
    const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
    let detectedKo = [];
    let detectedEn = [];
    let ocrText = "";
    if (fs.existsSync(VISION_CLI_PATH)) {
      try {
        const out = execFileSync(VISION_CLI_PATH, [file.fullPath], {
          encoding: "utf-8",
          timeout: 4000,
        });
        const parsed = JSON.parse(out.trim());
        detectedKo = parsed.koreanTags || [];
        detectedEn = parsed.labels || [];
        ocrText = parsed.ocr || "";
      } catch {
        // 무시
      }
    }
    const parts = [];
    if (detectedKo.length > 0)
      parts.push(`사물/객체: ${detectedKo.join(", ")}`);
    if (detectedEn.length > 0) parts.push(`Vision: ${detectedEn.join(", ")}`);
    if (ocrText.trim().length > 0) parts.push(`글자(OCR): ${ocrText.trim()}`);
    if (cleanName) parts.push(`파일명: ${cleanName}`);
    const desc =
      parts.length > 0
        ? `[사진 이미지] ${parts.join(". ")}`
        : `[사진 이미지] 파일명: ${file.name}`;

    let jpegPath = null;
    try {
      jpegPath = preprocessImageToJpeg(file.fullPath);
      const b64 = fs.readFileSync(jpegPath).toString("base64");
      const vec = await embedImage(b64);
      return [{ text: desc, vector: vec }];
    } catch (err) {
      console.warn(`  ⚠️ 이미지 임베딩 실패 (${file.name}): ${err.message}`);
      // 임의 벡터는 검색 결과를 오염시키므로 설명 텍스트만 남겨
      // 아래 일반 텍스트 임베딩 경로에서 재시도한다.
      return [{ text: desc }];
    } finally {
      if (jpegPath) fs.rmSync(jpegPath, { force: true });
    }
  }

  // ③ 오디오: 30초 겹침 윈도우 임베딩 (내용 기반 검색 + 재생 위치)
  if (AUDIO_EXTS.includes(ext)) {
    const audio = await extractAudioChunks(file.fullPath);
    const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
    if (audio && audio.chunks.length > 0) {
      // 스니펫에 제목과 전사 텍스트를 넣어 UI 가독성과 키워드 매칭을 함께 높인다.
      return audio.chunks.map((chunk) => ({
        ...chunk,
        text: `[오디오] ${cleanName}${chunk.transcript ? ` | ${chunk.transcript}` : ""} | ${chunk.text}`,
        durationSeconds: audio.durationSeconds,
      }));
    }
    return [
      {
        text: `[오디오] 제목: ${cleanName}, 파일명: ${file.name}`,
        durationSeconds: audio?.durationSeconds ?? probeDuration(file.fullPath),
      },
    ];
  }

  // ④ 비디오: 사운드트랙(오디오 윈도우) + 프레임(이미지) 임베딩
  if (VIDEO_EXTS.includes(ext)) {
    const segs = [];

    const audio = await extractAudioChunks(file.fullPath);
    if (audio) {
      segs.push(
        ...audio.chunks.map((chunk) => ({
          ...chunk,
          durationSeconds: audio.durationSeconds,
        })),
      );
    }
    const durationSeconds =
      audio?.durationSeconds ?? probeDuration(file.fullPath);

    const frames = extractVideoFrames(file.fullPath);
    let videoThumbnail = null;
    let videoPreview = null;
    const firstFrame = frames.find((frame) => frame.path);
    if (firstFrame) {
      // 검색 목록용 아이콘은 영상 시작 프레임을 대표 썸네일로 사용한다.
      videoThumbnail = generateDerived(
        file.fullPath,
        file.mtime.getTime(),
        file.size,
        THUMB_MAX,
        "vt",
        firstFrame.path,
      );
      videoPreview = generateDerived(
        file.fullPath,
        file.mtime.getTime(),
        file.size,
        PREVIEW_MAX,
        "vp",
        firstFrame.path,
      );
    }
    for (const frame of frames) {
      try {
        const b64 = fs.readFileSync(frame.path).toString("base64");
        const vec = await embedImage(b64);
        const t = Math.floor(frame.time || 0);
        segs.push({
          text: `[영상 프레임 ${fmtMmSs(t)}]`,
          timestampSeconds: t,
          vector: vec,
        });
      } catch {
        // 프레임 skip
      }
    }
    if (frames.length > 0 && frames[0].path) {
      fs.rmSync(path.dirname(frames[0].path), { recursive: true, force: true });
    }

    if (segs.length > 0) {
      return segs.map((segment) => ({
        ...segment,
        thumbnail: videoThumbnail,
        preview: videoPreview,
        durationSeconds,
      }));
    }
    const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
    return [
      {
        text: `[영상] 제목: ${cleanName}, 파일명: ${file.name}`,
        durationSeconds,
      },
    ];
  }

  // ⑤ 일반 텍스트 / 마크다운 / 소스 코드
  try {
    const raw = fs.readFileSync(file.fullPath, "utf-8");
    const chunks = chunkText(raw);
    return chunks.length > 0 ? chunks : [{ text: `${file.name} (빈 파일)` }];
  } catch {
    return [{ text: `[텍스트 파일] ${file.name}` }];
  }
}

// ─────────────────────────────────────────────────────────────
// 디렉토리 재귀 탐색
// ─────────────────────────────────────────────────────────────

function scanDirectory(dirPath, fileList = []) {
  if (!fs.existsSync(dirPath)) return fileList;
  const items = fs.readdirSync(dirPath);

  for (const item of items) {
    if (item.startsWith(".") || item === "node_modules" || item === "dist")
      continue;
    const fullPath = path.join(dirPath, item);
    let stat;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      scanDirectory(fullPath, fileList);
    } else {
      const ext = path.extname(item).toLowerCase();
      if (SUPPORTED_EXTS.includes(ext) && stat.size < 200 * 1024 * 1024) {
        fileList.push({
          fullPath,
          name: item,
          ext: ext.replace(".", ""),
          size: stat.size,
          mtime: stat.mtime,
        });
      }
    }
  }
  return fileList;
}

function scanIndexPath(inputPath, fileList = []) {
  let stat;
  try {
    stat = fs.statSync(inputPath);
  } catch {
    return fileList;
  }
  if (stat.isDirectory()) return scanDirectory(inputPath, fileList);
  if (!stat.isFile() || stat.size >= 200 * 1024 * 1024) return fileList;
  const ext = path.extname(inputPath).toLowerCase();
  if (!SUPPORTED_EXTS.includes(ext)) return fileList;
  fileList.push({
    fullPath: inputPath,
    name: path.basename(inputPath),
    ext: ext.replace(".", ""),
    size: stat.size,
    mtime: stat.mtime,
  });
  return fileList;
}

// ─────────────────────────────────────────────────────────────
// 메인 인덱싱 파이프라인
// ─────────────────────────────────────────────────────────────

async function runIndexer() {
  const args = process.argv.slice(2);
  const rawPaths =
    args.length > 0 ? args : [path.join(__dirname, "../sample_docs")];
  const home = os.homedir();
  const targetPaths = rawPaths.map((rawPath) => {
    let targetPath = rawPath.replace(/^~(?=$|\/|\\)/, home);
    const doubleHome = path.join(home, home);
    if (targetPath.startsWith(doubleHome))
      targetPath = targetPath.replace(doubleHome, home);
    return path.resolve(targetPath);
  });

  console.log(`\n======================================================`);
  console.log(`📂 Nookive Indexer: ${targetPaths.length}개 경로 색인 시작`);
  console.log(`======================================================\n`);

  const files = targetPaths.reduce(
    (all, targetPath) => scanIndexPath(targetPath, all),
    [],
  );
  console.log(
    `총 ${files.length}개의 색인 대상 파일을 발견했습니다 (PDF/문서/이미지/오디오/비디오).\n`,
  );

  const indexedRecords = [];
  const failedFiles = [];
  let processedFiles = 0;

  for (const file of files) {
    const recordCountBefore = indexedRecords.length;
    try {
      console.log(`⏳ 분석 중 [${file.ext.toUpperCase()}]: ${file.name}`);
      const fileExt = file.ext.toLowerCase();
      // 이미지 파일은 목록용 소형 썸네일을 미리 생성해 둔다.
      // (콘텐츠 주소 지정 캐시 → 재색인 시 재사용, 변경 시에만 재생성)
      let thumbnail = null;
      let preview = null;
      if (IMAGE_EXTS.includes(fileExt)) {
        const mt = file.mtime.getTime();
        thumbnail = generateDerived(
          file.fullPath,
          mt,
          file.size,
          THUMB_MAX,
          "t",
        );
        preview = generateDerived(
          file.fullPath,
          mt,
          file.size,
          PREVIEW_MAX,
          "p",
        );
      }
      const chunks = await extractContentFromFile(file);
      if (VIDEO_EXTS.includes(fileExt) && chunks[0]) {
        thumbnail = chunks[0].thumbnail;
        preview = chunks[0].preview;
      }
      // 오디오/비디오는 파일 단위 duration을 함께 저장해 미리보기 seek에 쓴다.
      const durationSeconds = chunks.find(
        (chunk) => chunk.durationSeconds !== undefined,
      )?.durationSeconds;

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const snippet = chunk.text;
        // 멀티모달 세그먼트는 이미 vector를 가짐. 텍스트 청크만 텍스트 임베딩 수행.
        const embedding =
          chunk.vector ?? (await fetchEmbedding(snippet, file.name));
        // STT 전사 텍스트는 별도 텍스트 벡터로 저장해 정확 단어 검색에 쓴다.
        let textVector;
        if (chunk.transcript) {
          try {
            textVector = await fetchEmbedding(chunk.transcript, file.name);
          } catch {
            // 임베딩 서버가 없으면 전사 벡터만 건너뛴다.
          }
        }

        const ext = file.ext.toLowerCase();
        let category = "document";
        if (
          IMAGE_EXTS.includes(ext) ||
          AUDIO_EXTS.includes(ext) ||
          VIDEO_EXTS.includes(ext)
        ) {
          category = "media";
        } else if (
          ["ts", "tsx", "js", "jsx", "py", "json", "rs", "go"].includes(ext)
        ) {
          category = "code";
        }

        const bestChunk = { chunkIndex: i, textSnippet: snippet };
        if (chunk.pageNumber !== undefined)
          bestChunk.pageNumber = chunk.pageNumber;
        if (chunk.lineStart !== undefined) {
          bestChunk.lineStart = chunk.lineStart;
          bestChunk.lineEnd = chunk.lineEnd;
        }
        if (chunk.timestampSeconds !== undefined) {
          bestChunk.timestampSeconds = chunk.timestampSeconds;
        }
        if (chunk.transcript) {
          bestChunk.transcript = chunk.transcript;
        }
        if (chunk.words) {
          // extractAudioChunks가 이미 파일 절대 시각으로 변환해 두었다.
          bestChunk.words = chunk.words;
        }

        indexedRecords.push({
          id: `${file.fullPath}#${i}`,
          file: {
            name: file.name,
            path: file.fullPath,
            extension: file.ext,
            sizeBytes: file.size,
            modifiedAt: file.mtime
              .toISOString()
              .replace("T", " ")
              .substring(0, 16),
            ...(durationSeconds !== undefined ? { durationSeconds } : {}),
            ...(thumbnail ? { thumbnail } : {}),
            ...(preview ? { preview } : {}),
          },
          bestChunk,
          category,
          vector: embedding, // 768차원 (텍스트/이미지/오디오 공통 공간)
          ...(textVector ? { textVector } : {}),
        });
      }
    } catch (err) {
      if (/ENOSPC|no space left|disk full|not enough space|os error 28/i.test(String(err))) {
        throw err;
      }
      failedFiles.push(file.name);
      console.warn(`  ⚠️ 파일 색인 실패 (${file.name}): ${err.message}`);
    }
    processedFiles += 1;
    console.log(
      `NOOKIVE_PROGRESS:${JSON.stringify({
        completed: processedFiles,
        total: files.length,
        path: file.fullPath,
        indexed: indexedRecords.length > recordCountBefore,
      })}`,
    );
  }

  // 캐시 상한 초과분 정리 (오래된 썸네일부터 제거)
  pruneThumbnailCache();

  const outputPath =
    process.env.NOOKIVE_INDEX_OUTPUT ||
    path.join(__dirname, "../public/search_index.json");
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  fs.writeFileSync(
    outputPath,
    JSON.stringify(indexedRecords, null, 2),
    "utf-8",
  );
  console.log(
    `\n✅ 인덱싱 완료! 총 ${indexedRecords.length}개의 청크 벡터가 저장되었습니다.`,
  );
  if (failedFiles.length > 0) {
    console.log(
      `⚠️ 처리하지 못한 파일 ${failedFiles.length}개는 pending 상태로 남겨 재시도합니다.`,
    );
  }
  console.log(`저장 경로: ${outputPath}\n`);
}

// 예외를 출력만 하고 성공 코드(0)로 종료하면 Rust 브리지가 결과 파일을
// 읽으려다 원인 없는 "파일 없음" 오류로 바뀐다. 반드시 실패 코드로
// 종료해 stderr가 상위 계층까지 전달되도록 한다.
runIndexer().catch((error) => {
  console.error("❌ 인덱서 실행 실패:", error?.stack || error);
  process.exitCode = 1;
});
