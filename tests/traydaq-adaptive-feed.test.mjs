import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { patchAdaptiveFeed, ADAPTIVE_FEED_MARKER } from '../scripts/patch-private-adaptive-feed.mjs';

const folder = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(folder);
const css = fs.readFileSync(path.join(root, 'assets/traydaq-adaptive-feed.css'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'assets/traydaq-adaptive-feed.js'), 'utf8');
const html = '<!doctype html><html><head><title>TRAYDAQ</title></head><body>' +
  '<main id="reelFeed"><article class="reel-card"><video></video><img alt="Post photo">' +
  '<div class="reel-actions"><img alt="User avatar"></div></article></main></body></html>';

const output = patchAdaptiveFeed(html, css, runtime);
assert.match(output, new RegExp('id="' + ADAPTIVE_FEED_MARKER + 'Style"'));
assert.match(output, new RegExp('id="' + ADAPTIVE_FEED_MARKER + '"'));
assert.ok(output.indexOf('data-td-adaptive-feed-media') < output.indexOf('</style>'));
assert.ok(output.indexOf('installTraydaqAdaptiveFeedMedia') > output.indexOf('<script id='));
assert.match(output, /object-fit:\s*contain\s*!important/);
assert.match(runtime, /loadedmetadata/);
assert.match(runtime, /orientationchange/);
assert.match(runtime, /function fitFeedViewport/);
assert.match(runtime, /getBoundingClientRect/);
assert.match(runtime, /data-td-feed-viewport/);
assert.match(runtime, /visualViewport/);
assert.ok(css.includes('#reelFeed[data-td-feed-viewport'));
assert.match(css, /--td-feed-viewport-height/);
assert.match(css, /max-width: 900px/);
assert.match(runtime, /largeEnough/);
assert.match(runtime, /feed\.querySelectorAll\(CARD\)/);
assert.match(runtime, /data-td-adaptive-classified/);
assert.match(runtime, /document\.visibilityState === 'hidden'/);
assert.match(runtime, /if \(node === root \|\| node\.contains\(root\)/);
assert.ok(!runtime.includes("document.addEventListener('click', schedule, true)"));
assert.match(runtime, /EXCLUDED/); // Avatars, buttons and overlaid actions left alone.
assert.ok(!runtime.includes('.play()')); // Do not double-play videos to measure them.
assert.throws(() => patchAdaptiveFeed(output, css, runtime), /already installed/);
assert.throws(() => patchAdaptiveFeed('<html><head></head><body></body></html>', css, runtime), /reel markup/);
assert.throws(() => patchAdaptiveFeed(html, css, 'invalid'), /Missing feed adaptation logic/);

/* Simulate the Android WebView bounds without loading private application data. */
function smokeViewport(windowWidth, dockVisible) {
  const values = new Map(), attributes = new Map(), mediaAttributes = new Map();
  const feed = {
    isConnected: true,
    style: {
      getPropertyValue: key => values.get(key) || '',
      setProperty: (key, value) => values.set(key, value),
      removeProperty: key => values.delete(key)
    },
    getBoundingClientRect: () => ({ top: 90, width: windowWidth, height: 320 }),
    hasAttribute: name => attributes.has(name),
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: name => attributes.delete(name),
    contains: () => false,
    getClientRects: () => [{}],
    querySelectorAll: selector => selector === '.reel-card' ? [card] : []
  };
  const video = {
    tagName: 'VIDEO',
    getBoundingClientRect: () => ({ width: windowWidth, height: 180 }),
    closest: selector => selector === '.reel-card' ? card : null,
    hasAttribute: name => mediaAttributes.has(name),
    setAttribute: (name, value) => mediaAttributes.set(name, value)
  };
  const card = {
    isConnected: true,
    getBoundingClientRect: () => ({ width: windowWidth, height: 320 }),
    querySelectorAll: () => [video]
  };
  const dock = {
    getBoundingClientRect: () => ({ top: 740, bottom: 806, width: windowWidth, height: 66 })
  };
  const doc = {
    readyState: 'complete',
    body: {},
    getElementById: () => feed,
    querySelectorAll: selector => selector === '.reel-card' ? [card] :
      (selector.startsWith('nav,') && dockVisible ? [dock] : []),
    addEventListener: () => {}
  };
  const win = {
    innerWidth: windowWidth, innerHeight: 810, visualViewport: null,
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', backgroundImage: 'none' }),
    addEventListener: () => {}
  };
  class FakeMutationObserver { observe() {} }
  new Function('window', 'document', 'MutationObserver', 'requestAnimationFrame', runtime)(
    win, doc, FakeMutationObserver, callback => callback()
  );
  return { values, attributes, mediaAttributes };
}
const mobile = smokeViewport(380, true);
assert.equal(mobile.values.get('--td-feed-viewport-height'), '648px');
assert.equal(mobile.attributes.get('data-td-feed-viewport'), 'true');
assert.equal(mobile.mediaAttributes.get('data-td-adaptive-feed-media'), 'true');
const fallback = smokeViewport(380, false);
assert.ok(Number.parseInt(fallback.values.get('--td-feed-viewport-height'), 10) > 580);
const desktop = smokeViewport(1100, true);
assert.equal(desktop.values.has('--td-feed-viewport-height'), false);

console.log('PASS: adaptive aspect ratio media runtime is syntactically valid, targets reels only and is idempotent.');
