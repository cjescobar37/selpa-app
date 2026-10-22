// One vector backdrop avoids different gradient rasterizers for native PNGs
// and the browser. Original brand artwork and installed icon stay unchanged.
const backdrop = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100" preserveAspectRatio="none"><defs><linearGradient id="n" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#020617"/><stop offset=".58" stop-color="#061b3a"/><stop offset="1" stop-color="#071426"/></linearGradient><radialGradient id="c" cx=".3" cy=".38" r=".72"><stop stop-color="#53c7d9" stop-opacity=".12"/><stop offset=".75" stop-color="#53c7d9" stop-opacity="0"/></radialGradient><radialGradient id="m" cx=".75" cy=".67" r=".6"><stop stop-color="#ff4e72" stop-opacity=".07"/><stop offset=".8" stop-color="#ff4e72" stop-opacity="0"/></radialGradient></defs><path fill="url(#n)" d="M0 0h100v100H0z"/><path fill="url(#c)" d="M0 0h100v100H0z"/><path fill="url(#m)" d="M0 0h100v100H0z"/></svg>'
const backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(backdrop)}")`
export const PWA_OPENING = {
  version: 'navy-medallion-v2',
  backgroundImage,
  background: `#061b3a ${backgroundImage} center / 100% 100% no-repeat`,
  medallion: 144, symbol: 88, wordmarkWidth: 200, wordmarkHeight: 28, gap: 28,
  accentWidth: 44, accentHeight: 2, exitMs: 420,
} as const

// CSS can paint while a preceding stylesheet delays the parser-time script.
// Keep BOTH document backgrounds navy for the lifetime of an installed phone
// page. WebKit derives its under-page canvas from html AND body; restoring a
// light body behind an opaque overlay still changes that native-facing canvas.
// The app owns the original light surface instead. No theme/layout changes in
// browser, tablet or desktop, and no JS or animation needed for this protection.
export const PWA_OPENING_CANVAS_CSS = `@media (display-mode: standalone) and (max-width: 600px), (display-mode: standalone) and (max-height: 600px) and (max-width: 980px) and (orientation: landscape){html,body{background:${PWA_OPENING.background}!important}.app-shell{background:var(--bg, #f4f7fb);min-height:100%}}`

// Parser-time, before the body can paint. Hydration may only retire this layer,
// never activate it. If this script is late/blocked, the default is the home.
export const PWA_OPENING_BOOTSTRAP = String.raw`(() => {
  try {
    const phone = matchMedia('(max-width: 600px), (max-height: 600px) and (max-width: 980px) and (orientation: landscape)');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const navigation = performance.getEntriesByType('navigation')[0];
    if (!phone.matches || reduced.matches || document.body || document.readyState !== 'loading'
      || !/iPhone|iPod|Android.*Mobile/i.test(navigator.userAgent) || /iPad|Tablet/i.test(navigator.userAgent)
      || !['/', '/player'].includes(location.pathname) || navigation?.type === 'back_forward'
      || document.visibilityState !== 'visible' || performance.getEntriesByName('first-contentful-paint').length) return;
    const style = document.createElement('style');
    style.id = 'selpa-opening-prepaint';
    const surface = '[data-pwa-opening]{display:grid!important;position:fixed;inset:0;z-index:10000;pointer-events:none;background:${PWA_OPENING.background};opacity:1;transition:opacity ${PWA_OPENING.exitMs}ms ease-in-out}';
    const canvas = 'html{background:${PWA_OPENING.background}!important}';
    // Protect the canvas even if the streamed body has not arrived. Restore the
    // original surface under the opaque layer, before the crossfade. In an
    // installed phone the permanent CSS keeps body navy and paints app-shell.
    style.textContent = canvas + 'body{background:${PWA_OPENING.background}!important}' + surface;
    // Local technical timing only. No identity, storage, URL or network logging.
    const state = window.__selpaOpening = {active:true, started:performance.now(), shownAt:0, readyAt:0, leavingAt:0, finishedAt:0, finish};
    let timer, frame, exitingLayer, previous = '', stable = 0, prepared = false;
    function faded(event) {
      if (event.target === exitingLayer && event.propertyName === 'opacity') finish();
    }
    function finish() {
      if (!state.active) return;
      state.active = false;
      state.finishedAt = performance.now();
      style.remove();
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      exitingLayer?.removeEventListener('transitionend', faded);
      for (const name of ['pointerdown','keydown','focusin','wheel','touchmove']) document.removeEventListener(name, finish, true);
      document.removeEventListener('visibilitychange', changed);
      window.removeEventListener('pagehide', finish);
      for (const media of [phone, reduced]) media.removeEventListener('change', changed);
    }
    function changed() { if (!phone.matches || reduced.matches || document.visibilityState !== 'visible') finish(); }
    function check(now) {
      if (!state.active) return;
      if (!['/', '/player'].includes(location.pathname)) { finish(); return; }
      const layer = document.querySelector('[data-pwa-opening]');
      if (layer?.getClientRects().length && !state.shownAt) {
        state.shownAt = performance.now();
      }
      const main = document.querySelector('main'), title = main?.querySelector('h1'), nav = document.querySelector('.px-nav');
      const box = title?.getBoundingClientRect(), header = nav?.getBoundingClientRect();
      const busy = main?.matches('[aria-busy="true"]') || main?.querySelector('[aria-busy="true"]');
      const images = document.querySelectorAll('.px-nav img, .playerHomeHero img, .modeCommunityHero img, .pampraxHero img');
      const ready = document.readyState !== 'loading' && box?.width > 0 && box?.height > 0 && header?.height > 0
        && !busy && document.fonts?.status !== 'loading' && Array.from(images).filter(image => image.getClientRects().length).every(image => image.complete);
      const geometry = ready ? [box.x,box.y,box.width,box.height,header.height].join(',') : '';
      stable = geometry && geometry === previous ? stable + 1 : 0;
      previous = geometry;
      if (state.shownAt && stable >= 2) {
        if (!prepared) {
          // First restore the real body surface behind an opaque opening.
          // Let that restoration paint before starting the opacity transition;
          // HTML arrival alone is not proof that the next surface is ready.
          style.textContent = canvas + surface;
          prepared = true;
          frame = requestAnimationFrame(check);
          return;
        }
        state.readyAt = state.leavingAt = performance.now();
        // Only the bootstrap-owned stylesheet changes: no SSR attributes or
        // React-owned state are mutated before hydration. A single dissolve
        // reveals the already-painted home, without a second opacity ramp.
        exitingLayer = layer;
        exitingLayer.addEventListener('transitionend', faded);
        style.textContent = canvas + surface + '[data-pwa-opening]{opacity:0}';
        // Cleanup fallback only: the visual transition ends at exitMs and never
        // blocks input. Do not truncate its last frame with an exact-time timer.
        timer = setTimeout(finish, ${PWA_OPENING.exitMs + 100});
        return;
      }
      frame = requestAnimationFrame(check);
    }
    for (const name of ['pointerdown','keydown','focusin','wheel','touchmove']) document.addEventListener(name, finish, {capture:true,passive:true});
    document.addEventListener('visibilitychange', changed);
    window.addEventListener('pagehide', finish);
    for (const media of [phone, reduced]) media.addEventListener('change', changed);
    document.head.append(style);
    frame = requestAnimationFrame(check);
  } catch { document.getElementById('selpa-opening-prepaint')?.remove(); }
})();`
