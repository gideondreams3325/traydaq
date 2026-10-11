/* TRAYDAQ Android launch gate: show first decoded For You media before leaving the wheel splash. */
(function tdFeedReadySplash(){
  'use strict';
  const bridge = window.TraydaqStartupGate;
  if (!bridge || typeof bridge.mediaReady !== 'function') return;
  if (window.__tdFeedReadySplashInstalled) return;
  window.__tdFeedReadySplashInstalled = true;
  const MAX_WAIT_MS = 11500;
  const started = Date.now();
  let released = false, pending = false;
  let observer = null, poll = null;
  function isVisible(element) {
    if (!element || !element.isConnected || element.closest('[hidden],.hidden,[aria-hidden="true"]')) return false;
    const css = getComputedStyle(element), rect = element.getBoundingClientRect();
    return css.display !== 'none' && css.visibility !== 'hidden' &&
      rect.width > 50 && rect.height > 50;
  }
  function firstReadyMedia() {
    const feed = document.getElementById('reelFeed');
    if (!isVisible(feed)) return false;
    const cards = feed.querySelectorAll('.reel-card');
    // Do not consider later/offscreen posts ready while the first one is still blank.
    for (let i = 0; i < Math.min(cards.length, 2); i++) {
      const card = cards[i];
      if (!isVisible(card)) continue;
      for (const media of card.querySelectorAll('video,img,canvas')) {
        if (media.closest('.reel-avatar,.reel-actions,.reel-action-group,.reel-disc,.reel-sound,nav,header,footer')) continue;
        if (media.tagName === 'IMG' && media.complete && media.naturalWidth > 0) return true;
        if (media.tagName === 'VIDEO' && media.readyState >= 2 && media.videoWidth > 0) return true;
        if (media.tagName === 'CANVAS' && media.width > 80 && media.height > 80) return true;
      }
      const stage = card.querySelector('[data-td-adaptive-feed-bg],.reel-media,.reel-bg,.reel-image,.reel-photo');
      if (stage && /url\(/i.test(getComputedStyle(stage).backgroundImage || '')) {
        // A background URL alone is not evidence that its pixels have decoded.
        const background = getComputedStyle(stage).backgroundImage || '';
        const match = /^url\(["']?(.*?)["']?\)$/.exec(background);
        if (match && match[1]) {
          const key = match[1], cache = tdFeedReadySplash._bgCache || (tdFeedReadySplash._bgCache = new Map());
          const hit = cache.get(key);
          if (hit === true) return true;
          if (!hit) {
            const img = new Image();
            cache.set(key, img);
            img.onload = function(){ cache.set(key, true); inspect(); };
            img.onerror = function(){ cache.delete(key); };
            img.src = key;
          }
        }
      }
    }
    return false;
  }
  function visibleOtherScreen() {
    // Login, onboarding, or a legitimate empty Home must never be trapped on splash.
    const feed = document.getElementById('reelFeed');
    const candidates = ['#authScreen','#loginScreen','#welcomeScreen','#onboardingScreen',
      '#loginPage','#signupScreen','[data-page="auth"]','[data-auth-screen]'];
    if (document.readyState === 'loading') return false;
    if (candidates.some(selector => {
      const element = document.querySelector(selector);
      return element && isVisible(element);
    })) return true;
    if (isVisible(feed) && !feed.querySelector('.reel-card')) {
      const text = (feed.textContent || '').replace(/\s+/g, ' ').trim();
      if (/no posts|nothing to show|no content|empty feed|could not load|sign in to see/i.test(text)) return true;
    }
    return false;
  }
  function cleanup() {
    if (observer) observer.disconnect();
    if (poll) clearInterval(poll);
    document.removeEventListener('load', inspect, true);
    document.removeEventListener('loadeddata', inspect, true);
    document.removeEventListener('canplay', inspect, true);
    window.removeEventListener('pageshow', inspect);
    window.removeEventListener('online', inspect);
  }
  function release(reason) {
    if (released) return;
    released = true; cleanup();
    window.__tdFeedReadySplashResult = reason;
    try { bridge.mediaReady(); } catch (_) {}
  }
  function inspect() {
    if (released || pending || document.visibilityState === 'hidden') return;
    const ready = firstReadyMedia();
    const other = Date.now() - started > 750 && visibleOtherScreen();
    if (!ready && !other && Date.now() - started < MAX_WAIT_MS) return;
    pending = true;
    // Let WebView layout and the existing Home recovery overlay settle first.
    const raf = window.requestAnimationFrame || (fn => setTimeout(fn, 16));
    raf(() => raf(() => release(ready ? 'first-media-ready' : (other ? 'other-screen' : 'timeout'))));
  }
  document.addEventListener('load', inspect, true);
  document.addEventListener('loadeddata', inspect, true);
  document.addEventListener('canplay', inspect, true);
  window.addEventListener('pageshow', inspect);
  window.addEventListener('online', inspect);
  function boot() {
    const feed = document.getElementById('reelFeed');
    if (feed && typeof MutationObserver === 'function') {
      observer = new MutationObserver(inspect);
      observer.observe(feed, {childList:true,subtree:true,attributes:true,attributeFilter:['src','poster','style','class']});
    }
    poll = setInterval(inspect, 250);
    inspect();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();
