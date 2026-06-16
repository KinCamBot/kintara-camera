# Security Policy

## What KinCam is, and its trust model

KinCam is a community fan tool for Kintara. It ships two ways: a **Chrome / Edge / Brave
extension** and a **Tampermonkey / Violentmonkey userscript**. Both do the same thing: on
`kintara.gg/play` they intercept the game's own `game.js` module, rewrite the source to add
cinematic-camera features, and re-inject the patched module. The code runs in the page's
**main world** at `document-start`.

Consequence: like every userscript or content script, KinCam runs with the **full privileges of
the kintara.gg page** it loads on. The published version does **not** read your login, cookies,
session tokens, or wallet keys, and it sends **no data anywhere**, but that capability exists by
design. Your safety therefore rests on two things: (1) the source being reviewable, and (2) the
update channel being trustworthy.

## Scope and behavior

- **Runs only on** `https://kintara.gg/play`. The extension is scoped to that path; the userscript
  matches `kintara.gg/play*`.
- **Network:** the only request is fetching the game's own same-origin `game.js`. No analytics,
  telemetry, beacons, or third-party calls.
- **Storage:** `localStorage` is used only for camera preferences (`kintara.cameraMode`,
  `kintaraFramings`, `kxPos`, `kxMin`, `kxHidden`).
- **Never** reads cookies, auth/session tokens, or wallet objects.
- Photo and clip capture stays entirely on your device.

## The auto-update channel (read this)

The userscript auto-updates through your userscript manager from:

```
https://kincambot.github.io/kintara-camera/kintara-camera.user.js
```

(`@updateURL` / `@downloadURL`). Userscript managers silently install any build with a higher
`@version`: there is no Subresource Integrity, no code signing, and no per-update review. The
manager simply trusts that URL plus the version number.

**This means whoever controls that URL can run code in your browser on kintara.gg.** A compromised
GitHub account or a hostile maintainer could push a malicious update that reads your session or
injects code into the game. We mitigate this operationally (see the checklist below) and we
disclose it plainly here and on the install page.

The extension is unpacked / developer-mode and does **not** auto-update; you reload it by hand, so
each version is whatever you loaded.

If you would rather review **every** update yourself, turn off auto-update for KinCam in your
userscript manager and re-install manually after reading the diff.

## Verifying your download

Every released file's SHA-256 is in [CHECKSUMS.txt](CHECKSUMS.txt). Check a file before running it:

- Windows (PowerShell): `Get-FileHash kincam.zip -Algorithm SHA256`
- macOS / Linux: `shasum -a 256 kincam.zip`

The only official sources are this repository and `https://kincambot.github.io/kintara-camera/`.
The only official account is [x.com/OmenCrypt](https://x.com/OmenCrypt). KinCam will **never** ask
for your seed phrase, private keys, or password.

## Maintainer hardening checklist

These are the real mitigations for the auto-update risk. Keep them all true:

- [x] **2FA** enabled on the `KinCamBot` GitHub account (the top attack vector: account compromise).
- [ ] **Branch protection** on the branch GitHub Pages serves from: require pull requests, require
      review, and disallow force-pushes.
- [ ] **Signed, annotated release tags** (`git tag -s vX.Y.Z`).
- [x] On **every** release: bump `@version`, regenerate the SHA-256, and update `CHECKSUMS.txt`.
- [x] Tip / donation address published in a second location (the install page) so a future swap in
      the script is detectable.

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

- Preferred: open a private **GitHub Security Advisory** on this repository
  (Security > Advisories > Report a vulnerability).
- Or email **rawbotgg@gmail.com**.

We aim to acknowledge reports within a few days and to ship a fix (with a new `@version` and
checksum) as quickly as is practical.
