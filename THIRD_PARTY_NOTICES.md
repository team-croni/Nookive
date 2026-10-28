# Third-party notices

Nookive's own source code is released under the [MIT License](LICENSE). The
components below are separate works and remain under their own licenses. The
MIT License for Nookive does not relicense any of them.

This file is the human-readable summary. The full license texts of everything
shipped inside the app are generated at build time into
`bin/licenses/THIRD_PARTY_LICENSES.txt` by `scripts/generate-licenses.mjs`,
bundled into `Nookive.app`, and opened from **Settings → About → Open-source
licenses**. Run `npm run licenses` to generate the file locally.

## Bundled in the app (DMG)

### Native programs

| Component | Version | Shipped as | Use in Nookive | License |
| --- | --- | --- | --- | --- |
| [Node.js](https://github.com/nodejs/node) | Version of the `node` used by `npm run bundle:prepare` | `bin/node` | Runs the indexer script | MIT, plus the licenses of its bundled dependencies (OpenSSL, V8, ICU, libuv and others) listed in its `LICENSE` |
| [llama.cpp](https://github.com/ggml-org/llama.cpp) / [ggml](https://github.com/ggml-org/ggml) | Source revision passed to `scripts/build-llama-metal.sh` (recorded in the generated file) | `bin/llama-server`, `bin/lib{llama,llama-common,mtmd,ggml*}.dylib` | Local server for embeddings and speech recognition | MIT, plus the files in upstream `licenses/` |
| [qwen3-asr.cpp](https://github.com/femelo/qwen3-asr.cpp) (fork of [predict-woo/qwen3-asr.cpp](https://github.com/predict-woo/qwen3-asr.cpp)) | `73295783e5c588139f0f15a17a18e8c7c161fc5f` (pinned in `scripts/build-aligner.sh`) | `bin/qwen3-asr-cli` | Word-level forced alignment | MIT. The fork has no `LICENSE` file, so the original repository's license is kept in `licenses/vendor/qwen3-asr.cpp.LICENSE` |
| [ggml](https://github.com/ggml-org/ggml) (submodule of qwen3-asr.cpp) | Submodule revision at the pinned commit | `bin/qwen3-asr-libs/libggml*.dylib` | Runtime for `qwen3-asr-cli` | MIT |
| [Skia](https://skia.org/) and [FreeType](https://freetype.org/) | Linked into `@napi-rs/canvas` | `node_modules/@napi-rs/canvas-darwin-arm64` | PDF page rendering inside `pdf-parse` | BSD-3-Clause (Skia), FreeType License (FTL) |
| Rust standard library | Toolchain used for the build | Nookive binary | Application runtime | MIT OR Apache-2.0 |

`bin/media-cli` and `bin/vision-cli` are built from Nookive's own sources
(`scripts/media-cli.swift`, `scripts/vision-cli.swift`) and link only Apple
system frameworks.

### JavaScript packages

Versions are pinned by `package-lock.json`. The generated file covers every
production dependency, transitive ones included.

| Component | Version | Use in Nookive | License |
| --- | --- | --- | --- |
| [React](https://react.dev/), React DOM | 19.3.0 | Web UI | MIT |
| [Tauri JS API](https://github.com/tauri-apps/tauri) and `plugin-dialog` | 2.12.3 / 2.8.3 | Calls between the UI and the desktop shell | Apache-2.0 OR MIT |
| [i18next](https://www.i18next.com/), [react-i18next](https://react.i18next.com/) | 26.5.4 / 17.1.0 | UI translations | MIT |
| [lucide-react](https://lucide.dev/) | 1.56.0 | UI icons | ISC |
| [PDF.js](https://github.com/mozilla/pdf.js) (`pdfjs-dist`) | 6.2.108 | PDF preview in the UI | Apache-2.0 |
| [pdf-parse](https://github.com/mehmet-kozan/pdf-parse) | 2.4.5 (ships `pdfjs-dist` 5.4.296) | PDF text extraction in the indexer | Apache-2.0 |
| [@napi-rs/canvas](https://github.com/Brooooooklyn/canvas) | 0.1.80 | Canvas for `pdf-parse` | MIT |

### Rust crates

About 290 crates are statically linked into the application binary. Among them
are [Tauri](https://tauri.app/) 2.12.3 (Apache-2.0 OR MIT),
[reqwest](https://github.com/seanmonstar/reqwest), [rustls](https://github.com/rustls/rustls),
[ring](https://github.com/briansmith/ring) (Apache-2.0 AND ISC) and
[webpki-roots](https://github.com/rustls/webpki-roots) (CDLA-Permissive-2.0).
The exact set comes from `src-tauri/Cargo.lock` for the `aarch64-apple-darwin`
target, and the generated file lists each crate with its license text.

A few crates (`cssparser`, `cssparser-macros`, `dtoa-short`, `option-ext`,
`selectors`) are under MPL-2.0. They are used unmodified, and their source code
is available from crates.io at the versions listed in the generated file.

## Downloaded after installation (not in the DMG)

On first launch the app downloads these files from their upstream locations,
checks their size and SHA-256 hash (pinned in `src-tauri/src/models.rs`), and
stores them in `~/Library/Application Support/com.nookive.search/models`.
Nookive does not redistribute them.

| Model / file | Downloaded from | Original model | Use in Nookive | License |
| --- | --- | --- | --- | --- |
| EmbeddingGemma 2 Q8_0 + mmproj | [ggml-org/embeddinggemma-2-GGUF](https://huggingface.co/ggml-org/embeddinggemma-2-GGUF) | [google/embeddinggemma-2](https://huggingface.co/google/embeddinggemma-2) | Text, image, audio and video-frame embeddings (required) | Apache-2.0. The model card also asks deployments to follow the [Gemma Prohibited Use Policy](https://ai.google.dev/gemma/prohibited_use_policy) |
| Qwen3-ASR-0.6B Q8_0 + mmproj | [ggml-org/Qwen3-ASR-0.6B-GGUF](https://huggingface.co/ggml-org/Qwen3-ASR-0.6B-GGUF) | [Qwen/Qwen3-ASR-0.6B](https://huggingface.co/Qwen/Qwen3-ASR-0.6B) | Speech recognition (speech bundle) | Apache-2.0 |
| Qwen3-ForcedAligner-0.6B Q8_0 | [OpenVoiceOS/qwen3-forced-aligner-0.6b-q8-0](https://huggingface.co/OpenVoiceOS/qwen3-forced-aligner-0.6b-q8-0) | [Qwen/Qwen3-ForcedAligner-0.6B](https://huggingface.co/Qwen/Qwen3-ForcedAligner-0.6B) | Word-level timestamps (speech bundle) | Apache-2.0 |
| `korean_dict_jieba.dict` | [qwen3-asr.cpp at the pinned commit](https://github.com/femelo/qwen3-asr.cpp/blob/73295783e5c588139f0f15a17a18e8c7c161fc5f/assets/korean_dict_jieba.dict) | — | Korean word splitting for alignment | Part of qwen3-asr.cpp (MIT) |

The installer shows the model sources and licenses before downloading. If you
redistribute these files yourself, include the upstream license and model card
with them.

## Build-only tools (not distributed)

Vite (MIT), TypeScript (Apache-2.0), oxlint (MIT), the Tauri CLI
(Apache-2.0 OR MIT), CMake and the Swift/Rust toolchains are used only to build
Nookive. They are not shipped in the app.

## Updating this file

When a dependency, helper binary or model changes:

1. Update the tables above, including versions and licenses.
2. Rebuild the changed helper with its script (`build-llama-metal.sh`,
   `build-aligner.sh`). Each script copies the upstream license into
   `bin/licenses/upstream/`.
3. Run `npm run licenses` and review the warnings. `npm run bundle:prepare`
   runs the same generator with `--strict` and fails if a native license text
   is missing.
