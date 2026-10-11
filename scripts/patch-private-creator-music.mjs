import fs from 'node:fs';
import path from 'node:path';

// Patch the temporary private checkout only during the PUBLIC Traydaq APK build.
// No music uploads, private source code or credentials are published here.
const MARKER = 'tdCreatorMusicBrowseOnly';

const injectedScript = String.raw`<script id="tdCreatorMusicBrowseOnly">
(() => {
  'use strict';
  // Only the Creator Studio song picker contains this descriptive sentence.
  // Do not touch the dedicated Music Library upload/release screen.
  const creatorPickerIntro = 'Use music released by artists who permit creator reuse';
  const uploadLabel = /^(?:[+＋]\s*)?Upload Music$/i;
  const oldEmpty = /No artist music available for reuse yet\.\s*You can upload your own with cover art\./g;

  function creatorMusicCard(button) {
    let current = button.parentElement;
    for (let i = 0; i < 10 && current && current !== document.body; i++, current = current.parentElement) {
      const content = current.textContent || '';
      if (content.length > 1800) continue;
      if (content.includes(creatorPickerIntro) && /Music Library/i.test(content)) return current;
    }
    return null;
  }

  function cleanEmptyState(card) {
    const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) {
      if (oldEmpty.test(walker.currentNode.nodeValue || '')) textNodes.push(walker.currentNode);
      oldEmpty.lastIndex = 0;
    }
    for (const node of textNodes) {
      node.nodeValue = node.nodeValue.replace(oldEmpty, 'No songs available for reuse yet. Check back later.');
    }
  }

  function refreshCreatorSongPicker() {
    for (const button of document.querySelectorAll('button, a, [role="button"]')) {
      const label = (button.textContent || button.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
      if (!uploadLabel.test(label)) continue;
      const card = creatorMusicCard(button);
      if (!card) continue;
      cleanEmptyState(card);
      button.remove();
    }
  }

  let pending = false;
  function scheduleRefresh() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      refreshCreatorSongPicker();
    });
  }

  // Creator Studio is a SPA: the picker may be rendered again when switching tabs.
  // Observe added nodes only and ignore the removals caused by this patch.
  const observer = new MutationObserver(records => {
    if (records.some(record => Array.from(record.addedNodes).some(node => {
      const text = node.textContent || '';
      return text.includes('Upload Music') || text.includes(creatorPickerIntro);
    }))) scheduleRefresh();
  });
  const start = () => {
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
    scheduleRefresh();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
</script>`;

export function patchCreatorStudioMusic(html) {
  if (typeof html !== 'string') throw new TypeError('Expected index.html text');
  if (html.includes(MARKER)) throw new Error('Creator Studio music patch already installed');
  const endings = [...html.matchAll(/<\/body\s*>/gi)];
  if (endings.length !== 1) throw new Error('Expected exactly one closing body element');
  const at = endings[0].index;
  return html.slice(0, at) + injectedScript + '\n' + html.slice(at);
}

if (process.argv[1] && import.meta.url === 'file://' + process.argv[1]) {
  const root = path.resolve(process.argv[2] || '.');
  const filename = path.join(root, 'index.html');
  const original = fs.readFileSync(filename, 'utf8');
  const updated = patchCreatorStudioMusic(original);
  fs.writeFileSync(filename, updated);
  console.log('PASS: Creator Studio song picker is browse-only; independent Music Library uploads remain available.');
}
