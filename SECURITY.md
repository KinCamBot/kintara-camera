# Security Policy

## What KinCam is, and its trust model

KinCam is a community fan tool for Kintara: a **Chrome / Edge / Brave extension**. On
`kintara.gg/play` it intercepts the game's own `game.js` module, rewrites the source to add
cinematic-camera features, and re-injects the patched module. The code runs in the page's **main
world** at `document-start`.

Consequence: like any content script, KinCam runs with the **full privileges of the kintara.gg
page** it loads on. The published version does **not** read your login, cookies, session tokens, or
wallet keys, and it sends **no data anywhere**, but that capability exists by design. Your safety
therefore rests on two things: (1) the source being reviewable, and (2) the copy you install being
genuine.

## Scope and behavior

- **Runs only on** `https://kintara.gg/play` (the content script is scoped to that path).
- **Network:** the only request is fetching the game's own same-origin `game.js`. No analytics,
  telemetry, beacons, or third-party calls.
- **Storage:** `localStorage` is used only for camera preferences (`kintara.cameraMode`,
  `kintaraFramings`, `kxPos`, `kxMin`, `kxHidden`).
- **Never** reads cookies, auth/session tokens, or wallet objects.
- Photo and clip capture stays entirely on your device.

## No auto-update (on purpose)

KinCam is an **unpacked, developer-mode extension**. It does **not** auto-update. You install it by
hand from `kincam.zip` and you update it only when you choose to, by downloading a newer zip and
reloading it in `chrome://extensions`. There is no silent update channel that could push new code
into your browser. The trade-off is that you should verify each download yourself (below).

## Reviewing the source

The full extension source is committed in **`extension/`** (`manifest.json`, `content.js`,
`rules.json`, `popup.html`, `popup.js`). The exact same files are packaged into `kincam.zip`, so what
you review is what you run. Read them before loading the extension.

## Verifying your download

The SHA-256 of `kincam.zip` is in [CHECKSUMS.txt](CHECKSUMS.txt). Check it before you load it:

- Windows (PowerShell): `Get-FileHash kincam.zip -Algorithm SHA256`
- macOS / Linux: `shasum -a 256 kincam.zip`

The only official sources are this repository and `https://kincambot.github.io/kintara-camera/`.
The only official account is [x.com/OmenCrypt](https://x.com/OmenCrypt). KinCam will **never** ask
for your seed phrase, private keys, or password.

## Maintainer hardening checklist

The distribution point (this repo + its GitHub Pages site) is what a download trusts, so keep these
true:

- [x] **2FA** enabled on the `KinCamBot` GitHub account (the top attack vector: account compromise).
- [x] **Branch protection** on the branch GitHub Pages serves from (force-pushes and deletions
      blocked, so history cannot be silently rewritten).
- [ ] **Signed, annotated release tags** (`git tag -s vX.Y.Z`).
- [x] On **every** release: regenerate the SHA-256 and update `CHECKSUMS.txt`.
- [x] Tip / donation address published in a second location (the install page) so a future swap in
      the code is detectable.

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

- Preferred: open a private **GitHub Security Advisory** on this repository
  (Security > Advisories > Report a vulnerability).
- Or email **rawbotgg@gmail.com**.

We aim to acknowledge reports within a few days and to ship a fix (with a new version and checksum)
as quickly as is practical.
