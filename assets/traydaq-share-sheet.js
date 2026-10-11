/* Preserves the app's existing click handlers and original share targets. */
(function () {
  'use strict';
  if (window.__tdShareSheet2026Installed) return;
  window.__tdShareSheet2026Installed = true;

  const icons = {
    whatsapp: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.966-.273-.099-.471-.148-.67.15-.198.297-.767.966-.94 1.164-.173.198-.347.223-.644.074-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.297-.496.1-.198.05-.371-.025-.52-.075-.148-.669-1.612-.916-2.206-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.793.372s-1.04 1.016-1.04 2.48 1.065 2.877 1.213 3.075c.149.198 2.095 3.2 5.076 4.487.709.306 1.262.489 1.693.626.712.227 1.36.195 1.872.118.571-.085 1.758-.718 2.006-1.412.248-.694.248-1.288.173-1.412-.074-.124-.272-.198-.57-.347m-5.45 7.442h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.646-.235-.374a9.86 9.86 0 01-1.51-5.26c.002-5.445 4.434-9.876 9.885-9.876a9.81 9.81 0 016.989 2.897 9.81 9.81 0 012.893 6.99c-.003 5.446-4.434 9.878-9.883 9.878m8.413-18.297A11.816 11.816 0 0012.028 0C5.495 0 .177 5.317.174 11.852a11.8 11.8 0 001.583 5.919L.075 24l6.379-1.674a11.85 11.85 0 005.57 1.419h.005c6.534 0 11.852-5.317 11.855-11.852a11.816 11.816 0 00-3.449-8.365z"/></svg>',
    telegram: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.9 4.4 3.1 10.9c-1.1.44-1.1 1.05-.2 1.32l4.32 1.35 1.67 5.17c.2.57.1.79.7.79.46 0 .67-.21.92-.46l2.1-2.05 4.36 3.22c.8.44 1.37.21 1.57-.74L21.4 5.67c.3-1.18-.45-1.71-1.5-1.27Zm-1.08 2.6L9.45 15.5l-.36 3.26-1.2-3.93L18.82 7Z"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.901 1.153h3.68L14.54 10.34 24 22.846h-7.406l-5.8-7.584-6.64 7.584H.47l8.6-9.828L0 1.154h7.594l5.243 6.932zM17.61 20.644h2.039L6.486 3.24H4.298z"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15.7 8.36h-2.23V6.94c0-.53.35-.65.6-.65h1.6V3.4l-2.19-.01c-2.43 0-3.65 1.52-3.65 3.51v1.46H7.95v3.1h1.88V21h3.64v-9.54h2.45l.34-3.1z"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.7 10.5 6.6-3.8M8.7 13.5l6.6 3.8"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3A5 5 0 0 0 11 21.07l1.7-1.7"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4"/><path d="M4 17v3h16v-3"/></svg>'
  };
  const plain = el => String(el && el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const controls = root => Array.from(root.querySelectorAll('button,a,[role="button"]'));
  const visible = el => {
    if (!el || !el.isConnected || el.closest('[hidden],[aria-hidden="true"]')) return false;
    if (!el.getClientRects().length) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  };
  function bestControl(root, predicate) {
    return controls(root).filter(el => predicate(plain(el))).sort((a, b) => plain(a).length - plain(b).length)[0] || null;
  }
  function findSheet() {
    const triggers = Array.from(document.querySelectorAll('button,a,[role="button"]'))
      .filter(el => plain(el).includes('share via android apps') && visible(el));
    for (const trigger of triggers) {
      let parent = trigger.parentElement;
      for (let depth = 0; parent && parent !== document.body && depth < 12; depth++, parent = parent.parentElement) {
        const t = plain(parent);
        if (t.includes('share post') && t.includes('whatsapp') && t.includes('telegram') &&
            t.includes('facebook') && t.includes('save media') && t.includes('copy') && t.includes('close')) {
          return { sheet: parent, trigger: trigger };
        }
      }
    }
    return null;
  }
  function removeOldIcons(target, newIcon) {
    if (!target) return;
    // Decorative glyphs are replaced, not the button itself; listeners and actions remain intact.
    const walker = document.createTreeWalker(target, 4);
    const staleText = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (newIcon && newIcon.contains(node)) continue;
      if (/^[\s]*(?:💬|✈️?|📘|📱|↗️?|🔗|⬇️?|📥|📤|📋|📲)[\s]*$/u.test(node.nodeValue || '')) staleText.push(node);
    }
    staleText.forEach(node => { node.nodeValue = ''; });
    Array.from(target.querySelectorAll('svg,img,i')).forEach(el => {
      if (!newIcon || !newIcon.contains(el)) el.classList.add('td-share-legacy-icon');
    });
    Array.from(target.querySelectorAll('span,div')).forEach(el => {
      if (newIcon && newIcon.contains(el)) return;
      const own = plain(el);
      if (own && own.length < 4 && /[^\p{L}\p{N}\s]/u.test(own) && !el.querySelector('button,a')) {
        el.classList.add('td-share-legacy-icon');
      }
    });
  }
  function iconSpan(name, className) {
    const span = document.createElement('span');
    span.className = className;
    span.setAttribute('aria-hidden', 'true');
    span.innerHTML = icons[name];
    return span;
  }
  function locateSocial(sheet, name, patterns) {
    const found = bestControl(sheet, t => t.length < 65 && patterns.some(p => t === p || t.includes(p)));
    if (found) return found;
    const leaf = Array.from(sheet.querySelectorAll('span,div,p'))
      .find(el => !el.children.length && patterns.includes(plain(el)));
    return leaf && leaf.parentElement !== sheet ? leaf.parentElement : null;
  }
  function labelGroup(sheet, items) {
    let row = items[0] && items[0].parentElement;
    while (row && row !== sheet) {
      if (items.every(item => row.contains(item))) {
        const t = plain(row);
        if (!t.includes('share via android apps') && !t.includes('save media') && !t.includes('copy')) {
          row.classList.add('td-share-social-row');
        }
        break;
      }
      row = row.parentElement;
    }
  }
  function styleLink(sheet, copy) {
    if (!copy) return;
    copy.classList.add('td-share-copy');
    removeOldIcons(copy);
    copy.prepend(iconSpan('copy', 'td-share-action-icon'));
    let parent = copy.parentElement;
    while (parent && parent !== sheet) {
      const str = plain(parent);
      if ((/https?:\/\/|:\/\/post\/|com\.sellerflow\.app|traydaq\./i.test(str) || str.includes('share link')) &&
          str.length < 550) {
        parent.classList.add('td-share-link-card');
        parent.prepend(iconSpan('link', 'td-share-link-badge'));
        break;
      }
      parent = parent.parentElement;
    }
  }
  function styleSheet() {
    const found = findSheet();
    if (!found || found.sheet.classList.contains('td-share-panel')) return;
    const sheet = found.sheet;
    const headings = Array.from(sheet.querySelectorAll('h1,h2,h3,h4'));
    const title = headings.find(el => plain(el) === 'share post');
    if (!title) return;
    sheet.classList.add('td-share-panel');
    const oldBadge = title.previousElementSibling;
    if (oldBadge && !oldBadge.matches('button,a') && plain(oldBadge).length < 5) {
      oldBadge.classList.add('td-share-legacy-icon');
    }
    const hero = iconSpan('share', 'td-share-hero');
    title.before(hero);
    title.classList.add('td-share-title');
    const subtitle = Array.from(sheet.querySelectorAll('p,span,div'))
      .find(el => !el.children.length && plain(el).startsWith('share this traydaq post'));
    if (subtitle) subtitle.classList.add('td-share-subtitle');

    const primary = found.trigger;
    primary.classList.add('td-share-primary');
    const shareIcon = iconSpan('share', 'td-share-action-icon');
    removeOldIcons(primary);
    primary.prepend(shareIcon);

    const social = [
      ['whatsapp', ['whatsapp']],
      ['telegram', ['telegram']],
      ['x', ['x / twitter', 'x/twitter', 'twitter']],
      ['facebook', ['facebook']]
    ].map(entry => {
      const item = locateSocial(sheet, entry[0], entry[1]);
      if (!item) return null;
      item.classList.add('td-share-social-item');
      const graphic = iconSpan(entry[0], 'td-share-brand-icon td-share-brand-' + entry[0]);
      removeOldIcons(item);
      item.prepend(graphic);
      return item;
    });
    if (social.every(Boolean)) labelGroup(sheet, social);

    styleLink(sheet, bestControl(sheet, t => t === 'copy' || t.endsWith(' copy')));
    const save = bestControl(sheet, t => t.includes('save media to device'));
    if (save) {
      save.classList.add('td-share-save');
      removeOldIcons(save);
      save.prepend(iconSpan('download', 'td-share-action-icon'));
    }
    const close = bestControl(sheet, t => t === 'close');
    if (close) close.classList.add('td-share-close');
  }
  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      try { styleSheet(); } catch (error) {
        // Share actions must remain available even if an unfamiliar template cannot be styled.
        console.warn('Traydaq share sheet enhancement skipped', error);
      }
    });
  }
  const observer = new MutationObserver(mutations => {
    if (mutations.some(m => {
      if (m.type === 'attributes') {
        const node = m.target;
        const t = node && node.textContent || '';
        return t.length < 4000 && t.toLowerCase().includes('share via android apps');
      }
      return Array.from(m.addedNodes).some(node => {
        const t = node && node.textContent || '';
        return t.length < 18000 && t.toLowerCase().includes('share via android apps');
      });
    })) schedule();
  });
  function start() {
    if (!document.body) return;
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class','style','aria-hidden'] });
    schedule();
    document.addEventListener('click', event => {
      const button = event.target && event.target.closest && event.target.closest('button,a,[role="button"]');
      if (button && /share/i.test(plain(button))) schedule();
    }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
