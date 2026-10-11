(function installTraydaqCompactMarketplace() {
  'use strict';
  if (window.__tdMarketplaceCompact2026) return;
  window.__tdMarketplaceCompact2026 = true;

  const strips = ['productFilterChips', 'marketFilterChips'];
  const grids = ['productGrid'];
  let queued = false, serial = 0;

  function close(panel, restoreFocus) {
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    const root = panel.parentElement;
    const trigger = root && root.querySelector(':scope > [aria-expanded]');
    if (trigger) {
      trigger.setAttribute('aria-expanded', 'false');
      if (restoreFocus && trigger.isConnected) trigger.focus({preventScroll:true});
    }
  }
  function closeAll(except) {
    document.querySelectorAll('.td-mp-filter-panel:not([hidden]),.td-mp-manage-panel:not([hidden])')
      .forEach(panel => { if (panel !== except) close(panel, false); });
  }
  function reposition(panel, trigger) {
    if (!panel || panel.hidden || !trigger) return;
    const bounds = trigger.getBoundingClientRect();
    const width = Math.min(270, Math.max(160, window.innerWidth - 20));
    panel.style.setProperty('--td-mp-left', Math.max(10, Math.min(bounds.left, window.innerWidth - width - 10)) + 'px');
    const estimatedHeight = Math.min(panel.scrollHeight || 280, window.innerHeight * .62, 420);
    const below = window.innerHeight - bounds.bottom;
    const top = below >= Math.min(estimatedHeight, 180) ? bounds.bottom + 6 :
      Math.max(8, bounds.top - estimatedHeight - 6);
    panel.style.setProperty('--td-mp-top', top + 'px');
  }
  function createTrigger(text, cls, panel, ariaLabel) {
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = cls;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-haspopup', 'true');
    trigger.setAttribute('aria-controls', panel.id);
    trigger.setAttribute('aria-label', ariaLabel);
    const label = document.createElement('span');
    label.textContent = text;
    const chevron = document.createElement('span');
    chevron.textContent = '⌄';
    chevron.setAttribute('aria-hidden', 'true');
    trigger.append(label, chevron);
    trigger.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation(); // Never send the synthetic trigger to the original filter handler.
      const opening = panel.hidden;
      closeAll();
      panel.hidden = !opening;
      trigger.setAttribute('aria-expanded', String(opening));
      if (opening && cls === 'td-mp-trigger') reposition(panel, trigger);
    });
    return trigger;
  }
  function isActive(el) {
    return el.matches('.active,[aria-pressed="true"],[aria-selected="true"],[data-active="true"]');
  }
  function refreshFilter(trigger, panel) {
    if (!trigger || !panel) return;
    const active = [...panel.children].find(isActive);
    trigger.classList.toggle('td-mp-has-active', !!active);
    const label = trigger.firstElementChild;
    if (label) label.textContent = active
      ? 'Filters: ' + (active.textContent || '').trim().slice(0, 32)
      : 'More filters';
  }
  function groupFilters(strip) {
    if (!strip) return;
    const existing = strip.querySelector(':scope > .td-mp-filter-root');
    if (existing) {
      refreshFilter(existing.querySelector('.td-mp-trigger'),
        existing.querySelector('.td-mp-filter-panel'));
      return;
    }
    const items = [...strip.children].filter(el => el.matches('button,[role="button"]'));
    if (items.length <= 4) return;
    // Keep the first common choices directly accessible; all other original
    // category buttons remain descendants of the same filter container.
    const more = document.createElement('div');
    more.className = 'td-mp-filter-root';
    const panel = document.createElement('div');
    panel.className = 'td-mp-filter-panel';
    panel.hidden = true;
    panel.id = 'td-mp-filter-' + (++serial);
    panel.setAttribute('role', 'group');
    panel.setAttribute('aria-label', 'More marketplace filters');
    const trigger = createTrigger('More filters', 'td-mp-trigger', panel, 'More marketplace filters');
    for (const item of items.slice(2)) panel.appendChild(item);
    more.append(trigger, panel);
    strip.appendChild(more);
    refreshFilter(trigger, panel);
  }
  function groupCard(card) {
    if (!card || card.querySelector(':scope > .td-mp-manage-root')) return;
    const edit = card.querySelector('button[data-edit-product],a[data-edit-product]');
    const del = card.querySelector('button[data-delete-product],a[data-delete-product]');
    if (!edit || !del) return; // Do not invent seller privileges or expose a new delete path.
    const root = document.createElement('div');
    root.className = 'td-mp-manage-root';
    const panel = document.createElement('div');
    panel.id = 'td-mp-manage-' + (++serial);
    panel.className = 'td-mp-manage-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'group');
    panel.setAttribute('aria-label', 'Manage your product');
    const trigger = createTrigger('Manage', 'td-mp-manage-trigger', panel, 'Manage product');
    // Move, never clone: original events, IDs and permissions remain in effect.
    panel.append(edit, del);
    root.append(trigger, panel);
    card.appendChild(root);
  }
  function scan() {
    queued = false;
    for (const id of strips) groupFilters(document.getElementById(id));
    for (const id of grids) {
      const grid = document.getElementById(id);
      if (grid) grid.querySelectorAll(':scope > [id^="market-product-"]').forEach(groupCard);
    }
  }
  function schedule() {
    if (queued) return;
    queued = true;
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(scan);
    else Promise.resolve().then(scan);
  }
  document.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    const chosen = event.target.closest('.td-mp-filter-panel :is(button,[role="button"]),.td-mp-manage-panel :is(button,a)');
    if (chosen) {
      // Allow the ORIGINAL control to handle this event. No preventDefault here.
      const panel = chosen.closest('.td-mp-filter-panel,.td-mp-manage-panel');
      closeAll();
      if (panel && panel.classList.contains('td-mp-filter-panel')) {
        const trigger = panel.parentElement.querySelector('.td-mp-trigger');
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => refreshFilter(trigger, panel));
      }
    } else if (!event.target.closest('.td-mp-filter-root,.td-mp-manage-root')) closeAll();
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const panel = document.querySelector('.td-mp-filter-panel:not([hidden]),.td-mp-manage-panel:not([hidden])');
    if (panel) { event.preventDefault(); close(panel, true); }
  });
  document.addEventListener('scroll', event => {
    if (!event.target || !(event.target instanceof Element) || event.target.closest('.td-mp-filter-panel')) return;
    closeAll();
  }, true);
  window.addEventListener('resize', () => closeAll());
  function start() {
    schedule();
    const observer = new MutationObserver(records => {
      if (records.some(record => record.type === 'childList' && [...record.addedNodes].some(node =>
        node.nodeType === 1 && (node.id === 'productGrid' || node.id === 'storeGrid' ||
        node.id === 'productFilterChips' || node.id === 'marketFilterChips' ||
        (node.matches && node.matches('[id^="market-product-"],button,[role="button"]')) ||
        (node.querySelector && node.querySelector('#productFilterChips,#marketFilterChips,#productGrid,[id^="market-product-"]')))))) {
        schedule();
      }
    });
    observer.observe(document.body, {childList:true,subtree:true});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
}());