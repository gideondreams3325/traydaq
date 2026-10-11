import assert from 'node:assert/strict';
import fs from 'node:fs';
import { patchMarketplaceCompact, MARKETPLACE_COMPACT_ID } from '../scripts/patch-private-marketplace-compact.mjs';

const css=fs.readFileSync(new URL('../assets/traydaq-marketplace-compact.css',import.meta.url),'utf8');
const js=fs.readFileSync(new URL('../assets/traydaq-marketplace-compact.js',import.meta.url),'utf8');
const shell='<html><head></head><body>' +
  ['marketProductsView','marketStoresView','productGrid','storeGrid',
    'productFilterChips','marketFilterChips'].map(id=>'<div id="'+id+'"></div>').join('') +
  '</body></html>';
const patched=patchMarketplaceCompact(shell,css,js);
assert.ok(patched.includes('id="'+MARKETPLACE_COMPACT_ID+'Style"'));
assert.ok(patched.includes('id="'+MARKETPLACE_COMPACT_ID+'Script"'));
assert.ok(patched.includes('.td-mp-filter-panel[hidden]'));
assert.ok(patched.includes('.td-mp-manage-panel[hidden]'));
assert.ok(patched.includes('panel.append(edit, del)'));
assert.ok(patched.includes("items.slice(2)"));
assert.ok(patched.includes("aria-expanded"));
assert.ok(patched.includes("Escape"));
assert.ok(patched.includes("MutationObserver"));
assert.ok(patched.includes('data-add-cart'));
assert.equal(patched.match(/tdMarketplaceCompact2026Style/g).length,1);
assert.throws(()=>patchMarketplaceCompact(patched,css,js),/already applied/);
assert.throws(()=>patchMarketplaceCompact('<html><head></head><body></body></html>',css,js),/source anchor/);
const script=patched.match(/<script id="tdMarketplaceCompact2026Script">([\s\S]*?)<\/script>/);
assert.ok(script,'embedded script present');
new Function(script[1]);
assert.equal((js.match(/\.addEventListener\(/g)||[]).length>=4,true);
console.log('PASS: mobile Marketplace filters, narrow controls, original cart and seller actions preserved, duplicate patch rejected.');
