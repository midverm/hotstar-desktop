(() => {
  // Hotstar's TS converter drops HEVC video, then appends an undefined buffer.
  // Let its existing player negotiate AVC for live streams in the enabled tab.
  let active = false;
  const block = type => active && location.pathname.includes('/live/') &&
    typeof type === 'string' && /\b(?:hvc1|hev1|dvhe|dvh1)\b/i.test(type);
  document.addEventListener('hotstar-android:live-config', event => { active = event.detail === true; });

  for (const source of new Set([window.MediaSource, window.ManagedMediaSource])) {
    if (typeof source?.isTypeSupported !== 'function') continue;
    const original = source.isTypeSupported;
    source.isTypeSupported = function (...args) {
      return block(args[0]) ? false : Reflect.apply(original, this, args);
    };
  }
  const capabilities = window.MediaCapabilities?.prototype;
  if (typeof capabilities?.decodingInfo === 'function') {
    const original = capabilities.decodingInfo;
    capabilities.decodingInfo = function (...args) {
      return block(args[0]?.video?.contentType)
        ? Promise.resolve({ supported: false, smooth: false, powerEfficient: false })
        : Reflect.apply(original, this, args);
    };
  }
  document.dispatchEvent(new CustomEvent('hotstar-android:live-ready'));
})();
