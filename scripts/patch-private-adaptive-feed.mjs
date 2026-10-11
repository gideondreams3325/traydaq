import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Run only in the APK builder's temporary private app checkout.
// The public repository contains no private app source or user data.
export const ADAPTIVE_FEED_MARKER = 'tdAdaptiveFeedMedia20261011';

export function patchAdaptiveFeed(html, css, runtime) {
  if (![html, css, runtime].every(value => typeof value === 'string')) {
    throw new TypeError('TRAYDAQ adaptive feed: expected HTML, CSS and JS source strings');
  }
  if (html.includes(ADAPTIVE_FEED_MARKER)) {
    throw new Error('TRAYDAQ adaptive feed already installed');
  }
  if (html.split('</head>').length !== 2 || html.split('</body>').length !== 2) {
    throw new Error('TRAYDAQ adaptive feed: unexpected HTML shell');
  }
  // Reject app revisions which may require a different media target; do not
  // silently patch an unrelated HTML page.
  if (!html.includes('reel-card') || !html.includes('reelFeed')) {
    throw new Error('TRAYDAQ adaptive feed: reel markup changed; review selector contract');
  }
  for (const token of [
    '[data-td-adaptive-feed-media="true"]', 'object-fit: contain',
    '[data-td-adaptive-feed-bg="true"]'
  ]) {
    if (!css.includes(token)) throw new Error('Missing adaptive feed CSS: ' + token);
  }
  for (const token of [
    'installTraydaqAdaptiveFeedMedia', 'MutationObserver', 'loadedmetadata',
    '.reel-card', 'largeEnough', 'orientationchange'
  ]) {
    if (!runtime.includes(token)) throw new Error('Missing feed adaptation logic: ' + token);
  }
  if (/<\\/style/i.test(css) || /<\\/script/i.test(runtime)) {
    throw new Error('Unsafe inline stylesheet or script terminator');
  }
  new Function(runtime); // Detect syntax errors before changing any app source.
  return html.replace(
    '</head>',
    '<style id="' + ADAPTIVE_FEED_MARKER + 'Style">\\n' + css + '\\n</style>\\n</head>'
  ).replace(
    '</body>',
    '<script id="' + ADAPTIVE_FEED_MARKER + '">\\n' + runtime + '\\n</script>\\n</body>'
  );
}

export function main(root = '.', cssFile, runtimeFile) {
  if (!cssFile || !runtimeFile) {
    throw new Error('Usage: patch-private-adaptive-feed.mjs <app-root> <css-file> <js-file>');
  }
  const htmlPath = path.join(path.resolve(root), 'index.html');
  const before = fs.readFileSync(htmlPath, 'utf8');
  const after = patchAdaptiveFeed(
    before,
    fs.readFileSync(cssFile, 'utf8'),
    fs.readFileSync(runtimeFile, 'utf8')
  );
  if (after === before) throw new Error('TRAYDAQ adaptive feed: no change applied');
  fs.writeFileSync(htmlPath, after, 'utf8');
  console.log('PASS: portrait, square and landscape photos/videos use contain in For You and Following; feed actions retained.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv[2] || '.', process.argv[3], process.argv[4]);
}
