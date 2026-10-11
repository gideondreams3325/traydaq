/* TRAYDAQ adaptive aspect-ratio feed media.
 * One lightweight observer handles For You, Following, lazy photos and video
 * replacements. Does not touch source URLs, playback, touch/swipe handlers,
 * overlay controls, authorship, engagement or post ordering. */
(function installTraydaqAdaptiveFeedMedia() {
  'use strict';
  if (window.__traydaqAdaptiveFeedMediaInstalled) return;
  window.__traydaqAdaptiveFeedMediaInstalled = true;

  const CARD = '.reel-card';
  const EXCLUDED = '.reel-actions, .reel-action-group, .reel-action, .td-reel-more-panel, .reel-avatar, .reel-disc, .reel-sound, nav, header, footer';
  let scheduled = false;

  function largeEnough(element, card) {
    const media = element.getBoundingClientRect();
    const surface = card.getBoundingClientRect();
    if (!surface.width || !surface.height) return false;
    // Post media spans most of a reel's width. Icons/avatars never do.
    return media.width >= surface.width * 0.48 &&
      media.height >= surface.height * 0.24 &&
      media.width * media.height >= surface.width * surface.height * 0.13;
  }

  function apply(card) {
    if (!card || !card.isConnected) return;
    const media = card.querySelectorAll('video, img');
    let found = false;
    for (const element of media) {
      if (element.closest(EXCLUDED)) continue;
      const belongsToCard = element.closest(CARD) === card;
      if (!belongsToCard) continue;
      const inStage = element.closest('.reel-media, .reel-bg, .reel-image, .reel-photo, .reel-video');
      const wideVideo = element.tagName === 'VIDEO' &&
        element.getBoundingClientRect().width >= card.getBoundingClientRect().width * 0.48;
      if (!largeEnough(element, card) && !wideVideo && !inStage) continue;
      if (inStage && inStage !== card && inStage.closest(CARD) === card) {
        inStage.setAttribute('data-td-adaptive-feed-stage', 'true');
      }
      element.setAttribute('data-td-adaptive-feed-media', 'true');
      found = true;
    }
    if (found) return;

    // Some image posts use a CSS background instead of an <img>. Do not
    // modify unrelated gradient overlays or the page-wide background.
    const backgrounds = [
      ...card.querySelectorAll('.reel-media, .reel-bg, .reel-image, .reel-photo, [style*="background-image"]'),
      card
    ];
    for (const element of backgrounds) {
      if (element !== card && element.closest(CARD) !== card) continue;
      if (element.closest(EXCLUDED)) continue;
      if (!largeEnough(element, card) && element !== card) continue;
      const image = window.getComputedStyle(element).backgroundImage || '';
      if (!/url\(/i.test(image)) continue;
      element.setAttribute('data-td-adaptive-feed-bg', 'true');
      return;
    }
  }


  // Android WebViews sometimes size reels to an old CSS viewport, leaving
  // a large blank gap above the bottom dock. Measure actual visible bounds.
  function fitFeedViewport() {
    const feed = document.getElementById('reelFeed');
    if (!feed) return;
    const clear = () => {
      if (feed.hasAttribute('data-td-feed-viewport')) feed.removeAttribute('data-td-feed-viewport');
      if (feed.style.getPropertyValue('--td-feed-viewport-height')) {
        feed.style.removeProperty('--td-feed-viewport-height');
      }
    };
    const rect = feed.getBoundingClientRect();
    const viewBottom = Math.min(window.innerHeight,
      window.visualViewport
        ? window.visualViewport.height + window.visualViewport.offsetTop
        : window.innerHeight);
    if (window.innerWidth > 900 || rect.width < 180 ||
        rect.top < -20 || rect.top > viewBottom - 260 ||
        window.getComputedStyle(feed).visibility === 'hidden') {
      clear();
      return;
    }
    let dockTop = Infinity;
    const docks = document.querySelectorAll(
      'nav, footer, [role="navigation"], #bottomNav, .bottom-nav, .bottom-navigation, .bottom-tab-bar, .tab-bar, .tabbar'
    );
    for (const dock of docks) {
      if (feed.contains(dock)) continue;
      const box = dock.getBoundingClientRect();
      if (box.width < window.innerWidth * 0.65 || box.height < 35 ||
          box.height > 190 || box.top < viewBottom * 0.55 ||
          box.top > viewBottom - 24 || box.bottom < viewBottom - 150 ||
          window.getComputedStyle(dock).visibility === 'hidden') continue;
      dockTop = Math.min(dockTop, box.top);
    }
    const reservedFallback = Math.max(54, Math.min(78, Math.round(viewBottom * 0.1)));
    const bottom = Number.isFinite(dockTop) ? dockTop : viewBottom - reservedFallback;
    const height = Math.floor(bottom - rect.top - 2);
    if (height < 260) {
      clear();
      return;
    }
    const value = height + 'px';
    if (feed.style.getPropertyValue('--td-feed-viewport-height') !== value) {
      feed.style.setProperty('--td-feed-viewport-height', value);
    }
    if (!feed.hasAttribute('data-td-feed-viewport')) {
      feed.setAttribute('data-td-feed-viewport', 'true');
    }
  }

  function scan() {
    scheduled = false;
    fitFeedViewport();
    document.querySelectorAll(CARD).forEach(apply);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(scan);
    else Promise.resolve().then(scan);
  }

  function isFeedChange(record) {
    if (record.type === 'attributes') {
      return !!(record.target.closest && record.target.closest(CARD));
    }
    if (record.type !== 'childList' || !record.addedNodes.length) return false;
    for (const node of record.addedNodes) {
      if (node.nodeType !== 1) continue;
      if (node.matches && node.matches(CARD + ',video,img,.reel-media,.reel-bg,.reel-image,.reel-photo')) return true;
      if (node.querySelector && node.querySelector(CARD + ',video,img,.reel-media,.reel-bg,.reel-image,.reel-photo')) return true;
    }
    return false;
  }

  function start() {
    if (!document.body) return;
    schedule();
    const observer = new MutationObserver(records => {
      if (records.some(isFeedChange)) schedule();
    });
    observer.observe(document.body, {
      subtree: true, childList: true, attributes: true,
      attributeFilter: ['src', 'srcset', 'poster', 'style']
    });
    document.addEventListener('load', event => {
      if (event.target && event.target.closest && event.target.closest(CARD)) schedule();
    }, true);
    document.addEventListener('loadedmetadata', event => {
      if (event.target && event.target.closest && event.target.closest(CARD)) schedule();
    }, true);
    document.addEventListener('click', schedule, true);
    document.addEventListener('visibilitychange', schedule);
    window.addEventListener('pageshow', schedule);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('orientationchange', schedule, { passive: true });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else start();
})();
