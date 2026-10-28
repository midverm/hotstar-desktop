import { isHotstarPage } from './profile.js';

const toggle = document.getElementById('toggle');
const status = document.getElementById('status');
const openLink = document.getElementById('open');
const error = document.getElementById('error');
let activeTab;
let mode = { active: false, state: null };
let busy = false;

async function ask(action, extra = {}) {
  const response = await chrome.runtime.sendMessage({ action, ...extra });
  if (!response?.ok) throw new Error(response?.error || 'Reopen the extension and try again.');
  return response.result;
}
function showError(message) {
  error.textContent = message || '';
  error.hidden = !message;
}
async function refresh() {
  [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  mode = await ask('status');
  const onHotstar = isHotstarPage(activeTab?.url);
  toggle.setAttribute('aria-checked', String(mode.active));
  toggle.disabled = busy || (!mode.active && !onHotstar);
  toggle.setAttribute('aria-busy', String(busy));
  status.textContent = mode.active
    ? mode.state?.tabId === activeTab?.id ? 'On for this tab' : 'On in another Hotstar tab'
    : onHotstar ? 'Off' : 'Open Hotstar to turn it on.';
  openLink.hidden = onHotstar;
}
toggle.addEventListener('click', async () => {
  if (busy) return;
  const turnOn = !mode.active;
  busy = true;
  toggle.disabled = true;
  toggle.setAttribute('aria-busy', 'true');
  status.textContent = turnOn ? 'Turning on…' : 'Turning off…';
  showError();
  try { await ask(turnOn ? 'enable' : 'disable', { tabId: activeTab?.id }); }
  catch (failure) { showError(failure.message); }
  finally {
    busy = false;
    await refresh().catch(failure => { toggle.disabled = true; showError(failure.message); });
  }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes.state && !busy) refresh().catch(failure => showError(failure.message));
});
refresh().catch(failure => { status.textContent = 'Unavailable'; showError(failure.message); });
