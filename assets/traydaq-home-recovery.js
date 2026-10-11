/* TRAYDAQ Android: replace a stalled black Home viewport with a light, recoverable state.
 * Visual-only guard: never deletes posts, rewrites feeds, or fetches account data. */
(function tdInstallHomeRecovery(){
  'use strict';
  if (window.__tdHomeRecoveryInstalled) return;
  window.__tdHomeRecoveryInstalled = true;
  var WAIT_MS = 4800, firstEmptyAt = null, lastFeed = null, recovery = null;
  var lastInline = null, recoveryFailed = false;

  function visible(element) {
    if (!element || !element.isConnected || element.closest('[hidden]')) return false;
    var rect = element.getBoundingClientRect();
    var style = window.getComputedStyle(element);
    return rect.width > 120 && rect.height > 100 &&
      style.display !== 'none' && style.visibility !== 'hidden';
  }
  function homeTabSelected() {
    var items = document.querySelectorAll('nav button, nav a, [role="navigation"] button, [role="navigation"] a, #bottomNav button, .bottom-nav button, .nav-item');
    for (var i = 0; i < items.length; i++) {
      var item = items[i], text = (item.textContent || '').trim();
      if (!/^Home$/i.test(text)) continue;
      if (item.matches('.active,.selected,.current,[aria-selected="true"],[aria-current="page"]') ||
          (item.parentElement && item.parentElement.matches('.active,.selected,.current'))) return true;
    }
    return false;
  }
  function validPost(card) {
    if (!card || !card.isConnected) return false;
    // An empty .reel-card is NOT a loaded post. It can be just a black video stage.
    var media = card.querySelectorAll('video,img,canvas');
    for (var i = 0; i < media.length; i++) {
      var item = media[i];
      if (item.closest('.reel-avatar,.reel-actions,.reel-action-group,.reel-disc,.reel-sound,nav,header,footer')) continue;
      if (item.tagName === 'VIDEO' && (item.readyState >= 2 ||
          (item.getAttribute('poster') || '').trim())) return true;
      if (item.tagName === 'IMG' && item.complete && item.naturalWidth > 0) return true;
      if (item.tagName === 'CANVAS' && item.width > 80 && item.height > 80) return true;
    }
    var stage = card.querySelector('.reel-media,.reel-bg,.reel-image,.reel-photo,.reel-video,[data-td-adaptive-feed-bg]');
    if (stage && /url\(/i.test(window.getComputedStyle(stage).backgroundImage || '')) return true;
    var textPost = card.querySelector('.reel-caption,.reel-description,.post-caption,.post-text');
    return !!(textPost && (textPost.textContent || '').trim().length > 24 && !media.length);
  }
  function feedReady(feed) {
    if (!feed) return false;
    var cards = feed.querySelectorAll('.reel-card');
    if (cards.length) {
      for (var i = 0; i < Math.min(3, cards.length); i++) if (validPost(cards[i])) return true;
      return false;
    }
    // Respect explicit empty states and server errors; never cover a valid explanation.
    var text = (feed.textContent || '').replace(/\s+/g, ' ').trim();
    if (recovery) text = text.replace((recovery.textContent || '').replace(/\s+/g, ' ').trim(), '').trim();
    return /no posts|no videos|nothing to show|no content|empty feed|caught up|sign in to see|could not load/i.test(text) ||
      text.length > 35;
  }
  function clear() {
    if (recovery && recovery.isConnected) recovery.remove();
    recovery = null;
    recoveryFailed = false;
    if (lastFeed && lastFeed.removeAttribute) lastFeed.removeAttribute('data-td-home-pending');
    firstEmptyAt = null;
    lastInline = null;
  }
  function makeButton(label, action, secondary) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = secondary ? 'td-home-action td-home-action-secondary' : 'td-home-action';
    b.textContent = label;
    b.addEventListener('click', action);
    return b;
  }
  function retry() {
    clear();
    try {
      if (typeof window.navigate === 'function') { window.navigate('feed'); inspect(); return; }
    } catch (_) {}
    window.location.reload();
  }
  function show(feed, inline, failed) {
    if (!recovery || !recovery.isConnected || lastInline !== inline) {
      if (recovery && recovery.isConnected) recovery.remove();
      var card = document.createElement('section');
      card.id = 'tdHomeRecovery';
      card.className = 'td-home-state' + (inline ? '' : ' td-home-state-fixed');
      card.setAttribute('data-td-home-recovery', 'true');
      card.setAttribute('role', 'status');
      card.setAttribute('aria-live', 'polite');
      var spinner = document.createElement('div');
      spinner.className = 'td-home-spinner';
      spinner.setAttribute('aria-hidden', 'true');
      var title = document.createElement('strong');
      title.className = 'td-home-heading';
      var detail = document.createElement('p');
      detail.className = 'td-home-description';
      var actions = document.createElement('div');
      actions.className = 'td-home-actions';
      card.appendChild(spinner);
      card.appendChild(title);
      card.appendChild(detail);
      card.appendChild(actions);
      card._tdView = {spinner:spinner,title:title,detail:detail,actions:actions};
      if (inline) feed.appendChild(card);
      else document.body.appendChild(card);
      recovery = card;
      recoveryFailed = null;
      lastInline = inline;
    }
    if (inline) feed.setAttribute('data-td-home-pending', 'true');
    if (recoveryFailed === failed) return;
    recoveryFailed = failed;
    var view = recovery._tdView;
    view.spinner.hidden = failed;
    view.title.textContent = failed ? 'Home is taking longer than expected' : 'Loading your Home feed';
    view.detail.textContent = failed ?
      'Your posts are safe. Try again, or open another section while Home loads.' :
      'Getting your posts ready…';
    while (view.actions.firstChild) view.actions.removeChild(view.actions.firstChild);
    if (failed) {
      view.actions.appendChild(makeButton('Retry Home', retry, false));
      view.actions.appendChild(makeButton('Reload app', function(){ window.location.reload(); }, true));
    }
  }
  function inspect() {
    if (document.visibilityState === 'hidden') return;
    var feed = document.getElementById('reelFeed');
    if (feed !== lastFeed) { clear(); lastFeed = feed; }
    var inline = visible(feed);
    if (!inline && !homeTabSelected()) { clear(); return; }
    if (inline && feedReady(feed)) { clear(); return; }
    if (firstEmptyAt === null) firstEmptyAt = Date.now();
    show(feed, inline, Date.now() - firstEmptyAt >= WAIT_MS);
  }
  function start() {
    inspect();
    // Kept lightweight: check only on Home and skip background pages.
    window.setInterval(inspect, 1300);
    var observer = new MutationObserver(function(records) {
      for (var i = 0; i < records.length; i++) {
        var record = records[i], node = record.target;
        if (recovery && (node === recovery || recovery.contains(node))) continue;
        if (node === lastFeed || (lastFeed && lastFeed.contains(node)) ||
            (record.addedNodes && Array.prototype.some.call(record.addedNodes, function(n){
              return n.nodeType === 1 && (n.id === 'reelFeed' || n.querySelector && n.querySelector('#reelFeed'));
            }))) { inspect(); break; }
      }
    });
    if (document.body) observer.observe(document.body, {childList:true,subtree:true});
    document.addEventListener('load', function(event) {
      if (event.target && event.target.closest && event.target.closest('#reelFeed')) inspect();
    }, true);
    document.addEventListener('loadeddata', function(event) {
      if (event.target && event.target.closest && event.target.closest('#reelFeed')) inspect();
    }, true);
    window.addEventListener('online', inspect);
    window.addEventListener('pageshow', inspect);
    document.addEventListener('visibilitychange', inspect);
    document.addEventListener('click', function(event) {
      if (event.target && event.target.closest && event.target.closest('nav,[role="navigation"],#bottomNav,.bottom-nav')) {
        window.setTimeout(inspect, 0);
      }
    }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();