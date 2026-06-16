const btn = document.getElementById('toggle');
const note = document.getElementById('note');
const shut = document.getElementById('shutdown');
const confirmBox = document.getElementById('confirm');
const cyes = document.getElementById('cyes');
const cno = document.getElementById('cno');
const PLAY = /:\/\/kintara\.gg\/play/i;
async function activeTab(){ const [t] = await chrome.tabs.query({ active: true, currentWindow: true }); return t; }
async function runInPage(func){
  const t = await activeTab();
  if (!t || !PLAY.test(t.url || '')) return { noTab: true };
  try { const [r] = await chrome.scripting.executeScript({ target: { tabId: t.id }, world: 'MAIN', func }); return { result: r ? r.result : undefined }; }
  catch (e) { return { error: String(e.message) }; }
}
function showConfirm(on){ confirmBox.style.display = on ? 'block' : 'none'; shut.style.display = on ? 'none' : 'block'; btn.style.display = on ? 'none' : 'block'; note.style.display = on ? 'none' : 'block'; }
function setShut(on){ shut.style.display = on ? 'block' : 'none'; }
async function refresh(){
  showConfirm(false);
  const t = await activeTab();
  if (!t || !PLAY.test(t.url || '')) { btn.textContent = 'Open kintara.gg/play'; btn.disabled = true; btn.classList.add('off'); note.textContent = 'KinCam only runs in the game.'; setShut(false); return; }
  const { result } = await runInPage(() => ({ vis: (typeof window.__kxPanelVisible === 'function' ? window.__kxPanelVisible() : null), dead: !!window.__kxDead }));
  if (!result) { btn.textContent = 'Refresh the game tab'; btn.disabled = false; btn.classList.add('off'); note.textContent = 'KinCam is still loading.'; setShut(false); return; }
  if (result.dead) { btn.textContent = 'KinCam is off'; btn.disabled = true; btn.classList.add('off'); note.textContent = 'Reload the game tab to use it again.'; setShut(false); return; }
  if (result.vis === null || result.vis === undefined) { btn.textContent = 'Refresh the game tab'; btn.disabled = false; btn.classList.add('off'); note.textContent = 'KinCam is still loading.'; setShut(false); return; }
  btn.disabled = false; setShut(true);
  btn.textContent = result.vis ? 'Hide KinCam' : 'Show KinCam';
  btn.classList.toggle('off', !result.vis);
  note.textContent = result.vis ? 'Panel is showing.' : 'Panel is hidden.';
}
btn.addEventListener('click', async () => {
  const { result } = await runInPage(() => ({ vis: (typeof window.__kxPanelVisible === 'function' ? window.__kxPanelVisible() : null), dead: !!window.__kxDead }));
  if (!result || result.dead || result.vis === null || result.vis === undefined) { refresh(); return; }
  await runInPage(result.vis ? (() => { if (window.__kxPanelHide) window.__kxPanelHide(); }) : (() => { if (window.__kxPanelShow) window.__kxPanelShow(); }));
  refresh();
});
shut.addEventListener('click', () => showConfirm(true));
cno.addEventListener('click', () => showConfirm(false));
cyes.addEventListener('click', async () => { await runInPage(() => { if (typeof window.__kxShutdown === 'function') window.__kxShutdown(); }); refresh(); });
refresh();