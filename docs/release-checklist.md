# Open-source release checklist

This checklist is intentionally kept in the repository so each release can be
audited consistently.

## Before the first public push

- [x] Add the repository URL under the `team-croni` GitHub organization to
      documentation and package metadata.
- [ ] Confirm the maintainer name and copyright holder in `LICENSE`.
- [ ] Confirm that the app name, icon, screenshots, sample documents, and
      bundled fonts/assets can be redistributed.
- [ ] Review `THIRD_PARTY_NOTICES.md` against the exact model, binary, and
      dependency versions shipped in the release.
- [ ] Run secret scanning over the complete history before making the first
      push (`gitleaks`, GitHub secret scanning, or an equivalent tool).
- [ ] Verify that `.gitignore` excludes models, binaries, caches, indexes,
      `.env` files, credentials, and build output.
- [x] Models are downloaded on first run through the app UI; they are not
      embedded in the DMG. Do not silently claim that every downloaded asset is MIT.
- [ ] Confirm every release asset stays below GitHub's 2 GiB per-file limit;
      the DMG should remain model-free and the app should download weights on
      first run.

- [ ] Confirm that the first public release is macOS Apple Silicon only. Do not
      publish Windows or Linux download links until those builds are implemented
      and tested.

## Before each release

- [ ] `npm ci`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `cargo check --manifest-path src-tauri/Cargo.toml`
- [ ] Build and launch the macOS app on a clean Apple Silicon machine.
- [ ] Test folder selection, indexing, deletion/rescan, PDF preview, media
      seeking, global shortcut, reset, and offline operation.
- [ ] Confirm that no indexed file contents, paths, or credentials are sent to
      a remote service. Review any network code added since the prior release.
- [ ] For the current unsigned distribution plan, build the release artifact,
      publish SHA-256 checksums, and document the macOS first-launch warning.
- [ ] If Apple Developer signing is added later, switch this step to a
      Developer ID-signed and notarized artifact.
- [ ] Create release notes with known limits, supported macOS versions, and
      model/dependency changes.
