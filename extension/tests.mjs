import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { APP, RULE_IDS, URL_FILTERS, isHotstarPage, androidHeaders, makeRules } from './profile.js';

// Run: node tests.mjs. No dependencies, network, account, or browser profile required.
const manifest = JSON.parse(await readFile(new URL('./manifest.json', import.meta.url)));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.host_permissions.length, 3);
assert(!JSON.stringify(manifest).includes('<all_urls>'));
assert(!manifest.permissions.includes('cookies'));
assert(!manifest.permissions.includes('debugger'));
assert(!manifest.permissions.includes('webRequest'));
assert.deepEqual(manifest.content_scripts.map(script => script.matches), [
  ['https://www.hotstar.com/*'], ['https://www.hotstar.com/*']
]);
assert(manifest.content_scripts.every(script => script.run_at === 'document_start' && !script.all_frames));
assert.equal(manifest.name, 'Hotstar Desktop');
const html = await readFile(new URL('./panel.html', import.meta.url), 'utf8');
assert.equal((html.match(/<button /g) || []).length, 1);
assert(!/<(?:input|select|fieldset|details)\b/.test(html));
assert(html.includes('role="switch"'));
for (const path of Object.values(manifest.icons)) assert.equal((await readFile(new URL(path, import.meta.url))).subarray(1,4).toString(), 'PNG');
assert(isHotstarPage('https://www.hotstar.com/in/home'));
const headers = androidHeaders();
assert.equal(headers['user-agent'], 'Hotstar;in.startv.hotstar/26.10.12.2.13211 (Android/14)');
assert(headers['x-hs-client'].includes('schema_version:0.0.1832;'));
assert.equal(headers['x-hs-app'], APP.build);
const generatedRules = makeRules(17);
assert.equal(generatedRules.length, 15);
assert.equal(new Set(RULE_IDS).size, 15);
assert(generatedRules.every(rule => !('regexFilter' in rule.condition)));
assert(URL_FILTERS.every(filter => filter.startsWith('|https://') && !filter.includes('*')));
const rule = generatedRules[0];
assert.deepEqual(rule.condition.tabIds, [17]);
assert.deepEqual(rule.condition.resourceTypes, ['xmlhttprequest']);
assert(!rule.action.responseHeaders);
assert.throws(() => makeRules(-1));
const clone = structuredClone;
const data = {};
const registrations = {};
const event = name => ({ addListener(fn) { registrations[name] = fn; } });
let rules = [];
let failSave = false;
let dropRules = false;
let reloaded = [];
const tabs = new Map([[17, { id: 17, url: 'https://www.hotstar.com/in/home' }], [18, { id: 18, url: 'https://evil.test/' }]]);
globalThis.chrome = {
  runtime: { id: 'test-extension', getURL: path => `chrome-extension://test-extension/${path}`, onMessage: event('message') },
  storage: { session: {
    async get(key) { return clone({ [key]: data[key] }); },
    async set(value) { if (failSave) { failSave = false; throw new Error('Storage failed'); } Object.assign(data, clone(value)); },
    async remove(key) { delete data[key]; }
  } },
  declarativeNetRequest: {
    async getSessionRules() { return clone(rules); },
    async isRegexSupported() { throw new Error('Chrome rejected the old combined expression; this API must not be needed.'); },
    async updateSessionRules({ removeRuleIds = [], addRules = [] }) {
      rules = [...rules.filter(rule => !removeRuleIds.includes(rule.id)), ...clone(dropRules ? addRules.slice(0, 1) : addRules)];
      dropRules = false;
    }
  },
  tabs: {
    async get(id) { if (!tabs.has(id)) throw new Error('No such tab'); return clone(tabs.get(id)); },
    async reload(id) { reloaded.push(id); }, onRemoved: event('removed'), onUpdated: event('updated')
  },
  action: { async setBadgeText() {}, async setBadgeBackgroundColor() {} },
  webRequest: { onSendHeaders: event('headers') }
};
const background = await import('./background.js');
assert.equal((await background.dispatch({ action: 'status' })).active, false);
await assert.rejects(background.dispatch({ action: 'enable', tabId: 18 }), /Open Hotstar/);
assert.equal(rules.length, 0);
await background.dispatch({ action: 'enable', tabId: 17 });
assert.equal((await background.dispatch({ action: 'status' })).active, true);
assert.equal(rules.length, 15);
assert.deepEqual(reloaded, [17]);
assert.deepEqual(rules[0].condition.tabIds, [17]);
const contentSender = { id: 'test-extension', frameId: 0, tab: { id: 17 }, url: 'https://www.hotstar.com/in/home' };
const compatibility = sender => new Promise(resolve => {
  const accepted = registrations.message({ action: 'live-compatibility' }, sender, resolve);
  if (!accepted) resolve(null);
});
assert.equal((await compatibility(contentSender)).active, true);
assert.equal((await compatibility({ ...contentSender, tab: { id: 18 } })).active, false);
assert.equal(await compatibility({ ...contentSender, frameId: 1 }), null);
assert.equal(await compatibility({ ...contentSender, url: 'https://evil.test/' }), null);
const oldRule = clone(rules);
failSave = true;
await assert.rejects(background.dispatch({ action: 'enable', tabId: 17, device: { os: '99' } }), /Storage failed/);
assert.deepEqual(rules, oldRule, 'Rule must roll back when session storage fails');
assert.deepEqual(Object.keys(data.state).sort(), ['enabledAt', 'tabId']);
dropRules = true;
await assert.rejects(background.dispatch({ action: 'enable', tabId: 17 }), /did not retain/);
assert.deepEqual(rules, oldRule, 'Incomplete registration must roll back to the previous complete rule set');
assert.equal(registrations.message({ action: 'disable' }, { id: 'other-extension' }, () => assert.fail('untrusted response')), false);
assert.equal(registrations.message({ action: 'disable' }, { id: 'test-extension', tab: { id: 17 }, url: 'https://www.hotstar.com/' }, () => assert.fail('content script must not control mode')), false);
await background.dispatch({ action: 'disable' });
assert.equal(rules.length, 0);
assert(!data.state);
assert.equal((await background.dispatch({ action: 'status' })).active, false);
assert.equal((await compatibility(contentSender)).active, false);
// An orphaned rule must not remain active without a visible state/control.
rules = [makeRules(17)[0]];
assert.equal((await background.dispatch({ action: 'status' })).active, false);
assert.equal(rules.length, 0);
await assert.rejects(background.dispatch({ action: 'unrecognized' }), /Unknown/);
await assert.rejects(background.dispatch({ action: 'probe' }), /Unknown/);
await background.dispatch({ action: 'enable', tabId: 17 });
registrations.removed(17);
assert.equal((await background.dispatch({ action: 'status' })).active, false);
assert.equal(rules.length, 0);
// Simulate the browser APIs and page/extension event bridge without media or accounts.
const compatSource = await readFile(new URL('./live-compat.js', import.meta.url), 'utf8');
const bridgeSource = await readFile(new URL('./live-bridge.js', import.meta.url), 'utf8');
for (const mainFirst of [true, false]) {
  const events = new EventTarget();
  const location = { pathname: '/in/sports/cricket/match/1540082840/video/live/watch' };
  const nativeResult = { supported: true, smooth: true, powerEfficient: true };
  class MediaCapabilities { async decodingInfo() { assert(this instanceof MediaCapabilities); return nativeResult; } }
  const MediaSource = { isTypeSupported() { assert.equal(this, MediaSource); return true; } };
  const env = { document: events, location, MediaCapabilities, Event, CustomEvent,
    window: { MediaSource, MediaCapabilities }, chrome: { runtime: { async sendMessage() { return { active: true }; } } } };
  for (const script of mainFirst ? [compatSource, bridgeSource] : [bridgeSource, compatSource]) runInNewContext(script, env);
  await new Promise(resolve => setImmediate(resolve));
  const hevc = 'video/mp4; codecs="hvc1.1.6.L93.B0"';
  const avc = 'video/mp4; codecs="avc1.64001f"';
  const capabilities = new MediaCapabilities();
  assert.equal(MediaSource.isTypeSupported(hevc), false);
  assert.equal(MediaSource.isTypeSupported(avc), true);
  assert.equal((await capabilities.decodingInfo({ video: { contentType: hevc } })).supported, false);
  assert.equal(await capabilities.decodingInfo({ video: { contentType: avc } }), nativeResult);
  location.pathname = '/in/shows/bbs20-24-hrs-channel-deferred/1271698275/live/watch';
  assert.equal(MediaSource.isTypeSupported(hevc), false, 'Show live routes receive the same compatibility fallback');
  assert.equal((await capabilities.decodingInfo({ video: { contentType: hevc } })).supported, false);
  location.pathname = '/in/movies/example/123/watch';
  assert.equal(MediaSource.isTypeSupported(hevc), true, 'VOD retains HEVC support');
  location.pathname = '/in/sports/cricket/match/1540082840/video/live/watch';
  events.dispatchEvent(new CustomEvent('hotstar-android:live-config', { detail: false }));
  assert.equal(MediaSource.isTypeSupported(hevc), true, 'Disabled mode retains native support');
}
const nativeMenuSource = await readFile(new URL('./native-quality.js', import.meta.url), 'utf8');
for (const runtimeFirst of [true, false]) {
  const document = new EventTarget();
  const window = { webpackChunk_N_E: [] };
  const modules = {};
  const installRuntime = () => {
    const parent = window.webpackChunk_N_E.push.bind(window.webpackChunk_N_E);
    window.webpackChunk_N_E.push = function (chunk) {
      Object.assign(modules, chunk[1]);
      return parent(chunk);
    };
  };
  if (runtimeFirst) installRuntime();
  runInNewContext(nativeMenuSource, { window, document, CustomEvent });
  if (!runtimeFirst) installRuntime();
  window.webpackChunk_N_E.push([[5495], { 95495(module, exports, require) {
    require.d(exports, { configSettingsTypeMap: () => ({ VIDEO_QUALITY: 1 }), dataFormatter: () => (...args) => args });
  } }]);
  const exports = {};
  const require = Object.assign(() => {}, { d(object, definitions) {
    for (const key of Object.keys(definitions)) Object.defineProperty(object, key, { enumerable: true, get: definitions[key] });
  } });
  modules[95495]({}, exports, require);
  const choices = [{ title: 'Auto', max_height: 720 }, { title: 'Full HD', accessory: { action: { upgrade: true } } }];
  const settings = { data: { option_list_map: { video: { video_quality_list: { title: 'Video Quality', video_quality_option: choices } } } } };
  const general = Object.freeze({ general_action_item: { label: 'Watch More' } });
  const items = Object.freeze([general]);
  const controls = Object.freeze({ data: Object.freeze({ player_control_menu: Object.freeze({ data: Object.freeze({ items }) }) }) });
  const format = (...args) => exports.dataFormatter(...args);
  assert.equal(format(settings, {}, controls)[2], controls, 'Disabled mode leaves the native menu intact');
  document.dispatchEvent(new CustomEvent('hotstar-android:live-config', { detail: true }));
  const result = format(settings, {}, controls);
  const restored = result[2].data.player_control_menu.data.items;
  assert.equal(result[0], settings, 'Quality choices and locked actions are passed through unchanged');
  assert.equal(restored.length, 2);
  assert.equal(restored[0], general);
  assert.equal(restored[1].open_settings_item.types.join(','), 'VIDEO_QUALITY');
  assert.equal(restored[1].open_settings_item.title, 'Video Quality');
  assert.equal(format(settings, {}, result[2])[2], result[2], 'Existing quality entries are never duplicated');
  assert.equal(format({}, {}, controls)[2], controls, 'No menu is invented when the service supplies no quality choices');
  document.dispatchEvent(new CustomEvent('hotstar-android:live-config', { detail: false }));
  assert.equal(format(settings, {}, controls)[2], controls);
}
console.log('PASS: request rules, UI, icons, mode lifecycle, sender boundaries, live AVC fallback, native quality menu, unchanged locked actions, disabled passthrough, Webpack startup ordering.');
