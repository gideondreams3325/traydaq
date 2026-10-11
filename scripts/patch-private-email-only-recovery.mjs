import fs from 'node:fs';
import path from 'node:path';

// Public APK builder patch. Only modifies a temporary copy of the app at build
// time; no private source, stored recovery details or Firebase settings leak.
export function patchEmailOnlyRecovery(source) {
  if (typeof source !== 'string' || !source.includes('</body>')) {
    throw new Error('Traydaq email-only recovery patch: app HTML body missing.');
  }
  if (source.includes('id="tdEmailOnlyRecovery"')) {
    throw new Error('Traydaq email-only recovery patch applied more than once.');
  }
  if (!/Recovery Phone Number|Add Recovery Phone Number|SMS OTP account recovery/i.test(source)) {
    throw new Error('Traydaq email-only recovery patch: recovery-phone UI not recognized; refusing unverified build.');
  }
  // The app constructs account settings dynamically, so its existing auth and
  // navigation logic are preserved. Strip the phone-specific controls whenever
  // that screen mounts, including after Android SPA navigation.
  const runtime = '(' + enforceEmailOnlyRecovery.toString() + ')();';
  return source.replace('</body>',
    '<script id="tdEmailOnlyRecovery">\n' + runtime + '\n</script>\n</body>');
}

function enforceEmailOnlyRecovery() {
  'use strict';

  function normalize(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }
  function isAppText(node) {
    return !!node.parentElement &&
      !node.parentElement.closest('script, style, noscript, textarea, template, [contenteditable="true"]');
  }
  function isPhoneHeading(text) {
    return /\bRecovery Phone Number\b/i.test(text) && text.length < 140;
  }
  function isPhoneAction(text) {
    return /^(?:📱\s*)?(?:Add|Change|Manage|Verify|Update|Remove)\s+Recovery Phone Number$/i.test(text);
  }

  function removePhoneCard(heading) {
    let ancestor = heading.parentElement;
    let safeContainer = null;
    for (let depth = 0; ancestor && depth < 10 && ancestor !== document.body; depth++, ancestor = ancestor.parentElement) {
      const text = normalize(ancestor.textContent);
      // Never remove the recovery email panel, Google/password section or the
      // entire account-security page.
      if (text.length > 1800 || /\bRecovery Email\b/i.test(text) ||
          /\bManaged (?:via|by) Google\b/i.test(text)) break;
      if (isPhoneHeading(text) ||
          (/\bRecovery Phone Number\b/i.test(text) &&
           /\bAdd Recovery Phone Number\b|\bSMS OTP account recovery\b/i.test(text))) {
        safeContainer = ancestor;
      }
    }
    if (safeContainer) {
      safeContainer.remove();
      return true;
    }
    return false;
  }

  function inspect(root) {
    if (!root || (root.nodeType !== 1 && root.nodeType !== 3 &&
       root.nodeType !== 11)) return;
    const text = normalize(root.textContent || '');
    if (!/Recovery Phone Number|SMS OTP account recovery|Add recovery email or phone number/i.test(text)) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const headings = [];
    const actions = [];
    const descriptions = [];
    let scanned = 0;
    while (walker.nextNode() && scanned++ < 12000) {
      const node = walker.currentNode;
      if (!isAppText(node)) continue;
      const value = normalize(node.nodeValue);
      if (!value || value.length > 400) continue;
      if (/Add recovery email or phone number for account protection\s*&\s*password recovery\.?/i.test(value)) {
        node.nodeValue = node.nodeValue.replace(
          /Add recovery email or phone number for account protection\s*&\s*password recovery\.?/i,
          'Add a recovery email to protect your account and reset your password.');
      }
      if (isPhoneHeading(value) && !isPhoneAction(value)) headings.push(node);
      else if (isPhoneAction(value)) actions.push(node);
      else if (/Add your Ghanaian mobile number to enable SMS OTP account recovery/i.test(value)) descriptions.push(node);
    }
    // Process deepest labels first, so one removed card cannot cause a higher
    // shared security wrapper to be accidentally selected.
    for (const heading of headings) {
      if (heading.parentElement && heading.parentElement.isConnected) {
        removePhoneCard(heading);
      }
    }
    // If the source has split headings and buttons across wrappers, these
    // targeted fallbacks still leave no live phone-recovery action behind.
    for (const node of [...actions, ...descriptions]) {
      const host = node.parentElement;
      if (host && host.isConnected) {
        const control = host.closest('button, a, label');
        if (control) control.remove();
        else if (host.tagName === 'P') host.remove();
        else if (normalize(host.textContent).length < 200) host.remove();
      }
    }
  }

  const pending = new Set();
  let scheduled = false;
  function flush() {
    scheduled = false;
    for (const root of [...pending].slice(0, 40)) {
      pending.delete(root);
      if (root === document.body || root.isConnected) inspect(root);
    }
    if (pending.size) schedule();
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(flush);
    else Promise.resolve().then(flush);
  }
  function queue(root) {
    if (root) {
      pending.add(root);
      schedule();
    }
  }
  function start() {
    if (!document.body || typeof MutationObserver === 'undefined') return;
    queue(document.body);
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type !== 'childList') continue;
        for (const node of record.addedNodes) {
          if (node.nodeType !== 1 && node.nodeType !== 3) continue;
          const value = String(node.textContent || '');
          if (/Recovery Phone Number|SMS OTP account recovery|Add recovery email or phone number/i.test(value)) {
            queue(node.nodeType === 3 ? node.parentElement : node);
          }
        }
      }
    });
    // Observe only additions. Removing the phone UI doesn't cause a loop.
    observer.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else start();
}

if (process.argv[1] && import.meta.url === 'file://' + process.argv[1]) {
  const root = path.resolve(process.argv[2] || '.');
  const file = path.join(root, 'index.html');
  const previous = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, patchEmailOnlyRecovery(previous));
  console.log('PASS: Phone recovery removed from Traydaq account security UI; email recovery and Google sign-in retained.');
}
