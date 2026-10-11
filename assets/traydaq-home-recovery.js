/* TRAYDAQ: unobtrusive, automatic Home feed wait. Never asks users to retry or reload. */
(function tdInstallHomeRecovery() {
  'use strict';
  if (window.__tdHomeRecoveryInstalled) return;
  window.__tdHomeRecoveryInstalled = true;
  const AUTO_REFRESH_MS = 8500;
  let currentFeed = null, pendingSince = 0, refreshed = false;
  let indicator = null, scheduled = false;
  function visible(node) {
    if (!node || !node.isConnected || node.closest('[hidden],.hidden,[aria-hidden="true"]')) return false;
    const style = window.getComputedStyle(node);
    const bounds = node.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && bounds.width > 120 && bounds.height > 100;
  }
  function homeTabSelected() {
    const items = document.querySelectorAll('nav button,nav a,[role="navigation"] button,[role="navigation"] a,#bottomNav button,.bottom-nav button,.nav-item');
    let found = false;
    for (const item of items) {
      if (!/^Home$/i.test((item.textContent || '').trim())) continue;
      found = true;
      if (item.matches('.active,.selected,.current,[aria-selected="true"],[aria-current="page"]') ||
          item.parentElement?.matches('.active,.selected,.current')) return true;
    }
    // Some app builds use an icon-only Home tab. Visible feed is the fallback.
    return !found;
  }
  function firstPostReady(feed) {
    if (!feed) return false;
    const cards = feed.querySelectorAll('.reel-card');
    for (let i = 0; i < Math.min(cards.length, 2); i++) {
      const card = cards[i];
      for (const media of card.querySelectorAll('video,img,canvas')) {
        if (media.closest('.reel-avatar,.reel-actions,.reel-action-group,.reel-disc,.reel-sound,nav,header,footer')) continue;
        if (media.tagName === 'VIDEO' && media.readyState >= 2) return true;
        if (media.tagName === 'IMG' && media.complete && media.naturalWidth > 0) return true;
        if (media.tagName === 'CANVAS' && media.width > 60 && media.height > 60) return true;
      }
      const surface = card.querySelector('[data-td-adaptive-feed-bg],.reel-bg,.reel-media,.reel-image,.reel-photo');
      if (surface && /url\(/i.test(window.getComputedStyle(surface).backgroundImage || '')) return true;
      const textPost = card.querySelector('.reel-caption,.reel-description,.post-caption,.post-text');
      if (textPost && (textPost.textContent || '').trim().length > 24) return true;
    }
    if (cards.length) return false;
    const message = (feed.textContent || '').replace(/\s+/g, ' ').trim();
    return /no posts|nothing to show|no videos|empty feed|no content|sign in to see|could not load/i.test(message);
  }
  function stop() {
    if (indicator?.isConnected) indicator.remove();
    indicator = null;
    if (currentFeed?.isConnected) currentFeed.removeAttribute('data-td-home-pending');
    pendingSince = 0; refreshed = false;
  }
  function renderLoading(feed) {
    if (indicator && indicator.isConnected) return;
    const hint = document.createElement('div');
    hint.className = 'td-home-loading-hint';
    hint.id = 'tdHomeLoadingHint';
    hint.setAttribute('data-td-home-recovery', 'true');
    hint.setAttribute('role', 'status');
    hint.setAttribute('aria-label', 'Loading For You posts');
    const spinner = document.createElement('span');
    spinner.className = 'td-home-spinner';
    spinner.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.textContent = 'Loading posts…';
    hint.append(spinner, label);
    feed.appendChild(hint);
    indicator = hint;
    feed.setAttribute('data-td-home-pending', 'true');
  }
  function resumeFeedAutomatically() {
    // At most one recovery per visit to Home: don't flood Firebase or force full reloads.
    if (refreshed || document.visibilityState === 'hidden') return;
    refreshed = true;
    window.setTimeout(() => {
      const feed = document.getElementById('reelFeed');
      if (feed !== currentFeed || !visible(feed) || !homeTabSelected() || firstPostReady(feed)) return;
      try {
        if (typeof window.renderFeed === 'function') {
          Promise.resolve(window.renderFeed()).catch(() => {});
        } else if (typeof window.navigate === 'function') {
          window.navigate('feed');
        }
      } catch (_) { /* The existing feed may still be loading; never reload the whole app. */ }
    }, 0);
  }
  function inspect() {
    if (document.visibilityState === 'hidden') return;
    const feed = document.getElementById('reelFeed');
    if (feed !== currentFeed) { stop(); currentFeed = feed; }
    if (!visible(feed) || !homeTabSelected()) { stop(); return; }
    if (firstPostReady(feed)) { stop(); return; }
    if (!pendingSince) pendingSince = Date.now();
    renderLoading(feed);
    if (Date.now() - pendingSince >= AUTO_REFRESH_MS) resumeFeedAutomatically();
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    const raf = window.requestAnimationFrame || (callback => window.setTimeout(callback, 16));
    raf(() => { scheduled = false; inspect(); });
  }
  function start() {
    schedule();
    window.setInterval(() => {
      if (document.visibilityState !== 'hidden') inspect();
    }, 1300);
    const observer = new MutationObserver(records => {
      for (const record of records) {
        const target = record.target;
        if (indicator && (target === indicator || indicator.contains(target))) continue;
        if (currentFeed && (target === currentFeed || currentFeed.contains(target))) {
          schedule(); return;
        }
        for (const node of record.addedNodes || []) {
          if (node.nodeType === 1 &&
              (node.id === 'reelFeed' || node.querySelector?.('#reelFeed'))) {
            schedule(); return;
          }
        }
      }
    });
    observer.observe(document.body, {childList:true,subtree:true});
    document.addEventListener('load', event => {
      if (event.target?.closest?.('#reelFeed')) schedule();
    }, true);
    document.addEventListener('loadeddata', event => {
      if (event.target?.closest?.('#reelFeed')) schedule();
    }, true);
    window.addEventListener('pageshow', schedule);
    window.addEventListener('online', () => {
      if (currentFeed) { refreshed = false; pendingSince = Date.now() - AUTO_REFRESH_MS; }
      schedule();
    });
    document.addEventListener('visibilitychange', schedule);
    document.addEventListener('click', event => {
      if (event.target?.closest?.('nav,[role="navigation"],#bottomNav,.bottom-nav')) window.setTimeout(schedule, 0);
    }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();