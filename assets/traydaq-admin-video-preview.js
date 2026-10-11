/* Traydaq admin moderation inline video playback. */
(function () {
  'use strict';
  if (window.__tdAdminVideoPreview2026) return;
  window.__tdAdminVideoPreview2026 = true;
  const isAdminVideo = el => el instanceof HTMLVideoElement && el.hasAttribute('data-td-admin-video');
  const parent = el => el && el.closest('[data-td-admin-video-card]');
  function showError(video) {
    const label = parent(video)?.querySelector('[data-td-admin-video-error]');
    if (label) label.hidden = false;
  }
  function setPlayVisible(video, visible) {
    const button = parent(video)?.querySelector('[data-td-admin-play]');
    if (button) button.hidden = !visible;
  }
  document.addEventListener('click', function (event) {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest('[data-td-admin-play]');
    if (!button) return;
    const video = parent(button)?.querySelector('video[data-td-admin-video]');
    if (!video) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      const attempt = video.play();
      if (attempt && typeof attempt.catch === 'function') attempt.catch(() => showError(video));
    } catch (_) { showError(video); }
  }, true);
  document.addEventListener('play', function (event) {
    const video = event.target;
    if (!isAdminVideo(video)) return;
    document.querySelectorAll('video[data-td-admin-video]').forEach(other => {
      if (other !== video && !other.paused) other.pause();
    });
    setPlayVisible(video, false);
    const error = parent(video)?.querySelector('[data-td-admin-video-error]');
    if (error) error.hidden = true;
  }, true);
  for (const type of ['pause', 'ended']) {
    document.addEventListener(type, function (event) {
      if (isAdminVideo(event.target)) setPlayVisible(event.target, true);
    }, true);
  }
  document.addEventListener('error', function (event) {
    if (isAdminVideo(event.target)) showError(event.target);
  }, true);
  document.addEventListener('loadeddata', function (event) {
    if (!isAdminVideo(event.target)) return;
    const error = parent(event.target)?.querySelector('[data-td-admin-video-error]');
    if (error) error.hidden = true;
  }, true);
}());