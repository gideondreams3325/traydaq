/* TRAYDAQ event file uploader. Keep the original native file input & upload handlers. */
(() => {
  'use strict';
  if (window.__tdEventUploadCard2026) return;
  window.__tdEventUploadCard2026 = true;
  const TITLE = /host an event(?: in ghana)?/i;
  const ICON = '<svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4m0 0-4 4m4-4 4 4"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>';
  const formatSize = b => b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.ceil(b / 1024)) + ' KB';

  function belongsToEventForm(input) {
    if (!input || input.type !== 'file' || input.dataset.tdEventUploadCard) return false;
    let ancestor = input.parentElement;
    while (ancestor && ancestor !== document.body) {
      if (Array.from(ancestor.querySelectorAll('h1,h2,h3,h4,[role="heading"]'))
        .some(heading => TITLE.test(heading.textContent || ''))) return true;
      ancestor = ancestor.parentElement;
    }
    return false;
  }
  function enhance(input) {
    if (!belongsToEventForm(input) || !input.parentElement) return;
    input.dataset.tdEventUploadCard = '1';
    const videoOnly = /video/i.test(input.accept || '') && !/image/i.test(input.accept || '');
    const wrap = document.createElement('div');
    wrap.className = 'td-event-file-picker';
    wrap.innerHTML = '<div class="td-event-file-tap"><span class="td-event-file-icon">' + ICON +
      '</span><span class="td-event-file-message"><strong>Choose ' + (videoOnly ? 'video' : 'photo or file') +
      '</strong><small>Tap anywhere to browse your device</small></span>' +
      '<span class="td-event-file-arrow" aria-hidden="true">›</span></div>' +
      '<div class="td-event-file-selection" hidden><div class="td-event-file-thumbnails"></div>' +
      '<div class="td-event-file-details"><strong class="td-event-file-name"></strong>' +
      '<small class="td-event-file-info"></small></div>' +
      '<button type="button" class="td-event-file-remove" aria-label="Remove selected file">Remove</button></div>';

    const tap = wrap.querySelector('.td-event-file-tap');
    const selection = wrap.querySelector('.td-event-file-selection');
    const thumbnails = wrap.querySelector('.td-event-file-thumbnails');
    const name = wrap.querySelector('.td-event-file-name');
    const info = wrap.querySelector('.td-event-file-info');
    const remove = wrap.querySelector('.td-event-file-remove');

    // The entire 88px+ card uses the actual input so Android receives a native tap.
    input.parentNode.insertBefore(wrap, input);
    tap.appendChild(input);
    input.classList.add('td-event-file-native');
    input.removeAttribute('hidden');
    if (!input.getAttribute('aria-label')) input.setAttribute('aria-label', 'Choose event media from your device');
    let urls = [];
    function clearPreviews() {
      urls.forEach(url => URL.revokeObjectURL(url));
      urls = [];
      thumbnails.replaceChildren();
    }
    function render() {
      clearPreviews();
      const files = Array.from(input.files || []);
      selection.hidden = !files.length;
      if (!files.length) return;
      name.textContent = files.length > 1 ? files.length + ' files selected' : files[0].name;
      name.title = files.length === 1 ? files[0].name : '';
      info.textContent = files.map(f => formatSize(f.size)).join(' · ');
      files.slice(0, 3).forEach(file => {
        let preview;
        if (file.type.startsWith('image/')) {
          preview = document.createElement('img');
          preview.alt = 'Selected image preview';
          const url = URL.createObjectURL(file);
          urls.push(url);
          preview.src = url;
        } else if (file.type.startsWith('video/')) {
          preview = document.createElement('video');
          preview.muted = true;
          preview.playsInline = true;
          preview.preload = 'metadata';
          const url = URL.createObjectURL(file);
          urls.push(url);
          preview.src = url;
          preview.setAttribute('aria-label', 'Selected video preview');
        } else {
          preview = document.createElement('span');
          preview.className = 'td-event-file-document';
          preview.textContent = 'FILE';
        }
        thumbnails.appendChild(preview);
      });
    }
    input.addEventListener('change', render);
    remove.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      if (input.disabled) return;
      input.value = '';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    render();
  }

  let pending = false;
  function scan() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      document.querySelectorAll('input[type="file"]:not([data-td-event-upload-card])').forEach(enhance);
    });
  }
  function ready() {
    scan();
    new MutationObserver(changes => {
      if (changes.some(change => Array.from(change.addedNodes).some(node =>
        node.nodeType === 1 && (node.matches?.('input[type="file"],form,[role="dialog"]') ||
          node.querySelector?.('input[type="file"]'))))) scan();
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, {once: true});
  else ready();
})();
