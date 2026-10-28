import { RULE_IDS, isHotstarPage, makeRules } from './profile.js';

const api = chrome;
// Keep rule changes and their session state in the same operation.
let queue = Promise.resolve();
function exclusive(task) {
  const result = queue.then(task, task);
  queue = result.catch(() => {});
  return result;
}
const readState = async () => (await api.storage.session.get('state')).state || null;

export async function status() {
  const [state, rules] = await Promise.all([readState(), api.declarativeNetRequest.getSessionRules()]);
  const owned = rules.filter(rule => RULE_IDS.includes(rule.id));
  const complete = owned.length === RULE_IDS.length && state && owned.every(rule => rule.condition.tabIds?.length === 1 && rule.condition.tabIds[0] === state.tabId);
  if (owned.length && !complete) {
    await api.declarativeNetRequest.updateSessionRules({ removeRuleIds: RULE_IDS });
    await api.storage.session.remove('state');
    return { state: null, active: false };
  }
  return { state, active: Boolean(complete), ruleCount: owned.length };
}

export async function enable(tabId) {
  const rules = makeRules(tabId);
  const tab = await api.tabs.get(tabId);
  if (!isHotstarPage(tab.url)) throw new Error('Open Hotstar first.');
  const previous = await api.declarativeNetRequest.getSessionRules();
  const oldState = await readState();
  await api.declarativeNetRequest.updateSessionRules({ removeRuleIds: RULE_IDS, addRules: rules });
  const state = { tabId, enabledAt: new Date().toISOString() };
  try {
    const installed = (await api.declarativeNetRequest.getSessionRules()).filter(rule => RULE_IDS.includes(rule.id));
    if (installed.length !== RULE_IDS.length || installed.some(rule => rule.condition.tabIds?.length !== 1 || rule.condition.tabIds[0] !== tabId)) {
      throw new Error('The browser did not retain all request rules. The profile was not enabled.');
    }
    await api.storage.session.set({ state });
  }
  catch (error) {
    await api.declarativeNetRequest.updateSessionRules({ removeRuleIds: RULE_IDS, addRules: previous.filter(rule => RULE_IDS.includes(rule.id)) });
    throw error;
  }
  if (oldState && oldState.tabId !== tabId) await api.action.setBadgeText({ tabId: oldState.tabId, text: '' }).catch(() => {});
  await api.action.setBadgeBackgroundColor({ tabId, color: '#4678e8' });
  await api.action.setBadgeText({ tabId, text: 'ON' });
  await api.tabs.reload(tabId);
  return state;
}

export async function disable(reload = true) {
  const state = await readState();
  await api.declarativeNetRequest.updateSessionRules({ removeRuleIds: RULE_IDS });
  await api.storage.session.remove('state');
  if (state) {
    await api.action.setBadgeText({ tabId: state.tabId, text: '' }).catch(() => {});
    if (reload) {
      const tab = await api.tabs.get(state.tabId).catch(() => null);
      if (isHotstarPage(tab?.url)) await api.tabs.reload(state.tabId);
    }
  }
  return { disabled: true };
}

export async function dispatch(message) {
  switch (message?.action) {
    case 'status': return exclusive(status);
    case 'enable': return exclusive(() => enable(message.tabId));
    case 'disable': return exclusive(() => disable());
    default: throw new Error('Unknown extension action.');
  }
}

api.runtime.onMessage.addListener((message, sender, reply) => {
  // The content script can read only its own mode flag, never change the mode.
  if (message?.action === 'live-compatibility' && sender.id === api.runtime.id &&
      sender.tab && sender.frameId === 0 && isHotstarPage(sender.url)) {
    exclusive(status).then(({ state, active }) => reply({ active: active && state.tabId === sender.tab.id }),
      () => reply({ active: false }));
    return true;
  }
  // Only the bundled popup can change the mode.
  if (sender.id !== api.runtime.id || sender.tab || sender.url !== api.runtime.getURL('panel.html')) return false;
  dispatch(message).then(result => reply({ ok: true, result }), error => reply({ ok: false, error: error.message }));
  return true;
});
api.tabs.onRemoved.addListener(tabId => {
  exclusive(async () => { if ((await readState())?.tabId === tabId) await disable(false); }).catch(() => {});
});
api.tabs.onUpdated.addListener((tabId, change) => {
  if (change.url && !isHotstarPage(change.url)) {
    exclusive(async () => { if ((await readState())?.tabId === tabId) await disable(false); }).catch(() => {});
  }
});
