// ==UserScript==
// @name         KinCam Cinematic Camera
// @namespace    gg.kincam.camera
// @version      1.1.1
// @description  First-person, free-cam photos, over-the-shoulder, and cinematic HYPE reels for Kintara, with an in-game control panel.
// @author       KinCam
// @match        https://kintara.gg/play*
// @run-at       document-start
// @grant        none
// @downloadURL  https://kincambot.github.io/kintara-camera/kintara-camera.user.js
// @updateURL    https://kincambot.github.io/kintara-camera/kintara-camera.user.js
// ==/UserScript==
(function () {
  'use strict';
  if (window.__kxUserscript) return;
  window.__kxUserscript = true;

  var GAME_RE = /(^|\/)game\.js(\?|$)/i;
  var handled = false;

  // The blob module we inject has no path, so relative imports (./src/x) would break.
  // Rewrite every relative specifier to an absolute URL based on /game.js.
  function absolutizeImports(src) {
    var baseUrl = location.origin + '/game.js';
    return src.replace(/((?:\bfrom|\bimport)\s*\(?\s*)(["'])(\.\.?\/[^"'\n]*)\2/g, function (whole, pre, q, spec) {
      try { return pre + q + new URL(spec, baseUrl).href + q; } catch (e) { return whole; }
    });
  }

  function patchGameSource(source) {
    let out = source;
  
    const camOffNeedle = 'const CAM_OFF   = new THREE.Vector3(20, 20, 20);';
    const camOffPatch = String.raw`const CAM_OFF   = new THREE.Vector3(20, 20, 20);
  const KINTARA_CAMERA_OFFSETS = {
    iso: new THREE.Vector3(20, 20, 20),
    chase: new THREE.Vector3(12, 7, 12),
    shoulder: new THREE.Vector3(7, 3.8, 7),
    low: new THREE.Vector3(5, 2.4, 5),
    close: new THREE.Vector3(3.2, 1.8, 3.2),
    over: new THREE.Vector3(2.0, 1.35, 2.0),
    nose: new THREE.Vector3(1.15, 0.95, 1.15),
    first: new THREE.Vector3(20, 20, 20),
  };
  let kintaraCameraMode = 'iso';
  const kintaraFirstPersonCamera = new THREE.PerspectiveCamera(78, aspect, 0.03, 220);
  const kintaraFirstPersonConfig = {
    behind: 0.92,
    side: 0.16,
    height: 1.48,
    lookHeight: 1.34,
    lookAhead: 7.5,
    yawOffset: 0,
    pitch: 0,
    mouseSensitivity: 0.0042,
    hideAvatar: true,
  };
  let kintaraViewYaw = 0;
  let kintaraViewYawInitialized = false;
  let kintaraControlHintEl = null;
  let kintaraCrosshairEl = null;
  let kintaraCrosshairOn = true;
  function kintaraClamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }
  function kintaraEnsureViewYaw() {
    if (!kintaraViewYawInitialized && character && character.rotation) {
      kintaraViewYaw = character.rotation.y + (Number(kintaraFirstPersonConfig.yawOffset) || 0);
      kintaraViewYawInitialized = true;
    }
  }
  function kintaraForwardVectorFromAvatar() {
    kintaraEnsureViewYaw();
    return new THREE.Vector3(Math.sin(kintaraViewYaw), 0, Math.cos(kintaraViewYaw)).normalize();
  }
  function updateKintaraFirstPersonCamera() {
    if (!character) return camera;
    kintaraEnsureViewYaw();
    const forward = kintaraForwardVectorFromAvatar();
    const right = new THREE.Vector3(forward.z, 0, -forward.x).normalize();
    const base = character.position;
    kintaraFirstPersonCamera.aspect = Math.max(0.1, window.innerWidth / Math.max(1, window.innerHeight));
    kintaraFirstPersonCamera.fov = 78;
    kintaraFirstPersonCamera.near = 0.03;
    kintaraFirstPersonCamera.far = 220;
    kintaraFirstPersonCamera.updateProjectionMatrix();
    kintaraFirstPersonCamera.position.set(
      base.x - forward.x * kintaraFirstPersonConfig.behind + right.x * kintaraFirstPersonConfig.side,
      base.y + kintaraFirstPersonConfig.height,
      base.z - forward.z * kintaraFirstPersonConfig.behind + right.z * kintaraFirstPersonConfig.side
    );
    kintaraFirstPersonCamera.lookAt(
      base.x + forward.x * kintaraFirstPersonConfig.lookAhead,
      base.y + kintaraFirstPersonConfig.lookHeight + Math.tan(Number(kintaraFirstPersonConfig.pitch) || 0) * kintaraFirstPersonConfig.lookAhead,
      base.z + forward.z * kintaraFirstPersonConfig.lookAhead
    );
    kintaraFirstPersonCamera.layers.mask = camera.layers.mask;
    kintaraFirstPersonCamera.updateMatrixWorld(true);
    return kintaraFirstPersonCamera;
  }
  // ---- Orbit camera (shared by Free Cam + Auto Pan) -------------------------
  const kintaraOrbitCamera = new THREE.PerspectiveCamera(52, aspect, 0.03, 500);
  const kintaraOrbit = {
    azimuth: 0, elevation: 0.55, radius: 7, lookHeight: 1.05,
    autoSpeed: 0.32, autoStyle: 'orbit', _t: 0, _initd: false,
  };
  const KINTARA_ORBIT_LIMITS = { minRadius: 1.4, maxRadius: 60, minElev: -0.5, maxElev: 1.48 };
  // Cinematic HYPE timeline — close, face-framed, music-video energy. a-values (azimuth)
  // are RELATIVE to the captured front-facing: 0 = staring at the hero's face. Hard cuts
  // between shots, smooth motion within. Low-angle hero rises, fast push-ins, whip-360s,
  // crane reveal. f = field of view (low = compressed/tele, high = wide/dramatic).
  // a = azimuth RELATIVE to the hero's facing (0 = camera on the face, PI = behind).
  // e = camera elevation angle (floored so it never goes underground).
  // r = distance in BODY-HEIGHTS (smaller = tighter, hero fills frame).
  // l = look target as a FRACTION of body height (0.88 = eyes/face, 0.5 = torso, 0.15 = feet).
  // f = field of view. 8 segments == the 4-shot storyboard (5s each).
  const KINTARA_HYPE_SHOTS = [
    // SHOT 1 — orbit-to-over-the-shoulder reveal: sweep 180 from behind-left to front-right, push in, tilt up
    { d: 5.0, ease: 'io',  a0: 2.40, a1: -0.45, e0: -0.12, e1: -0.05, r0: 0.95, r1: 0.72, l0: 0.55, l1: 0.88, f0: 52, f1: 46 },
    // SHOT 2a — ground-level snap push toward the feet (extreme low, fast)
    { d: 1.5, ease: 'in',  a0: -0.30, a1: -0.25, e0: -0.44, e1: -0.44, r0: 1.55, r1: 0.80, l0: 0.32, l1: 0.22, f0: 58, f1: 58 },
    // SHOT 2b — rising crane up to chest, pulling back so the head stays in frame
    { d: 3.5, ease: 'out', a0: -0.25, a1: -0.08, e0: -0.40, e1: -0.15, r0: 0.90, r1: 1.40, l0: 0.24, l1: 0.56, f0: 56, f1: 52 },
    // SHOT 3a — over-the-shoulder sweep, pull wide to reveal the landscape
    { d: 2.0, ease: 'out', a0: 0.55, a1: 1.45, e0: 0.08,  e1: 0.06, r0: 1.30, r1: 2.45, l0: 0.52, l1: 0.50, f0: 58, f1: 58 },
    // SHOT 3b — WHIP-PAN back onto the face (fast)
    { d: 0.45, ease: 'in', a0: 1.45, a1: -0.05, e0: 0.06,  e1: 0.05, r0: 2.45, r1: 0.74, l0: 0.52, l1: 0.88, f0: 50, f1: 44 },
    // SHOT 3c — locked dramatic close-up
    { d: 2.55, ease: 'lin', a0: -0.05, a1: 0.07, e0: 0.05, e1: 0.05, r0: 0.74, r1: 0.74, l0: 0.88, l1: 0.88, f0: 44, f1: 44 },
    // SHOT 4a — matrix 360: fast constant-speed spin (torso-centered, 15deg low)
    { d: 3.0, ease: 'lin', a0: 0.00, a1: -7.40, e0: -0.26, e1: -0.26, r0: 1.20, r1: 1.20, l0: 0.52, l1: 0.52, f0: 52, f1: 52 },
    // SHOT 4b — keep spinning + push to a dead-center face close-up climax
    { d: 2.0, ease: 'out', a0: -7.40, a1: -12.55, e0: -0.26, e1: -0.04, r0: 1.20, r1: 0.66, l0: 0.52, l1: 0.90, f0: 52, f1: 40 },
  ];
  function kintaraEase(t, e) { t = kintaraClamp(t, 0, 1); if (e === 'in') return t * t; if (e === 'out') return 1 - (1 - t) * (1 - t); if (e === 'io') return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; return t; }
  let kintaraOrbitLastMs = 0;
  function kintaraOrbitInitFromAvatar() {
    if (kintaraOrbit._initd || !character || !character.rotation) return;
    kintaraOrbit.azimuth = character.rotation.y + Math.PI;
    kintaraOrbit._initd = true;
  }
  function updateKintaraOrbitCamera() {
    if (!character) return camera;
    kintaraOrbitInitFromAvatar();
    const now = performance.now();
    const dt = kintaraOrbitLastMs ? Math.min(0.08, (now - kintaraOrbitLastMs) / 1000) : 0.016;
    kintaraOrbitLastMs = now;
    kintaraOrbitCamera.fov = 52;
    if (kintaraCameraMode === 'autopan') {
      kintaraOrbit._t += dt;
      const s = kintaraOrbit.autoStyle;
      if (s === 'hype') {
        const shots = KINTARA_HYPE_SHOTS;
        if (!kintaraOrbit._hypeTotal) { let tot = 0; for (let i = 0; i < shots.length; i++) tot += shots[i].d; kintaraOrbit._hypeTotal = tot; }
        let tt = kintaraOrbit._t % kintaraOrbit._hypeTotal;
        let idx = 0;
        while (idx < shots.length - 1 && tt > shots[idx].d) { tt -= shots[idx].d; idx++; }
        const sh = shots[idx];
        const lt = kintaraEase(tt / sh.d, sh.ease);
        const face = (kintaraOrbit._faceYaw != null) ? kintaraOrbit._faceYaw : (character.rotation ? character.rotation.y : 0);
        // Anchor on the hero's REAL eyes via the game's own rig holder (moves with mounts),
        // not a hat-inflated bounding box.
        let rigY = 0;
        try { if (character.avatarRigHolder) rigY = Number(character.avatarRigHolder.position.y) || 0; } catch (_) {}
        const footY = (kintaraOrbit._charBaseY != null) ? kintaraOrbit._charBaseY : character.position.y;
        const headTop = character.position.y + rigY + 1.42; // game's overhead head anchor
        const H = Math.max(0.9, headTop - footY);            // true visual height
        const lookFrac = sh.l0 + (sh.l1 - sh.l0) * lt;
        const rMult = sh.r0 + (sh.r1 - sh.r0) * lt;
        kintaraOrbit.azimuth = face + (sh.a0 + (sh.a1 - sh.a0) * lt);
        kintaraOrbit.elevation = sh.e0 + (sh.e1 - sh.e0) * lt;
        kintaraOrbit.radius = H * rMult;
        kintaraOrbit.lookHeight = (footY + H * lookFrac) - character.position.y;
        kintaraOrbitCamera.fov = sh.f0 + (sh.f1 - sh.f0) * lt;
      } else {
        kintaraOrbit.azimuth += dt * Number(kintaraOrbit.autoSpeed || 0);
        if (s === 'sweep') {
          kintaraOrbit.elevation = 0.55 + Math.sin(kintaraOrbit._t * 0.55) * 0.5;
          kintaraOrbit.radius = 8.5 + Math.sin(kintaraOrbit._t * 0.4) * 3.6;
        } else if (s === 'rise') {
          kintaraOrbit.elevation = kintaraClamp(0.15 + kintaraOrbit._t * 0.035, KINTARA_ORBIT_LIMITS.minElev, KINTARA_ORBIT_LIMITS.maxElev);
        } else if (s === 'pushin') {
          kintaraOrbit.radius = kintaraClamp(11 - kintaraOrbit._t * 0.7, 2.4, 60);
        }
      }
    }
    const az = kintaraOrbit.azimuth;
    const el = kintaraClamp(kintaraOrbit.elevation, KINTARA_ORBIT_LIMITS.minElev, KINTARA_ORBIT_LIMITS.maxElev);
    const rad = kintaraClamp(kintaraOrbit.radius, KINTARA_ORBIT_LIMITS.minRadius, KINTARA_ORBIT_LIMITS.maxRadius);
    const cosEl = Math.cos(el);
    const base = character.position;
    const cy = base.y + kintaraOrbit.lookHeight;
    const floorBase = (kintaraCameraMode === 'autopan' && kintaraOrbit.autoStyle === 'hype' && kintaraOrbit._charBaseY != null) ? kintaraOrbit._charBaseY : base.y;
    let camY = cy + Math.sin(el) * rad;
    if (camY < floorBase + 0.3) camY = floorBase + 0.3; // never dip below the ground / clip the terrain
    kintaraOrbitCamera.aspect = Math.max(0.1, window.innerWidth / Math.max(1, window.innerHeight));
    kintaraOrbitCamera.updateProjectionMatrix();
    kintaraOrbitCamera.position.set(base.x + cosEl * Math.sin(az) * rad, camY, base.z + cosEl * Math.cos(az) * rad);
    kintaraOrbitCamera.lookAt(base.x, cy, base.z);
    kintaraOrbitCamera.layers.mask = camera.layers.mask;
    kintaraOrbitCamera.updateMatrixWorld(true);
    return kintaraOrbitCamera;
  }
  function kintaraInstallOrbitControls() {
    if (typeof window === 'undefined' || window.__kintaraOrbitControlsInstalled) return;
    window.__kintaraOrbitControlsInstalled = true;
    const keys = new Set();
    let drag = false;
    const isOrbit = () => kintaraCameraMode === 'orbit' || kintaraCameraMode === 'autopan';
    const tick = () => {
      if (!isOrbit()) return;
      const fb = (keys.has('w') ? 1 : 0) + (keys.has('s') ? -1 : 0);
      const st = (keys.has('d') ? 1 : 0) + (keys.has('a') ? -1 : 0);
      if (!fb && !st) return;
      const yaw = kintaraOrbit.azimuth + Math.PI; // move the avatar relative to the view
      const f = new THREE.Vector2(Math.sin(yaw), Math.cos(yaw));
      const r = new THREE.Vector2(-f.y, f.x);
      const v = new THREE.Vector2().addScaledVector(f, fb).addScaledVector(r, st);
      if (v.lengthSq() < 0.001) return;
      v.normalize();
      let dc = Math.round(v.x), dr = Math.round(v.y);
      if (dc === 0 && dr === 0) { if (Math.abs(v.x) >= Math.abs(v.y)) dc = v.x >= 0 ? 1 : -1; else dr = v.y >= 0 ? 1 : -1; }
      kintaraTryKeyboardMove(dc, dr);
    };
    setInterval(tick, 150);
    window.addEventListener('keydown', ev => {
      if (!isOrbit() || kintaraKeyboardInputTargetIsTyping(ev)) return;
      const k = String(ev.key || '').toLowerCase();
      if (['w', 'a', 's', 'd'].includes(k)) { keys.add(k); ev.preventDefault(); }
      else if (k === 'r') { kintaraOrbit.elevation = 0.55; kintaraOrbit.radius = 7; ev.preventDefault(); }
    }, true);
    window.addEventListener('keyup', ev => keys.delete(String(ev.key || '').toLowerCase()), true);
    window.addEventListener('blur', () => keys.clear(), true);
    document.addEventListener('visibilitychange', () => { if (document.hidden) keys.clear(); }, true);
    window.addEventListener('mousedown', ev => {
      if (isOrbit() && ev.button === 0 && ev.target === renderer.domElement) { drag = true; ev.preventDefault(); }
    }, true);
    window.addEventListener('mouseup', ev => { if (ev.button === 0) drag = false; }, true);
    window.addEventListener('mousemove', ev => {
      if (!drag || !isOrbit()) return;
      if (kintaraCameraMode === 'autopan') kintaraCameraMode = 'orbit'; // grabbing takes manual control
      kintaraOrbit.azimuth -= Number(ev.movementX || 0) * 0.006;
      kintaraOrbit.elevation = kintaraClamp(kintaraOrbit.elevation + Number(ev.movementY || 0) * 0.005, KINTARA_ORBIT_LIMITS.minElev, KINTARA_ORBIT_LIMITS.maxElev);
      ev.preventDefault();
    }, true);
    window.addEventListener('wheel', ev => {
      if (!isOrbit()) return;
      kintaraOrbit.radius = kintaraClamp(kintaraOrbit.radius * (1 + Math.sign(ev.deltaY) * 0.08), KINTARA_ORBIT_LIMITS.minRadius, KINTARA_ORBIT_LIMITS.maxRadius);
      ev.preventDefault();
    }, { passive: false, capture: true });
  }
  function getKintaraRenderCamera() {
    if (kintaraCameraMode === 'first') return updateKintaraFirstPersonCamera();
    if (kintaraCameraMode === 'orbit' || kintaraCameraMode === 'autopan') return updateKintaraOrbitCamera();
    return camera;
  }
  function getKintaraInteractionCamera() {
    return getKintaraRenderCamera();
  }
  function kintaraKeyboardInputTargetIsTyping(ev) {
    const el = ev && ev.target;
    if (!el) return false;
    const tag = String(el.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || !!el.isContentEditable;
  }
  function kintaraStepFromCameraInput(strafe, forwardBack) {
    kintaraEnsureViewYaw();
    const viewYaw = kintaraViewYaw;
    const f = new THREE.Vector2(Math.sin(viewYaw), Math.cos(viewYaw));
    const r = new THREE.Vector2(-f.y, f.x);
    const v = new THREE.Vector2()
      .addScaledVector(f, forwardBack)
      .addScaledVector(r, strafe);
    if (v.lengthSq() < 0.001) return null;
    v.normalize();
    let dc = Math.round(v.x);
    let dr = Math.round(v.y);
    if (dc === 0 && dr === 0) {
      if (Math.abs(v.x) >= Math.abs(v.y)) dc = v.x >= 0 ? 1 : -1;
      else dr = v.y >= 0 ? 1 : -1;
    }
    return { dc, dr };
  }
  function kintaraTryKeyboardMove(dc, dr) {
    if (!Number.isFinite(dc) || !Number.isFinite(dr) || (dc === 0 && dr === 0)) return false;
    if (!character || typeof findPath !== 'function') return false;
    if (moving || (tilePath && tilePath.length)) return false;
    const cols = getActiveCols();
    const rows = getActiveRows();
    const nc = Math.max(0, Math.min(cols - 1, (charCol | 0) + dc));
    const nr = Math.max(0, Math.min(rows - 1, (charRow | 0) + dr));
    if (nc === charCol && nr === charRow) return false;
    try {
      if (typeof cancelPondFishingIfActive === 'function') cancelPondFishingIfActive();
      if (typeof cancelMining === 'function' && miningState !== 'idle') cancelMining();
      if (typeof cancelChopping === 'function' && choppingState !== 'idle') cancelChopping();
    } catch (_) {}
    const path = findPath(charCol, charRow, nc, nr);
    if (!path || !path.length) return false;
    tilePath = path;
    const dest = getActiveTilePos(tilePath[0].col, tilePath[0].row);
    targetPos.copy(dest);
    moving = true;
    const dir = new THREE.Vector3().subVectors(dest, character.position);
    dir.y = 0;
    if (dir.lengthSq() > 0.001) character.rotation.y = Math.atan2(dir.x, dir.z);
    return true;
  }
  function kintaraShowControlHint() {
    if (typeof document === 'undefined') return;
    if (!kintaraControlHintEl) {
      kintaraControlHintEl = document.createElement('div');
      kintaraControlHintEl.style.cssText = [
        'position:fixed',
        'left:50%',
        'top:14px',
        'transform:translateX(-50%)',
        'z-index:999999',
        'padding:8px 12px',
        'border-radius:10px',
        'background:rgba(11,15,22,0.78)',
        'color:#fff',
        'font:700 12px system-ui,sans-serif',
        'box-shadow:0 2px 12px rgba(0,0,0,0.35)',
        'pointer-events:none',
        'text-align:center',
      ].join(';');
      document.body.appendChild(kintaraControlHintEl);
    }
    kintaraControlHintEl.textContent = 'First-person: WASD move | Space use selected item | hold right mouse to look | Q/E turn | R recenter | T hide avatar';
    kintaraControlHintEl.style.display = 'block';
    clearTimeout(kintaraControlHintEl._hideTimer);
    kintaraControlHintEl._hideTimer = setTimeout(() => {
      if (kintaraControlHintEl) kintaraControlHintEl.style.display = 'none';
    }, 9000);
  }
  function kintaraSyncCrosshair() {
    if (typeof document === 'undefined') return;
    if (!kintaraCrosshairEl) {
      kintaraCrosshairEl = document.createElement('div');
      kintaraCrosshairEl.style.cssText = [
        'position:fixed',
        'left:50%',
        'top:50%',
        'width:16px',
        'height:16px',
        'transform:translate(-50%,-50%)',
        'z-index:999998',
        'pointer-events:none',
        'display:none',
      ].join(';');
      kintaraCrosshairEl.innerHTML = '<div style="position:absolute;left:7px;top:1px;width:2px;height:14px;background:rgba(255,255,255,.82);box-shadow:0 0 2px #000"></div><div style="position:absolute;left:1px;top:7px;width:14px;height:2px;background:rgba(255,255,255,.82);box-shadow:0 0 2px #000"></div>';
      document.body.appendChild(kintaraCrosshairEl);
    }
    kintaraCrosshairEl.style.display = (kintaraCameraMode === 'first' && kintaraCrosshairOn) ? 'block' : 'none';
  }
  function kintaraUseSelectedAtCenter() {
    if (!renderer || !renderer.domElement) return false;
    const el = renderer.domElement;
    const r = el.getBoundingClientRect();
    const x = Math.round(r.left + r.width * 0.5);
    const y = Math.round(r.top + r.height * 0.5);
    const directEvent = {
      button: 0,
      buttons: 1,
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y,
      target: el,
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      preventDefault() {},
      stopPropagation() {},
    };
    try {
      if (typeof kintaraFirstPersonUseSelectedAtCenter === 'function') {
        return !!kintaraFirstPersonUseSelectedAtCenter(directEvent);
      }
    } catch (err) {
      try { showHudToast('Space action failed: ' + String(err?.message || err)); } catch (_) {}
    }
    const base = {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y,
      button: 0,
      buttons: 1,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
    };
    try {
      el.dispatchEvent(new PointerEvent('pointerdown', base));
      el.dispatchEvent(new MouseEvent('mousedown', base));
      el.dispatchEvent(new PointerEvent('pointerup', { ...base, buttons: 0 }));
      el.dispatchEvent(new MouseEvent('mouseup', { ...base, buttons: 0 }));
      el.dispatchEvent(new MouseEvent('click', { ...base, buttons: 0 }));
      return true;
    } catch (_) {
      try {
        el.dispatchEvent(new MouseEvent('mousedown', base));
        el.dispatchEvent(new MouseEvent('mouseup', { ...base, buttons: 0 }));
        el.dispatchEvent(new MouseEvent('click', { ...base, buttons: 0 }));
        return true;
      } catch (_) {
        return false;
      }
    }
  }
  function kintaraFirstPersonFishingTargetFromCenter(e) {
    if (typeof gameState === 'undefined' || !['pond', 'eldergrove', 'beach'].includes(gameState)) return null;
    if (typeof getEquippedItemType === 'function' && getEquippedItemType() !== 'tool_fishing_rod') return null;
    if (typeof playerHasToolType === 'function' && !playerHasToolType('tool_fishing_rod')) return null;
    if (typeof getActiveFishableWaterCells !== 'function') return null;
    const cells = getActiveFishableWaterCells();
    if (!cells || !cells.size || typeof charCol === 'undefined' || typeof charRow === 'undefined') return null;
  
    let aimed = null;
    try {
      raycaster.setFromCamera(getMainViewNDC(e), getKintaraInteractionCamera());
      const hits = raycaster.intersectObject(getActivePlane());
      if (hits.length) {
        const col = Math.round(hits[0].point.x - getActiveOffX());
        const row = Math.round(hits[0].point.z - getActiveOffZ());
        if (cells.has(col + ',' + row)) aimed = { col, row };
      }
    } catch (_) {}
  
    const inRange = (col, row) => (
      typeof pondTileIsFishableFromPlayer === 'function'
        ? pondTileIsFishableFromPlayer(col, row)
        : Math.max(Math.abs(charCol - col), Math.abs(charRow - row)) <= 5
    );
    if (aimed && inRange(aimed.col, aimed.row)) return aimed;
  
    kintaraEnsureViewYaw();
    const forward = new THREE.Vector2(Math.sin(kintaraViewYaw), Math.cos(kintaraViewYaw)).normalize();
    let best = null;
    let bestScore = Infinity;
    for (const key of cells.values()) {
      const [col, row] = key.split(',').map(Number);
      if (!inRange(col, row)) continue;
      const dx = col - charCol;
      const dz = row - charRow;
      const dist = Math.max(Math.abs(dx), Math.abs(dz));
      const len = Math.max(0.001, Math.hypot(dx, dz));
      const dot = (dx / len) * forward.x + (dz / len) * forward.y;
      const aimedPenalty = aimed ? Math.hypot(col - aimed.col, row - aimed.row) * 0.35 : 0;
      const behindPenalty = dot < -0.15 ? 8 : 0;
      const score = aimedPenalty + behindPenalty + dist - dot * 2.5;
      if (score < bestScore) {
        bestScore = score;
        best = { col, row };
      }
    }
    return best;
  }
  function tryHandleKintaraFirstPersonFishing(e) {
    if (kintaraCameraMode !== 'first') return false;
    if (typeof gameState === 'undefined' || !['pond', 'eldergrove', 'beach'].includes(gameState)) return false;
    if (typeof getEquippedItemType === 'function' && getEquippedItemType() !== 'tool_fishing_rod') return false;
    if (typeof playerHasToolType === 'function' && !playerHasToolType('tool_fishing_rod')) return false;
    if (typeof pondFishPhase !== 'undefined' && pondFishPhase === 'wait') {
      if (typeof cancelPondFishingIfActive === 'function') cancelPondFishingIfActive();
      try { showHudToast('You reel in the line.'); } catch (_) {}
      return true;
    }
    if (typeof pondFishPhase !== 'undefined' && (pondFishPhase === 'strike' || pondFishPhase === 'reel')) return true;
    if ((typeof moving !== 'undefined' && moving) || (typeof tilePath !== 'undefined' && tilePath.length)) {
      try { showHudToast('Stand still to fish.'); } catch (_) {}
      return true;
    }
    const target = kintaraFirstPersonFishingTargetFromCenter(e);
    if (!target) {
      try { showHudToast('Face nearby water to cast.'); } catch (_) {}
      return true;
    }
    if (typeof beginPondFishingAtTile !== 'function') return false;
    beginPondFishingAtTile(target.col, target.row);
    return true;
  }
  function kintaraInstallPerspectiveControls() {
    if (typeof window === 'undefined' || window.__kintaraPerspectiveControlsInstalled) return;
    window.__kintaraPerspectiveControlsInstalled = true;
    const keys = new Set();
    let rightDrag = false;
    let lastMoveAt = 0;
    let lastUseAt = 0;
    const turn = delta => {
      kintaraEnsureViewYaw();
      kintaraViewYaw += delta;
      if (kintaraViewYaw > Math.PI * 2) kintaraViewYaw -= Math.PI * 2;
      if (kintaraViewYaw < -Math.PI * 2) kintaraViewYaw += Math.PI * 2;
    };
    const recenter = () => {
      if (character && character.rotation) {
        kintaraViewYaw = character.rotation.y;
        kintaraViewYawInitialized = true;
        kintaraFirstPersonConfig.pitch = 0;
      }
    };
    const tickKeys = () => {
      if (kintaraCameraMode !== 'first') return;
      const now = performance.now();
      if (now - lastMoveAt < 145) return;
      const forwardBack = (keys.has('w') || keys.has('arrowup') ? 1 : 0) + (keys.has('s') || keys.has('arrowdown') ? -1 : 0);
      const strafe = (keys.has('d') ? 1 : 0) + (keys.has('a') ? -1 : 0);
      const step = kintaraStepFromCameraInput(strafe, forwardBack);
      if (step && kintaraTryKeyboardMove(step.dc, step.dr)) lastMoveAt = now;
      if (!moving && (!tilePath || !tilePath.length) && character && character.rotation) {
        character.rotation.y = kintaraViewYaw;
      }
    };
    setInterval(tickKeys, 35);
    // Smooth, frame-time-based Q/E turning. Decoupled from the tile-move cooldown
    // so rotation is fluid instead of stepping in chunky 145ms increments.
    let kintaraLastTurnTs = 0;
    const KINTARA_TURN_RATE = 1.85; // radians per second
    const kintaraTurnLoop = ts => {
      if (kintaraCameraMode === 'first') {
        if (!kintaraLastTurnTs) kintaraLastTurnTs = ts;
        const dt = Math.min(0.05, (ts - kintaraLastTurnTs) / 1000);
        kintaraLastTurnTs = ts;
        let dir = 0;
        if (keys.has('q') || keys.has('arrowleft')) dir += 1;
        if (keys.has('e') || keys.has('arrowright')) dir -= 1;
        if (dir !== 0) {
          turn(dir * KINTARA_TURN_RATE * dt);
          if (!moving && (!tilePath || !tilePath.length) && character && character.rotation) {
            character.rotation.y = kintaraViewYaw;
          }
        }
      } else {
        kintaraLastTurnTs = 0;
      }
      requestAnimationFrame(kintaraTurnLoop);
    };
    requestAnimationFrame(kintaraTurnLoop);
    window.addEventListener('keydown', ev => {
      if (kintaraCameraMode !== 'first' || kintaraKeyboardInputTargetIsTyping(ev)) return;
      const k = String(ev.key || '').toLowerCase();
      if (k === 'r') {
        recenter();
        ev.preventDefault();
        return;
      }
      if (k === 't') {
        kintaraFirstPersonConfig.hideAvatar = !kintaraFirstPersonConfig.hideAvatar;
        kintaraShowControlHint();
        ev.preventDefault();
        return;
      }
      if (k === ' ' || k === 'spacebar') {
        const now = performance.now();
        if (now - lastUseAt > 190) {
          lastUseAt = now;
          kintaraUseSelectedAtCenter();
        }
        ev.preventDefault();
        return;
      }
      if (new Set(['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']).has(k)) {
        keys.add(k);
        ev.preventDefault();
      }
    }, true);
    window.addEventListener('keyup', ev => {
      keys.delete(String(ev.key || '').toLowerCase());
    }, true);
    // Clear held keys when focus leaves the game (otherwise a keyup that lands on
    // another window/tab leaves the avatar "stuck" walking forward).
    window.addEventListener('blur', () => keys.clear(), true);
    document.addEventListener('visibilitychange', () => { if (document.hidden) keys.clear(); }, true);
    window.addEventListener('contextmenu', ev => {
      if (kintaraCameraMode === 'first' && ev.target === renderer.domElement) ev.preventDefault();
    }, true);
    window.addEventListener('mousedown', ev => {
      if (kintaraCameraMode === 'first' && ev.button === 2 && ev.target === renderer.domElement) {
        rightDrag = true;
        ev.preventDefault();
      }
    }, true);
    window.addEventListener('mouseup', ev => {
      if (ev.button === 2) rightDrag = false;
    }, true);
    window.addEventListener('mousemove', ev => {
      if (!rightDrag || kintaraCameraMode !== 'first') return;
      turn(-Number(ev.movementX || 0) * kintaraFirstPersonConfig.mouseSensitivity);
      kintaraFirstPersonConfig.pitch = kintaraClamp(
        (Number(kintaraFirstPersonConfig.pitch) || 0) - Number(ev.movementY || 0) * kintaraFirstPersonConfig.mouseSensitivity * 0.72,
        -0.46,
        0.42
      );
      ev.preventDefault();
    }, true);
    window.__kintaraPerspectiveControls = {
      status: () => ({
        mode: kintaraCameraMode,
        yaw: kintaraViewYaw,
        pitch: kintaraFirstPersonConfig.pitch,
        config: { ...kintaraFirstPersonConfig },
        keys: [...keys],
      }),
      turn,
      recenter,
      use: kintaraUseSelectedAtCenter,
    };
  }
  function renderKintaraMainScene(activeScene) {
    const renderCam = getKintaraRenderCamera();
    let oldVisible = true;
    if (kintaraCameraMode === 'first' && character && kintaraFirstPersonConfig.hideAvatar) {
      oldVisible = character.visible;
      character.visible = false;
    }
    try {
      renderer.render(activeScene, renderCam);
    } finally {
      if (kintaraCameraMode === 'first' && character && kintaraFirstPersonConfig.hideAvatar) {
        character.visible = oldVisible;
      }
    }
  }
  function applyKintaraCameraModeOffset() {
    const off = KINTARA_CAMERA_OFFSETS[kintaraCameraMode] || KINTARA_CAMERA_OFFSETS.iso;
    CAM_OFF.copy(off);
  }
  if (typeof window !== 'undefined') {
    window.__kintaraCameraMode = function __kintaraCameraMode(mode = 'iso') {
      const next = String(mode || 'iso').toLowerCase();
      kintaraCameraMode = KINTARA_CAMERA_OFFSETS[next] ? next : 'iso';
      try { localStorage.setItem('kintara.cameraMode', kintaraCameraMode); } catch (_) {}
      applyKintaraCameraModeOffset();
      if (typeof applyCamera === 'function') applyCamera();
      return {
        mode: kintaraCameraMode,
        offset: [CAM_OFF.x, CAM_OFF.y, CAM_OFF.z],
        zoom: typeof kintaraCameraZoom === 'number' ? kintaraCameraZoom : null,
      };
    };
    window.__kintaraFirstPerson = function __kintaraFirstPerson(config = {}) {
      Object.assign(kintaraFirstPersonConfig, config || {});
      kintaraCameraMode = 'first';
      if (character && character.rotation) {
        kintaraViewYaw = character.rotation.y + (Number(kintaraFirstPersonConfig.yawOffset) || 0);
        kintaraViewYawInitialized = true;
      }
      try { localStorage.setItem('kintara.cameraMode', kintaraCameraMode); } catch (_) {}
      kintaraInstallPerspectiveControls();
      kintaraSyncCrosshair();
      kintaraShowControlHint();
      if (typeof applyCamera === 'function') applyCamera();
      return {
        mode: kintaraCameraMode,
        config: { ...kintaraFirstPersonConfig },
      };
    };
    window.__kintaraFreeCam = function __kintaraFreeCam(config = {}) {
      Object.assign(kintaraOrbit, config || {});
      kintaraCameraMode = 'orbit';
      kintaraOrbit._initd = false;
      kintaraOrbitInitFromAvatar();
      try { localStorage.setItem('kintara.cameraMode', kintaraCameraMode); } catch (_) {}
      kintaraInstallOrbitControls();
      kintaraSyncCrosshair();
      if (typeof applyCamera === 'function') applyCamera();
      return { mode: kintaraCameraMode, orbit: { ...kintaraOrbit } };
    };
    window.__kintaraAutoPan = function __kintaraAutoPan(config = {}) {
      Object.assign(kintaraOrbit, config || {});
      kintaraCameraMode = 'autopan';
      kintaraOrbit._t = 0;
      kintaraOrbit._hypeTotal = 0;
      kintaraOrbit._faceYaw = (character && character.rotation) ? character.rotation.y : 0;
      // Measure the avatar's real bounding box so framing tracks the actual head/face
      // height and overall size — this auto-adapts to mounts (taller subject).
      try {
        const _bb = new THREE.Box3(); const _tmp = new THREE.Box3(); const _dbg = [];
        character.traverse(o => {
          if (o && o.isMesh && o.geometry && o.visible !== false) {
            _tmp.setFromObject(o);
            if (isFinite(_tmp.min.y) && isFinite(_tmp.max.y) && _tmp.max.y > _tmp.min.y) {
              _bb.union(_tmp);
              _dbg.push({ n: String(o.name || o.type || '?').slice(0, 18), top: +(_tmp.max.y).toFixed(2), h: +(_tmp.max.y - _tmp.min.y).toFixed(2) });
            }
          }
        });
        if (_bb.isEmpty()) { kintaraOrbit._charH = 1.8; kintaraOrbit._charBaseY = character.position.y; }
        else { kintaraOrbit._charH = Math.max(0.8, _bb.max.y - _bb.min.y); kintaraOrbit._charBaseY = _bb.min.y; }
        kintaraOrbit._charDbg = _dbg.sort((a, b) => b.top - a.top).slice(0, 7);
      } catch (_) { kintaraOrbit._charH = 1.8; kintaraOrbit._charBaseY = (character && character.position) ? character.position.y : 0; }
      kintaraOrbit._initd = false;
      kintaraOrbitInitFromAvatar();
      try { localStorage.setItem('kintara.cameraMode', kintaraCameraMode); } catch (_) {}
      kintaraInstallOrbitControls();
      kintaraSyncCrosshair();
      if (typeof applyCamera === 'function') applyCamera();
      return { mode: kintaraCameraMode, orbit: { ...kintaraOrbit } };
    };
    window.__kintaraOrbitDebug = function __kintaraOrbitDebug() {
      let rigY = 0;
      try { if (character && character.avatarRigHolder) rigY = Number(character.avatarRigHolder.position.y) || 0; } catch (_) {}
      const footY = (kintaraOrbit._charBaseY != null) ? kintaraOrbit._charBaseY : (character ? character.position.y : 0);
      const headTop = (character ? character.position.y : 0) + rigY + 1.42;
      const H = Math.max(0.9, headTop - footY);
      const _v = new THREE.Vector3();
      const ndcY = wy => { _v.set(character.position.x, wy, character.position.z); _v.project(kintaraOrbitCamera); return +_v.y.toFixed(3); };
      const dx = kintaraOrbitCamera.position.x - character.position.x;
      const dz = kintaraOrbitCamera.position.z - character.position.z;
      const dyy = kintaraOrbitCamera.position.y - footY;
      return {
        rigY: +rigY.toFixed(2), footY: +footY.toFixed(2), headTop: +headTop.toFixed(2), visualH: +H.toFixed(2),
        camDist: +Math.sqrt(dx * dx + dz * dz + dyy * dyy).toFixed(2), radius: +kintaraOrbit.radius.toFixed(2), fov: Math.round(kintaraOrbitCamera.fov),
        footNdc: ndcY(footY), eyeNdc: ndcY(footY + H * 0.88), headNdc: ndcY(headTop)
      };
    };
    window.__kintaraCrosshair = function __kintaraCrosshair(on) {
      kintaraCrosshairOn = on !== false;
      kintaraSyncCrosshair();
      return { crosshair: kintaraCrosshairOn };
    };
    window.__kintaraCameraCustom = function __kintaraCameraCustom(x = 2, y = 1.35, z = 2, zoom = 5.5) {
      kintaraCameraMode = 'custom';
      CAM_OFF.set(Number(x) || 2, Number(y) || 1.35, Number(z) || 2);
      if (typeof kintaraCameraZoom === 'number') kintaraCameraZoom = Math.max(0.6, Math.min(10.0, Number(zoom) || 5.5));
      if (character && panTarget) panTarget.set(character.position.x, 0, character.position.z);
      if (typeof applyCamera === 'function') applyCamera();
      return {
        mode: kintaraCameraMode,
        offset: [CAM_OFF.x, CAM_OFF.y, CAM_OFF.z],
        zoom: typeof kintaraCameraZoom === 'number' ? kintaraCameraZoom : null,
      };
    };
  }`;
    if (!out.includes(camOffNeedle)) {
      throw new Error('CAM_OFF needle not found; game bundle layout changed');
    }
    out = out.replace(camOffNeedle, camOffPatch);
  
    const zoomNeedle = "let kintaraCameraZoom = KINTARA_HOME_BG_SHOT ? KINTARA_ZOOM_MIN : KINTARA_ZOOM_MAX;";
    const zoomPatch = String.raw`let kintaraCameraZoom = KINTARA_HOME_BG_SHOT ? KINTARA_ZOOM_MIN : KINTARA_ZOOM_MAX;
  try {
    const savedMode = String(localStorage.getItem('kintara.cameraMode') || 'iso').toLowerCase();
    if (KINTARA_CAMERA_OFFSETS[savedMode]) {
      kintaraCameraMode = savedMode;
      applyKintaraCameraModeOffset();
      if (savedMode !== 'iso') kintaraCameraZoom = 1.5;
    }
  } catch (_) {}
  if (typeof window !== 'undefined') {
    window.__kintaraCameraZoom = function __kintaraCameraZoom(z) {
      const next = Math.max(0.6, Math.min(10.0, Number(z) || KINTARA_ZOOM_MAX));
      kintaraCameraZoom = next;
      if (typeof applyCamera === 'function') applyCamera();
      return kintaraCameraZoom;
    };
  }`;
    if (!out.includes(zoomNeedle)) {
      throw new Error('camera zoom needle not found; game bundle layout changed');
    }
    out = out.replace(zoomNeedle, zoomPatch);
  
    out = out.replaceAll(
      'kintaraCameraZoom = Math.min(KINTARA_ZOOM_MAX, kintaraCameraZoom * 1.06);',
      "kintaraCameraZoom = Math.min((kintaraCameraMode === 'custom' ? 10.0 : KINTARA_ZOOM_MAX), kintaraCameraZoom * 1.06);"
    );
  
    const renderNeedle = 'renderer.render(getActiveScene(), camera);';
    if (!out.includes(renderNeedle)) {
      throw new Error('main render needle not found; game bundle layout changed');
    }
    out = out.replaceAll(renderNeedle, 'renderKintaraMainScene(getActiveScene());');
  
    const clickHandlerNeedle = "window.addEventListener('click', e => {\n  if (spectatorMode) {";
    const clickHandlerPatch = "function kintaraHandleMainWorldClick(e) {\n  if (spectatorMode) {";
    if (!out.includes(clickHandlerNeedle)) {
      throw new Error('main world click handler needle not found; game bundle layout changed');
    }
    out = out.replace(clickHandlerNeedle, clickHandlerPatch);
    const firstClickHandlerEnd = '\n});\n\n/** Double-click a toggleable piece';
    if (!out.includes(firstClickHandlerEnd)) {
      throw new Error('main world click handler end needle not found; game bundle layout changed');
    }
    out = out.replace(firstClickHandlerEnd, "\n}\nwindow.addEventListener('click', kintaraHandleMainWorldClick);\nfunction kintaraFirstPersonUseSelectedAtCenter(e) {\n  if (typeof tryHandleKintaraFirstPersonFishing === 'function' && tryHandleKintaraFirstPersonFishing(e)) return true;\n  kintaraHandleMainWorldClick(e);\n  return true;\n}\n\n/** Double-click a toggleable piece");
  
    out = out.replace(
      "function kintaraHandleMainWorldClick(e) {\n  if (spectatorMode) {",
      "function kintaraHandleMainWorldClick(e) {\n  if (typeof tryHandleKintaraFirstPersonFishing === 'function' && tryHandleKintaraFirstPersonFishing(e)) return;\n  if (spectatorMode) {"
    );
  
    out = out
      .replaceAll('raycaster.setFromCamera(getNDC(e), camera);', 'raycaster.setFromCamera(getNDC(e), getKintaraInteractionCamera());')
      .replaceAll('raycaster.setFromCamera(getMainViewNDC(e), camera);', 'raycaster.setFromCamera(getMainViewNDC(e), getKintaraInteractionCamera());')
      .replaceAll('raycaster.setFromCamera(ndc, camera);', 'raycaster.setFromCamera(ndc, getKintaraInteractionCamera());');
    out = out.replaceAll('.project(camera)', '.project(getKintaraInteractionCamera())');
  
    return out;
  }

  function loadOriginal(url) {
    var s = document.createElement('script'); s.type = 'module'; s.src = url; document.head.appendChild(s);
  }
  function injectBlob(out) {
    var blob = new Blob([out], { type: 'text/javascript' });
    var s = document.createElement('script'); s.type = 'module'; s.src = URL.createObjectURL(blob);
    document.head.appendChild(s);
    whenReady();
  }
  // If our block lost the timing race, the original game code runs on its own and draws
  // a large canvas. In that case we must NOT also inject our patched copy, or the game
  // double-loads (another-tab warning + WebGL crash). So we wait for load, then only
  // inject when the game has NOT already rendered. Worst case: no camera this load, but
  // the game itself never breaks.
  function gameAlreadyRendered() {
    var big = false;
    document.querySelectorAll('canvas').forEach(function (c) { if (c.width >= 400 && c.height >= 300) big = true; });
    return big;
  }
  function loadPatched(url) {
    fetch(url, { cache: 'no-store' }).then(function (r) { return r.text(); }).then(function (code) {
      var out = null;
      try { out = absolutizeImports(patchGameSource(code)); }
      catch (e) { console.warn('[KinCam] patch skipped (' + e.message + ')'); }
      function decide() {
        setTimeout(function () {
          if (gameAlreadyRendered()) { console.warn('[KinCam] game loaded before KinCam could patch it; skipping to avoid a double-load. Refresh to enable the camera.'); return; }
          if (out) injectBlob(out); else loadOriginal(url);
        }, 350);
      }
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', decide); else decide();
    }).catch(function (e) {
      console.warn('[KinCam] fetch failed (' + e.message + ')');
      function d() { if (!gameAlreadyRendered()) loadOriginal(url); }
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', d); else d();
    });
  }
  function tryHandle(node) {
    if (handled || !node || node.tagName !== 'SCRIPT') return;
    var type = (node.getAttribute && node.getAttribute('type')) || node.type || '';
    var src = node.src || (node.getAttribute && node.getAttribute('src')) || '';
    if (type === 'module' && GAME_RE.test(src)) {
      handled = true;
      var realUrl = node.src || new URL(src, location.href).href;
      node.type = 'kx/blocked';        // neutralize so the original never executes
      node.removeAttribute('src');
      loadPatched(realUrl);
    }
  }

  var mo = new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) for (var j = 0; j < muts[i].addedNodes.length; j++) tryHandle(muts[i].addedNodes[j]);
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
  // in case the tag is already present at injection time
  Array.prototype.forEach.call(document.querySelectorAll('script[type=module]'), tryHandle);

  function whenReady() {
    var tries = 0;
    var iv = setInterval(function () {
      if (typeof window.__kintaraCameraMode === 'function') { clearInterval(iv); mountPanel(); }
      else if (++tries > 600) clearInterval(iv);
    }, 100);
  }

  function mountPanel() {
    /* ============================================================================
     * Kintara Cinematic Camera — in-game control panel  (kintara-camera-panel.js)
     * ----------------------------------------------------------------------------
     * A self-contained, dependency-free overlay UI for the Kintara camera engine.
     * It draws a draggable glass panel on top of the game and drives the camera
     * through the engine's public hooks:
     *     window.__kintaraCameraMode(mode)
     *     window.__kintaraFirstPerson(config)
     *     window.__kintaraFreeCam(config)
     *     window.__kintaraAutoPan(config)
     *     window.__kintaraCrosshair(on)
     *     window.__kintaraPerspectiveControls.status()   (optional, for readout)
     *
     * No build step, no framework, no network. Drop it in after the camera engine
     * is present (or load it anytime — it waits for the engine), e.g.:
     *     <script src="kintara-camera-panel.js"></script>
     *
     * Hotkeys:  H = hide/show the whole panel (clean recordings)
     * ========================================================================== */
    (function () {
      if (window.__kintaraPanelMounted) return;
      window.__kintaraPanelMounted = true;
    
      /* ---- preset configs (match the engine's first-person camera) ----------- */
      var PRESETS = {
        fp:   { yawOffset: 0, behind: 0.12, side: 0.00, height: 0.92, lookHeight: 0.82, lookAhead: 10, pitch: -0.025, mouseSensitivity: 0.0042, hideAvatar: true },
        play: { yawOffset: 0, behind: 1.95, side: 0.00, height: 1.70, lookHeight: 1.25, lookAhead: 10, pitch: -0.03,  mouseSensitivity: 0.0042, hideAvatar: false }, // classic centered follow
        ots:  { yawOffset: 0, behind: 1.25, side: 0.72, height: 1.78, lookHeight: 1.28, lookAhead: 8,  pitch: -0.02,  mouseSensitivity: 0.0042, hideAvatar: false }  // Dark Souls offset shoulder
      };
      var fc = { radius: 7, elevation: 0.55, lookHeight: 1.05 };
      var ap = { autoSpeed: 0.32, radius: 9, elevation: 0.55, autoStyle: 'orbit' };
      var fp = Object.assign({}, PRESETS.fp);   // live first-person config
    
      /* ---- tiny helpers ------------------------------------------------------ */
      function has(name) { return typeof window[name] === 'function'; }
      function call(name, arg) { try { if (has(name)) return window[name](arg); } catch (e) {} }
      function fmt(v, dp) { return Number(v).toFixed(dp == null ? 2 : dp); }
      function el(tag, cls, html) { var n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; }
    
      /* ---- theme (deep midnight glass + electric-blue glow) ------------------ */
      var CSS = ''
      + '#kx{position:fixed;top:18px;right:18px;width:312px;z-index:2147483000;'
      +   'font-family:system-ui,Segoe UI,Roboto,sans-serif;color:#dfe8f6;'
      +   'background:linear-gradient(180deg,rgba(15,23,42,.92),rgba(9,14,28,.94));'
      +   'border:1px solid rgba(96,150,238,.22);border-radius:16px;'
      +   'box-shadow:0 18px 60px -12px rgba(0,0,0,.7),0 0 0 1px rgba(120,170,255,.05) inset,0 0 40px -18px rgba(70,140,255,.5);'
      +   'backdrop-filter:blur(16px) saturate(135%);-webkit-backdrop-filter:blur(16px) saturate(135%);'
      +   'overflow:hidden;user-select:none;font-size:13px;transition:opacity .18s,transform .18s}'
      + '#kx.kx-hidden{opacity:0;transform:translateY(-8px) scale(.98);pointer-events:none}'
      + '#kx .kx-top{position:absolute;inset:0 0 auto 0;height:2px;'
      +   'background:linear-gradient(90deg,transparent,#4d8bff,#5ad6ff,transparent)}'
      + '#kx .kx-hd{display:flex;align-items:center;gap:9px;padding:13px 14px 11px;cursor:grab}'
      + '#kx .kx-hd:active{cursor:grabbing}'
      + '#kx .kx-logo{width:26px;height:26px;flex:0 0 auto;border-radius:6px;filter:drop-shadow(0 0 6px rgba(90,160,255,.55))}'
      + '#kx .kx-ttl{font-family:system-ui,Segoe UI,Roboto,sans-serif;font-weight:700;font-size:13px;letter-spacing:.14em;'
      +   'text-transform:uppercase;background:linear-gradient(90deg,#cfe2ff,#8fb8ff);-webkit-background-clip:text;background-clip:text;color:transparent}'
      + '#kx .kx-sub{font-size:10px;color:#6f86ab;letter-spacing:.05em;margin-top:1px}'
      + '#kx .kx-hd-sp{flex:1}'
      + '#kx .kx-ic{width:26px;height:26px;display:grid;place-items:center;border-radius:8px;cursor:pointer;'
      +   'color:#9fb4d6;border:1px solid transparent;transition:.15s}'
      + '#kx .kx-ic:hover{background:rgba(90,140,230,.16);color:#dfe8f6;border-color:rgba(96,150,238,.25)}'
      + '#kx .kx-close:hover{background:rgba(255,90,90,.18);color:#ff8d8d;border-color:rgba(255,90,90,.3)}'
      + '#kx .kx-bd{padding:4px 14px 14px;max-height:78vh;overflow-y:auto}'
      + '#kx .kx-bd::-webkit-scrollbar{width:7px}#kx .kx-bd::-webkit-scrollbar-thumb{background:rgba(96,150,238,.3);border-radius:8px}'
      + '#kx.kx-collapsed .kx-bd{display:none}'
      + '#kx .kx-sec{margin-top:13px}'
      + '#kx .kx-lab{display:flex;align-items:center;gap:7px;font-family:system-ui,Segoe UI,Roboto,sans-serif;font-size:10px;font-weight:600;'
      +   'letter-spacing:.13em;text-transform:uppercase;color:#7d93b6;margin:0 0 8px}'
      + '#kx .kx-lab .kx-dot{width:5px;height:5px;border-radius:50%;background:#4d8bff;box-shadow:0 0 8px #4d8bff}'
      + '#kx .kx-lab .kx-line{flex:1;height:1px;background:linear-gradient(90deg,rgba(96,150,238,.28),transparent)}'
      + '#kx .kx-hint{font-size:11px;line-height:1.5;color:#74899e;margin:-2px 0 9px}'
      + '#kx .kx-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}'
      + '#kx .kx-grid.k3{grid-template-columns:1fr 1fr 1fr}'
      + '#kx .kx-pill{appearance:none;cursor:pointer;font:inherit;font-weight:600;font-size:12px;color:#c4d3ea;'
      +   'background:rgba(34,48,74,.55);border:1px solid rgba(96,150,238,.18);border-radius:10px;padding:9px 8px;'
      +   'text-align:center;transition:.15s;position:relative;overflow:hidden}'
      + '#kx .kx-pill:hover{background:rgba(48,68,108,.7);border-color:rgba(120,170,255,.4);color:#fff}'
      + '#kx .kx-pill.on{color:#fff;border-color:transparent;'
      +   'background:linear-gradient(135deg,#3d7bff,#4fb6ff);box-shadow:0 4px 16px -4px rgba(70,140,255,.65),0 0 0 1px rgba(150,200,255,.3) inset}'
      + '#kx .kx-act{width:100%;margin-top:8px;color:#2a1b04;border:none;display:flex;align-items:center;justify-content:center;gap:7px;'
      +   'background:linear-gradient(135deg,#f4b13e,#ffd277);box-shadow:0 4px 18px -4px rgba(240,170,60,.6),0 0 0 1px rgba(255,225,150,.4) inset}'
      + '#kx .kx-act:hover{background:linear-gradient(135deg,#ffbe50,#ffdc8c);color:#2a1b04;box-shadow:0 6px 22px -4px rgba(240,170,60,.75)}'
      + '#kx .kx-act:active{transform:translateY(1px)}'
      + '#kx .kx-row{display:flex;gap:7px}#kx .kx-row .kx-pill{flex:1}'
      + '#kx .kx-sl{display:grid;grid-template-columns:64px 1fr 40px;align-items:center;gap:9px;margin:8px 0}'
      + '#kx .kx-sl>span:first-child{font-size:11px;color:#9db0cc}'
      + '#kx .kx-sl .kx-v{font-size:11px;text-align:right;color:#7fb6ff;font-variant-numeric:tabular-nums}'
      + '#kx input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:4px;border-radius:4px;'
      +   'background:rgba(120,150,200,.22);outline:none}'
      + '#kx input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:15px;height:15px;border-radius:50%;'
      +   'background:radial-gradient(circle at 35% 30%,#bfe0ff,#4d8bff);cursor:pointer;'
      +   'box-shadow:0 0 0 3px rgba(77,139,255,.22),0 0 10px rgba(77,139,255,.7);border:none}'
      + '#kx input[type=range]::-moz-range-thumb{width:15px;height:15px;border:none;border-radius:50%;'
      +   'background:radial-gradient(circle at 35% 30%,#bfe0ff,#4d8bff);cursor:pointer;box-shadow:0 0 10px rgba(77,139,255,.7)}'
      + '#kx .kx-tog{display:flex;align-items:center;gap:9px;cursor:pointer;font-size:12px;color:#bccbe2;margin-top:4px}'
      + '#kx .kx-sw{width:36px;height:20px;border-radius:20px;background:rgba(120,150,200,.25);position:relative;transition:.18s;flex:0 0 auto}'
      + '#kx .kx-sw::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#dfe8f6;transition:.18s}'
      + '#kx .kx-tog.on .kx-sw{background:linear-gradient(135deg,#3d7bff,#4fb6ff);box-shadow:0 0 12px -2px rgba(77,139,255,.8)}'
      + '#kx .kx-tog.on .kx-sw::after{left:18px}'
      + '#kx .kx-foot{display:flex;align-items:center;gap:8px;margin-top:14px;padding-top:11px;border-top:1px solid rgba(96,150,238,.14)}'
      + '#kx .kx-stat{flex:1;font-size:11px;color:#8aa0c0}'
      + '#kx .kx-stat b{color:#7fb6ff;font-weight:600}'
      + '#kx .kx-kbd{font-size:10px;color:#6f86ab;border:1px solid rgba(96,150,238,.22);border-radius:5px;padding:2px 6px;background:rgba(20,30,50,.6)}'
      + '#kx-tab{position:fixed;top:18px;right:18px;z-index:2147483000;cursor:pointer;display:none;'
      +   'align-items:center;gap:7px;padding:8px 12px;border-radius:11px;font:600 12px system-ui,Segoe UI,Roboto,sans-serif;letter-spacing:.1em;'
      +   'color:#cfe2ff;background:linear-gradient(180deg,rgba(15,23,42,.92),rgba(9,14,28,.94));'
      +   'border:1px solid rgba(96,150,238,.28);box-shadow:0 8px 30px -8px rgba(0,0,0,.7);'
      +   'backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}'
      + '#kx-tab.show{display:flex}#kx-tab:hover{border-color:rgba(120,170,255,.5)}'
      + '#kx .kx-actrow{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px}'
      + '#kx .kx-hype{width:100%;padding:12px;border:none;border-radius:12px;cursor:pointer;font:700 13px system-ui,Segoe UI,Roboto,sans-serif;letter-spacing:.09em;color:#fff;'
      +   'background:linear-gradient(135deg,#ff7a3d,#ff4d8d 55%,#a45cff);box-shadow:0 6px 24px -4px rgba(255,90,140,.6),0 0 0 1px rgba(255,205,175,.3) inset;transition:.15s}'
      + '#kx .kx-hype:hover{filter:brightness(1.08);box-shadow:0 9px 30px -4px rgba(255,90,140,.8)}'
      + '#kx .kx-hype:active{transform:translateY(1px)}'
      + '#kx .kx-rec-on{color:#fff!important;border-color:transparent!important;background:linear-gradient(135deg,#ff4d4d,#ff7a5c)!important;box-shadow:0 0 16px -2px rgba(255,80,80,.7)!important}'
      + '#kx .kx-pname{flex:1;min-width:0;background:rgba(13,20,36,.85);border:1px solid rgba(96,150,238,.22);border-radius:9px;color:#dfe8f6;padding:8px 10px;font:inherit;font-size:12px;outline:none}'
      + '#kx .kx-pname:focus{border-color:rgba(120,170,255,.5)}'
      + '#kx .kx-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}'
      + '#kx .kx-chip{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:#cdddf3;background:rgba(34,48,74,.6);border:1px solid rgba(96,150,238,.2);border-radius:20px;padding:5px 9px;cursor:pointer;transition:.15s}'
      + '#kx .kx-chip:hover{background:rgba(48,68,108,.75);border-color:rgba(120,170,255,.45)}'
      + '#kx .kx-chip .x{font-size:14px;line-height:1;opacity:.6}#kx .kx-chip .x:hover{color:#ff9d9d;opacity:1}'
      + '#kx-rec{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:2147483600;display:none;align-items:center;gap:9px;cursor:pointer;'
      +   'padding:7px 14px;border-radius:22px;font:600 12px system-ui,Segoe UI,Roboto,sans-serif;letter-spacing:.08em;color:#ffe2e2;'
      +   'background:rgba(36,12,16,.85);border:1px solid rgba(255,90,90,.5);box-shadow:0 8px 30px -6px rgba(0,0,0,.6);backdrop-filter:blur(8px)}'
      + '#kx-rec.show{display:flex}'
      + '#kx-rec .dot{width:9px;height:9px;border-radius:50%;background:#ff4d4d;box-shadow:0 0 10px #ff4d4d;animation:kxpulse 1s infinite}'
      + '@keyframes kxpulse{0%,100%{opacity:1}50%{opacity:.3}}'
      + '#kx .kx-acc{border:1px solid rgba(96,150,238,.14);border-radius:12px;margin-top:9px;overflow:hidden;background:rgba(20,30,52,.32)}'
      + '#kx .kx-acc-h{display:flex;align-items:center;gap:9px;padding:11px 12px;cursor:pointer;font-family:system-ui,Segoe UI,Roboto,sans-serif;font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#c4d3ea;transition:.15s}'
      + '#kx .kx-acc-h:hover{background:rgba(60,90,150,.18);color:#fff}'
      + '#kx .kx-acc-dot{width:6px;height:6px;border-radius:50%;background:#4d8bff;box-shadow:0 0 8px #4d8bff;flex:0 0 auto}'
      + '#kx .kx-acc-t{flex:1}'
      + '#kx .kx-chev{transition:transform .2s;color:#6f86ab;font-size:10px}'
      + '#kx .kx-acc.kx-open .kx-chev{transform:rotate(180deg)}'
      + '#kx .kx-acc-b{display:none;padding:2px 12px 13px}'
      + '#kx .kx-acc.kx-open .kx-acc-b{display:block}'
      + '#kx .kx-tip{width:100%;margin-top:11px;padding:10px;border:1px solid rgba(255,120,180,.35);border-radius:11px;cursor:pointer;font:600 12px system-ui,Segoe UI,Roboto,sans-serif;letter-spacing:.05em;color:#ffd0e4;background:rgba(60,20,40,.4);transition:.15s;display:flex;align-items:center;justify-content:center;gap:7px}'
      + '#kx .kx-tip:hover{background:rgba(90,30,60,.55);border-color:rgba(255,120,180,.6);color:#fff}'
      + '#kx .kx-tip .h{color:#ff6fae}'
      + '#kx .kx-tipcard{display:none;margin-top:8px;padding:12px;border-radius:11px;background:rgba(20,30,52,.5);border:1px solid rgba(96,150,238,.18)}'
      + '#kx .kx-tipcard.show{display:block}'
      + '#kx .kx-tipmsg{font-size:12px;color:#cdddf3;text-align:center;margin-bottom:9px}'
      + '#kx .kx-tipaddr{font:11px ui-monospace,Menlo,Consolas,monospace;color:#9fc4ff;background:rgba(13,20,36,.85);border:1px solid rgba(96,150,238,.2);border-radius:8px;padding:8px;word-break:break-all;text-align:center;line-height:1.4}';
    
      var LOGO = '<img class=kx-logo alt="" src="data:image/png;base64,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">';
    
      /* ---- build DOM --------------------------------------------------------- */
      var style = el('style'); style.textContent = CSS; document.head.appendChild(style);
    
      var root = el('div'); root.id = 'kx';
      root.appendChild(el('div', 'kx-top'));
    
      var hd = el('div', 'kx-hd');
      hd.innerHTML = LOGO + '<div><div class=kx-ttl>KinCam</div><div class=kx-sub>CINEMATIC CAMERA</div></div><div class=kx-hd-sp></div>';
      var btnCollapse = el('div', 'kx-ic', '&#9776;'); btnCollapse.title = 'Collapse';
      var btnHide = el('div', 'kx-ic', eyeSvg()); btnHide.title = 'Hide to tab (H)';
      var btnClose = el('div', 'kx-ic kx-close', '&#10005;'); btnClose.title = 'Shut down (back to normal game)';
      hd.appendChild(btnCollapse); hd.appendChild(btnHide); hd.appendChild(btnClose);
      root.appendChild(hd);
    
      var bd = el('div', 'kx-bd');
      bd.innerHTML =
          acc('play', 'Play Mode', 'Angles you play from.',
              '<div class="kx-grid k3" id=kx-views>' + pill('iso', 'Normal') + pill('first', 'First-person') + pill('play', 'Play') + '</div>'
            + '<div class="kx-row" style="margin-top:7px">' + pill('ots', 'Over-shoulder', 'wide') + pill('custom', 'Custom', 'wide') + '</div>'
            + '<button class="kx-pill kx-act" id=kx-use>&#9876;&#65039; Use Equipped Item &middot; Space</button>'
            + '<div id=kx-custom-tune style="display:none">'
              + '<div class=kx-hint style="margin-top:11px">Place the camera with the sliders, then play normally &mdash; <b>WASD</b> + mouse.</div>'
              + slider('behind', 'Behind', 0, 3, 0.02, fp.behind) + slider('side', 'Side', -1, 1, 0.02, fp.side)
              + slider('height', 'Height', 0.3, 2.5, 0.02, fp.height) + slider('lookAhead', 'Look', 2, 20, 0.5, fp.lookAhead)
              + slider('pitch', 'Pitch', -0.46, 0.42, 0.01, fp.pitch)
              + '<div class="kx-tog' + (fp.hideAvatar ? ' on' : '') + '" id=kx_hideAvatar><div class=kx-sw></div>Hide avatar</div>'
            + '</div>', true)
        + acc('photo', 'Photo', 'Free-roam the camera and grab stills.',
              '<div class=kx-row>' + pill('freecam', 'Free Cam', 'wide') + '<button class=kx-pill id=kx-photo style="flex:1">&#128247; Photo</button></div>'
            + '<div class=kx-hint style="margin-top:9px"><b>Free Cam:</b> WASD walk &middot; drag orbit &middot; scroll zoom &middot; R reset. <b>Photo</b> saves a clean PNG.</div>'
            + '<div style="display:flex;gap:7px;margin-top:4px"><input class=kx-pname id=kx-pname placeholder="save this framing&hellip;" maxlength=24><button class=kx-pill id=kx-save style="flex:0 0 auto">Save</button></div>'
            + '<div class=kx-chips id=kx-chips></div>')
        + acc('video', 'Video', 'Cinematic auto-moves &amp; recording.',
              '<button class=kx-hype id=kx-hype>&#128293; HYPE MODE &middot; auto 20s reel</button>'
            + '<div class=kx-lab style="margin-top:13px"><span class=kx-dot></span>Auto Pan<span class=kx-line></span></div>'
            + '<div class="kx-grid" id=kx-styles>' + pill('orbit', 'Orbit') + pill('sweep', 'Sweep') + pill('rise', 'Rising') + pill('pushin', 'Push-in') + '</div>'
            + slider('ap_autoSpeed', 'Speed', 0.05, 1.2, 0.02, ap.autoSpeed) + slider('ap_radius', 'Radius', 2, 40, 0.5, ap.radius) + slider('ap_elevation', 'Tilt', -0.3, 1.48, 0.02, ap.elevation)
            + '<button class=kx-pill id=kx-rec-btn style="width:100%;margin-top:11px">&#9210; Record clip</button>')
        + acc('adv', 'Advanced', '',
              '<div class="kx-tog on" id=kx_cross><div class=kx-sw></div>Crosshair</div>'
            + '<div class="kx-tog" id=kx-hideothers><div class=kx-sw></div>Hide other players’ names</div>'
            + '<div class="kx-tog" id=kx-hideown><div class=kx-sw></div>Hide my name &amp; level</div>')
        + '<button class=kx-tip id=kx-tip><span class=h>&#9829;</span> Tip the dev</button>'
        + '<div class=kx-tipcard id=kx-tipcard>'
        +   '<div class=kx-tipmsg>Would appreciate any tips! SOL or KINS ty &lt;3</div>'
        +   '<div class=kx-tipaddr id=kx-addr>F1ULZxHK9PicLNp5Nk6DnS86Rk1Lc37rX6ex7XprACQf</div>'
        +   '<button class=kx-pill id=kx-copy style="width:100%;margin-top:8px">Copy address</button>'
        + '</div>'
        + '<div class=kx-foot><div class=kx-stat id=kx-stat>engine: <b>checking&hellip;</b></div><span class=kx-kbd>H</span><span style="font-size:10px;color:#6f86ab">hide</span></div>';
      root.appendChild(bd);
      document.body.appendChild(root);
    
      var tab = el('div'); tab.id = 'kx-tab'; tab.innerHTML = LOGO + 'KinCam';
      document.body.appendChild(tab);
    
      // Stop panel interactions from reaching the game's click-to-move / world handlers.
      // Bubble-phase only, so the panel's own buttons & sliders still work normally.
      ['click', 'mousedown', 'mouseup', 'dblclick', 'pointerdown', 'pointerup', 'wheel', 'contextmenu', 'touchstart', 'touchend']
        .forEach(function (ev) {
          var stop = function (e) { e.stopPropagation(); };
          root.addEventListener(ev, stop, false);
          tab.addEventListener(ev, stop, false);
        });
    
      /* ---- section / control builders --------------------------------------- */
      function acc(id, title, hint, inner, open) {
        return '<div class="kx-acc' + (open ? ' kx-open' : '') + '" data-acc="' + id + '">'
          + '<div class=kx-acc-h><span class=kx-acc-dot></span><span class=kx-acc-t>' + title + '</span><span class=kx-chev>&#9662;</span></div>'
          + '<div class=kx-acc-b>' + (hint ? '<div class=kx-hint style="margin-top:0">' + hint + '</div>' : '') + inner + '</div></div>';
      }
      function pill(id, label, wide) { return '<button class=kx-pill data-k="' + id + '"' + (wide ? ' style="flex:1"' : '') + '>' + label + '</button>'; }
      function slider(id, label, min, max, step, val) {
        return '<div class=kx-sl><span>' + label + '</span>'
          + '<input type=range id=kx_' + id + ' min=' + min + ' max=' + max + ' step=' + step + ' value=' + val + '>'
          + '<span class=kx-v id=kxv_' + id + '>' + fmt(val, step < 0.01 ? 3 : 2) + '</span></div>';
      }
      function eyeSvg() {
        return '<svg width=15 height=15 viewBox="0 0 24 24" fill=none stroke=currentColor stroke-width=1.7><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx=12 cy=12 r=2.6/></svg>';
      }
    
      /* ---- wiring ------------------------------------------------------------ */
      var Q = function (s) { return root.querySelector(s); };
      var QA = function (s) { return Array.prototype.slice.call(root.querySelectorAll(s)); };
      var activeView = null, activeStyle = null;
    
      function setActive(group, id) {
        QA(group + ' .kx-pill').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-k') === id); });
      }
      var customSeeded = false;
      function showCustomTune(on) { var e = Q('#kx-custom-tune'); if (e) e.style.display = on ? 'block' : 'none'; }
      function applyView(id) {
        activeView = id; setActive('#kx-views', id);
        showCustomTune(id === 'custom');
        if (id === 'iso') call('__kintaraCameraMode', 'iso');
        else if (id === 'freecam') call('__kintaraFreeCam', { radius: fc.radius, elevation: fc.elevation, lookHeight: fc.lookHeight });
        else if (id === 'custom') { if (!customSeeded) { fp = Object.assign({}, PRESETS.play); customSeeded = true; } syncFpSliders(); call('__kintaraFirstPerson', fp); }
        else { fp = Object.assign({}, PRESETS[id] || PRESETS.fp); syncFpSliders(); call('__kintaraFirstPerson', fp); }
        // pills that live outside the #kx-views grid (Over-shoulder / Custom / Free Cam)
        QA('.kx-pill').forEach(function (b) { var k = b.getAttribute('data-k'); if (k === 'freecam' || k === 'ots' || k === 'custom') b.classList.toggle('on', k === id); });
      }
      function applyStyle(id) { activeStyle = id; ap.autoStyle = id; setActive('#kx-styles', id); call('__kintaraAutoPan', { autoSpeed: ap.autoSpeed, radius: ap.radius, elevation: ap.elevation, autoStyle: id }); }
      function syncFpSliders() {
        ['behind', 'side', 'height', 'lookAhead', 'pitch'].forEach(function (k) {
          var i = Q('#kx_' + k); if (i) { i.value = fp[k]; Q('#kxv_' + k).textContent = fmt(fp[k], k === 'pitch' ? 3 : 2); }
        });
        Q('#kx_hideAvatar').classList.toggle('on', !!fp.hideAvatar);
      }
    
      QA('.kx-pill[data-k]').forEach(function (b) {
        var k = b.getAttribute('data-k');
        b.addEventListener('click', function () {
          if (k === 'orbit' || k === 'sweep' || k === 'rise' || k === 'pushin') applyStyle(k);
          else applyView(k);
        });
      });
    
      // collapsible dropdowns
      QA('.kx-acc-h').forEach(function (h) { h.addEventListener('click', function () { this.parentElement.classList.toggle('kx-open'); }); });
    
      function bindSlider(id, onInput, dp) {
        var i = Q('#kx_' + id), v = Q('#kxv_' + id);
        i.addEventListener('input', function () { var n = Number(i.value); v.textContent = fmt(n, dp); onInput(n); });
      }
      bindSlider('ap_autoSpeed', function (n) { ap.autoSpeed = n; if (activeStyle) call('__kintaraAutoPan', ap); }, 2);
      bindSlider('ap_radius', function (n) { ap.radius = n; if (activeStyle) call('__kintaraAutoPan', ap); }, 2);
      bindSlider('ap_elevation', function (n) { ap.elevation = n; if (activeStyle) call('__kintaraAutoPan', ap); }, 2);
      ['behind', 'side', 'height', 'lookAhead', 'pitch'].forEach(function (k) {
        bindSlider(k, function (n) { fp[k] = n; call('__kintaraFirstPerson', fp); }, k === 'pitch' ? 3 : 2);
      });
      Q('#kx_hideAvatar').addEventListener('click', function () { fp.hideAvatar = !fp.hideAvatar; this.classList.toggle('on', fp.hideAvatar); call('__kintaraFirstPerson', fp); });
    
      var cross = Q('#kx_cross');
      cross.addEventListener('click', function () { var on = !cross.classList.contains('on'); cross.classList.toggle('on', on); call('__kintaraCrosshair', on); });
    
      var useBtn = Q('#kx-use');
      if (useBtn) useBtn.addEventListener('click', function () {
        try { var c = window.__kintaraPerspectiveControls; if (c && typeof c.use === 'function') c.use(); } catch (e) {}
      });
    
      // Hide HUD nametags (DOM overlays) — own vs others targeted separately.
      var nameCss = el('style'); document.head.appendChild(nameCss);
      var hideOthers = false, hideOwn = false;
      function applyNameCss() {
        var css = '';
        if (hideOthers) css += '#kintara-hud-root > .kintara-spectator-keep:has(.kintara-nametag-name){display:none!important}';
        if (hideOwn) css += '#kintara-hud-root > div:not(.kintara-spectator-keep):has(.kintara-nametag-name){display:none!important}';
        nameCss.textContent = css;
      }
      var hoEl = Q('#kx-hideothers'); if (hoEl) hoEl.addEventListener('click', function () { hideOthers = !hideOthers; this.classList.toggle('on', hideOthers); applyNameCss(); });
      var hwEl = Q('#kx-hideown'); if (hwEl) hwEl.addEventListener('click', function () { hideOwn = !hideOwn; this.classList.toggle('on', hideOwn); applyNameCss(); });
    
      // tip the dev (SOL / KINS to one Solana address)
      var TIP_ADDR = 'F1ULZxHK9PicLNp5Nk6DnS86Rk1Lc37rX6ex7XprACQf';
      function fallbackCopy(t) { try { var ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('Address copied ✓'); } catch (e) { toast('Copy failed — select it manually'); } }
      var tipBtn = Q('#kx-tip'), tipCard = Q('#kx-tipcard');
      if (tipBtn) tipBtn.addEventListener('click', function () { if (tipCard) tipCard.classList.toggle('show'); });
      var copyBtn = Q('#kx-copy');
      if (copyBtn) copyBtn.addEventListener('click', function () {
        try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(TIP_ADDR).then(function () { toast('Address copied ✓'); }, function () { fallbackCopy(TIP_ADDR); }); } else fallbackCopy(TIP_ADDR); }
        catch (e) { fallbackCopy(TIP_ADDR); }
      });
    
      /* ---- header drag, collapse, hide -------------------------------------- */
      (function drag() {
        var ox, oy, dragging = false;
        hd.addEventListener('mousedown', function (e) {
          if (e.target.closest('.kx-ic')) return;
          dragging = true; var r = root.getBoundingClientRect();
          ox = e.clientX - r.left; oy = e.clientY - r.top; root.style.right = 'auto'; e.preventDefault();
        });
        window.addEventListener('mousemove', function (e) {
          if (!dragging) return;
          root.style.left = Math.max(4, Math.min(window.innerWidth - 80, e.clientX - ox)) + 'px';
          root.style.top = Math.max(4, Math.min(window.innerHeight - 40, e.clientY - oy)) + 'px';
        });
        // capture phase so the release fires even when it lands on the panel
        // (the panel stops bubbling events, which used to swallow this and leave it stuck to the cursor)
        window.addEventListener('mouseup', function () { dragging = false; }, true);
      })();
      btnCollapse.addEventListener('click', function () { root.classList.toggle('kx-collapsed'); });
      function hidePanel(h) { root.classList.toggle('kx-hidden', h); tab.classList.toggle('show', h); }
      // Toolbar-icon (extension popup) on/off hooks: fully hide BOTH the panel and its tab, and
      // remember the choice so it stays that way across reloads until shown again.
      window.__kxPanelShow = function () { try { localStorage.removeItem('kxHidden'); } catch (e) {} root.style.display = ''; tab.style.display = ''; root.classList.remove('kx-hidden'); };
      window.__kxPanelHide = function () { try { localStorage.setItem('kxHidden', '1'); } catch (e) {} root.style.display = 'none'; tab.style.display = 'none'; };
      window.__kxPanelVisible = function () { return root.style.display !== 'none'; };
      try { if (localStorage.getItem('kxHidden') === '1') { root.style.display = 'none'; tab.style.display = 'none'; } } catch (e) {}
      btnHide.addEventListener('click', function () { hidePanel(true); });
      // shut it down: hand the game back its normal camera and HIDE the panel (does not destroy
      // it, so the toolbar "Show KinCam" button can always bring it back).
      function shutdownPanel() {
        try { call('__kintaraCameraMode', 'iso'); } catch (e) {}
        if (typeof window.__kxPanelHide === 'function') window.__kxPanelHide();
        else { root.style.display = 'none'; tab.style.display = 'none'; }
      }
      btnClose.addEventListener('click', shutdownPanel);
      tab.addEventListener('click', function () { hidePanel(false); });
      window.addEventListener('keydown', function (e) {
        if (e.key === 'h' || e.key === 'H') {
          var t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
          hidePanel(!root.classList.contains('kx-hidden'));
        }
      });
    
      /* ---- studio: toast + helpers ------------------------------------------ */
      var toastEl = el('div');
      toastEl.style.cssText = 'position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:2147483600;'
        + 'background:rgba(15,23,42,.94);color:#dfe8f6;border:1px solid rgba(96,150,238,.3);border-radius:10px;'
        + 'padding:9px 16px;font:13px system-ui,sans-serif;box-shadow:0 10px 30px -8px rgba(0,0,0,.6);opacity:0;transition:opacity .2s;pointer-events:none';
      document.body.appendChild(toastEl);
      var toastT = null;
      function toast(msg) { toastEl.textContent = msg; toastEl.style.opacity = '1'; clearTimeout(toastT); toastT = setTimeout(function () { toastEl.style.opacity = '0'; }, 2300); }
    
      var recBadge = el('div'); recBadge.id = 'kx-rec';
      recBadge.innerHTML = '<span class=dot></span><span id=kx-rec-t>REC 0:00</span>';
      document.body.appendChild(recBadge);
    
      function gameCanvas() { var best = null, area = 0; Array.prototype.forEach.call(document.querySelectorAll('canvas'), function (c) { var a = c.width * c.height; if (a > area) { area = a; best = c; } }); return best; }
      function pad(n) { return (n < 10 ? '0' : '') + n; }
      function stamp() { var d = new Date(); return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()); }
      function download(blob, name) { var u = URL.createObjectURL(blob); var a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); URL.revokeObjectURL(u); }, 1500); }
    
      /* ---- photo capture ----------------------------------------------------- */
      function snapPhoto() {
        var c = gameCanvas(); if (!c) { toast('No game canvas found'); return; }
        function finish(blob) { if (blob) { download(blob, 'kintara-' + stamp() + '.png'); toast('Photo saved ✓'); } else toast('Capture failed — try Record'); }
        try {
          var stream = c.captureStream(); var track = stream.getVideoTracks()[0];
          if (window.ImageCapture && track) {
            new ImageCapture(track).grabFrame().then(function (bmp) {
              var off = document.createElement('canvas'); off.width = bmp.width; off.height = bmp.height;
              off.getContext('2d').drawImage(bmp, 0, 0); off.toBlob(function (b) { finish(b); track.stop(); }, 'image/png');
            }).catch(function () { try { c.toBlob(function (b) { finish(b); track.stop(); }, 'image/png'); } catch (e) { toast('Capture failed'); } });
          } else { c.toBlob(function (b) { finish(b); if (track) track.stop(); }, 'image/png'); }
        } catch (e) { toast('Capture not supported here'); }
      }
    
      /* ---- clip recorder ----------------------------------------------------- */
      var rec = null, recChunks = [], recStart = 0, recTick = null;
      function recActive() { return rec && rec.state !== 'inactive'; }
      function startRec(silent) {
        if (recActive()) return true;
        var c = gameCanvas(); if (!c) { toast('No game canvas found'); return false; }
        var stream; try { stream = c.captureStream(60); } catch (e) { toast('Recording not supported'); return false; }
        var mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].filter(function (m) { return window.MediaRecorder && MediaRecorder.isTypeSupported(m); })[0] || 'video/webm';
        try { rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12000000 }); } catch (e) { toast('Recorder unavailable'); return false; }
        recChunks = []; rec.ondataavailable = function (e) { if (e.data && e.data.size) recChunks.push(e.data); };
        rec.onstop = function () { var b = new Blob(recChunks, { type: 'video/webm' }); download(b, 'kintara-clip-' + stamp() + '.webm'); if (!silent) toast('Clip saved ✓'); };
        rec.start(120); recStart = Date.now();
        recBadge.classList.add('show');
        var rb = Q('#kx-rec-btn'); if (rb) { rb.classList.add('kx-rec-on'); rb.innerHTML = '&#9209;&#65039; Stop'; }
        clearInterval(recTick);
        recTick = setInterval(function () { var s = Math.floor((Date.now() - recStart) / 1000); var t = document.getElementById('kx-rec-t'); if (t) t.textContent = 'REC ' + Math.floor(s / 60) + ':' + pad(s % 60); }, 500);
        return true;
      }
      function stopRec() {
        if (recActive()) { try { rec.stop(); } catch (e) {} }
        clearInterval(recTick); recBadge.classList.remove('show');
        var rb = Q('#kx-rec-btn'); if (rb) { rb.classList.remove('kx-rec-on'); rb.innerHTML = '&#9210; Record clip'; }
      }
    
      /* ---- HYPE MODE: auto 20s hero-angle reel ------------------------------- */
      var hypeRunning = false, hypeTimers = [];
      function clearHype() { hypeTimers.forEach(clearTimeout); hypeTimers = []; }
      var HYPE_MS = 20400; // matches the engine KINTARA_HYPE_SHOTS total (~20s)
      function runHype() {
        if (!has('__kintaraAutoPan')) { toast('Camera engine not loaded'); return; }
        if (hypeRunning) { stopHype(); return; }
        hypeRunning = true; var btn = Q('#kx-hype'); if (btn) btn.textContent = '■ Stop HYPE';
        hidePanel(true);
        startRec(true);
        call('__kintaraAutoPan', { autoStyle: 'hype' }); // engine plays the cinematic, face-framed reel
        hypeTimers.push(setTimeout(stopHype, HYPE_MS));
      }
      function stopHype() {
        if (!hypeRunning) return;
        clearHype(); if (recActive()) stopRec();
        call('__kintaraCameraMode', 'iso'); hidePanel(false);
        hypeRunning = false; var btn = Q('#kx-hype'); if (btn) btn.innerHTML = '&#128293; HYPE MODE &middot; auto 20s reel';
        toast('HYPE reel saved ✓');
      }
    
      /* ---- framings: save / recall (localStorage) ---------------------------- */
      var LSKEY = 'kintaraFramings';
      function loadFramings() { try { return JSON.parse(localStorage.getItem(LSKEY) || '{}'); } catch (e) { return {}; } }
      function saveFramings(o) { try { localStorage.setItem(LSKEY, JSON.stringify(o)); } catch (e) {} }
      function escapeHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
      function currentState() { return { view: activeView, style: activeStyle, fp: Object.assign({}, fp), fc: Object.assign({}, fc), ap: Object.assign({}, ap), cross: cross.classList.contains('on') }; }
      function setSlider(id, val, dp) { var i = Q('#kx_' + id), v = Q('#kxv_' + id); if (i) i.value = val; if (v) v.textContent = fmt(val, dp == null ? 2 : dp); }
      function applyState(s) {
        if (!s) return;
        if (s.fp) fp = Object.assign({}, s.fp); if (s.fc) fc = Object.assign({}, s.fc); if (s.ap) ap = Object.assign({}, s.ap);
        setSlider('fc_radius', fc.radius); setSlider('fc_elevation', fc.elevation); setSlider('fc_lookHeight', fc.lookHeight);
        setSlider('ap_autoSpeed', ap.autoSpeed); setSlider('ap_radius', ap.radius); setSlider('ap_elevation', ap.elevation);
        syncFpSliders();
        if (s.cross != null) { cross.classList.toggle('on', !!s.cross); call('__kintaraCrosshair', !!s.cross); }
        if (s.style) applyStyle(s.style); else if (s.view) applyView(s.view);
      }
      function renderChips() {
        var o = loadFramings(), wrap = Q('#kx-chips'); if (!wrap) return; wrap.innerHTML = '';
        var names = Object.keys(o);
        if (!names.length) { wrap.innerHTML = '<span style="font-size:11px;color:#6f86ab">no saved shots yet</span>'; return; }
        names.forEach(function (n) {
          var chip = el('span', 'kx-chip'); chip.innerHTML = '<b>' + escapeHtml(n) + '</b><span class=x title="delete">&times;</span>';
          chip.addEventListener('click', function (ev) {
            if (ev.target.classList.contains('x')) { var oo = loadFramings(); delete oo[n]; saveFramings(oo); renderChips(); toast('Deleted'); }
            else { applyState(loadFramings()[n]); toast('Loaded “' + n + '”'); }
          });
          wrap.appendChild(chip);
        });
      }
    
      /* ---- studio wiring ----------------------------------------------------- */
      var pe = Q('#kx-photo'); if (pe) pe.addEventListener('click', snapPhoto);
      var re = Q('#kx-rec-btn'); if (re) re.addEventListener('click', function () { if (recActive()) stopRec(); else startRec(false); });
      var he = Q('#kx-hype'); if (he) he.addEventListener('click', runHype);
      var sv = Q('#kx-save'); if (sv) sv.addEventListener('click', function () {
        var inp = Q('#kx-pname'), n = (inp.value || '').trim(); if (!n) { toast('Name the shot first'); inp.focus(); return; }
        var o = loadFramings(); o[n] = currentState(); saveFramings(o); inp.value = ''; renderChips(); toast('Saved “' + n + '”');
      });
      recBadge.addEventListener('click', function () { if (hypeRunning) stopHype(); else stopRec(); });
      ['click', 'mousedown', 'pointerdown', 'wheel'].forEach(function (ev) { recBadge.addEventListener(ev, function (e) { e.stopPropagation(); }, false); });
      window.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && hypeRunning) stopHype();
      });
      renderChips();
    
      /* ---- engine status readout -------------------------------------------- */
      function refresh() {
        var stat = Q('#kx-stat');
        if (!has('__kintaraCameraMode')) { stat.innerHTML = 'engine: <b>not loaded</b>'; return; }
        var mode = '';
        try { var s = window.__kintaraPerspectiveControls && window.__kintaraPerspectiveControls.status(); if (s && s.mode) mode = s.mode; } catch (e) {}
        stat.innerHTML = 'engine: <b>ready</b>' + (mode ? ' &middot; ' + mode : '');
      }
      refresh(); setInterval(refresh, 2000);
    })();
    
  }
})();
