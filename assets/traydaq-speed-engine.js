/* TRAYDAQ Speed Engine: fast first frame, economical nearby media and low-RAM scheduling.
 * Runs only in the built Android app; does not fetch private data, change media URLs,
 * take control of post ordering, or modify authenticated API calls.
 */
(function tdInstallSpeedEngine2026() {
  'use strict';
  if (window.__tdSpeedEngine2026) return;
  var doc = document;
  var nav = navigator || {};
  var connection = nav.connection || nav.mozConnection || nav.webkitConnection || {};
  var saver = !!connection.saveData;
  try { saver = saver || localStorage.getItem('sf_data_saver') === 'true'; } catch (_) {}
  var memory = Number(nav.deviceMemory || 0);
  var constrained = saver || (memory > 0 && memory <= 3) ||
    /(?:^|-)2g$/.test(String(connection.effectiveType || ''));
  var neighbors = constrained ? 1 : 2;
  var feed = null, feedObserver = null, feedChanges = null;
  var observed = new WeakSet(), imageSeen = new WeakSet();
  var visible = new Map(), current = null, scheduled = false, lazyScheduled = false;
  var stopped = false, connectionOrigins = new Set();
  // Performance API clock begins at navigation, not at the late-loaded engine.
  // This is an observable startup metric, not a promise about network speed.
  var bootAt = window.performance && typeof performance.now === 'function' ? 0 : Date.now();
  var stats = { firstMediaMs: null, longestTaskMs: 0, longTasks: 0,
    mediaPrioritized: 0, offscreenPaused: 0, lowDataMode: constrained,
    nearbyPrefetch: neighbors };
  var raf = window.requestAnimationFrame ?
    function(fn){ return window.requestAnimationFrame(fn); } :
    function(fn){ return setTimeout(fn, 16); };
  function idle(fn) {
    if (typeof window.requestIdleCallback === 'function')
      return window.requestIdleCallback(fn, {timeout: 850});
    return setTimeout(fn, 120);
  }
  function onScreen(el) {
    if (!el || !el.isConnected || el.closest('[hidden],[aria-hidden="true"]')) return false;
    var r = el.getBoundingClientRect();
    return r.width > 60 && r.height > 60 && r.bottom > 0 &&
      r.top < (window.innerHeight || 800);
  }
  function stageMedia(card) {
    if (!card || !card.querySelectorAll) return [];
    return Array.from(card.querySelectorAll('video,img')).filter(function(el) {
      return !el.closest('.reel-actions,.reel-action-group,.reel-avatar,.reel-disc,.reel-sound,nav,header,footer');
    });
  }
  function markFirstReady(element) {
    if (stats.firstMediaMs !== null || !element) return;
    if (element.tagName === 'VIDEO') {
      if (element.readyState < 2 || !(element.videoWidth > 0)) return;
    } else if (element.tagName === 'IMG') {
      if (!element.complete || !(element.naturalWidth > 0)) return;
    } else return;
    stats.firstMediaMs = Math.round(((window.performance && performance.now()) || Date.now()) - bootAt);
    try { performance.mark('traydaq-first-feed-media-ready'); } catch (_) {}
  }
  function warmOrigin(url) {
    if (!url || connectionOrigins.size >= 3) return;
    try {
      var parsed = new URL(url, location.href);
      if (parsed.protocol !== 'https:' || parsed.origin === location.origin ||
        connectionOrigins.has(parsed.origin)) return;
      // Only approved public media CDNs; never preconnect to arbitrary post links.
      if (!/(?:^|\.)(?:supabase\.co|supabase\.in|cloudinary\.com|googleapis\.com|googleusercontent\.com|firebasestorage\.app)$/i.test(parsed.hostname)) return;
      var link = doc.createElement('link');
      link.rel = 'preconnect'; link.href = parsed.origin; link.crossOrigin = 'anonymous';
      (doc.head || doc.documentElement).appendChild(link);
      connectionOrigins.add(parsed.origin);
    } catch (_) {}
  }
  function prioritize(card, level) {
    for (var el of stageMedia(card)) {
      if (el.tagName === 'IMG') {
        el.decoding = 'async';
        if (level === 2) {
          el.loading = 'eager';
          try { el.fetchPriority = 'high'; } catch (_) {}
          markFirstReady(el);
        } else if (level === 1) {
          el.loading = 'eager';
          try { el.fetchPriority = 'low'; } catch (_) {}
        }
        if (level === 2) warmOrigin(el.currentSrc || el.src);
      } else if (el.tagName === 'VIDEO') {
        el.playsInline = true;
        if (level === 2) {
          // Existing feed owns autoplay; only hint the browser to buffer.
          if (el.preload === 'none' || el.preload === 'metadata') el.preload = 'auto';
          markFirstReady(el);
        } else if (level === 1 && el.preload === 'none') {
          // Do not download whole offscreen videos on limited mobile connections.
          el.preload = 'metadata';
        } else if (level === 0 && !el.paused && !doc.hidden &&
          !el.closest('[data-keep-playing]')) {
          try { el.pause(); stats.offscreenPaused++; } catch (_) {}
        }
        if (level === 2) warmOrigin(el.currentSrc || el.src || el.poster);
      }
    }
    if (level === 2) stats.mediaPrioritized++;
  }
  function pauseCurrent() {
    if (!current) return;
    var previous = current; current = null;
    for (var el of stageMedia(previous)) {
      if (el.tagName === 'VIDEO' && !el.paused) {
        try { el.pause(); stats.offscreenPaused++; } catch (_) {}
      }
    }
  }
  function refreshBudget() {
    var nextSaver = !!connection.saveData;
    try { nextSaver = nextSaver || localStorage.getItem('sf_data_saver') === 'true'; } catch (_) {}
    var limited = nextSaver || (memory > 0 && memory <= 3) ||
      /(?:^|-)2g$/.test(String(connection.effectiveType || ''));
    if (limited !== constrained) {
      constrained = limited;
      neighbors = constrained ? 1 : 2;
      stats.lowDataMode = constrained;
      stats.nearbyPrefetch = neighbors;
    }
  }
  function chooseCurrent() {
    refreshBudget();
    if (!feed || !feed.isConnected || !onScreen(feed) || doc.hidden) {
      pauseCurrent();
      return;
    }
    var candidates = Array.from(visible.entries()).filter(function(entry){
      return entry[0].isConnected && entry[1] > 0;
    });
    candidates.sort(function(a,b){ return b[1] - a[1]; });
    var first = candidates[0] && candidates[0][0];
    if (!first) {
      var cards = feed.querySelectorAll('.reel-card');
      for (var card of cards) { if (onScreen(card)) { first = card; break; } }
    }
    if (!first) return;
    if (first === current) { for (var m of stageMedia(first)) markFirstReady(m); return; }
    var old = current; current = first;
    if (old && old !== first) prioritize(old, 0);
    var all = Array.from(feed.querySelectorAll('.reel-card'));
    var index = all.indexOf(first);
    prioritize(first, 2);
    for (var i = 1; i <= neighbors; i++) {
      if (all[index + i]) prioritize(all[index + i], 1);
    }
  }
  function queueFocus() {
    if (scheduled || stopped) return;
    scheduled = true;
    raf(function(){ scheduled = false; chooseCurrent(); });
  }
  function bindFeed() {
    var next = doc.getElementById('reelFeed');
    if (next !== feed) {
      if (feedObserver) feedObserver.disconnect();
      if (feedChanges) feedChanges.disconnect();
      pauseCurrent();
      observed = new WeakSet(); visible.clear();
      feed = next; current = null; feedObserver = null; feedChanges = null;
      if (feed && typeof IntersectionObserver === 'function') {
        feedObserver = new IntersectionObserver(function(entries) {
          for (var entry of entries) {
            if (!entry.target.isConnected) { visible.delete(entry.target); continue; }
            if (entry.isIntersecting) visible.set(entry.target, entry.intersectionRatio);
            else {
              visible.delete(entry.target);
              if (entry.target !== current) prioritize(entry.target, 0);
            }
          }
          queueFocus();
        }, {threshold: [0, 0.35, 0.7]});
      }
      if (feed && typeof MutationObserver === 'function') {
        feedChanges = new MutationObserver(function(records) {
          for (var entry of visible.keys()) if (!entry.isConnected) visible.delete(entry);
          if (records.some(function(record) {
            return Array.from(record.addedNodes).some(function(n) {
              return n.nodeType === 1 && (n.matches?.('.reel-card') ||
                n.querySelector?.('.reel-card') || n.matches?.('video,img'));
            });
          })) queueScan();
        });
        feedChanges.observe(feed, {childList: true, subtree: true});
      }
    }
    if (!feed) return;
    var cards = feed.querySelectorAll('.reel-card');
    // Observing existing cards is O(n) only on initial load or when feed changes.
    for (var card of cards) {
      if (observed.has(card)) continue;
      observed.add(card);
      if (feedObserver) feedObserver.observe(card);
    }
    queueFocus();
  }
  var scanQueued = false;
  function queueScan() {
    if (scanQueued || stopped) return;
    scanQueued = true;
    raf(function() {
      scanQueued = false;
      bindFeed();
    });
  }
  function lazyDiscoveryImages() {
    if (stopped) return;
    var images = doc.querySelectorAll(
      '#productGrid img,#storeGrid img,#jobsListContainer img,#eventsListContainer img');
    var cap = Math.min(images.length, 180);
    for (var i=0; i<cap; i++) {
      var img = images[i];
      if (imageSeen.has(img)) continue;
      imageSeen.add(img);
      img.decoding = 'async';
      if (!onScreen(img)) {
        img.loading = 'lazy';
        try { img.fetchPriority = 'low'; } catch (_) {}
      }
    }
  }
  function scheduleLazy() {
    if (lazyScheduled || stopped) return;
    lazyScheduled = true;
    idle(function(){ lazyScheduled = false; if (!doc.hidden) lazyDiscoveryImages(); });
  }
  function initialize() {
    if (stopped) return;
    queueScan(); scheduleLazy();
    doc.addEventListener('loadeddata', function(event){
      if (event.target && current && current.contains(event.target)) markFirstReady(event.target);
    }, true);
    doc.addEventListener('load', function(event){
      if (event.target && current && current.contains(event.target)) markFirstReady(event.target);
    }, true);
    doc.addEventListener('visibilitychange', function(){
      if (doc.hidden) pauseCurrent();
      else { queueFocus(); scheduleLazy(); }
    });
    doc.addEventListener('click', function(event) {
      if (event.target?.closest?.('nav,[role="navigation"],#bottomNav,.bottom-nav')) {
        scheduleLazy();
        // Route handlers may hide Home after the capture phase; check after navigation.
        setTimeout(queueFocus, 0);
      }
    }, true);
    window.addEventListener('pageshow', function(){ queueScan(); scheduleLazy(); });
    window.addEventListener('popstate', queueFocus);
    window.addEventListener('hashchange', queueFocus);
    window.addEventListener('resize', queueFocus, {passive:true});
    if (connection && typeof connection.addEventListener === 'function') {
      connection.addEventListener('change', function(){ refreshBudget(); queueFocus(); });
    }
    if (typeof PerformanceObserver === 'function') {
      try {
        var longTaskObserver = new PerformanceObserver(function(list) {
          for (var entry of list.getEntries()) {
            stats.longTasks++;
            stats.longestTaskMs = Math.max(stats.longestTaskMs, Math.round(entry.duration));
          }
        });
        longTaskObserver.observe({entryTypes:['longtask']});
      } catch (_) {}
    }
    // Rebind on route changes without watching the whole DOM for every button mutation.
    if (typeof MutationObserver === 'function') {
      var containerObserver = new MutationObserver(function(records) {
        if (records.some(function(r){ return Array.from(r.addedNodes).some(function(n){
          return n.nodeType === 1 && (n.id === 'reelFeed' || n.querySelector?.('#reelFeed') ||
            n.id === 'productGrid' || n.id === 'jobsListContainer' || n.id === 'eventsListContainer');
        }); })) { queueScan(); scheduleLazy(); }
      });
      containerObserver.observe(doc.body, {childList:true,subtree:true});
    }
  }
  window.__tdSpeedEngine2026 = Object.freeze({
    stats: stats, rescan: function(){ queueScan(); scheduleLazy(); }
  });
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', initialize, {once:true});
  else initialize();
})();