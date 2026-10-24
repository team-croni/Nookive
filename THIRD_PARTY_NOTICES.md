# Third-party notices

Nookive's own source code is released under the MIT License. The following
components are separate works and remain subject to their own licenses and
terms. Check the linked upstream license and model card before redistributing
an application bundle that contains them.

| Component | Use in Nookive | Upstream | License / notice |
| --- | --- | --- | --- |
| Tauri | Desktop shell | [tauri.app](https://tauri.app/) | MIT or Apache-2.0 |
| React, Vite, TypeScript | Web UI and build | [react.dev](https://react.dev/), [vite.dev](https://vite.dev/) | MIT |
| llama.cpp | Local embedding server | [github.com/ggml-org/llama.cpp](https://github.com/ggml-org/llama.cpp) | MIT |
| EmbeddingGemma 2 | Text/image/audio embeddings | [Google model card](https://huggingface.co/ggml-org/embeddinggemma-2-GGUF) | Apache-2.0; also follow the upstream model terms |
| Qwen3-ASR | Optional audio transcription | [Qwen model card](https://huggingface.co/Qwen/Qwen3-ASR-0.6B) and [GGUF conversion](https://huggingface.co/ggml-org/Qwen3-ASR-0.6B-GGUF) | Apache-2.0; also follow the upstream model terms |
| Qwen3-ForcedAligner | Optional word-level timestamps | [Qwen model card](https://huggingface.co/Qwen/Qwen3-ForcedAligner-0.6B) and [GGUF conversion](https://huggingface.co/OpenVoiceOS/qwen3-forced-aligner-0.6b-q8-0) | Apache-2.0; also follow the upstream model terms |
| qwen3-asr.cpp | Optional ASR/alignment helper | [github.com/femelo/qwen3-asr.cpp](https://github.com/femelo/qwen3-asr.cpp) | MIT; preserve the upstream notice when redistributing the helper |
| pdf-parse / PDF.js | PDF extraction and rendering | [pdf-parse](https://github.com/mehmet-kozan/pdf-parse), [PDF.js](https://github.com/mozilla/pdf.js) | Follow each upstream license and notice |
| lucide-react | UI icons | [lucide.dev](https://lucide.dev/) | ISC |

The `models/` and `bin/` directories are intentionally excluded from the Git
source distribution. Models are downloaded by the app after installation and
stored in the user's Application Support directory; platform-specific helper
build outputs are prepared locally for the DMG. Preserve all upstream notices
when redistributing downloaded models or helper binaries. The MIT license for
Nookive does not relicense those files.
