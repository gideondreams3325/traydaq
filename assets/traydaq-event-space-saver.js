/* TRAYDAQ_EVENT_SPACE_SAVER_20261011: preserve original event action nodes/listeners. */
(function () {
  'use strict';
  const containerSelector = '#eventsListContainer';
  const cardSelector = '#eventsListContainer [data-event-card]';
  const actionRowSelector = '.pt-3.flex.items-center';
  const menuClass = 'td-event-more-panel';
  let scheduled = false;
  let menuSequence = 0;

  function closePanel(panel, restoreFocus) {
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    const row = panel.closest('.td-event-compact-actions');
    const toggle = row && row.querySelector('.td-event-more-toggle');
    if (toggle) {
      toggle.setAttribute('aria-expanded', 'false');
      if (restoreFocus && toggle.isConnected) toggle.focus({preventScroll:true});
    }
  }
  function closeAll(except) {
    document.querySelectorAll(cardSelector + ' .' + menuClass + ':not([hidden])')
      .forEach(panel => { if (panel !== except) closePanel(panel, false); });
  }
  function labelFor(node) {
    return ((node.getAttribute('aria-label') || node.textContent || '') + '').trim();
  }
  function actionScore(node) {
    const button = node.matches('button,a,[role="button"]') ? node
      : node.querySelector('button,a,[role="button"]');
    if (!button) return 0;
    const words = labelFor(button).toLowerCase();
    if (button.matches('[data-register-event]') || /register|book|attend|join event|ticket/.test(words)) return 100;
    if (button.matches('[data-view-event]') || /view|detail|open event|learn more/.test(words)) return 80;
    if (/contact|message|location/.test(words)) return 50;
    if (/comment|share|save|report|more|delete|edit/.test(words)) return 10;
    return 30;
  }
  function groupCard(card) {
    const row = card.querySelector(actionRowSelector);
    if (!row || row.classList.contains('td-event-compact-actions')) return;
    // Do not move the picture / title click targets; only the card's action bar.
    const actions = Array.from(row.children).filter(child =>
      child.matches('button,a,[role="button"]') ||
      (child.querySelector && child.querySelector('button,a,[role="button"]'))
    );
    if (actions.length < 2) return;
    const primary = actions.slice().sort((a,b) => actionScore(b)-actionScore(a))[0];
    const secondary = actions.filter(action => action !== primary);
    const panel = document.createElement('div');
    panel.className = menuClass;
    panel.hidden = true;
    panel.id = 'td-event-more-' + (++menuSequence);
    panel.setAttribute('role','group');
    panel.setAttribute('aria-label','More event actions');

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'td-event-more-toggle';
    toggle.setAttribute('data-td-event-more','');
    toggle.setAttribute('aria-label','More event actions');
    toggle.setAttribute('aria-controls',panel.id);
    toggle.setAttribute('aria-expanded','false');
    toggle.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg><span>More</span>';
    // Append the existing elements rather than cloning: preserve data attributes
    // and bound event listeners for registration, comments, sharing, etc.
    primary.classList.add('td-event-primary-action');
    row.insertBefore(primary, row.firstChild);
    secondary.forEach(node => panel.appendChild(node));
    row.append(toggle,panel);
    row.classList.add('td-event-compact-actions');
  }
  function scan() {
    scheduled = false;
    document.querySelectorAll(cardSelector).forEach(groupCard);
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(scan);
    else Promise.resolve().then(scan);
  }
  function onClick(event) {
    if (!(event.target instanceof Element)) return;
    const toggle = event.target.closest('[data-td-event-more]');
    if (toggle) {
      event.preventDefault();
      event.stopPropagation();
      const panel = toggle.parentElement && toggle.parentElement.querySelector('.' + menuClass);
      if (!panel) return;
      const shouldOpen = panel.hidden;
      closeAll();
      panel.hidden = !shouldOpen;
      toggle.setAttribute('aria-expanded', String(shouldOpen));
      return;
    }
    const usedAction = event.target.closest('.' + menuClass + ' button, .' + menuClass + ' a, .' + menuClass + ' [role="button"]');
    if (usedAction) {
      const panel = usedAction.closest('.' + menuClass);
      closePanel(panel, false);
    } else if (!event.target.closest('.' + menuClass)) {
      closeAll();
    }
  }
  function start() {
    if (!document.body) return;
    schedule();
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      const open = document.querySelector(cardSelector + ' .' + menuClass + ':not([hidden])');
      if (open) {
        event.preventDefault();
        closePanel(open, true);
      }
    });
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type !== 'childList' || !mutation.addedNodes.length) continue;
        const root = mutation.target;
        if (root instanceof Element && (root.matches(containerSelector) || root.closest(containerSelector))) {
          schedule();
          return;
        }
        for (const added of mutation.addedNodes) {
          if (added instanceof Element && (added.matches(containerSelector) ||
            added.matches(cardSelector) || added.querySelector(containerSelector + ',[data-event-card]'))) {
            schedule();
            return;
          }
        }
      }
    });
    observer.observe(document.body, {childList:true, subtree:true});
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, {once:true});
  } else start();
}());
