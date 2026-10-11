import fs from 'node:fs';
import path from 'node:path';

// Shared uploader assets are applied only to the temporary private APK source.
// Never expose private source in this public repository.
export function patchEventFilePicker(indexHtml, css, js) {
  if (typeof indexHtml !== 'string' || !indexHtml.includes('</head>') || !indexHtml.includes('</body>'))
    throw new Error('Traydaq shared picker: index.html anchors missing');
  if (indexHtml.includes('id="tdUniversalPickerStyle2026"') ||
      indexHtml.includes('id="tdUniversalPickerRuntime2026"'))
    throw new Error('Traydaq shared picker: already injected');
  if (!css.includes('.td-upload-card') || !css.includes('.td-upload-selected') ||
      !js.includes('window.__tdUniversalUpload2026') ||
      !js.includes('input[type="file"]') || !js.includes('MutationObserver'))
    throw new Error('Traydaq shared picker: required assets missing');
  return indexHtml
    .replace('</head>', '<style id="tdUniversalPickerStyle2026">\n' +
      css.replace(/<\/style/gi, '<\\/style') + '\n</style>\n</head>')
    .replace('</body>', '<script id="tdUniversalPickerRuntime2026">\n' +
      js.replace(/<\/script/gi, '<\\/script') + '\n</script>\n</body>');
}
if (process.argv[1] && import.meta.url === 'file://' + process.argv[1]) {
  const root = path.resolve(process.argv[2] || '.');
  const cssFile = process.argv[3], jsFile = process.argv[4];
  if (!cssFile || !jsFile) throw new Error('Expected public stylesheet and runtime asset paths');
  const htmlPath = path.join(root, 'index.html');
  const output = patchEventFilePicker(fs.readFileSync(htmlPath, 'utf8'),
    fs.readFileSync(cssFile, 'utf8'), fs.readFileSync(jsFile, 'utf8'));
  fs.writeFileSync(htmlPath, output);
  console.log('PASS: universal TRAYDAQ file picker installed without changing source inputs.');
}
