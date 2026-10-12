import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const CACHE_MARKER = 'tdPublicMediaCache20261012';
export function patchHtml(html,registration) {
  if(typeof html!=='string'||typeof registration!=='string')throw TypeError('Expected HTML and public-cache JS');
  if(html.includes(CACHE_MARKER))throw Error('Cache already installed');
  if(html.split('</body>').length!==2)throw Error('Android HTML shell changed');
  for(const marker of ['serviceWorker.register','traydaq-public-media-sw.js','requestIdleCallback']) {
    if(!registration.includes(marker))throw Error('Incomplete cache registration: '+marker);
  }
  if(/<\/script/i.test(registration))throw Error('Unsafe inline cache script');
  new Function(registration);
  return html.replace('</body>','<script id="'+CACHE_MARKER+'">\n'+registration+'\n</script>\n</body>');
}
export function main(root='.',workerPath,registrationPath) {
  if(!workerPath||!registrationPath) throw Error('Usage: patch-private-public-media-cache.mjs <app-root> <worker> <register-js>');
  const native=path.join(path.resolve(root),'android/app/src/main/assets/public');
  const htmlPath=path.join(native,'index.html');
  const worker=fs.readFileSync(workerPath,'utf8');
  for(const key of ['traydaq-public-media','cacheResponse','MAX_ENTRIES','request.destination','authorization','range'])
    if(!worker.includes(key)) throw Error('Missing cache safety guard: '+key);
  new Function(worker);
  const html=patchHtml(fs.readFileSync(htmlPath,'utf8'),fs.readFileSync(registrationPath,'utf8'));
  fs.writeFileSync(path.join(native,'traydaq-public-media-sw.js'),worker,'utf8');
  fs.writeFileSync(htmlPath,html,'utf8');
  console.log('PASS: Android-only, bounded public image/cover cache; private and signed media excluded.');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main(process.argv[2]||'.',process.argv[3],process.argv[4]);
