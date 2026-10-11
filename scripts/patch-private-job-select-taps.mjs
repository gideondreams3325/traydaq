import fs from 'node:fs';
import path from 'node:path';

// Public APK-builder patch only. Private app sources are never written to this repository.
const fail = message => { throw new Error('Traydaq vacancy tap picker: ' + message); };
function exactlyOnce(source, find, replace, label) {
  const start = source.indexOf(find);
  if (start < 0 || source.indexOf(find, start + find.length) !== -1) {
    fail('Source anchor has changed or is ambiguous: ' + label);
  }
  return source.slice(0, start) + replace + source.slice(start + find.length);
}

export function patchJobTapPickers(indexHtml, jobsJs, pickerJs, pickerCss) {
  if (indexHtml.includes('id="tdEasyJobPickers2026"') ||
      jobsJs.includes('function tdInstallEasyJobSelects(')) fail('Picker already installed');
  if (!pickerJs.includes('function tdInstallEasyJobSelects(modal)') ||
      !pickerJs.includes("select.dispatchEvent(new Event('change'") ||
      !pickerJs.includes("event.target === overlay") ||
      !pickerJs.includes("select.addEventListener('invalid'")) {
    fail('Picker interaction asset incomplete');
  }
  if (!pickerCss.includes('#postJobModal .td-job-picker-trigger') ||
      !pickerCss.includes('min-height: 58px') ||
      !pickerCss.includes('.td-job-picker-option')) fail('Picker touch-target stylesheet incomplete');

  // Apply styles to the APK's checked-out HTML, not to the public repository.
  indexHtml = exactlyOnce(indexHtml, '</head>',
    '<style id="tdEasyJobPickers2026">\n' +
    pickerCss.replace(/<\/style/gi, '<\\/style') + '\n</style>\n</head>', 'document head');

  const startToken = 'function openPostJobModal() {';
  const start = jobsJs.indexOf(startToken);
  const end = jobsJs.indexOf('// Modal: Apply for a Job', start);
  if (start < 0 || end < start || jobsJs.indexOf(startToken, start + startToken.length) >= 0) {
    fail('Cannot uniquely isolate the vacancy posting modal');
  }
  let modal = jobsJs.slice(start, end);
  modal = exactlyOnce(modal,
    "  document.body.appendChild(modal);\n\n  let selectedJobImageData = '';",
    "  document.body.appendChild(modal);\n  const refreshJobPickerButtons = tdInstallEasyJobSelects(modal);\n\n  let selectedJobImageData = '';",
    'modal installation');
  modal = exactlyOnce(modal,
    "  }\n\n  modal.querySelectorAll('input[name=\"jobListingType\"]').forEach(input => input.addEventListener('change', updateListingTypeUi));",
    "    // Refresh the displayed options after switching Vacancy / Self-Employed.\n    refreshJobPickerButtons();\n  }\n\n  modal.querySelectorAll('input[name=\"jobListingType\"]').forEach(input => input.addEventListener('change', updateListingTypeUi));",
    'listing-type refresh');
  jobsJs = jobsJs.slice(0, start) +
    pickerJs.trimEnd() + '\n\n' + modal + jobsJs.slice(end);

  for (const marker of ['const refreshJobPickerButtons = tdInstallEasyJobSelects(modal);',
    'refreshJobPickerButtons();',
    "select.addEventListener('invalid'",
    "select.dispatchEvent(new Event('change'",
    'jobEmploymentType',
    'jobLocationType',
    'jobSalaryPeriod']) {
    if (!jobsJs.includes(marker)) fail('Missing picker integration: ' + marker);
  }
  // Catch malformed template strings / inserted JavaScript before writing.
  new Function(pickerJs);
  return { indexHtml, jobsJs };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const root = path.resolve(process.argv[2] || '.');
  const jsFile = process.argv[3];
  const cssFile = process.argv[4];
  if (!jsFile || !cssFile) fail('Expected JS and CSS assets');
  const htmlPath = path.join(root, 'index.html');
  const jobsPath = path.join(root, 'jobs-events.js');
  const changed = patchJobTapPickers(
    fs.readFileSync(htmlPath, 'utf8'),
    fs.readFileSync(jobsPath, 'utf8'),
    fs.readFileSync(jsFile, 'utf8'),
    fs.readFileSync(cssFile, 'utf8')
  );
  // Save only after all anchors, syntax, and integration checks passed.
  fs.writeFileSync(htmlPath, changed.indexHtml);
  fs.writeFileSync(jobsPath, changed.jobsJs);
  console.log('PASS: Vacancy, location, employment and period selectors have full-width Android tap targets.');
}
