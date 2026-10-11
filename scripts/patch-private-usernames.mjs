import fs from 'node:fs';

// This PUBLIC builder patch changes the checked-out app at APK build time.
// It does not publish the app source, alter usernames in the database, or
// guess identities when an account handle is unavailable.
export function patchPublicUsernameDisplay(html) {
  if (typeof html !== 'string' || !html.includes('</body>')) {
    throw new Error('Traydaq username patch: HTML body is missing.');
  }
  if (html.includes('id="tdActualUsernames"')) {
    throw new Error('Traydaq username patch has already been applied.');
  }

  // Browser code is embedded verbatim so it can work with both existing
  // static template renderers and subsequent SPA route updates.
  const runtime = '(' + liveUsernameLabels.toString() + ')();';
  return html.replace('</body>',
    '<script id="tdActualUsernames">\n' + runtime + '\n</script>\n</body>');
}

function liveUsernameLabels() {
  'use strict';

  // Never turn "Seller" into another person's guessed identity. Only use an
  // actual @username already present within the SAME compact account card.
  function validHandle(value) {
    const match = String(value || '').trim().match(/^@([A-Za-z0-9_][A-Za-z0-9_.-]{1,49})$/);
    return match ? '@' + match[1] : '';
  }

  function handleInCard(card) {
    const candidates = new Set();
    if (card && card.getAttribute) {
      for (const attr of ['data-username', 'data-user-username', 'data-handle']) {
        const value = card.getAttribute(attr);
        const handle = validHandle(value && value[0] === '@' ? value : '@' + (value || ''));
        if (handle) candidates.add(handle);
      }
    }

    // A small ancestor can contain both "Seller" and @username. A section
    // with many users is deliberately rejected as ambiguous.
    const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
    let scanned = 0;
    while (walker.nextNode() && ++scanned <= 70) {
      const raw = String(walker.currentNode.nodeValue || '').trim();
      const handle = validHandle(raw);
      if (handle) candidates.add(handle);
      if (candidates.size > 1) return '';
    }
    return candidates.size === 1 ? [...candidates][0] : '';
  }

  function accountHandleFor(textNode) {
    let scope = textNode.parentElement;
    for (let level = 0; scope && level < 5 && scope !== document.body; level++, scope = scope.parentElement) {
      // Do not cross from a single account card into a whole feed or list.
      if (String(scope.textContent || '').length > 650) break;
      const handle = handleInCard(scope);
      if (handle) return handle;
    }
    return '';
  }

  function updateTextNode(node) {
    if (!node || node.nodeType !== Node.TEXT_NODE || !/^\s*Seller\s*$/i.test(node.nodeValue || '')) return;
    const host = node.parentElement;
    if (!host || host.closest('button, input, textarea, select, option, script, style, [contenteditable="true"], [role="button"][aria-label]')) return;

    // This should only rename a displayed ACCOUNT TITLE, never standalone
    // Seller role indicators, store categories, or call-to-action buttons.
    const handle = accountHandleFor(node);
    if (!handle) return;
    node.nodeValue = (node.nodeValue.match(/^\s*/)?.[0] || '') + handle + (node.nodeValue.match(/\s*$/)?.[0] || '');
  }

  function inspect(root) {
    if (!root || (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.TEXT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE)) return;
    if (root.nodeType === Node.TEXT_NODE) {
      updateTextNode(root);
      return;
    }
    if (root.nodeType === Node.ELEMENT_NODE && /^(SCRIPT|STYLE|TEXTAREA|INPUT|SELECT)$/.test(root.tagName)) return;
    if (!/seller/i.test(root.textContent || '')) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let scanned = 0;
    while (walker.nextNode() && ++scanned <= 3500) updateTextNode(walker.currentNode);
  }

  const pending = new Set();
  let frameRequested = false;
  function flush() {
    frameRequested = false;
    const roots = [...pending].slice(0, 40);
    for (const root of roots) {
      pending.delete(root);
      inspect(root);
    }
    if (pending.size) requestFrame();
  }
  function requestFrame() {
    if (frameRequested) return;
    frameRequested = true;
    // Queue work outside the DOM mutation callback to avoid UI freezes.
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(flush);
    else Promise.resolve().then(flush);
  }
  function enqueue(root) {
    if (!root) return;
    pending.add(root);
    requestFrame();
  }

  function start() {
    if (!document.body || typeof MutationObserver === 'undefined') return;
    enqueue(document.body);
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'characterData') enqueue(record.target.parentElement);
        else for (const added of record.addedNodes) enqueue(added);
      }
    });
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}

if (process.argv[1] && import.meta.url === 'file://' + process.argv[1]) {
  const path = (process.argv[2] || '.').replace(/\/$/, '') + '/index.html';
  const original = fs.readFileSync(path, 'utf8');
  const updated = patchPublicUsernameDisplay(original);
  fs.writeFileSync(path, updated);
  console.log('PASS: Live @username labels enabled in account cards where the real handle is present.');
}
