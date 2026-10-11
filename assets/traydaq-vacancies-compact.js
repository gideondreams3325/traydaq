(function installTraydaqCompactVacancies() {
  'use strict';
  if (window.__tdVacanciesCompact2026) return;
  window.__tdVacanciesCompact2026 = true;

  let scheduled = false;
  function make(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function selectedTab(root) {
    const nav = root.querySelector('.sf-disc-tabs');
    if (!nav) return '';
    if (nav.dataset.tdCurrentTab) return nav.dataset.tdCurrentTab;
    const active = [...nav.querySelectorAll('.jobs-tab')].find(button =>
      button.classList.contains('active-tab') ||
      button.className.includes('border-[#F59E0B]'));
    return active?.dataset.tab || 'explore';
  }
  function syncNav(root) {
    const nav = root.querySelector('.sf-disc-tabs');
    const menu = nav?.querySelector('.td-vacancy-nav-menu');
    if (!menu) return;
    const active = selectedTab(root);
    const labels = { my_applications:'Applications', employer_desk:'My Listings', admin_hub:'Moderation' };
    const label = menu.querySelector('.td-vacancy-nav-name');
    const next = labels[active] || 'My Activity';
    if (label && label.textContent !== next) label.textContent = next;
    menu.querySelectorAll('.jobs-tab').forEach(button => {
      const yes = button.dataset.tab === active;
      if (button.getAttribute('aria-current') !== (yes ? 'page' : null)) {
        if (yes) button.setAttribute('aria-current','page');
        else button.removeAttribute('aria-current');
      }
    });
  }
  function enhanceNav(root) {
    const nav = root.querySelector('.sf-disc-tabs');
    if (!nav) return;
    if (!nav.querySelector('.td-vacancy-nav-menu')) {
      const explore = nav.querySelector('.jobs-tab[data-tab="explore"]');
      const secondary = [...nav.querySelectorAll('.jobs-tab:not([data-tab="explore"])')];
      if (!explore || !secondary.length) return;
      const oldLabel = explore.querySelector('span') || explore;
      oldLabel.textContent = '🔎 Explore';
      explore.setAttribute('aria-label','Explore vacancies and entrepreneur services');
      const menu = make('details','td-vacancy-nav-menu td-vacancy-dropdown');
      const summary = make('summary','td-vacancy-nav-summary');
      summary.append(make('span','td-vacancy-nav-name','My Activity'),
        make('span','td-vacancy-chevron','⌄'));
      const panel = make('div','td-vacancy-nav-panel');
      panel.setAttribute('role','group');
      panel.setAttribute('aria-label','Vacancy account pages');
      secondary.forEach(button => panel.appendChild(button)); // Move, never clone: handlers survive.
      menu.append(summary,panel);
      nav.appendChild(menu);
      nav.dataset.tdVacancyNav = '1';
    }
    syncNav(root);
  }
  function syncFilters(pane) {
    const category = pane.querySelector('#jobCategorySelect');
    const region = pane.querySelector('#jobRegionSelect');
    const badge = pane.querySelector('.td-vacancy-filter-count');
    if (!category || !region || !badge) return;
    const count = Number(category.value !== 'All') + Number(region.value !== 'All');
    badge.hidden = count === 0;
    if (badge.textContent !== String(count)) badge.textContent = String(count);
    const summary = pane.querySelector('.td-vacancy-filter-menu > summary');
    summary?.classList.toggle('td-has-filters',count > 0);
    const reset = pane.querySelector('.td-vacancy-clear');
    if (reset) reset.disabled = count === 0;
  }
  function filterField(title, select) {
    const label = make('div','td-vacancy-filter-field');
    label.appendChild(make('span','td-vacancy-filter-label',title));
    // The global TRAYDAQ select picker may have already wrapped this select.
    // Move that complete wrapper when present to keep its trigger and listeners.
    const existingWrap = select.closest('.td-easy-select-wrap');
    label.appendChild(existingWrap || select);
    return label;
  }
  function enhanceExplore(root) {
    const pane = root.querySelector('.sf-explore-pane');
    if (!pane) return;
    if (pane.dataset.tdVacancyCompact) { syncFilters(pane); return; }
    const types = pane.querySelector('#listingTypeFilters');
    const input = pane.querySelector('#jobSearchInput');
    const category = pane.querySelector('#jobCategorySelect');
    const region = pane.querySelector('#jobRegionSelect');
    const oldRow = input?.parentElement?.parentElement;
    if (!types || !input || !category || !region || !oldRow ||
        !oldRow.contains(category) || !oldRow.contains(region)) return;
    pane.dataset.tdVacancyCompact = '1';

    const toolbar = make('div','td-vacancy-toolbar');
    const search = make('div','td-vacancy-search');
    input.placeholder = 'Search vacancies or services';
    input.setAttribute('aria-label','Search vacancies and services');
    search.appendChild(input);

    const filter = make('details','td-vacancy-filter-menu td-vacancy-dropdown');
    const summary = make('summary','td-vacancy-filter-summary');
    const count = make('span','td-vacancy-filter-count','0');
    count.hidden = true;
    summary.append(make('span','td-vacancy-filter-text','⚙ Filters'),count,
      make('span','td-vacancy-chevron','⌄'));
    summary.setAttribute('aria-label','Filter by category or region');
    const panel = make('div','td-vacancy-filter-panel');
    panel.append(filterField('Category',category),filterField('Region',region));
    const clear = make('button','td-vacancy-clear','Clear filters');
    clear.type = 'button';
    clear.addEventListener('click', event => {
      event.preventDefault();
      // Dispatch original change events so the app performs its real filtering.
      for (const select of [category,region]) {
        if (select.value !== 'All') {
          select.value = 'All';
          select.dispatchEvent(new Event('change',{bubbles:true}));
        }
      }
      syncFilters(pane);
      filter.open = false;
    });
    panel.appendChild(clear);
    filter.append(summary,panel);
    toolbar.append(search,filter);
    pane.insertBefore(toolbar,types);
    oldRow.remove();
    types.classList.add('td-vacancy-types');
    for (const [value,short,full] of [
      ['all','All','All listings'],['vacancy','Vacancies','Vacancies'],
      ['entrepreneur','Services','Entrepreneur services']]) {
      const button = types.querySelector('[data-listing-type="' + value + '"]');
      if (!button) continue;
      button.textContent = short;
      button.setAttribute('aria-label',full);
    }
    syncFilters(pane);
  }
  function enhanceCards(root) {
    const grid = root.querySelector('#jobsListContainer');
    if (!grid) return;
    grid.querySelectorAll('.td-job-card:not([data-td-vacancy-card])').forEach(card => {
      card.dataset.tdVacancyCard = '1';
      const actions = card.querySelector('.flex.items-center.gap-2.shrink-0');
      if (actions) {
        actions.classList.add('td-vacancy-card-actions');
        const details = actions.querySelector('button[data-view-job]');
        if (details) {
          details.textContent = 'Details';
          details.setAttribute('aria-label','View listing details');
        }
        const apply = actions.querySelector('button[data-apply-job]');
        if (apply) {
          apply.textContent = 'Apply';
          apply.setAttribute('aria-label','Apply for this vacancy');
        }
        const contact = actions.querySelector('button[data-contact-entrepreneur]');
        if (contact) {
          contact.textContent = 'Message';
          contact.setAttribute('aria-label','Message this service provider');
        }
      }
      card.querySelectorAll('span').forEach(span => {
        if (span.textContent.trim() === 'Anti-Scam Protected') {
          span.textContent = 'Protected';
          span.setAttribute('title','Anti-Scam Protected');
        }
      });
    });
  }
  function scan() {
    scheduled = false;
    const root = document.querySelector('.sf-disc-jobs');
    if (!root) return;
    root.classList.add('td-vacancies-compact');
    enhanceNav(root);
    enhanceExplore(root);
    enhanceCards(root);
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(scan);
    else Promise.resolve().then(scan);
  }
  document.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest('.sf-disc-jobs .jobs-tab');
    if (button) {
      const nav = button.closest('.sf-disc-tabs');
      if (nav) nav.dataset.tdCurrentTab = button.dataset.tab || 'explore';
      const details = button.closest('.td-vacancy-nav-menu');
      if (details) details.open = false;
      schedule();
      return; // Original tab click handler runs unmodified.
    }
  });
  document.addEventListener('change', event => {
    if (event.target?.matches?.('#jobCategorySelect,#jobRegionSelect')) {
      const pane = event.target.closest('.sf-explore-pane');
      if (pane) syncFilters(pane);
    }
  });
  document.addEventListener('pointerdown', event => {
    document.querySelectorAll('.sf-disc-jobs .td-vacancy-dropdown[open]').forEach(menu => {
      if (!menu.contains(event.target)) menu.open = false;
    });
  },true);
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const open = document.querySelector('.sf-disc-jobs .td-vacancy-dropdown[open]');
    if (open) {
      event.preventDefault();
      open.open = false;
      open.querySelector('summary')?.focus();
    }
  });
  function start() {
    schedule();
    const watcher = new MutationObserver(records => {
      if (records.some(record => {
        if (record.type !== 'childList') return false;
        const target = record.target;
        if (target?.nodeType === 1 && target.closest?.('.sf-disc-jobs')) return true;
        return [...record.addedNodes].some(node => node.nodeType === 1 &&
          (node.matches?.('.sf-disc-jobs') || node.querySelector?.('.sf-disc-jobs')));
      })) schedule();
    });
    watcher.observe(document.body,{childList:true,subtree:true});
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
}());
