import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {patchAdaptiveFeed} from '../scripts/patch-private-adaptive-feed.mjs';
import {patchGlobalDropdowns} from '../scripts/patch-private-global-dropdowns.mjs';
import {patchMediaPreviews} from '../scripts/patch-private-media-previews.mjs';

const asset = path => readFileSync(new URL('../'+path, import.meta.url),'utf8');
const feedJS=asset('assets/traydaq-adaptive-feed.js');
const feedCSS=asset('assets/traydaq-adaptive-feed.css');
const selectJS=asset('assets/traydaq-global-selects.js');
const selectCSS=asset('assets/traydaq-global-selects.css');
const mediaJS=asset('assets/traydaq-media-previews.js');
const mediaCSS=asset('assets/traydaq-media-previews.css');
for(const [name,code] of [['feed',feedJS],['selects',selectJS],['previews',mediaJS]]) {
  assert.doesNotThrow(()=>new Function(code),name+' runtime syntax');
}
assert.match(feedJS,/feed\.querySelectorAll\(CARD\)/);
assert.doesNotMatch(feedJS,/document\.querySelectorAll\(CARD\)/);
assert.match(feedJS,/document\.visibilityState === 'hidden'/);
assert.match(feedJS,/target\.closest && target\.closest/);
assert.match(feedJS,/Already classified media needs no more layout measurements/);
assert.match(selectJS,/const labelsById = new Map\(\)/);
assert.match(selectJS,/labelsById\.get\(select\.id\)/);
assert.match(selectJS,/change\.attributeName === 'hidden'/);
assert.match(selectJS,/change\.attributeName === 'style'/);
assert.doesNotMatch(selectJS,/target\.tagName === 'SELECT' \|\| target\.querySelector\?\.\('select'\)/);
assert.match(mediaJS,/requestAnimationFrame\(flush\)/);
assert.doesNotMatch(mediaJS,/queueMicrotask\(/);
assert.match(mediaJS,/thumbnailObserver\.observe\(video\)/);
assert.match(mediaJS,/rootMargin:'300px 0px'/);
assert.match(mediaJS,/img\.loading = 'lazy'/);
assert.match(mediaJS,/video\.preload = thumbnailObserver \? 'none' : 'metadata'/);
const html='<html><head></head><body><div id="reelFeed"><div class="reel-card"></div></div>'+
  '<script>const cover = x.post.coverUrl || x.post.thumbnailUrl;</script></body></html>';
const result=patchMediaPreviews(patchGlobalDropdowns(
    patchAdaptiveFeed(html,feedCSS,feedJS),selectJS,selectCSS
  ),mediaJS,mediaCSS);
for(const marker of ['tdAdaptiveFeedMedia20261011','tdGlobalDropdownsScript2026','tdMediaPreviews2026']) {
  assert.ok(result.includes(marker),marker+' must ship in the same Android HTML bundle');
}
console.log('PASS: startup/navigation assets defer offscreen work, scope observers, and bundle together.');
