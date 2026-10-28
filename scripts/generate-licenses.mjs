#!/usr/bin/env node
// scripts/generate-licenses.mjs
// 앱 번들(DMG)에 함께 배포되는 제3자 구성요소의 라이선스 전문을 하나의 파일로 모은다.
//
// 출력: bin/licenses/
//   - THIRD_PARTY_LICENSES.txt  자동 생성된 라이선스 전문 (앱 About 화면에서 연다)
//   - THIRD_PARTY_NOTICES.md    저장소의 요약 고지 사본
//   - LICENSE.txt               Nookive 자체 MIT 라이선스 사본
//
// 수집 대상
//   1. 네이티브 프로그램: Node.js 런타임, llama.cpp/ggml, qwen3-asr.cpp/ggml, Skia/FreeType
//      (bin/licenses/upstream/* 은 build-llama-metal.sh, build-aligner.sh,
//       prepare-bundle.sh 가 업스트림 소스에서 복사한다)
//   2. JavaScript 패키지: package-lock.json 의 프로덕션 의존성
//      (프론트엔드 번들 + 앱 리소스로 복사되는 node_modules)
//   3. Rust 크레이트: aarch64-apple-darwin 대상 앱 바이너리에 링크되는 크레이트
//
// --strict: 배포 빌드용. 네이티브 구성요소 라이선스가 하나라도 없으면 실패한다.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(PROJECT_DIR, 'bin', 'licenses');
const UPSTREAM_DIR = path.join(OUT_DIR, 'upstream');
const SPDX_DIR = path.join(PROJECT_DIR, 'licenses', 'spdx');
const VENDOR_DIR = path.join(PROJECT_DIR, 'licenses', 'vendor');
const RUST_TARGET = 'aarch64-apple-darwin';
const STRICT = process.argv.includes('--strict');

const LICENSE_FILE_PATTERN = /^(licen[cs]e|copying|notice|copyright|unlicense)([-._].*)?$/i;
// 파일이 없는 패키지에 SPDX 원문을 붙일 때의 선호 순서 (선택 가능한 라이선스 중 첫 번째)
const SPDX_PREFERENCE = ['MIT', 'Apache-2.0', 'BSD-3-Clause', 'Zlib', 'MPL-2.0'];
const RULE = '='.repeat(78);
const SUBRULE = '-'.repeat(78);

const warnings = [];
const errors = [];

const readText = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').trimEnd();
const normalize = (text) => text.replace(/\s+/g, ' ').trim();
const hash = (text) => createHash('sha256').update(normalize(text)).digest('hex');

const APACHE_TEXT = readText(path.join(SPDX_DIR, 'Apache-2.0.txt'));

/// 업스트림마다 줄바꿈·부록만 다른 Apache-2.0 원문을 SPDX 표준 원문으로 통일하고,
/// 실제 저작권 표시 줄만 보존한다. 같은 문서끼리 묶여 출력 크기가 크게 줄어든다.
function canonicalizeApache(text) {
  // 파일 전체가 Apache-2.0 원문인 경우만 다룬다. 다른 라이선스 안에 Apache 원문이
  // 포함된 문서(예: Node.js LICENSE)는 손대지 않는다.
  const head = text.trimStart().slice(0, 400);
  if (!/Apache License\s+Version 2\.0, January 2004/.test(head)) return text;
  if (text.length > APACHE_TEXT.length + 4000) return text;
  if (/Permission is hereby granted|Redistribution and use|ISC License/.test(text)) return text;
  const copyrights = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^Copyright\s+(\(c\)|©|\d)/i.test(line) && !/\[yyyy\]|\[name of copyright owner\]/.test(line));
  return copyrights.length > 0 ? `${copyrights.join('\n')}\n\n${APACHE_TEXT}` : APACHE_TEXT;
}

/// "MIT OR Apache-2.0" 처럼 선택 가능한 라이선스는 하나만 골라 그 파일만 싣는다.
/// 라이선스 이름이 파일명에 드러나지 않으면 모든 파일을 그대로 싣는다.
const FILE_HINTS = { MIT: /mit/i, 'Apache-2.0': /apache/i, Zlib: /zlib/i, 'BSD-3-Clause': /bsd/i, ISC: /isc/i, Unlicense: /unlicense/i };
const CHOICE_PREFERENCE = ['MIT', 'Apache-2.0', 'ISC', 'Zlib', 'BSD-3-Clause', 'Unlicense'];

function selectFiles(files, expression) {
  const expr = String(expression ?? '');
  if (/\sAND\s/.test(expr) || !/\sOR\s|\//.test(expr)) return files;
  const ids = expr.split(/\s+OR\s+|\//).map((id) => id.replace(/[()]/g, '').trim());
  const hinted = (file) => Object.values(FILE_HINTS).some((hint) => hint.test(file.name));
  for (const id of CHOICE_PREFERENCE) {
    if (!ids.includes(id)) continue;
    const matching = files.filter((file) => FILE_HINTS[id].test(file.name));
    if (matching.length > 0) return [...matching, ...files.filter((file) => !hinted(file))];
  }
  return files;
}

function licenseFilesIn(dir, { canonical = true } = {}) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && LICENSE_FILE_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .map((name) => {
      const text = readText(path.join(dir, name));
      return { name, text: canonical ? canonicalizeApache(text) : text };
    });
}

/// "MIT OR Apache-2.0", "MIT/Apache-2.0" 같은 표현에서 SPDX 원문이 있는 ID를 고른다.
function spdxFallback(expression, holders) {
  const ids = String(expression ?? '')
    .split(/\s+OR\s+|\s+AND\s+|\/|[()]/)
    .map((id) => id.trim())
    .filter(Boolean);
  const isConjunction = /\sAND\s/.test(String(expression ?? ''));
  const chosen = isConjunction
    ? ids.filter((id) => SPDX_PREFERENCE.includes(id))
    : SPDX_PREFERENCE.filter((id) => ids.includes(id)).slice(0, 1);
  if (chosen.length === 0) return null;
  const holder = holders || 'the authors';
  return chosen
    .map((id) => {
      const text = readText(path.join(SPDX_DIR, `${id}.txt`))
        .replace('<year> <copyright holders>', holder)
        .replace('<year> <owner>', holder);
      return { name: `${id} (SPDX standard text; the package ships no license file)`, text };
    });
}

function section(title) {
  return `\n${RULE}\n${title}\n${RULE}\n`;
}

function renderFiles(files) {
  return files.map(({ name, text }) => `--- ${name} ---\n\n${text}\n`).join('\n');
}

// ---------------------------------------------------------------------------
// 1. 네이티브 프로그램
// ---------------------------------------------------------------------------

function readVersion(dir) {
  const file = path.join(dir, 'VERSION');
  return fs.existsSync(file) ? readText(file) : 'unknown';
}

function nativeComponent({ title, ships, dir, fallback, hint }) {
  // 네이티브 구성요소의 라이선스는 업스트림 원문 그대로 싣는다.
  let files = licenseFilesIn(dir, { canonical: false });
  const extraDir = path.join(dir, 'licenses');
  if (fs.existsSync(extraDir)) {
    files = files.concat(licenseFilesIn(extraDir, { canonical: false }).map((f) => ({ ...f, name: `licenses/${f.name}` })));
    // llama.cpp 의 licenses/ 디렉터리는 LICENSE-<name> 형식이 아닌 파일도 담는다.
    for (const entry of fs.readdirSync(extraDir)) {
      if (!files.some((f) => f.name === `licenses/${entry}`) && fs.statSync(path.join(extraDir, entry)).isFile()) {
        files.push({ name: `licenses/${entry}`, text: readText(path.join(extraDir, entry)) });
      }
    }
  }
  if (files.length === 0 && fallback) {
    files = fallback.map((file) => ({ name: path.basename(file), text: readText(file) }));
  }
  if (files.length === 0) {
    const message = `${title}: 라이선스 파일이 없습니다 (${path.relative(PROJECT_DIR, dir)}). ${hint}`;
    (STRICT ? errors : warnings).push(message);
    return `${section(title)}Ships as: ${ships}\n\nLICENSE TEXT MISSING — run the matching build script before bundling.\n`;
  }
  return `${section(title)}Ships as: ${ships}\nSource version: ${readVersion(dir)}\n\n${renderFiles(files)}`;
}

function nativeSection() {
  const parts = [
    nativeComponent({
      title: 'Node.js',
      ships: 'bin/node (JavaScript runtime used by the indexer)',
      dir: path.join(UPSTREAM_DIR, 'node'),
      hint: 'npm run bundle:prepare 가 Node.js LICENSE 를 복사합니다.',
    }),
    nativeComponent({
      title: 'llama.cpp / ggml',
      ships: 'bin/llama-server and bin/lib{llama,llama-common,mtmd,ggml*}.dylib (embedding and speech sidecar)',
      dir: path.join(UPSTREAM_DIR, 'llama.cpp'),
      hint: 'npm run build:llama-metal 을 다시 실행하세요.',
    }),
    nativeComponent({
      title: 'qwen3-asr.cpp',
      ships: 'bin/qwen3-asr-cli (word-level forced alignment)',
      dir: path.join(UPSTREAM_DIR, 'qwen3-asr.cpp'),
      hint: 'npm run aligner:build 를 다시 실행하세요.',
      // femelo/qwen3-asr.cpp 포크는 README 에 MIT 를 표기하지만 LICENSE 파일이 없다.
      // 원본 저장소(predict-woo/qwen3-asr.cpp)의 LICENSE 를 사용한다.
      fallback: [path.join(VENDOR_DIR, 'qwen3-asr.cpp.LICENSE')],
    }),
    nativeComponent({
      title: 'ggml (bundled with qwen3-asr.cpp)',
      ships: 'bin/qwen3-asr-libs/libggml*.dylib',
      dir: path.join(UPSTREAM_DIR, 'qwen3-asr.cpp', 'ggml'),
      hint: 'npm run aligner:build 를 다시 실행하세요.',
    }),
    `${section('Skia and FreeType (statically linked into @napi-rs/canvas)')}` +
      'Ships as: node_modules/@napi-rs/canvas-darwin-arm64/*.node (used by pdf-parse)\n' +
      'Portions of this software are copyright (c) The FreeType Project (www.freetype.org).\n' +
      'All rights reserved.\n' +
      'The Skia native module may also contain other third-party libraries listed in\n' +
      'https://github.com/google/skia/tree/main/third_party.\n\n' +
      renderFiles([
        { name: 'Skia LICENSE', text: readText(path.join(VENDOR_DIR, 'skia.LICENSE')) },
        { name: 'FreeType License (FTL)', text: readText(path.join(VENDOR_DIR, 'freetype.FTL.txt')) },
      ]),
    `${section('Rust standard library')}` +
      'Linked into the Nookive application binary.\n' +
      'Copyright (c) The Rust Project Developers. Licensed under MIT OR Apache-2.0;\n' +
      'see the MIT and Apache-2.0 texts in Part 3.\n',
  ];
  return `${section('PART 1. BUNDLED NATIVE PROGRAMS')}${parts.join('')}`;
}

// ---------------------------------------------------------------------------
// 2. JavaScript 패키지
// ---------------------------------------------------------------------------

function matchesPlatform(list, value) {
  if (!Array.isArray(list) || list.length === 0) return true;
  const denied = list.filter((item) => item.startsWith('!')).map((item) => item.slice(1));
  if (denied.includes(value)) return false;
  const allowed = list.filter((item) => !item.startsWith('!'));
  return allowed.length === 0 || allowed.includes(value);
}

function npmPackages() {
  const lock = JSON.parse(fs.readFileSync(path.join(PROJECT_DIR, 'package-lock.json'), 'utf8'));
  // 선택(optional) 의존성은 앱 리소스로 복사되는 경우에만 배포된다.
  // 예: pdfjs-dist 의 Node 전용 @napi-rs/canvas 는 브라우저 번들에 들어가지 않는다.
  const tauriConfig = JSON.parse(fs.readFileSync(path.join(PROJECT_DIR, 'src-tauri', 'tauri.conf.json'), 'utf8'));
  const bundledModules = Object.keys(tauriConfig.bundle?.resources ?? {})
    .filter((source) => source.startsWith('../node_modules/'))
    .map((source) => source.slice('../'.length));
  const isBundled = (key) => bundledModules.some((dir) => key === dir || key.startsWith(`${dir}/`));
  const packages = [];
  for (const [key, info] of Object.entries(lock.packages)) {
    if (!key || info.dev || info.devOptional) continue;
    if (info.optional && !isBundled(key)) continue;
    // 배포 대상은 macOS Apple Silicon 뿐이다.
    if (!matchesPlatform(info.os, 'darwin') || !matchesPlatform(info.cpu, 'arm64')) continue;
    const name = key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
    const dir = path.join(PROJECT_DIR, key);
    let manifest = {};
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    }
    const author = typeof manifest.author === 'string' ? manifest.author : manifest.author?.name;
    let files = selectFiles(licenseFilesIn(dir), info.license);
    if (files.length === 0) {
      if (!fs.existsSync(dir)) {
        warnings.push(`npm ${name}@${info.version}: node_modules 에 설치되어 있지 않아 SPDX 원문을 사용합니다.`);
      }
      files = spdxFallback(info.license, author) ?? [];
    }
    if (files.length === 0) errors.push(`npm ${name}@${info.version}: 라이선스(${info.license})를 확인할 수 없습니다.`);
    packages.push({ label: `${name}@${info.version} (${info.license ?? 'UNKNOWN'})`, files });
  }
  return packages;
}

// ---------------------------------------------------------------------------
// 3. Rust 크레이트
// ---------------------------------------------------------------------------

function rustCrates() {
  const metadata = JSON.parse(
    execFileSync(
      'cargo',
      [
        'metadata',
        '--format-version', '1',
        '--locked',
        '--filter-platform', RUST_TARGET,
        '--manifest-path', path.join(PROJECT_DIR, 'src-tauri', 'Cargo.toml'),
      ],
      { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] },
    ),
  );
  const packagesById = new Map(metadata.packages.map((pkg) => [pkg.id, pkg]));
  const nodesById = new Map(metadata.resolve.nodes.map((node) => [node.id, node]));
  const root = metadata.resolve.root;

  // 일반(normal) 의존성만 따라간다. dev/build 전용 크레이트는 앱 바이너리에 들어가지 않는다.
  const linked = new Set();
  const stack = [root];
  while (stack.length > 0) {
    const id = stack.pop();
    if (linked.has(id)) continue;
    linked.add(id);
    for (const dep of nodesById.get(id).deps) {
      if (dep.dep_kinds.some((kind) => kind.kind === null)) stack.push(dep.pkg);
    }
  }
  linked.delete(root);

  return [...linked]
    .map((id) => packagesById.get(id))
    .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))
    .map((pkg) => {
      const dir = path.dirname(pkg.manifest_path);
      let files = selectFiles(licenseFilesIn(dir), pkg.license);
      if (pkg.license_file && fs.existsSync(path.join(dir, pkg.license_file))) {
        const name = path.basename(pkg.license_file);
        if (!files.some((f) => f.name === name)) files.push({ name, text: readText(path.join(dir, pkg.license_file)) });
      }
      if (files.length === 0) files = spdxFallback(pkg.license, pkg.authors?.join(', ')) ?? [];
      if (files.length === 0) errors.push(`crate ${pkg.name} ${pkg.version}: 라이선스(${pkg.license})를 확인할 수 없습니다.`);
      // MPL-2.0 은 소스 코드 입수 방법을 알려야 한다.
      const source = `https://crates.io/crates/${pkg.name}/${pkg.version}`;
      const isMpl = /MPL-2\.0/.test(pkg.license ?? '') && !/\sOR\s|\//.test(pkg.license ?? '');
      return {
        label: `${pkg.name} ${pkg.version} (${pkg.license ?? 'UNKNOWN'})${isMpl ? ` — source: ${source}` : ''}`,
        files,
      };
    });
}

/// 같은 라이선스 문서를 공유하는 패키지들을 묶어 출력 크기를 줄인다.
function groupedSection(title, intro, entries) {
  const groups = new Map();
  for (const entry of entries) {
    const key = entry.files.map((f) => hash(f.text)).join(':');
    if (!groups.has(key)) groups.set(key, { files: entry.files, labels: [] });
    groups.get(key).labels.push(entry.label);
  }
  const body = [...groups.values()]
    .map(
      (group) =>
        `${SUBRULE}\nThe following packages are distributed under the license text below:\n\n` +
        `${group.labels.map((label) => `  - ${label}`).join('\n')}\n\n${renderFiles(group.files)}`,
    )
    .join('\n');
  return `${section(title)}${intro}\n\n${body}`;
}

// ---------------------------------------------------------------------------

function main() {
  const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_DIR, 'package.json'), 'utf8'));
  const npm = npmPackages();
  const crates = rustCrates();

  const header =
    `Nookive ${pkg.version} — Third-party software licenses\n\n` +
    'This file is generated by scripts/generate-licenses.mjs. Do not edit it by hand.\n' +
    "Nookive's own source code is licensed under the MIT License (LICENSE.txt).\n" +
    'The components below are separate works distributed with Nookive under their own\n' +
    'licenses. Model weights are not bundled; they are downloaded after installation\n' +
    'and listed in THIRD_PARTY_NOTICES.md together with their terms.\n';

  const output = [
    header,
    nativeSection(),
    groupedSection(
      'PART 2. JAVASCRIPT PACKAGES',
      'Included in the web UI bundle or copied into the application resources.',
      npm,
    ),
    groupedSection(
      'PART 3. RUST CRATES',
      `Statically linked into the Nookive application binary (${RUST_TARGET}).`,
      crates,
    ),
  ].join('\n');

  for (const message of warnings) console.warn(`⚠️  ${message}`);
  if (errors.length > 0) {
    for (const message of errors) console.error(`❌ ${message}`);
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'THIRD_PARTY_LICENSES.txt'), `${output.trimEnd()}\n`);
  fs.copyFileSync(path.join(PROJECT_DIR, 'THIRD_PARTY_NOTICES.md'), path.join(OUT_DIR, 'THIRD_PARTY_NOTICES.md'));
  fs.copyFileSync(path.join(PROJECT_DIR, 'LICENSE'), path.join(OUT_DIR, 'LICENSE.txt'));

  console.log(`✅ 라이선스 고지 생성: ${path.relative(PROJECT_DIR, OUT_DIR)}/THIRD_PARTY_LICENSES.txt`);
  console.log(`   JavaScript 패키지 ${npm.length}개, Rust 크레이트 ${crates.length}개`);
}

main();
