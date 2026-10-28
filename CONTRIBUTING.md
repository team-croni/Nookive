# Contributing to Nookive

Thanks for helping improve Nookive. Small, focused pull requests are easiest
to review.

## Development

1. Install Node.js 20.19+ (or 22.12+), Rust, Xcode command-line tools, and the Tauri
   prerequisites for macOS.
2. Install JavaScript dependencies with `npm ci`.
3. Fetch local models with `npm run model:download` when working on indexing.
4. Run the web UI with `npm run dev` or the desktop app with `npm run desktop`.

Before opening a pull request, run `npm run build` and `npm run lint`. Changes
to Rust code should also be checked with `cargo check --manifest-path
src-tauri/Cargo.toml`.

Do not commit model files, generated binaries, build output, local indexes,
`.env` files, credentials, or personal documents.

When you add, remove, or upgrade a bundled dependency, helper binary, or
downloaded model, update `THIRD_PARTY_NOTICES.md` and run `npm run licenses`
to check that the generated license file still covers it. See the "Updating
this file" section of `THIRD_PARTY_NOTICES.md`.

## Pull requests

Describe the user-visible change, test commands, platform assumptions, and any
privacy or licensing implications. Keep unrelated formatting changes out of
the same pull request. Follow the commit message rules in
`.github/COMMIT_CONVENTION.md`.
