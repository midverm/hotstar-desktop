(() => {
  const publish = () => chrome.runtime.sendMessage({ action: 'live-compatibility' }).then(
    result => document.dispatchEvent(new CustomEvent('hotstar-android:live-config', { detail: result?.active === true })),
    () => {});
  document.addEventListener('hotstar-android:live-ready', publish, { once: true });
  publish();
})();
