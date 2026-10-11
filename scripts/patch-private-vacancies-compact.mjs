import fs from 'node:fs';
import path from 'node:path';

// Public-source APK builder enhancement. No private app source is committed here.
export const VACANCIES_COMPACT_ID = 'tdVacanciesCompact2026';
export function patchVacanciesCompact(html, jobsJs, css, js) {
  if (typeof html !== 'string' || !html.includes('</head>') || !html.includes('</body>'))
    throw new Error('TRAYDAQ vacancies: complete HTML shell required');
  if (typeof jobsJs !== 'string') throw new Error('TRAYDAQ vacancies: jobs module required');
  for (const marker of ['id="jobsContentArea"','id="jobsListContainer"',
                       'id="jobSearchInput"','id="jobCategorySelect"',
                       'id="jobRegionSelect"','id="listingTypeFilters"',
                       'data-apply-job=','data-contact-entrepreneur=',
                       'data-tab="my_applications"','data-tab="employer_desk"']) {
    if (!jobsJs.includes(marker)) throw new Error('TRAYDAQ vacancies: changed jobs anchor ' + marker);
  }
  if (html.includes(VACANCIES_COMPACT_ID))
    throw new Error('TRAYDAQ vacancies: compact UI already installed');
  if (!css.includes('.td-vacancy-nav-panel') ||
      !css.includes('.td-vacancy-filter-panel') ||
      !css.includes('.td-vacancy-card-actions') ||
      !js.includes('window.__tdVacanciesCompact2026') ||
      !js.includes('filterField(\'Category\',category)') ||
      !js.includes('panel.appendChild(button)'))
    throw new Error('TRAYDAQ vacancies: incomplete assets');
  new Function(js);
  return html.replace('</head>',
    '<style id="' + VACANCIES_COMPACT_ID + 'Style">\n' + css + '\n</style>\n</head>')
    .replace('</body>',
    '<script id="' + VACANCIES_COMPACT_ID + 'Script">\n' + js + '\n</script>\n</body>');
}
export function main(root = '.', cssFile, jsFile) {
  if (!cssFile || !jsFile) throw new Error('Provide CSS and JS paths');
  const htmlFile = path.join(path.resolve(root),'index.html');
  const jobsFile = path.join(path.resolve(root),'jobs-events.js');
  const original = fs.readFileSync(htmlFile,'utf8');
  const updated = patchVacanciesCompact(original,fs.readFileSync(jobsFile,'utf8'),
    fs.readFileSync(cssFile,'utf8'),fs.readFileSync(jsFile,'utf8'));
  fs.writeFileSync(htmlFile,updated);
  console.log('PASS: Vacancy navigation grouped, category/region behind Filters, card actions compact.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname))
  main(process.argv[2] || '.',process.argv[3],process.argv[4]);
