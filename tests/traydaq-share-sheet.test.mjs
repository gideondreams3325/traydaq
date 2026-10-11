import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { injectTraydaqShareSheet } from '../scripts/patch-private-share-sheet.mjs';

const css = fs.readFileSync(new URL('../assets/traydaq-share-sheet.css', import.meta.url), 'utf8');
const js = fs.readFileSync(new URL('../assets/traydaq-share-sheet.js', import.meta.url), 'utf8');
const fixture = '<!doctype html><html><head><title>Traydaq</title></head><body>' +
  '<button id="oldShare" onclick="oldShareHandler()">Share via Android Apps</button>' +
  '<button onclick="copyLink()">Copy</button><button onclick="saveMedia()">Save media to device</button>' +
  '<button onclick="closeSheet()">Close</button></body></html>';

test('new share appearance compiles with locally embedded brand logos', () => {
  assert.doesNotThrow(() => new Function(js));
  for (const brand of ['whatsapp', 'telegram', 'x', 'facebook']) {
    assert.match(js, new RegExp(brand + ":"));
    assert.match(css, new RegExp('td-share-brand-' + brand));
  }
  assert.match(css, /#d5aa28/);
  assert.match(css, /#092f25/);
});

test('injects once without removing old click handlers or deep links', () => {
  const html = injectTraydaqShareSheet(fixture, css, js);
  assert.equal((html.match(/id="tdModernShareSheet2026"/g) || []).length, 1);
  assert.match(html, /onclick="oldShareHandler\(\)"/);
  assert.match(html, /onclick="copyLink\(\)"/);
  assert.match(html, /onclick="saveMedia\(\)"/);
  assert.match(html, /onclick="closeSheet\(\)"/);
  assert.match(html, /MutationObserver/);
  assert.throws(() => injectTraydaqShareSheet(html, css, js), /already been injected/);
});

test('refuses broken app markup or incomplete assets', () => {
  assert.throws(() => injectTraydaqShareSheet('<body></body></body>', css, js), /one <\/body>/);
  assert.throws(() => injectTraydaqShareSheet(fixture, '.td-share-panel{}', js), /incomplete/);
  assert.throws(() => injectTraydaqShareSheet(fixture, css, ''), /incomplete/);
});


test('fixes missing description and decorative duplicates without changing share handlers', () => {
  for (const marker of [
    'TRAYDAQ_SHARE_COLOR_REFINEMENT_2026', '#25d366', '#2aabee',
    '#1877f2', '#080808', '#0b3b2d', 'linear-gradient(135deg',
    '.td-share-social-item .td-share-brand-icon svg'
  ]) assert.ok(css.includes(marker), 'Missing color treatment: ' + marker);
  for (const marker of ['hideHeaderNoise', 'cleanSocialNoise', 'td-share-legacy-decoration',
    "caption.textContent = 'Share this Traydaq post with friends and followers.'",
    "labelGroup(sheet, social)"]) {
    assert.ok(js.includes(marker), 'Missing UI cleanup: ' + marker);
  }
  // Reuse original button elements; never replace them with synthetic controls
  // that would lose Android sharing, copy, or download click listeners.
  assert.ok(js.includes("primary.classList.add('td-share-primary')"));
  assert.ok(js.includes("copy.classList.add('td-share-copy')"));
  assert.ok(js.includes("save.classList.add('td-share-save')"));
  assert.ok(!js.includes('cloneNode('));
  assert.ok(!js.includes('outerHTML ='));
});

test('validates caption and familiar app colors in the injected APK HTML', () => {
  const html = injectTraydaqShareSheet(fixture, css, js);
  assert.match(html, /Share this Traydaq post with friends and followers/);
  assert.match(html, /background: #25d366 !important/);
  assert.match(html, /background: #2aabee !important/);
  assert.match(html, /background: #1877f2 !important/);
  assert.match(html, /td-share-legacy-decoration/);
});
