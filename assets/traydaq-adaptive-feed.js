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
      if (!largeEnough(element, card)) continue;
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

  function scan() {
    scheduled = false;
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
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('orientationchange', schedule, { passive: true });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else start();
})();
