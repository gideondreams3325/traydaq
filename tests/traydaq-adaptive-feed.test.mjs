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
assert.match(runtime, /largeEnough/);
assert.match(runtime, /EXCLUDED/); // Avatars, buttons and overlaid actions left alone.
assert.ok(!runtime.includes('.play()')); // Do not double-play videos to measure them.
assert.throws(() => patchAdaptiveFeed(output, css, runtime), /already installed/);
assert.throws(() => patchAdaptiveFeed('<html><head></head><body></body></html>', css, runtime), /reel markup/);
assert.throws(() => patchAdaptiveFeed(html, css, 'invalid'), /Missing feed adaptation logic/);
console.log('PASS: adaptive aspect ratio media runtime is syntactically valid, targets reels only and is idempotent.');
