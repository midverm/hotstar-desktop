(() => {
  let active = false;
  document.addEventListener('hotstar-android:live-config', event => { active = event.detail === true; });

  function restoreMenu(args) {
    const list = args[0]?.data?.option_list_map?.video?.video_quality_list;
    const controls = args[2];
    const menu = controls?.data?.player_control_menu;
    const items = menu?.data?.items;
    if (!active || !Array.isArray(list?.video_quality_option) || !list.video_quality_option.length ||
        !controls?.data || (items !== undefined && !Array.isArray(items)) ||
        items?.some(item => item?.open_settings_item?.types?.includes('VIDEO_QUALITY'))) return args;
    const next = args.slice();
    next[2] = { ...controls, data: { ...controls.data, player_control_menu: { ...menu,
      data: { ...menu?.data, items: [...(items || []), { open_settings_item: {
        title: typeof list.title === 'string' && list.title.trim() ? list.title : 'Video Quality',
        types: ['VIDEO_QUALITY']
      } }] }
    } } };
    return next;
  }

  // This module formats the existing web controls. Keep all choices and actions intact.
  const wrapped = new WeakSet();
  function patch(chunk) {
    const modules = Array.isArray(chunk) && chunk[1];
    const factory = modules?.[95495];
    if (typeof factory !== 'function' || wrapped.has(factory) ||
        !Function.prototype.toString.call(factory).includes('configSettingsTypeMap')) return;
    const replacement = function (module, exports, require) {
      const loader = new Proxy(require, { get(target, key, receiver) {
        if (key !== 'd') return Reflect.get(target, key, receiver);
        return (object, definitions) => {
          if (typeof definitions.dataFormatter === 'function') {
            const read = definitions.dataFormatter;
            const format = function (...args) { return Reflect.apply(read(), this, restoreMenu(args)); };
            definitions = { ...definitions, dataFormatter: () => format };
          }
          return target.d(object, definitions);
        };
      } });
      return Reflect.apply(factory, this, [module, exports, loader]);
    };
    wrapped.add(replacement);
    modules[95495] = replacement;
  }
  const chunks = window.webpackChunk_N_E = window.webpackChunk_N_E || [];
  chunks.forEach(patch);
  const wrap = push => function (...entries) { entries.forEach(patch); return Reflect.apply(push, this, entries); };
  let push = wrap(chunks.push);
  // Webpack replaces push at startup and retains its predecessor as a parent callback.
  Object.defineProperty(chunks, 'push', { configurable: true, get: () => push, set: next => { push = wrap(next); } });
})();
