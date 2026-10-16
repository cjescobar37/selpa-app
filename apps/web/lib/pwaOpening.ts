// One vector backdrop avoids different gradient rasterizers for native PNGs
// and the browser. Original brand artwork and installed icon stay unchanged.
const backdrop = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100" preserveAspectRatio="none"><defs><linearGradient id="n" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#020617"/><stop offset=".58" stop-color="#061b3a"/><stop offset="1" stop-color="#071426"/></linearGradient><radialGradient id="c" cx=".3" cy=".38" r=".72"><stop stop-color="#53c7d9" stop-opacity=".12"/><stop offset=".75" stop-color="#53c7d9" stop-opacity="0"/></radialGradient><radialGradient id="m" cx=".75" cy=".67" r=".6"><stop stop-color="#ff4e72" stop-opacity=".07"/><stop offset=".8" stop-color="#ff4e72" stop-opacity="0"/></radialGradient></defs><path fill="url(#n)" d="M0 0h100v100H0z"/><path fill="url(#c)" d="M0 0h100v100H0z"/><path fill="url(#m)" d="M0 0h100v100H0z"/></svg>'
const backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(backdrop)}")`
export const PWA_OPENING = {
  version: 'navy-medallion-v2',
  backgroundImage,
  background: `#061b3a ${backgroundImage} center / 100% 100% no-repeat`,
  medallion: 144, symbol: 88, wordmarkWidth: 200, wordmarkHeight: 28, gap: 28,
  accentWidth: 44, accentHeight: 2, maxMs: 1000, exitMs: 220,
} as const

// Parser-time, before the body can paint. Hydration may only retire this layer,
// never activate it. If this script is late/blocked, the default is the home.
export const PWA_OPENING_BOOTSTRAP = String.raw`(() => {
  try {
    const phone = matchMedia('(max-width: 600px), (max-height: 600px) and (max-width: 980px) and (orientation: landscape)');
    const standalone = matchMedia('(display-mode: standalone)');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const navigation = performance.getEntriesByType('navigation')[0];
    if (!phone.matches || !(standalone.matches || navigator.standalone === true) || reduced.matches
      || !/iPhone|iPod|Android.*Mobile/i.test(navigator.userAgent) || /iPad|Tablet/i.test(navigator.userAgent)
      || !['/', '/player'].includes(location.pathname) || navigation?.type === 'back_forward'
      || document.visibilityState !== 'visible' || performance.getEntriesByName('first-contentful-paint').length) return;
    const style = document.createElement('style');
    style.id = 'selpa-opening-prepaint';
    style.textContent = '[data-pwa-opening]{display:grid!important;position:fixed;inset:0;z-index:10000;pointer-events:none;background:${PWA_OPENING.background}}';
    const state = window.__selpaOpening = {active:true, started:performance.now(), finish};
    let timer;
    function finish() {
      if (!state.active) return;
      state.active = false;
      style.remove();
      clearTimeout(timer);
      for (const name of ['pointerdown','keydown','focusin','wheel','touchmove']) document.removeEventListener(name, finish, true);
      document.removeEventListener('visibilitychange', changed);
      window.removeEventListener('pagehide', finish);
      for (const media of [phone, standalone, reduced]) media.removeEventListener('change', changed);
      state.onFinish?.();
    }
    function changed() { if (!phone.matches || !(standalone.matches || navigator.standalone === true) || reduced.matches || document.visibilityState !== 'visible') finish(); }
    for (const name of ['pointerdown','keydown','focusin','wheel','touchmove']) document.addEventListener(name, finish, {capture:true,passive:true});
    document.addEventListener('visibilitychange', changed);
    window.addEventListener('pagehide', finish);
    for (const media of [phone, standalone, reduced]) media.addEventListener('change', changed);
    timer = setTimeout(finish, ${PWA_OPENING.maxMs});
    document.head.append(style);
  } catch { document.getElementById('selpa-opening-prepaint')?.remove(); }
})();`
