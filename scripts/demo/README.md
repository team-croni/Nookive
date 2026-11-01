# Demo recording

Scripts that produce the README demo (`docs/assets/nookive-demo.gif`). The demo
is recorded in a separate macOS user account so that no personal files or apps
appear on screen. Every document and recording in it is made up; the photos
come from Crossmodal-3600 (CC BY 2.0, credited in the main README).

| File | Purpose |
| --- | --- |
| `build-demo-files.mjs` | Builds the demo folder: notes, PDFs, podcasts (macOS `say`), and photos |
| `documents.mjs` | Content of the demo PDFs (a fictional company's annual reports and a lease) |
| `render-document.swift` | Renders `documents.mjs` into A4 PDFs |
| `setup.sh` | Installs Nookive, links the models, and registers `~/Documents` in the demo account |
| `update-app.sh` | Replaces only the app in the demo account with a new build |
| `storyboard.applescript` | The scenes: typed queries and key presses |
| `record.sh` | Runs the storyboard once to warm caches, then records it with `screencapture` |
| `edit-video.py` | Cuts, speeds up typing, zooms into the PDF scene, and adds captions |

## Steps

In your main account, prepare the shared folder `/Users/Shared/NookiveDemo`:

```bash
npm run eval:public:prepare -- xm3600
node scripts/demo/build-demo-files.mjs
npm run tauri build
cp -R src-tauri/target/release/bundle/macos/Nookive.app /Users/Shared/NookiveDemo/
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
ffmpeg -i demo.mp4 -vf "fps=30,split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" docs/assets/nookive-demo.gif
```

The cut points and zoom area in `edit-video.py` match the current storyboard on
a 3456×2234 display. Adjust them if you change either one.
