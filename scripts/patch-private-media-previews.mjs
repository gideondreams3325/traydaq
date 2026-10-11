import fs from 'node:fs';
import path from 'node:path';

// Public builder patch: private checkout is changed only inside the APK runner.
const MARKER = 'tdMediaPreviews2026';
const SEARCH_COVER = 'x.post.coverUrl || x.post.thumbnailUrl';
const SEARCH_RECOVERY = SEARCH_COVER +
  " || ((/^video(?:\\/|$)/i.test(String(x.post.mediaType || x.post.type || x.post.kind || ''))" +
  " || /\\.(?:mp4|webm|mov|m4v)(?:[?#]|$)/i.test(String(x.post.mediaUrl || x.post.videoUrl || '')))" +
  " ? (x.post.mediaUrl || x.post.videoUrl || '') : '')";

function assertSingle(html, match, label) {
  const hits = html.split(match).length - 1;
  if (hits !== 1) throw Error('Traydaq media preview source changed: ' + label + ' (' + hits + ')');
}

export function patchMediaPreviews(html, runtime, css) {
  if (typeof html !== 'string' || typeof runtime !== 'string' || typeof css !== 'string') {
    throw TypeError('Expected HTML, JavaScript, and CSS source text');
  }
  if (html.includes(MARKER)) throw Error('Media preview patch already installed');
  assertSingle(html, '</head>', 'head');
  assertSingle(html, '</body>', 'body');
  if (!html.includes(SEARCH_COVER)) throw Error('Global search video-cover expression changed');
  for (const marker of ['td-media-native-preview', 'loadedmetadata', 'MutationObserver',
    'Image preview unavailable', 'Video preview unavailable']) {
    if (!runtime.includes(marker)) throw Error('Media runtime incomplete: ' + marker);
  }
  if (!css.includes('.td-media-native-preview') || !css.includes('.td-media-preview-unavailable')) {
    throw Error('Media stylesheet incomplete');
  }
  new Function(runtime);
  if (/<\/script/i.test(runtime) || /<\/style/i.test(css)) {
    throw Error('Unsafe media runtime/styles inline terminator');
  }
  // Older videos lacking a saved cover must use an actual playable asset,
  // not a permanent icon placeholder, for their search-result thumbnail.
  html = html.split(SEARCH_COVER).join(SEARCH_RECOVERY);
  html = html.replace('</head>', '<style id="' + MARKER + 'Style">\n' + css + '\n</style>\n</head>');
  html = html.replace('</body>', '<script id="' + MARKER + '">\n' + runtime + '\n</script>\n</body>');
  return html;
}

export function main(root = '.', runtimeFile, cssFile) {
  if (!runtimeFile || !cssFile) throw Error('Missing public runtime or CSS path');
  const indexPath = path.join(path.resolve(root), 'index.html');
  const original = fs.readFileSync(indexPath, 'utf8');
  const runtime = fs.readFileSync(runtimeFile, 'utf8');
  const css = fs.readFileSync(cssFile, 'utf8');
  const output = patchMediaPreviews(original, runtime, css);
  fs.writeFileSync(indexPath, output);
  console.log('PASS: live video thumbnails and resilient photo previews enabled for search, cards, feeds and profiles.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main(process.argv[2] || '.', process.argv[3], process.argv[4]);
}
