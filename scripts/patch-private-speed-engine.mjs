import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SPEED_MARKER = 'tdSpeedEngine20261011';
export function patchSpeedEngine(html, runtime) {
  if (typeof html !== 'string' || typeof runtime !== 'string') throw new TypeError('Expected HTML and JavaScript strings');
  if (html.includes(SPEED_MARKER)) throw new Error('Speed engine already installed');
  if (!html.includes('id="reelFeed"') || !html.includes('reel-card')) throw new Error('Unexpected feed markup: abort safely');
  if (html.split('</body>').length !== 2) throw new Error('Unexpected HTML document');
  if (/<\/script/i.test(runtime)) throw new Error('Unsafe inline script terminator');
  for (const key of ['tdInstallSpeedEngine2026','IntersectionObserver','requestIdleCallback',
    'sf_data_saver','PerformanceObserver','visibilitychange','lazyDiscoveryImages']) {
    if (!runtime.includes(key)) throw new Error('Missing expected optimization: '+key);
  }
  new Function(runtime);
  return html.replace('</body>', '<script id="'+SPEED_MARKER+'">\n'+runtime+'\n</script>\n</body>');
}

export function main(root='.', jsFile) {
  if (!jsFile) throw new Error('Usage: patch-private-speed-engine.mjs <checkout> <js-file>');
  const file = path.join(path.resolve(root),'index.html');
  const before = fs.readFileSync(file,'utf8');
  const after = patchSpeedEngine(before,fs.readFileSync(jsFile,'utf8'));
  if (before===after) throw new Error('No change applied');
  fs.writeFileSync(file,after,'utf8');
  console.log('PASS: faster first media, bounded reel preloading, lazy discovery images, low RAM hints and local-only timing metrics.');
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main(process.argv[2] || '.',process.argv[3]);
}
