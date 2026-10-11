import fs from 'node:fs';
import path from 'node:path';

// Public APK-build patch: reorganizes the existing feed DOM without replacing
// social/permission handlers or publishing private source.
export const FEED_GROUP_MARKER = 'tdGroupedEngagement2026';

export function patchFeedEngagement(html, css) {
  if (typeof html !== 'string' || !html.includes('</head>') || !html.includes('</body>')) {
    throw new Error('TRAYDAQ feed groups: expected the app HTML shell.');
  }
  if (!html.includes('class="reel-actions"') || !html.includes('data-post-action="repost"') ||
      !html.includes('data-post-action="options"') ||
      !html.includes('data-user-delete-reel') || !html.includes('data-admin-takedown-reel')) {
    throw new Error('TRAYDAQ feed groups: expected For You engagement controls changed.');
  }
  if (html.includes(FEED_GROUP_MARKER)) {
    throw new Error('TRAYDAQ feed groups: already applied; refusing double insertion.');
  }
  if (typeof css !== 'string' || !css.includes('.td-reel-more-panel') ||
      !css.includes('[hidden]')) {
    throw new Error('TRAYDAQ feed groups: missing accessible menu styles.');
  }

  const js = '(' + installFeedEngagementGrouping.toString() + ')();';
  new Function(js); // Reject syntax-invalid injected JavaScript before writing source.
  const style = '<style id="' + FEED_GROUP_MARKER + '">\n' +
    css.replace(/<\/style/gi, '<\\/style') + '\n</style>\n';
  const runtime = '<script id="' + FEED_GROUP_MARKER + 'Script">\n' +
    js + '\n</script>\n';
  return html.replace('</head>', style + '</head>')
    .replace('</body>', runtime + '</body>');
}

export function installFeedEngagementGrouping() {
  'use strict';
  const selector = '.reel-card .reel-actions';
  const icon = '<svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>';
  let scheduled = false;
  let nextMenuId = 0;

  function closeMenu(panel, restoreFocus) {
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    const trigger = panel.parentElement && panel.parentElement.querySelector('[data-td-feed-more]');
    if (trigger) {
      trigger.setAttribute('aria-expanded', 'false');
      if (restoreFocus && trigger.isConnected) trigger.focus({ preventScroll: true });
    }
  }
  function closeMenus(except) {
    document.querySelectorAll('.td-reel-more-panel:not([hidden])').forEach(panel => {
      if (panel !== except) closeMenu(panel, false);
    });
  }

  function setRowLabel(row, title) {
    const button = row.querySelector('button');
    if (!button) return;
    button.setAttribute('aria-label', title);
    const count = row.querySelector('.reel-action-count');
    if (button.matches('[data-post-action="repost"]') && count) {
      const name = document.createElement('span');
      name.className = 'td-reel-more-item-title';
      name.textContent = 'Repost';
      count.before(name);
    } else if (count) {
      count.textContent = title;
    }
    row.classList.add('td-reel-more-item');
  }

  function groupCard(actions) {
    if (!actions || actions.dataset.tdGroupedEngagement === 'true') return;
    const find = value => {
      const button = actions.querySelector(value);
      return button && button.closest('.reel-action-group');
    };
    const repost = find('[data-post-action="repost"]');
    const options = find('[data-post-action="options"]');
    if (!repost || !options) return;
    const admin = find('[data-admin-takedown-reel]');
    const creatorDelete = find('[data-user-delete-reel]');
    const disc = find('[data-post-action="sound"]');
    const soundRow = disc && disc.closest('.reel-action-group');

    const root = document.createElement('div');
    root.className = 'reel-action-group td-reel-more-root';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'reel-action td-reel-more-trigger';
    trigger.setAttribute('data-td-feed-more', '');
    trigger.setAttribute('aria-label', 'More post actions');
    trigger.setAttribute('aria-haspopup', 'true');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML = icon;
    const caption = document.createElement('span');
    caption.className = 'reel-action-count';
    caption.textContent = 'More';
    const menu = document.createElement('div');
    menu.className = 'td-reel-more-panel';
    menu.hidden = true;
    menu.id = 'td-reel-more-' + (++nextMenuId);
    menu.setAttribute('role', 'group');
    menu.setAttribute('aria-label', 'More post actions');
    trigger.setAttribute('aria-controls', menu.id);

    // Move original controls, preserving all bound click listeners, post IDs,
    // live counters, repost state, and admin/creator permission checks.
    for (const [row, title] of [[repost, 'Repost'], [options, 'Post options'],
      [creatorDelete, 'Delete post'], [admin, 'Remove post']]) {
      if (!row) continue;
      setRowLabel(row, title);
      menu.appendChild(row);
    }
    root.append(trigger, caption, menu);
    actions.insertBefore(root, soundRow || null);
    actions.dataset.tdGroupedEngagement = 'true';
  }

  function scan() {
    scheduled = false;
    document.querySelectorAll(selector).forEach(groupCard);
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(scan);
    else Promise.resolve().then(scan);
  }

  document.addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const trigger = target.closest('[data-td-feed-more]');
    if (trigger) {
      event.preventDefault();
      const menu = trigger.parentElement && trigger.parentElement.querySelector('.td-reel-more-panel');
      if (!menu) return;
      const wasOpen = !menu.hidden;
      closeMenus();
      menu.hidden = wasOpen;
      trigger.setAttribute('aria-expanded', String(!wasOpen));
      return;
    }
    // The real action handler runs on the original button before this listener.
    const chosenAction = target.closest('.td-reel-more-panel button');
    if (chosenAction) {
      closeMenus();
      return;
    }
    if (!target.closest('.td-reel-more-panel')) closeMenus();
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const open = document.querySelector('.td-reel-more-panel:not([hidden])');
    if (open) {
      event.preventDefault();
      closeMenu(open, true);
    }
  });
  // The popup must not float over a different video after swiping.
  document.addEventListener('scroll', event => {
    if (event.target && (event.target.id === 'reelFeed' ||
      (event.target.classList && event.target.classList.contains('reel-card')))) closeMenus();
  }, true);

  function start() {
    if (!document.body) return;
    schedule();
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type !== 'childList' || !record.addedNodes.length) continue;
        let feedAdded = false;
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches('.reel-card,.reel-actions,#reelFeed,#page') ||
              node.querySelector('.reel-card .reel-actions')) {
            feedAdded = true;
            break;
          }
        }
        if (feedAdded) { schedule(); break; }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else start();
}

export function main(root = '.', cssFile) {
  const htmlPath = path.join(path.resolve(root), 'index.html');
  if (!cssFile) throw new Error('TRAYDAQ feed groups: provide the public CSS file.');
  const initial = fs.readFileSync(htmlPath, 'utf8');
  const result = patchFeedEngagement(initial, fs.readFileSync(cssFile, 'utf8'));
  if (result === initial) throw new Error('TRAYDAQ feed groups: no-op patch.');
  fs.writeFileSync(htmlPath, result);
  console.log('PASS: compact For You engagements, live counters, and owner/admin actions remain wired.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main(process.argv[2] || '.', process.argv[3]);
}