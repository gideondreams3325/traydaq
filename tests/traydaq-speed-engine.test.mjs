import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {patchSpeedEngine,SPEED_MARKER} from '../scripts/patch-private-speed-engine.mjs';
const js=readFileSync(new URL('../assets/traydaq-speed-engine.js',import.meta.url),'utf8');
assert.doesNotThrow(()=>new Function(js));
const markup='<!doctype html><html><head></head><body><div id="reelFeed"><div class="reel-card"><video></video></div></div></body></html>';
const output=patchSpeedEngine(markup,js);
assert(output.includes('id="'+SPEED_MARKER+'"'));
assert.equal(output.split(SPEED_MARKER).length,2);
assert.throws(()=>patchSpeedEngine(output,js),/already installed/);
assert.throws(()=>patchSpeedEngine(markup.replace('reelFeed','anything'),js),/Unexpected feed markup/);
assert.throws(()=>patchSpeedEngine(markup,js+'</script>'),/Unsafe inline/);
for(const feature of ['neighbors = constrained ? 1 : 2','el.preload = \'metadata\'',
  'el.preload = \'auto\'','el.pause()','img.loading = \'lazy\'',
  "performance.mark('traydaq-first-feed-media-ready')","connectionOrigins.size >= 3",
  "stats.firstMediaMs", "PerformanceObserver","requestIdleCallback"]) {
    assert(js.includes(feature), 'Speed regression: '+feature);
}
assert(!js.includes('localStorage.setItem('));
assert(!js.includes('fetch('));
assert(!js.includes('caches.open('));
console.log('PASS: safe app patch, preloading cap, startup instrumentation, lazy discovery images, no private data caching.');
