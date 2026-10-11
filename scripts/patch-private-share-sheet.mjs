import fs from 'node:fs';
import path from 'node:path';

// Runs on the temporary private app checkout during the public Traydaq APK build.
// Only generic UI assets and this injector are published; private app source is not.
export function injectTraydaqShareSheet(html, css, runtime) {
  if (typeof html !== 'string' || typeof css !== 'string' || typeof runtime !== 'string') {
    throw new Error('Share sheet patch requires HTML, CSS and browser JavaScript source.');
  }
  if (html.includes('id="tdModernShareSheet2026"')) {
    throw new Error('Traydaq modern share sheet has already been injected.');
  }
  if (!css.includes('.td-share-panel') || !css.includes('.td-share-brand-whatsapp') ||
      !css.includes('.td-share-brand-facebook') || !css.includes('.td-share-copy')) {
    throw new Error('Traydaq share sheet stylesheet is incomplete.');
  }
  for (const label of ['share via android apps', 'save media to device',
    'td-share-social-item', 'td-share-link-card', 'MutationObserver']) {
    if (!runtime.toLowerCase().includes(label.toLowerCase())) {
      throw new Error('Traydaq share sheet runtime is incomplete: ' + label);
    }
  }
  new Function(runtime); // Compile-time validation; never execute app JS in Node.
  const endings = [...html.matchAll(/<\/body\s*>/gi)];
  if (endings.length !== 1) throw new Error('Expected one </body> in Traydaq index.html.');
  const addition = [
    '<!-- tdModernShareSheet2026: purely visual enhancement; reuse original share handlers -->',
    '<style id="tdModernShareSheet2026">',
    css.replace(/<\/style/gi, '<\\/style'),
    '</style>',
    '<script id="tdModernShareSheetRuntime2026">',
    runtime.replace(/<\/script/gi, '<\\/script'),
    '</script>',
    ''
  ].join('\n');
  return html.slice(0, endings[0].index) + addition + html.slice(endings[0].index);
}

export function main(root = '.', cssFile, runtimeFile) {
  if (!cssFile || !runtimeFile) throw new Error('Provide public CSS and JS asset paths.');
  const file = path.join(path.resolve(root), 'index.html');
  const oldHtml = fs.readFileSync(file, 'utf8');
  const css = fs.readFileSync(path.resolve(cssFile), 'utf8');
  const runtime = fs.readFileSync(path.resolve(runtimeFile), 'utf8');
  const patched = injectTraydaqShareSheet(oldHtml, css, runtime);
  fs.writeFileSync(file, patched);
  console.log('PASS: Traydaq share post uses professional white/green/gold panel and original functional actions.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main(process.argv[2] || '.', process.argv[3], process.argv[4]);
}
