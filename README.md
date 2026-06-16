# KinCam: Cinematic Camera for Kintara

First-person, free-cam photos, over-the-shoulder views, and one-click cinematic **HYPE reels** for
[Kintara](https://kintara.gg), right inside your browser, driven by a draggable in-game control
panel.

> **Community fan tool, not affiliated with Kintara.** It runs only on `kintara.gg/play`, collects
> and sends no data, and never reads your login or wallet. See [SECURITY.md](SECURITY.md).

## Tip the dev

Free to use. If you enjoy it, KINS / SOL tips are appreciated:

```
F1ULZxHK9PicLNp5Nk6DnS86Rk1Lc37rX6ex7XprACQf
```

## Features

- **Camera modes:** First-person, Play (classic follow), Over-the-shoulder, a **Custom** angle you
  dial in yourself, and a free **Free Cam** to orbit and frame your character from any angle.
- **Auto-Pan + HYPE reel:** cinematic auto-moves (Orbit, Sweep, Rising crane, Push-in) plus a
  one-click ~20 second HYPE reel that films and saves itself (push-ins, whip-pans, a 360).
- **Capture:** clean photo (PNG) and clip (WebM) export, hide-HUD, crosshair toggle. Weather is
  captured too (e.g. the Frostmere snow).
- **Saved framings:** name and recall your favorite camera setups.
- **Stays out of the way:** rests as a small "KinCam" pill in the corner; click it to expand. Press
  **H** to hide it for clean recordings. The toolbar icon shows, hides, or fully shuts down the tool.

## Install (Chrome / Edge / Brave)

1. Download **[kincam.zip](kincam.zip)** and unzip it (remember where the folder lands).
2. Open `chrome://extensions` and turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** and pick the unzipped folder: the one that contains `manifest.json`.
4. Open [kintara.gg/play](https://kintara.gg/play). The panel appears top-right; click the **KinCam
   toolbar icon** any time to show or hide it.

> Developer mode stays on afterward and lets you load any unpacked extension, so only keep ones you
> trust. KinCam isn't on the Chrome Web Store yet, which is why this manual install is needed.

## Verify your download

The SHA-256 of every released file is in [CHECKSUMS.txt](CHECKSUMS.txt). Check a file before running
it:

```
shasum -a 256 kincam.zip          # macOS / Linux  (or: sha256sum kincam.zip)
(Get-FileHash kincam.zip -Algorithm SHA256).Hash.ToLower()   # Windows (PowerShell)
```

## Repository layout

| Path | What it is |
|---|---|
| `extension/` | The full, reviewable extension source (`manifest.json`, `content.js`, `popup.html`, `popup.js`, `rules.json`, icons) |
| `kincam.zip` | The packaged extension, built from `extension/` (what users download and load unpacked) |
| `index.html` | Install / landing page (served via GitHub Pages) |
| `CHECKSUMS.txt` | SHA-256 of the released files |
| `SECURITY.md` | Trust model, what it can and can't do, and how to report issues |
| `kincam-logo.png` | Logo used by the install page |

## How it works

At `document-start` on `kintara.gg/play`, KinCam fetches the game's own `game.js` module, rewrites
the source to add the camera engine, and re-injects the patched module. A `declarativeNetRequest`
rule blocks the original `game.js` request at the network layer, so the unmodified game never loads
alongside the patched one (no double-render, no "open in another tab" crash).

If patching ever fails (for example the game updates and the injection points move), KinCam falls
back to loading the game **unmodified** so play is never broken; you just don't get the camera until
KinCam is updated. It runs in the page's main world, makes no network request beyond that same-origin
`game.js` fetch, and stores only camera preferences in `localStorage`.

## Build

The source in `extension/` is the source of truth and is exactly what ships: `kincam.zip` is simply
those files zipped, with `manifest.json` at the root of the archive. To rebuild the package after
editing anything in `extension/`, zip its contents into `kincam.zip` and refresh the hash in
`CHECKSUMS.txt`.

## Safety and disclaimer

Open source, runs only on `kintara.gg/play`, no wallet or account access, no data collected or sent.
Only install from this repository or `https://kincambot.github.io/kintara-camera/`. The only official
account is [x.com/OmenCrypt](https://x.com/OmenCrypt). KinCam will never ask for your seed phrase,
private keys, or password.

**Use at your own risk. KinCam is not officially endorsed by the Kintara team at this time.** We
checked the docs and found nothing saying this breaks any rules, but if the team ever asks us to take
it down, we will. Please use it within Kintara's rules.
