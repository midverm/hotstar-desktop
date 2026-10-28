// App/version/schema and header format came from the supplied 26.10.12.2 APK.
// Device fields are a declared test profile, not a certified device identity.
export const APP = Object.freeze({ version: '26.10.12.2', build: '13211', schema: '0.0.1832' });
export const DEFAULT_DEVICE = Object.freeze({ brand: 'Google', model: 'Pixel 8', os: '14' });
export const URL_FILTERS = Object.freeze([
  ...['apix', 'hf-apix'].flatMap(host => [
    ...['start', 'freshstart', 'pages', 'widgets', 'slugs'].map(path => `|https://${host}.hotstar.com/v2/${path}^`),
    `|https://${host}.hotstar.com/play/v5/playback/`
  ]),
  ...['bff', 'config', 'string-store'].map(path => `|https://www.hotstar.com/api/internal/${path}^`)
]);
export const RULE_IDS = Object.freeze(URL_FILTERS.map((_, index) => index + 1));
export function isHotstarPage(url) {
  try { const u = new URL(url); return u.protocol === 'https:' && u.hostname === 'www.hotstar.com'; }
  catch { return false; }
}

export function androidHeaders() {
  const p = DEFAULT_DEVICE;
  return {
    'x-hs-platform': 'android',
    'app_name': 'android',
    'x-hs-app': APP.build,
    'x-hs-schema-version': APP.schema,
    'x-hs-client': `platform:android;app_id:in.startv.hotstar;app_version:${APP.version};os:Android;os_version:${p.os};schema_version:${APP.schema};brand:${p.brand};model:${p.model};carrier:;network_data:UNKNOWN`,
    'user-agent': `Hotstar;in.startv.hotstar/${APP.version}.${APP.build} (Android/${p.os})`
  };
}

export function makeRules(tabId) {
  if (!Number.isSafeInteger(tabId) || tabId < 0) throw new Error('A real browser tab is required.');
  return URL_FILTERS.map((urlFilter, index) => ({
    id: RULE_IDS[index], priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: Object.entries(androidHeaders()).map(([header, value]) => ({ header, operation: 'set', value }))
    },
    condition: { tabIds: [tabId], urlFilter, isUrlFilterCaseSensitive: true,
      resourceTypes: ['xmlhttprequest'], requestMethods: ['get', 'post'] }
  }));
}
