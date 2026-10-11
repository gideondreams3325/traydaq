/* TRAYDAQ Android: global one-tap dropdowns. No private data or app configuration. */
(() => {
  'use strict';
  if (window.__tdEasySelects2026) return;
  window.__tdEasySelects2026 = true;

  const enhanced = new Map();
  let active = null;
  let pending = false;
  let busy = false;
  let pickerCounter = 0;

  const isRendered = (select) => {
    if (!select.isConnected || !select.ownerDocument?.body?.contains(select)) return false;
    if (select.closest('.td-job-picker-holder, .td-easy-select-wrap')) return false;
    if (select.multiple || select.size > 1 || select.hasAttribute('data-td-native-picker')) return false;
    if (select.matches('[hidden], .hidden, .sr-only, .invisible, [aria-hidden="true"]')) return false;
    const rect = select.getBoundingClientRect();
    if (rect.width < 28 || rect.height < 18) return false;
    const style = window.getComputedStyle(select);
    if (style.display === 'none' || style.visibility !== 'visible') return false;
    return select.options.length > 0;
  };

  function labelFor(select) {
    const forLabel = select.id ? [...document.querySelectorAll('label[for]')]
      .find(label => label.htmlFor === select.id) : null;
    const label = forLabel || select.closest('label') || select.parentElement?.querySelector('label');
    return (label?.textContent || select.getAttribute('aria-label') || select.name || 'Choose an option')
      .replace(/\s*\*\s*$/, '').replace(/\s+/g, ' ').trim() || 'Choose an option';
  }

  function currentOption(select) {
    return select.selectedIndex >= 0 ? select.options[select.selectedIndex] : null;
  }

  function refresh(select) {
    const state = enhanced.get(select);
    if (!state || !select.isConnected) return;
    const chosen = currentOption(select);
    const placeholder = !select.value || !chosen || chosen.disabled;
    state.value.textContent = chosen?.textContent?.trim() || 'Choose an option';
    state.value.classList.toggle('td-easy-select-empty', placeholder);
    state.button.disabled = select.disabled;
    state.button.setAttribute('aria-label', labelFor(select) + ': ' + state.value.textContent);
    state.button.setAttribute('aria-required', String(select.required));
  }

  function dismiss(focus = true) {
    if (!active) return;
    const old = active;
    active = null;
    document.removeEventListener('keydown', onKeyDown, true);
    old.overlay.remove();
    if (focus && old.button.isConnected) {
      try { old.button.focus({ preventScroll: true }); } catch (_) { old.button.focus(); }
    }
  }

  function onKeyDown(event) {
    if (!active) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      dismiss();
    } else if (event.key === 'Tab') {
      const items = [...active.overlay.querySelectorAll('button:not([hidden]):not([disabled]), input:not([hidden])')];
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  function open(select, button) {
    if (!select.isConnected || select.disabled) return;
    dismiss(false);
    refresh(select);
    const available = [...select.options].filter(option => !option.disabled && option.value !== '');
    if (!available.length) return;

    const overlay = document.createElement('div');
    overlay.className = 'td-easy-overlay';
    const sheet = document.createElement('section');
    sheet.className = 'td-easy-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    const heading = document.createElement('h3');
    heading.className = 'td-easy-heading';
    heading.id = 'tdEasyPickerHeading' + (++pickerCounter);
    heading.textContent = labelFor(select);
    sheet.setAttribute('aria-labelledby', heading.id);
    const subtitle = document.createElement('p');
    subtitle.className = 'td-easy-subtitle';
    subtitle.textContent = 'Tap an option to select it';

    const header = document.createElement('header');
    header.className = 'td-easy-header';
    const intro = document.createElement('div');
    intro.append(heading, subtitle);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'td-easy-close';
    close.setAttribute('aria-label', 'Close options');
    close.textContent = '✕';
    close.addEventListener('click', () => dismiss());
    header.append(intro, close);

    const list = document.createElement('div');
    list.className = 'td-easy-list';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', heading.textContent);
    let chosenButton = null;
    const choices = [];

    for (const option of available) {
      const choice = document.createElement('button');
      choice.type = 'button';
      choice.className = 'td-easy-choice';
      choice.setAttribute('role', 'option');
      const checked = option.value === select.value;
      choice.classList.toggle('is-current', checked);
      choice.setAttribute('aria-selected', String(checked));
      const title = document.createElement('span');
      title.className = 'td-easy-choice-text';
      title.textContent = option.textContent.trim();
      const indicator = document.createElement('span');
      indicator.className = 'td-easy-check';
      indicator.textContent = checked ? '✓' : '';
      indicator.setAttribute('aria-hidden', 'true');
      choice.append(title, indicator);
      choice.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        select.value = option.value;
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
        refresh(select);
        dismiss();
      });
      list.appendChild(choice);
      choices.push({ choice, title });
      if (checked) chosenButton = choice;
    }

    sheet.append(header);
    if (available.length >= 9) {
      const search = document.createElement('input');
      search.className = 'td-easy-search';
      search.type = 'search';
      search.autocomplete = 'off';
      search.placeholder = 'Search options';
      search.setAttribute('aria-label', 'Search ' + heading.textContent);
      search.addEventListener('input', () => {
        const query = search.value.toLocaleLowerCase().trim();
        for (const item of choices) {
          item.choice.hidden = !item.title.textContent.toLocaleLowerCase().includes(query);
        }
      });
      sheet.append(search);
    }
    sheet.append(list);
    overlay.appendChild(sheet);
    overlay.addEventListener('click', event => {
      if (event.target === overlay) dismiss();
    });
    document.body.appendChild(overlay);
    active = { overlay, button, select };
    document.addEventListener('keydown', onKeyDown, true);
    const focusTarget = chosenButton || choices[0]?.choice;
    try { focusTarget?.focus({ preventScroll: true }); } catch (_) { focusTarget?.focus(); }
  }

  function enhance(select) {
    if (!isRendered(select) || enhanced.has(select)) return;
    const parent = select.parentNode;
    if (!parent) return;
    const wrap = document.createElement('div');
    wrap.className = 'td-easy-select-wrap';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'td-easy-select-trigger';
    button.setAttribute('aria-haspopup', 'dialog');
    const value = document.createElement('span');
    value.className = 'td-easy-selected-value';
    const arrow = document.createElement('span');
    arrow.className = 'td-easy-arrow';
    arrow.textContent = '⌄';
    arrow.setAttribute('aria-hidden', 'true');
    button.append(value, arrow);
    parent.insertBefore(wrap, select);
    wrap.append(select, button);
    select.classList.add('td-easy-original');
    select.tabIndex = -1;
    enhanced.set(select, { wrap, button, value });

    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      open(select, button);
    });
    select.addEventListener('change', () => refresh(select));
    select.addEventListener('input', () => refresh(select));
    select.addEventListener('invalid', event => {
      event.preventDefault();
      open(select, button);
    });
    select.addEventListener('blur', () => refresh(select));
    const exactLabels = select.id ? [...document.querySelectorAll('label[for]')]
      .filter(label => label.htmlFor === select.id) : [];
    for (const label of exactLabels) {
      label.classList.add('td-easy-select-label');
      label.addEventListener('click', event => {
        if (!select.isConnected || select.disabled) return;
        event.preventDefault();
        event.stopPropagation();
        open(select, button);
      });
    }
    // A native select's original onchange handlers and form value stay intact.
    refresh(select);
  }

  function scan() {
    pending = false;
    if (busy) return;
    busy = true;
    try {
      for (const select of document.querySelectorAll('select')) {
        if (enhanced.has(select)) refresh(select);
        else enhance(select);
      }
      for (const select of enhanced.keys()) {
        if (!select.isConnected) enhanced.delete(select);
      }
      if (active && !active.select.isConnected) dismiss(false);
    } finally {
      busy = false;
    }
  }

  function queueScan() {
    if (pending) return;
    pending = true;
    window.setTimeout(scan, 90);
  }

  document.addEventListener('change', event => {
    if (event.target?.tagName === 'SELECT') refresh(event.target);
  }, true);
  document.addEventListener('reset', event => {
    if (event.target?.tagName === 'FORM') window.setTimeout(queueScan, 0);
  }, true);
  const observer = new MutationObserver(mutations => {
    for (const change of mutations) {
      if (change.type === 'childList') {
        if (change.target.closest?.('.td-easy-overlay, .td-job-picker-overlay')) continue;
        queueScan();
        return;
      }
      if (change.type === 'attributes' && (change.target.tagName === 'SELECT' ||
          change.attributeName === 'class' || change.attributeName === 'style' ||
          change.attributeName === 'hidden')) {
        queueScan();
        return;
      }
    }
  });
  observer.observe(document.documentElement, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ['disabled', 'required', 'class', 'style', 'hidden', 'value']
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', queueScan, { once: true });
  else queueScan();
})();
