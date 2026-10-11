import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {patchEventSpaceSaver,EVENT_SPACE_SAVER_MARKER} from '../scripts/patch-private-event-space-saver.mjs';

const css=fs.readFileSync(new URL('../assets/traydaq-event-space-saver.css',import.meta.url),'utf8');
const js=fs.readFileSync(new URL('../assets/traydaq-event-space-saver.js',import.meta.url),'utf8');
const html='<!doctype html><html><head><title>Traydaq</title></head><body><main id="page"></main></body></html>';
const jobs='const view = \u0060<div id="eventsListContainer"><article data-event-card="demo"></article></div>\u0060;';

test('installs isolated compact Events stylesheet and runtime exactly once',()=>{
  const updated=patchEventSpaceSaver(html,jobs,css,js);
  assert.match(updated,/id="tdEventSpaceSaver20261011Style"/);
  assert.match(updated,/id="tdEventSpaceSaver20261011"/);
  assert.ok(updated.includes('grid-template-columns:minmax(0,1fr) 39px'));
  assert.ok(updated.includes('data-td-event-more'));
  assert.ok(updated.includes('data-register-event'));
  assert.equal((updated.match(/id="tdEventSpaceSaver20261011"/g)||[]).length,1);
  assert.throws(()=>patchEventSpaceSaver(updated,jobs,css,js),/already installed/);
});

test('refuses changed event-card anchors and incomplete assets',()=>{
  assert.throws(()=>patchEventSpaceSaver(html,'const jobs=[];',css,js),/event cards were changed/);
  assert.throws(()=>patchEventSpaceSaver(html,jobs,'',js),/assets incomplete/);
  assert.throws(()=>patchEventSpaceSaver(html,jobs,css,'invalid'),/assets incomplete/);
  assert.throws(()=>patchEventSpaceSaver(html.replace('</head>',''),jobs,css,js),/expected full app HTML/);
});

test('secondary actions retain original elements and delegated handlers',()=>{
  new Function(js);
  assert.ok(js.includes('secondary.forEach(node => panel.appendChild(node))'));
  assert.ok(js.includes("primary.classList.add('td-event-primary-action')"));
  assert.ok(!js.includes('cloneNode('),'must not clone and lose listeners');
  assert.ok(js.includes('aria-expanded'));
  assert.ok(js.includes("event.key !== 'Escape'"));
  assert.ok(js.includes("const containerSelector = '#eventsListContainer'"));
  assert.ok(js.includes('MutationObserver'));
  assert.ok(css.includes('.td-event-more-panel[hidden]'));
  assert.ok(css.includes('min-height:40px'));
});
