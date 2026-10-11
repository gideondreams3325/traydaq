/* Traydaq media previews: card thumbnails, video frames and graceful failures. */
(function () {
  'use strict';
  if (window.__tdMediaPreviews2026) return;
  window.__tdMediaPreviews2026 = true;

  const VIDEO_FILE = /\.(?:mp4|m4v|webm|mov|ogv|ogg)(?:[?#]|$)/i;
  const PLACEHOLDER = /(?:^|\/)(?:icon\.svg|placeholder[^/]*|video-placeholder[^/]*)\b/i;
  const PROTECTED = '#studioVideo,#studioCoverScrubPreview,#studioVideoDetailsPreview,video[id^="ve"],video[data-camera],#verificationCamera,#faceCamera';
  const imageSources = new WeakMap();
  const videos = new WeakSet();
  const queued = new Set();
  let scheduled = false;

  function safeUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return '';
    const url = value.trim();
    if (/^(?:https?:\/\/|blob:|\/(?!\/)|\.\/)/i.test(url)) return url;
    return '';
  }
  function videoSource(img) {
    const current = safeUrl(img.getAttribute('src') || '');
    if (VIDEO_FILE.test(current)) return current;
    const mediaType = String(img.getAttribute('data-media-type') || img.closest('[data-media-type]')?.getAttribute('data-media-type') || '').toLowerCase();
    if (/^video(?:\/|$)/.test(mediaType)) {
      const named = safeUrl(img.getAttribute('data-video-url') || img.getAttribute('data-media-url') || '');
      if (named) return named;
      if (current && !/\.(?:png|jpe?g|webp|gif|avif|heic|svg)(?:[?#]|$)/i.test(current)) return current;
    }
    return '';
  }
  function coverFrom(node) {
    const parent = node.closest('[data-cover-url],[data-thumbnail-url],[data-video-poster]');
    for (const value of [
      node.getAttribute('data-cover-url'),
      node.getAttribute('data-thumbnail-url'),
      node.getAttribute('data-video-poster'),
      parent?.getAttribute('data-cover-url'),
      parent?.getAttribute('data-thumbnail-url'),
      parent?.getAttribute('data-video-poster')
    ]) {
      const url = safeUrl(value || '');
      if (url && !VIDEO_FILE.test(url) && !PLACEHOLDER.test(url)) return url;
    }
    return '';
  }
  function showUnavailable(media, text) {
    if (!media.isConnected || media.dataset.tdPreviewFailed === '1') return;
    media.dataset.tdPreviewFailed = '1';
    const holder = media.parentElement;
    if (!holder || holder.querySelector(':scope > .td-media-preview-unavailable')) return;
    holder.classList.add('td-media-fallback-parent');
    const label = document.createElement('span');
    label.className = 'td-media-preview-unavailable';
    label.textContent = text;
    label.setAttribute('role', 'img');
    label.setAttribute('aria-label', text);
    holder.appendChild(label);
  }
  function setupVideo(video, isThumbnail) {
    if (videos.has(video) || video.matches(PROTECTED)) return;
    videos.add(video);
    const poster = safeUrl(video.getAttribute('poster') || '');
    if (!poster || PLACEHOLDER.test(poster) || VIDEO_FILE.test(poster)) {
      const actualCover = coverFrom(video);
      if (actualCover) video.setAttribute('poster', actualCover);
      else {
        video.removeAttribute('poster');
        // Existing playback must not be interrupted; only a paused, unstarted
        // element is seeked to an actual decoded opening frame.
        video.classList.add('td-media-awaiting-frame');
        let tried = false;
        const seekFirstFrame = function () {
          if (tried || !video.isConnected || video.seeking || video.error || !video.paused ||
              video.currentTime > 0.025 || !Number.isFinite(video.duration) || video.duration <= 0) return;
          tried = true;
          try { video.currentTime = Math.min(0.12, Math.max(0.001, video.duration / 100)); } catch (_) {}
        };
        video.addEventListener('loadedmetadata', seekFirstFrame, { once: true });
        if (video.readyState >= 1) seekFirstFrame();
        video.addEventListener('loadeddata', function () { video.classList.remove('td-media-awaiting-frame'); }, { once: true });
        if (video.preload === 'none' && (isThumbnail || !video.hasAttribute('controls'))) {
          video.preload = 'metadata';
        }
      }
    }
    video.addEventListener('error', function () {
      if (video.error && video.error.code === 4) showUnavailable(video, 'Video cannot be previewed on this device');
      else if (video.error) showUnavailable(video, 'Video preview unavailable');
    });
    if (isThumbnail) {
      video.muted = true;
      video.playsInline = true;
      video.setAttribute('webkit-playsinline', '');
      video.preload = 'metadata';
      video.tabIndex = -1;
      video.setAttribute('aria-label', 'Video thumbnail');
      video.classList.add('td-media-native-preview');
    }
  }
  function upgradeImage(img) {
    if (img.closest(PROTECTED) || img.closest('.td-media-preview-unavailable')) return;
    const rawSrc = img.getAttribute('src') || '';
    if (imageSources.get(img) === rawSrc) return;
    imageSources.set(img, rawSrc);
    const videoUrl = videoSource(img);
    if (videoUrl) {
      const video = document.createElement('video');
      video.className = img.className;
      video.style.cssText = img.style.cssText;
      video.width = img.width || 0;
      video.height = img.height || 0;
      const actualCover = coverFrom(img);
      if (actualCover) video.setAttribute('poster', actualCover);
      video.src = videoUrl;
      video.muted = true;
      video.playsInline = true;
      video.setAttribute('webkit-playsinline', '');
      video.preload = 'metadata';
      video.setAttribute('aria-label', 'Video thumbnail');
      // Preserve the card's surrounding link and delegated tap action.
      video.style.pointerEvents = 'none';
      img.replaceWith(video);
      setupVideo(video, true);
      return;
    }
    if (!img.hasAttribute('decoding')) img.decoding = 'async';
  }
  function scan(node) {
    if (!(node instanceof Element)) return;
    if (node.matches('img')) upgradeImage(node);
    if (node.matches('video')) setupVideo(node, false);
    node.querySelectorAll('img').forEach(upgradeImage);
    node.querySelectorAll('video').forEach(video => setupVideo(video, false));
  }
  function queue(node) {
    if (!(node instanceof Element)) return;
    queued.add(node);
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(function () {
      scheduled = false;
      const entries = Array.from(queued);
      queued.clear();
      entries.forEach(scan);
    });
  }
  function boot() {
    queue(document.body);
    const observer = new MutationObserver(function (changes) {
      for (const change of changes) {
        if (change.type === 'attributes') { queue(change.target); continue; }
        for (const added of change.addedNodes) if (added.nodeType === 1) queue(added);
      }
    });
    observer.observe(document.body, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'poster', 'data-media-type', 'data-video-url']
    });
    // Some image URLs are returned by a server with an unexpected image MIME
    // type. Recover video assets on the actual failed element, not all photos.
    document.addEventListener('error', function (event) {
      const img = event.target;
      if (!(img instanceof HTMLImageElement) || !img.isConnected) return;
      if (videoSource(img)) { upgradeImage(img); return; }
      if (img.onerror || img.closest('#productGrid,#storeGrid,#jobsListContainer,#eventsListContainer')) return;
      if (!safeUrl(img.getAttribute('src') || '') || PLACEHOLDER.test(img.getAttribute('src') || '')) return;
      showUnavailable(img, 'Image preview unavailable');
    }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
}());
