import fs from 'node:fs';
import path from 'node:path';

// This builder-only patch keeps main and admin private code on the Android build runner.
// Public repository ships only generic JS/CSS and validation.
function fail(message) { throw new Error('Traydaq global dropdown patch: '+message); }

export function patchGlobalDropdowns(html, js, css, fileLabel = 'index.html') {
  if (html.includes('id="tdGlobalDropdownsStyle2026"') ||
      html.includes('id="tdGlobalDropdownsScript2026"')) {
    fail(fileLabel+' already patched');
  }
  if (!js.includes('window.__tdEasySelects2026 = true') ||
      !js.includes("new MutationObserver(") ||
      !js.includes("select.dispatchEvent(new Event('change'") ||
      !js.includes("select.addEventListener('invalid'") ||
      !js.includes("target.querySelector?.('select')") ||
      !js.includes('select.closest(\'.td-job-picker-holder, .td-easy-select-wrap\')')) {
    fail('Dynamic/select change and validation handlers are missing');
  }
  if (!css.includes('min-height:56px') ||
      !css.includes('.td-easy-choice') ||
      !css.includes('min-height:60px') ||
      !css.includes('.td-easy-overlay')) {
    fail('Accessible touch-target styles missing');
  }
  new Function(js);
  const head = [...html.matchAll(/<\/head\s*>/gi)];
  const body = [...html.matchAll(/<\/body\s*>/gi)];
  if (head.length !== 1 || body.length !== 1) fail(fileLabel+' document boundaries are ambiguous');

  const style = '<style id="tdGlobalDropdownsStyle2026">\n'+
    css.replace(/<\/style/gi, '<\\/style')+'\n</style>\n';
  const script = '<script id="tdGlobalDropdownsScript2026">\n'+
    js.replace(/<\/script/gi, '<\\/script')+'\n</script>\n';

  // Insert before closing tags, never append after </html>.
  const originalHead = head[0][0], originalBody = body[0][0];
  html = html.slice(0, head[0].index) + style + html.slice(head[0].index);
  const bodyAt = html.lastIndexOf(originalBody);
  if (bodyAt < 0) fail(fileLabel+' closing body lost');
  return html.slice(0, bodyAt) + script + html.slice(bodyAt);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const root = path.resolve(process.argv[2] || '.');
  const jsPath = process.argv[3], cssPath = process.argv[4];
  if (!jsPath || !cssPath) fail('Pass JS and CSS paths');
  const js = fs.readFileSync(jsPath,'utf8');
  const css = fs.readFileSync(cssPath,'utf8');
  const mainPath = path.join(root, 'index.html');
  const adminPath = path.join(root, 'admin', 'index.html');
  if (!fs.existsSync(mainPath) || !fs.existsSync(adminPath)) {
    fail('Expected main and admin app entry points');
  }
  const main = patchGlobalDropdowns(fs.readFileSync(mainPath,'utf8'),js,css,'index.html');
  const admin = patchGlobalDropdowns(fs.readFileSync(adminPath,'utf8'),js,css,'admin/index.html');
  // Do not modify either file if any validation failed.
  fs.writeFileSync(mainPath, main);
  fs.writeFileSync(adminPath, admin);
  console.log('PASS: one-tap dropdowns installed on main and admin routes (including dynamic forms).');
}
