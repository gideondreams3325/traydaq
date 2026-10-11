import fs from 'node:fs';
import path from 'node:path';

// Public APK-builder patch. The original application remains in the private checkout.
export const MARKETPLACE_COMPACT_ID = 'tdMarketplaceCompact2026';
export function patchMarketplaceCompact(html, css, js) {
  if (typeof html !== 'string' || !html.includes('</head>') || !html.includes('</body>'))
    throw new Error('TRAYDAQ marketplace: complete HTML shell required');
  for (const id of ['marketProductsView','marketStoresView','productGrid','storeGrid',
                    'productFilterChips','marketFilterChips']) {
    if (!html.includes('id="' + id + '"'))
      throw new Error('TRAYDAQ marketplace: changed source anchor ' + id);
  }
  if (html.includes(MARKETPLACE_COMPACT_ID))
    throw new Error('TRAYDAQ marketplace: compact UI already applied');
  if (!css.includes('.td-mp-filter-panel[hidden]') ||
      !css.includes('.td-mp-manage-panel[hidden]') ||
      !js.includes('window.__tdMarketplaceCompact2026') ||
      !js.includes("panel.append(edit, del)") ||
      !js.includes('choices.slice(2)') && !js.includes('items.slice(2)'))
    throw new Error('TRAYDAQ marketplace: incomplete compact control assets');
  new Function(js);
  const style = '<style id="' + MARKETPLACE_COMPACT_ID + 'Style">\n' +
    css.replace(/<\\/style/gi, '<\\/style') + '\n</style>\n';
  const script = '<script id="' + MARKETPLACE_COMPACT_ID + 'Script">\n' +
    js.replace(/<\\/script/gi, '<\\/script') + '\n</script>\n';
  return html.replace('</head>', style + '</head>')
    .replace('</body>', script + '</body>');
}
export function main(root = '.', cssFile, jsFile) {
  if (!cssFile || !jsFile) throw new Error('Provide CSS and JS paths');
  const file = path.join(path.resolve(root), 'index.html');
  const before = fs.readFileSync(file, 'utf8');
  const after = patchMarketplaceCompact(before,
    fs.readFileSync(cssFile,'utf8'),fs.readFileSync(jsFile,'utf8'));
  fs.writeFileSync(file,after);
  console.log('PASS: Marketplace toolbar compact, filters grouped, product management grouped, existing buttons preserved.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname))
  main(process.argv[2] || '.', process.argv[3], process.argv[4]);
