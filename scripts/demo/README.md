# Demo recording

Scripts that produce the README demo (`docs/assets/nookive-demo.gif`). The demo
is recorded in a separate macOS user account so that no personal files or apps
appear on screen. Every document, recording, and code file in it is made up;
the photos come from Crossmodal-3600 (CC BY 2.0). The main README credits the
photos that appear in the demo, and every photo's author and source is listed
in `photos` in `build-demo-files.mjs`.

| File | Purpose |
| --- | --- |
| `build-demo-files.mjs` | Builds the demo folder: notes, recipes, PDFs, podcasts (macOS `say`), a small code project, and about 30 photos, so each query shows a full result list |
| `documents.mjs` | Content of the demo PDFs (a fictional company's reports, a lease, an invoice, a manual, and an insurance summary) |
| `render-document.swift` | Renders `documents.mjs` into A4 PDFs |
| `setup.sh` | Installs Nookive, links the models, and registers `~/Documents` in the demo account |
| `update-app.sh` | Replaces only the app in the demo account with a new build |
| `storyboard.applescript` | The scenes: an app, a question answered by a PDF page, photos, a podcast moment, quick answers (weather, time zones, currency, dates), and a Korean query |
| `record.sh` | Runs the storyboard once to warm caches, then records it with `screencapture` |
| `edit-video.py` | Cuts, speeds up typing, zooms into the PDF scene, and adds captions |

## Steps

In your main account, prepare the shared folder `/Users/Shared/NookiveDemo`:

```bash
npm run eval:public:prepare -- xm3600
node scripts/demo/build-demo-files.mjs
npm run tauri build
# The build only keeps the DMG (bundle target "dmg"), so copy the app out of it.
hdiutil attach -nobrowse -readonly -mountpoint /tmp/nookive-dmg src-tauri/target/release/bundle/dmg/Nookive_*_aarch64.dmg
rm -rf /Users/Shared/NookiveDemo/Nookive.app
cp -R /tmp/nookive-dmg/Nookive.app /Users/Shared/NookiveDemo/
hdiutil detach /tmp/nookive-dmg
cp -R ~/Library/Application\ Support/com.nookive.search/models /Users/Shared/NookiveDemo/
cp scripts/demo/*.sh scripts/demo/storyboard.applescript /Users/Shared/NookiveDemo/
chmod -R a+rX /Users/Shared/NookiveDemo
```

Then sign in to the demo account (English UI, ABC keyboard layout), allow
Terminal under Screen Recording and Accessibility, and run:

```bash
/Users/Shared/NookiveDemo/setup.sh
/Users/Shared/NookiveDemo/record.sh
```

Back in the main account, edit the take and convert it to a GIF (needs
`ffmpeg` and Pillow):

```bash
python3 scripts/demo/edit-video.py /Users/Shared/NookiveDemo/recordings/take-<time>.mov demo.mp4 800
ffmpeg -i demo.mp4 -vf "fps=24,split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" docs/assets/nookive-demo.gif
```

The cut points and zoom area in `edit-video.py` match the current storyboard on
a 3456×2234 display. Adjust them if you change either one.
