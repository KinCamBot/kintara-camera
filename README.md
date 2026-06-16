# KinCam: Cinematic Camera for Kintara

First-person play, over-the-shoulder views, free-cam photos, and one-click cinematic **HYPE reels**
for [Kintara](https://kintara.gg), right inside your browser, driven by a small draggable in-game
panel.

> **Community fan tool, not affiliated with Kintara.** It runs only on `kintara.gg/play`, collects
> and sends no data, and never reads your login or wallet. See [SECURITY.md](SECURITY.md).

## Features

- **Play cameras:** First-person, Play (classic follow), Over-the-shoulder, and a **Custom** angle
  you dial in yourself. Back to Normal anytime.
- **Free Cam:** orbit and frame your character from any angle for stills.
- **Auto-Pan + HYPE:** cinematic auto-moves (Orbit, Sweep, Rising crane, Push-in) plus a one-click
  ~20 second HYPE reel that films and saves itself.
- **Capture:** clean photo (PNG) and clip (WebM) export with the HUD hidden. Weather is captured
  too (e.g. the Frostmere snow).
- **Saved framings:** name and recall your favorite camera setups.
- **Stays out of the way:** rests as a small "KinCam" pill in the corner; click it to expand. The
  toolbar icon shows, hides, or fully shuts down the tool.

## Install

Pick **one** (do not run both at once; they would both patch the game and collide).

### Chrome / Edge / Brave extension (recommended)

1. Download **[kincam.zip](kincam.zip)** and unzip it (remember where the folder lands).
2. Open `chrome://extensions` and turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** and pick the unzipped folder: the one that contains `manifest.json`.
4. Open [kintara.gg/play](https://kintara.gg/play). Click the **KinCam toolbar icon** any time to
   show or hide it.

> Developer mode lets you load any unpacked extension, so only keep ones you trust. KinCam is not on
> the Chrome Web Store yet, which is why this manual install is needed.

### Userscript (Tampermonkey / Violentmonkey)

Install **[kintara-camera.user.js](kintara-camera.user.js)** in your userscript manager, then open
kintara.gg/play. (Violentmonkey is open-source and tends to be the more reliable host.)

## Verify your download

Every released file's SHA-256 is in [CHECKSUMS.txt](CHECKSUMS.txt). Check before running:

- Windows (PowerShell): `Get-FileHash kincam.zip -Algorithm SHA256`
- macOS / Linux: `shasum -a 256 kincam.zip`

## Safety

Open source, runs only on `kintara.gg/play`, no wallet or account access, no data collected or sent.
Only install from this repository or `https://kincambot.github.io/kintara-camera/`. The only
official account is [x.com/OmenCrypt](https://x.com/OmenCrypt). KinCam will never ask for your seed
phrase, private keys, or password. See [SECURITY.md](SECURITY.md) for the full trust model.

**Use at your own risk. KinCam is not officially endorsed by the Kintara team at this time.** We
checked the docs and found nothing saying this breaks any rules, but if the team ever asks us to take
it down, we will.
