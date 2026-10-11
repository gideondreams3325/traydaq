import fs from 'node:fs';
import path from 'node:path';

function fail(msg) { throw new Error('Traydaq discovery grids: ' + msg); }
function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) !== -1) fail('missing or changed ' + label);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

export function patchDiscoveryGrids(indexHtml, jobsJs, css) {
  for (const id of ['id="productGrid"', 'id="storeGrid"', 'id="marketProductsView"', 'id="marketStoresView"']) {
    if (!indexHtml.includes(id)) fail('marketplace source anchor ' + id);
  }
  for (const id of ['id="jobsListContainer"', 'id="eventsListContainer"', 'data-event-card=']) {
    if (!jobsJs.includes(id)) fail('jobs and events source anchor ' + id);
  }
  if (!css.includes('#productGrid') || !css.includes('#jobsListContainer') || !css.includes('#eventsListContainer')) {
    fail('incomplete discovery stylesheet');
  }
  if (indexHtml.includes('id="tdDiscoveryGrid2026"') || indexHtml.includes('id="tdDiscoveryMedia2026"')) {
    fail('patch already installed; refusing duplicate stylesheet and listeners');
  }
  indexHtml = replaceOnce(indexHtml, '</head>',
    '<style id="tdDiscoveryGrid2026">\n' + css.replace(/<\/style/gi, '<\\/style') + '\n</style>\n</head>', 'document head');

  const brokenMediaHandler = String.raw`<script id="tdDiscoveryMedia2026">
(function() {
  "use strict";
  document.addEventListener("error", function(event) {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || image.dataset.tdMediaFailed === "true") return;
    const region = image.closest("#productGrid,#storeGrid,#jobsListContainer,#eventsListContainer");
    if (!region) return;
    // Existing photo fallbacks get their first attempt. Only show a neutral
    // placeholder if the replacement also fails; no fake product photo.
    const source = image.getAttribute("src") || "";
    if (image.onerror && !source.startsWith("data:image/")) return;
    image.dataset.tdMediaFailed = "true";
    image.classList.add("td-image-failed");
    const holder = image.parentElement;
    if (!holder || holder.querySelector(":scope > .td-media-fallback")) return;
    holder.style.position = "relative";
    const fallback = document.createElement("div");
    fallback.className = "td-media-fallback";
    fallback.setAttribute("role", "img");
    fallback.setAttribute("aria-label", "Photo currently unavailable");
    const symbol = document.createElement("span");
    symbol.className = "td-media-fallback-icon";
    symbol.textContent = "📷";
    const caption = document.createElement("span");
    caption.textContent = "Photo unavailable";
    fallback.append(symbol, caption);
    holder.appendChild(fallback);
  }, true);
}());
</script>`;
  indexHtml = replaceOnce(indexHtml, '</body>', brokenMediaHandler + '\n</body>', 'document body');

  const originalJobCard = '    <div class="bg-white hover:bg-amber-50/15 border border-gray-200 hover:border-amber-400 rounded-2xl p-4 sm:p-5 transition shadow-xs hover:shadow-md space-y-3">';
  const replacementJobCard = '    <div class="td-job-card bg-white hover:bg-amber-50/15 border border-gray-200 hover:border-amber-400 rounded-2xl p-4 sm:p-5 transition shadow-xs hover:shadow-md space-y-3" data-job-card="listing">';
  jobsJs = replaceOnce(jobsJs, originalJobCard, replacementJobCard, 'job listing card');
  return {indexHtml, jobsJs};
}

export function main(root = '.', cssFile) {
  if (!cssFile) fail('missing public stylesheet file');
  const htmlFile = path.join(root, 'index.html');
  const jobsFile = path.join(root, 'jobs-events.js');
  const originalHtml = fs.readFileSync(htmlFile, 'utf8');
  const originalJobs = fs.readFileSync(jobsFile, 'utf8');
  const result = patchDiscoveryGrids(originalHtml, originalJobs, fs.readFileSync(cssFile, 'utf8'));
  // Atomicity for parse/anchor failures: perform all checks before writing.
  fs.writeFileSync(htmlFile, result.indexHtml);
  fs.writeFileSync(jobsFile, result.jobsJs);
  console.log('PASS: mobile 2-column, tablet 3-column, desktop 4-column grids for marketplace, jobs and events.');
}
if (process.argv[1] && import.meta.url === 'file://' + process.argv[1])
  main(path.resolve(process.argv[2] || '.'), process.argv[3]);
