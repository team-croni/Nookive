# Nookive

**Describe it. Find it.**

Maintained by [Croni](https://github.com/team-croni). Source code and releases
are hosted at [team-croni/Nookive](https://github.com/team-croni/Nookive).

This is an open-source project for macOS. It is not distributed through the
Apple App Store and release builds are not Apple-notarized.

[Download Nookive for macOS (Apple Silicon)](https://github.com/team-croni/Nookive/releases) · [View all releases](https://github.com/team-croni/Nookive/releases)

Nookive is an open-source, on-device semantic search app for macOS. Search
your documents, images, recordings, videos, and code by describing what you
remember instead of guessing a filename. Nookive runs the embedding pipeline
locally with EmbeddingGemma 2 and llama.cpp.

> Your indexed content stays on your Mac. Nookive does not require an account
> or a hosted AI service. Model downloads and Google autocomplete/web-search
> actions are network operations; they are separate from local indexing.

## What it can find

- Semantic matches such as “the clause about pets in the lease” or “payment
  declined screenshot”.
- PDF pages, Markdown/text files, JSON, and source code.
- Images by visual content, with macOS Vision labels/OCR where available.
- Audio and video by content, with results pointing to a relevant time range.
- Installed macOS applications by display name and bundle identifier.
- Exact terms and filenames alongside semantic ranking.

PDF results are scanned in the background so a result can show the page where
the query was found before it is opened. When a PDF is opened, Nookive uses
the first page containing the query when the document has a readable text
layer, highlights the matching text, and shows the current page and total page
count. PDF scan results are cached for the same document and query.

On macOS, PDF pages can be rendered through the native Core Graphics renderer.
Documents without a usable text layer can still be previewed, but they may
not have a matching page or text highlight.

## Status and platform

Nookive is an early-stage macOS desktop application. The current build targets
Apple Silicon and macOS 14 or later. Windows and Linux are not supported yet.
Audio transcription and forced alignment are optional components and may have
additional model or platform requirements.

## Install a release

Download the latest macOS Apple Silicon DMG from [GitHub Releases](https://github.com/team-croni/Nookive/releases), open the DMG,
and move Nookive to Applications. Until Apple Developer signing and
notarization are added, a downloaded release may show a macOS security warning;
users may need to use Control-click → Open or approve it in Privacy & Security.
On first launch, Nookive opens the in-app installer if the local model bundle
is missing. The current installer prepares the search and speech model
components together; speech transcription and word-level timestamps remain
optional features at runtime. No terminal command is needed. Models are stored
in macOS Application Support and remain on your Mac.
The source repository and DMG exclude model weights; check the release notes
and [third-party notices](THIRD_PARTY_NOTICES.md) before redistribution.

Nookive runs as a macOS menu-bar utility. It stays available from the menu bar
and global shortcut without appearing in the Dock or the `Cmd + Tab` app switcher.

## Build from source

Requirements: macOS on Apple Silicon, Node.js 20.19+ (or 22.12+), Rust, Xcode/Swift toolchain,
and the Tauri prerequisites.

```sh
npm ci
npm run build
npm run lint
npm run desktop
```

For local semantic indexing, download the model files first:

```sh
npm run model:download
```

Optional media and speech helpers are prepared with:

```sh
npm run media:build
npm run asr:download
npm run aligner:build
```

The exact script names available in this checkout can be listed with
`npm run`. A production DMG is built with:

```sh
npm run tauri -- build --bundles dmg
```

The bundle preparation step expects the helper binaries to be present. Models
are intentionally downloaded after installation rather than committed to this
repository or embedded in the DMG; see
`THIRD_PARTY_NOTICES.md`.

The DMG intentionally contains no model weights. On first launch, the app
downloads and verifies the model components required by the installer. Model
downloads can be stopped, paused, resumed, or reset from the installer window
and menu-bar tray menu.

### File access on macOS

Nookive follows macOS file-access permissions. If a selected file or PDF
cannot be opened, grant the app access to the folder containing it and restart
the app if necessary. The supported user-folder scopes include:

- `~/Documents`
- `~/Desktop`
- `~/Downloads`
- `~/Pictures`

## Environment variables

No `.env` file is required. Nookive is a local desktop app rather than a web
service, so runtime settings are passed as ordinary process environment
variables when needed. Copying `.env.example` is optional and does not add any
secrets. Supported tuning variables include `NOOKIVE_PORT`,
`NOOKIVE_CPU_ONLY`, and `NOOKIVE_CTX_SIZE`.

Never put API keys, signing credentials, Apple notarization passwords, or
personal file paths in a committed environment file. Use your shell, macOS
Keychain, or CI secret storage for those values.

## Privacy and data handling

Nookive reads only folders selected by the user and stores its local index in
the application data directory. It does not upload indexed file contents. If
you use autocomplete or web search, the typed query is sent to Google and the
selected URL is opened in your browser. The temporary embedding server listens
on loopback (`127.0.0.1`) and should not be exposed publicly. Local indexes,
logs, model caches, and selected paths may be sensitive and should be handled
accordingly.

## Documentation

- [System architecture](docs/system-architecture.md)
- [Indexer pipeline](docs/indexer-pipeline.md)
- [Settings and menu bar](docs/settings-and-menu-bar.md)
- [Documentation index](docs/README.md)
- [Open-source release checklist](docs/release-checklist.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) for development conventions and
[SECURITY.md](SECURITY.md) for private vulnerability reporting.

## Acknowledgements

Nookive is built with Tauri, React, Vite, llama.cpp, EmbeddingGemma 2, and
other open-source components. Their licenses and upstream links are listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Nookive is not affiliated
with Google or Apple. EmbeddingGemma/Gemma, macOS, and Apple are trademarks of
their respective owners.

## License

Nookive's original source code is available under the [MIT License](LICENSE).
Third-party components and downloaded model files remain under their own terms.
