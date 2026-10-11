/* TRAYDAQ shared Android/web file picker skin. Purely presentational: original
   input IDs, names, accepted types, capture, multiple, validation and listeners survive. */
(() => {
  'use strict';
  if (window.__tdUniversalUpload2026) return;
  window.__tdUniversalUpload2026 = true;

  const fileStates = new Map();
  const ICON = '<svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4m0 0-4 4m4-4 4 4"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>';
  const actionWords = /\b(choose|browse|select|pick|attach|add|upload|take)\b/i;
  const formatSize = bytes => bytes >= 1048576
    ? (bytes / 1048576).toFixed(1) + ' MB'
    : Math.max(1, Math.ceil(bytes / 1024)) + ' KB';

  function visible(element) {
    if (!element || !element.isConnected || !element.getClientRects().length) return false;
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }
  function labelFor(input) {
    if (!input.id) return null;
    return Array.from(document.querySelectorAll('label[for]'))
      .find(label => label.htmlFor === input.id && visible(label) && actionWords.test(label.textContent || '')) || null;
  }
  function description(input) {
    if (input.hasAttribute('capture')) return /video/i.test(input.accept || '') ? 'Record video' : 'Take photo';
    const accepted = (input.accept || '').toLowerCase();
    if (/image/.test(accepted) && !/video|audio|pdf/.test(accepted)) return input.multiple ? 'Choose photos' : 'Choose photo';
    if (/video/.test(accepted) && !/image|audio/.test(accepted)) return input.multiple ? 'Choose videos' : 'Choose video';
    if (/audio|\.mp3|\.wav/.test(accepted) && !/image|video/.test(accepted)) return 'Choose audio';
    if (/pdf|docx|\.doc|text\//.test(accepted) && !/image|video/.test(accepted)) return 'Choose document';
    return input.multiple ? 'Choose files' : 'Choose file';
  }
  function selectedPanel() {
    const element = document.createElement('div');
    element.className = 'td-upload-selected';
    element.hidden = true;
    element.innerHTML = '<div class="td-upload-thumbs"></div>' +
      '<div class="td-upload-file-details"><strong class="td-upload-file-title"></strong>' +
      '<small class="td-upload-file-size"></small></div>' +
      '<button class="td-upload-remove" type="button" aria-label="Remove selected files">Remove</button>';
    return element;
  }
  function createCard(input) {
    const card = document.createElement('label');
    card.className = 'td-upload-card';
    card.htmlFor = input.id;
    card.innerHTML = '<span class="td-upload-card-icon">' + ICON + '</span>' +
      '<span class="td-upload-card-message"><strong></strong><small>Tap anywhere to browse your device</small></span>' +
      '<span class="td-upload-card-arrow" aria-hidden="true">›</span>';
    card.querySelector('strong').textContent = description(input);
    return card;
  }
  function attachSelection(input, trigger) {
    const panel = selectedPanel();
    trigger.insertAdjacentElement('afterend', panel);
    const thumbs = panel.querySelector('.td-upload-thumbs');
    const title = panel.querySelector('.td-upload-file-title');
    const sizes = panel.querySelector('.td-upload-file-size');
    const remove = panel.querySelector('.td-upload-remove');
    const state = { panel, urls: [] };
    fileStates.set(input, state);

    function clearUrls() {
      state.urls.forEach(url => URL.revokeObjectURL(url));
      state.urls = [];
      thumbs.replaceChildren();
    }
    function update() {
      clearUrls();
      const files = Array.from(input.files || []);
      panel.hidden = !files.length;
      if (!files.length) return;
      title.textContent = files.length === 1 ? files[0].name : files.length + ' files selected';
      title.title = files.length === 1 ? files[0].name : '';
      sizes.textContent = files.map(file => formatSize(file.size)).join(' · ');
      files.slice(0, 3).forEach(file => {
        let preview;
        if (file.type.startsWith('image/')) {
          preview = document.createElement('img');
          preview.alt = 'Selected image preview';
          const url = URL.createObjectURL(file);
          state.urls.push(url);
          preview.src = url;
        } else if (file.type.startsWith('video/')) {
          preview = document.createElement('video');
          preview.muted = true;
          preview.playsInline = true;
          preview.controls = true;
          preview.preload = 'metadata';
          preview.setAttribute('aria-label', 'Selected video preview');
          const url = URL.createObjectURL(file);
          state.urls.push(url);
          preview.src = url;
        } else if (file.type.startsWith('audio/')) {
          preview = document.createElement('span');
          preview.className = 'td-upload-file-type';
          preview.textContent = 'AUDIO';
        } else {
          preview = document.createElement('span');
          preview.className = 'td-upload-file-type';
          preview.textContent = 'FILE';
        }
        thumbs.appendChild(preview);
      });
    }
    input.addEventListener('change', update);
    remove.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (input.disabled) return;
      input.value = '';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    if (input.form) {
      input.form.addEventListener('reset', () => requestAnimationFrame(update));
    }
    update();
  }

  function enhance(input) {
    if (!input || input.type !== 'file' || input.dataset.tdUniversalPicker) return;
    if (!input.isConnected || input.closest('[data-td-file-picker-ignore]')) return;

    // Use the app's existing label when it already opens this file input.
    // This is important for CV uploads and other programmatic picker controls.
    const containingLabel = input.closest('label');
    const actionLabel = containingLabel && visible(containingLabel) ? containingLabel : labelFor(input);
    const nativeVisible = visible(input);
    if (!nativeVisible && !actionLabel) return; // Preserve bespoke hidden upload flows.

    input.dataset.tdUniversalPicker = '1';
    let trigger = null;
    if (actionLabel) {
      trigger = actionLabel;
      trigger.classList.add('td-upload-card', 'td-upload-existing-label');
      if (input.closest('.td-form-upload')) input.closest('.td-form-upload').classList.add('td-upload-modernized');
    } else {
      if (!input.id) input.id = 'tdUploadInput' + (++window.__tdUploadIdCounter);
      trigger = createCard(input);
      input.insertAdjacentElement('afterend', trigger);
    }
    input.classList.add('td-upload-source');
    if (!input.hasAttribute('aria-label') && !actionLabel) input.setAttribute('aria-label', description(input));
    if (input.disabled) trigger.classList.add('td-upload-disabled');
    attachSelection(input, trigger);
  }

  // Enhance existing custom "Choose file" buttons without replacing their handlers.
  function decorateExistingButtons() {
    document.querySelectorAll('button,[role="button"]').forEach(button => {
      if (button.classList.contains('td-upload-remove') || button.classList.contains('td-upload-action')) return;
      const words = (button.textContent || '').trim();
      if (!/^(choose|select|browse|pick|attach)\s+(a\s+|an\s+)?(file|photo|image|video|audio|music|document|media|picture|cover|files|photos|images|videos|pictures)\b/i.test(words)) return;
      let parent = button.parentElement, found = false;
      for (let n = 0; parent && n < 3; n++, parent = parent.parentElement) {
        if (parent.querySelector('input[type="file"]')) { found = true; break; }
      }
      if (found) button.classList.add('td-upload-action');
    });
  }

  let pending = false;
  function scan() {
    if (pending || !document.body) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      for (const [input, state] of fileStates) {
        if (!input.isConnected || !state.panel.isConnected) {
          state.urls.forEach(url => URL.revokeObjectURL(url));
          fileStates.delete(input);
        }
      }
      document.querySelectorAll('input[type="file"]:not([data-td-universal-picker])').forEach(enhance);
      decorateExistingButtons();
    });
  }
  function ready() {
    window.__tdUploadIdCounter = window.__tdUploadIdCounter || 0;
    scan();
    new MutationObserver(records => {
      // Modals are often inserted hidden and revealed via class/style changes.
      if (records.some(record => record.type === 'attributes' ||
        Array.from(record.addedNodes).some(node => node.nodeType === 1 &&
          (node.matches?.('input,button,label,[role="dialog"],form,[role="button"]') ||
           node.querySelector?.('input[type="file"],label[for],button'))))) scan();
    }).observe(document.body, { childList: true, subtree: true,
      attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
  else ready();
})();
