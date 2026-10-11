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
