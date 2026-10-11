import fs from 'node:fs';
import path from 'node:path';

export const EVENT_SPACE_SAVER_MARKER = 'tdEventSpaceSaver20261011';

export function patchEventSpaceSaver(html, jobsJs, css, js) {
  if (typeof html !== 'string' || !html.includes('</head>') || !html.includes('</body>')) {
    throw new Error('TRAYDAQ Events spacing: expected full app HTML.');
  }
  if (typeof jobsJs !== 'string' || !jobsJs.includes('id="eventsListContainer"') ||
      !jobsJs.includes('data-event-card=')) {
    throw new Error('TRAYDAQ Events spacing: event cards were changed; refusing an unverified patch.');
  }
  if (html.includes(EVENT_SPACE_SAVER_MARKER)) {
    throw new Error('TRAYDAQ Events spacing: patch already installed.');
  }
  if (!css.includes('.td-event-compact-actions') ||
      !css.includes('.td-event-more-panel[hidden]') ||
      !js.includes('TRAYDAQ_EVENT_SPACE_SAVER_20261011') ||
      !js.includes('data-td-event-more') ||
      !js.includes('MutationObserver')) {
    throw new Error('TRAYDAQ Events spacing: assets incomplete.');
  }
  new Function(js); // Validate public runtime before touching private files.
  return html
    .replace('</head>', '<style id="' + EVENT_SPACE_SAVER_MARKER + 'Style">\n' +
      css.replace(/<\/style/gi, '<\\/style') + '\n</style>\n</head>')
    .replace('</body>', '<script id="' + EVENT_SPACE_SAVER_MARKER + '">\n' +
      js.replace(/<\/script/gi, '<\\/script') + '\n</script>\n</body>');
}

export function main(root = '.', cssPath, jsPath) {
  if (!cssPath || !jsPath) throw new Error('Expected public CSS and runtime paths.');
  root = path.resolve(root);
  const htmlPath = path.join(root, 'index.html');
  const jobsPath = path.join(root, 'jobs-events.js');
  const updated = patchEventSpaceSaver(
    fs.readFileSync(htmlPath, 'utf8'),
    fs.readFileSync(jobsPath, 'utf8'),
    fs.readFileSync(cssPath, 'utf8'),
    fs.readFileSync(jsPath, 'utf8')
  );
  fs.writeFileSync(htmlPath, updated);
  console.log('PASS: Events keep registration visible, group secondary actions, and use compact mobile spacing.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main(process.argv[2] || '.', process.argv[3], process.argv[4]);
}
