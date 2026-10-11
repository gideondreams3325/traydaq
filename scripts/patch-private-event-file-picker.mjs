import fs from 'node:fs';
import path from 'node:path';

// Public-only assets are injected into the temporary private app checkout during APK build.
export function patchEventFilePicker(indexHtml, css, js) {
  if (typeof indexHtml !== 'string' || !indexHtml.includes('</head>') || !indexHtml.includes('</body>'))
    throw new Error('Traydaq event picker: HTML anchors missing');
  if (indexHtml.includes('id="tdEventFilePickerStyle2026"') || indexHtml.includes('id="tdEventFilePickerRuntime2026"'))
    throw new Error('Traydaq event picker: duplicate installation');
  if (!css.includes('.td-event-file-tap') || !css.includes('min-height:88px') ||
      !js.includes('window.__tdEventUploadCard2026') || !js.includes('MutationObserver'))
    throw new Error('Traydaq event picker: assets incomplete');
  return indexHtml
    .replace('</head>', '<style id="tdEventFilePickerStyle2026">\n' +
      css.replace(/<\/style/gi, '<\\/style') + '\n</style>\n</head>')
    .replace('</body>', '<script id="tdEventFilePickerRuntime2026">\n' +
      js.replace(/<\/script/gi, '<\\/script') + '\n</script>\n</body>');
}
if (process.argv[1] && import.meta.url === 'file://' + process.argv[1]) {
  const root = path.resolve(process.argv[2] || '.');
  const cssFile = process.argv[3], jsFile = process.argv[4];
  if (!cssFile || !jsFile) throw new Error('Expected public stylesheet and runtime paths');
  const htmlPath = path.join(root, 'index.html');
  const changed = patchEventFilePicker(fs.readFileSync(htmlPath, 'utf8'),
    fs.readFileSync(cssFile, 'utf8'), fs.readFileSync(jsFile, 'utf8'));
  fs.writeFileSync(htmlPath, changed);
  console.log('PASS: full-width event picker, image preview and remove action installed.');
}
