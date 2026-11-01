# Contributing to Nookive

Thanks for helping improve Nookive. Small, focused pull requests are easiest
to review.

## Development

1. Install Node.js 20.19+ (or 22.12+), Rust, Xcode command-line tools, and the Tauri
   prerequisites for macOS.
2. Install JavaScript dependencies with `npm ci`.
3. Fetch local models with `npm run model:download` when working on indexing.
4. Run the web UI with `npm run dev` or the desktop app with `npm run desktop`.

Before opening a pull request, run `npm run build`, `npm run lint`, and
`npm test`. Changes to Rust code should also be checked with `cargo check
--manifest-path src-tauri/Cargo.toml`.

### Search evaluation set

`npm test` includes a ranking regression test
(`src/features/search/evaluation/ranking.test.ts`). It runs the real ranking
pipeline on a synthetic corpus with precomputed vectors and fails when any
metric gets worse than `baseline.json`, overall or in either split:
Recall@5/10, MRR, nDCG@10, Precision@5, noise rate (unexpected results in the
top 10), location accuracy, or the no-answer false-positive rate.

- Each query in `queries.json` lists `relevant` paths (must appear) and
  optional `acceptable` paths (may appear without counting as noise).
- Queries are split into `dev` and `test`. Tune ranking while looking at `dev`
  results, then check that `test` improves too; a change that helps only `dev`
  is likely overfitting.
- The test output lists every query and a per-tag table (lookup, paraphrase,
  image, audio, …) so a weak area is not hidden in the average.
- Changing ranking on purpose: run `npm run eval:baseline` and commit the
  updated `baseline.json` with an explanation in the pull request.
- Adding queries to `queries.json` or changing `scripts/eval/corpus.mjs`: start
  the embedding server with `npm run sidecar`, then run `npm run eval:fixture`
  (macOS only; it also starts the ASR server if needed) and update the
  baseline.
- Changing the embedding model or indexer output: regenerate the fixture the
  same way.
- Before changing gates or thresholds, also run the public benchmarks
  (`npm run eval:public:prepare -- mixed`, then `npm run eval:public -- mixed`)
  and compare the results with `docs/search-evaluation.md`. They run locally
  only and download public datasets into `~/Library/Caches/nookive-eval/`.

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

Set a label, an assignee, and the upcoming release milestone on every pull
request and issue. Labels follow the commit type and drive the release-note
categories in `.github/release.yml`:

| Commit type | Label |
|---|---|
| `feat` | `enhancement` |
| `fix` | `bug` |
| `test` | `test` |
| `docs` | `documentation` |
| `chore`, `build` | `chore` |
| `ci` | `ci` |

Add `rust`, `javascript`, or `dependencies` when they apply.
