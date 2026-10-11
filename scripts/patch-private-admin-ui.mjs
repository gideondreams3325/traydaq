import fs from 'node:fs';

// Applied only to the private checkout inside the public GitHub Actions runner.
// No private source, user data, ID media or credentials are committed publicly.
const fail = message => { throw new Error('Traydaq admin navigation upgrade: ' + message); };
function changeOnce(source, before, after, label) {
  const i=source.indexOf(before);
  if(i<0 || source.indexOf(before,i+before.length)!==-1) fail('source anchor changed: '+label);
  return source.slice(0,i)+after+source.slice(i+before.length);
}
const modules=[
  ['Blue Check Hub','dashCardBlueChecks','blue_checks','🔵','Grant or revoke official blue checks','null'],
  ['Reports & Safety','dashCardReports','reports','🚩','Review community reports','reports.size'],
  ['Broadcast Center','dashCardNotify','notify','🔔','Message your community','null'],
  ['Policies & Terms','dashCardTerms','terms','📜','Manage platform rules','null']
];
const destinationTitles={
  overview:'Overview',users:'Users & Accounts',blue_checks:'Blue Check Hub',ghana_cards:'Identity Verifications',
  orders:'Order Security',posts:'Posts & Moderation',stores:'Stores',
  products:'Products',reports:'Community Reports',frauds:'Fraud Investigations',
  restoration:'Restoration Hub',jobs_events:'Jobs & Events',
  notify:'Broadcast Center',terms:'Policies & Terms'
};
export function patchTraydaqAdminUi(source,css) {
  if(!css || !css.includes('.td-admin-shell')) fail('missing public dashboard CSS');
  if(source.includes('id="tdAdminDashboard"')) fail('already patched; duplicate prevented');
  const start=source.indexOf("    const initialTab = window._currentAdminTab || 'overview';");
  if(start<0) fail('admin render section missing');
  const templateStart=source.indexOf("    $('page').innerHTML = \`",start);
  const headStart=source.indexOf('      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">',templateStart);
  const headEnd=source.indexOf('      \${!registryVerified ?',headStart);
  if(templateStart<0||headStart<0||headEnd<0||headEnd-headStart>6500) fail('admin header bounds changed');

  const header=[
    '      <section id="tdAdminShell" class="td-admin-shell">',
    '      <style id="tdAdminStyles">'+css.replace(/<\/style/gi,'<\\/style')+'</style>',
    '      <header class="td-admin-header">',
    '        <div class="td-admin-heading">',
    '          <p class="td-admin-eyebrow"><span class="td-admin-shield">🛡️</span> TRAYDAQ · TRUST & SAFETY</p>',
    '          <p class="td-admin-breadcrumb" id="tdAdminBreadcrumb">Security Team / Overview</p>',
    '          <h1 id="tdAdminHeaderTitle">Security Command Center</h1>',
    '          <p id="tdAdminHeaderSubtitle">Oversee real platform activity, manage reports and protect the community.</p>',
    '        </div>',
    '        <div class="td-admin-header-actions">',
    '          <span class="td-admin-registry" role="status"><span class="td-admin-status-dot"></span>\${registryVerified ? "AUTH REGISTRY VERIFIED" : "SYNC UNAVAILABLE"}</span>',
    '          <div class="td-admin-action-row">',
    '            <button type="button" id="tdAdminBackOverview" class="td-admin-control td-admin-back" hidden aria-label="Back to security overview">← Overview</button>',
    '            <button type="button" id="adminRefreshBtn" class="td-admin-control">↻ Refresh</button>',
    '            <button type="button" id="adminCreatePostBtn" class="td-admin-control td-admin-control-primary">＋ Post as Traydaq</button>',
    '          </div>',
    '        </div>',
    '      </header>',
    ''
  ].join('\n');
  source=source.slice(0,headStart)+header+source.slice(headEnd);

  const gridStart='      <!-- Dashboard-Style Executive Cards Grid -->';
  const gridEnd='      <!-- Sleek Tab-Based Interface for Navigation -->';
  let from=source.indexOf(gridStart,templateStart),to=source.indexOf(gridEnd,from);
  if(from<0||to<0||to-from>20000) fail('dashboard grid bounds changed');
  let region=source.slice(from,to);
  region=changeOnce(region,
    'grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8 gap-3 mb-6',
    'grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 td-admin-module-grid',
    'responsive grid classes');
  const endOfGrid=region.lastIndexOf('      </div>');
  if(endOfGrid<0||region.slice(endOfGrid).trim()!=='</div>') fail('dashboard grid closing tag changed');
  const extras=modules.map(([label,id,route,icon,description,expression])=>[
    '        <button type="button" class="sf-dash-card td-admin-extra-card group" id="'+id+'" aria-label="Open '+label+'">',
    '          <div class="td-admin-extra-main">',
    '            <span class="td-admin-extra-icon" aria-hidden="true">'+icon+'</span>',
    '            <span class="td-admin-extra-heading">'+label+'</span>',
    expression==='null'
      ? '            <span class="td-admin-extra-detail">'+description+'</span>'
      : '            <span class="td-admin-extra-stat">\${registryVerified ? '+expression+' : "—"} <small>reported</small></span>',
    '          </div>',
    '          <div class="td-admin-extra-footer"><span>Open '+label+'</span><span aria-hidden="true">↗</span></div>',
    '        </button>'
  ].join('\n')).join('\n');
  region=region.slice(0,endOfGrid)+extras+'\n'+region.slice(endOfGrid);
  region=region.replace(gridStart,[
    '      <section id="tdAdminDashboard" class="td-admin-dashboard" aria-label="Security team modules">',
    '        <div class="td-admin-section-heading">',
    '          <div><p class="td-admin-overline">MANAGEMENT CENTER</p>',
    '            <h2>Select a workspace</h2>',
    '            <p>Every card opens its own secure management section.</p></div>',
    '          <span class="td-admin-section-count">13 workspaces</span>',
    '        </div>'
  ].join('\n'));
  region=region.trimEnd()+'\n      </section>\n\n';
  source=source.slice(0,from)+region+source.slice(to);

  const workspace='      <div id="adminWorkspace"></div>';
  source=changeOnce(source,workspace,workspace+'\n      </section>','shell closing tag');
  const tabBar='<div class="flex items-center gap-2 overflow-x-auto pb-2 border-b border-gray-200 scrollbar-none mb-6" id="adminTabsBar">';
  source=changeOnce(source,tabBar,
    '<div class="flex items-center gap-2 overflow-x-auto pb-2 border-b border-gray-200 scrollbar-none mb-6" id="adminTabsBar" hidden>',
    'legacy tab bar hidden when card navigation enabled');

  const tabAnchor='      window._currentAdminTab = tabName;';
  const tabLogic=[
    '      const tdAdminTitles = '+JSON.stringify(destinationTitles)+';',
    '      if(!Object.prototype.hasOwnProperty.call(tdAdminTitles,tabName)) tabName = "overview";',
    '      const tdOverview = tabName === "overview";',
    '      const tdDashboard = document.getElementById("tdAdminDashboard");',
    '      const tdBack = document.getElementById("tdAdminBackOverview");',
    '      const tdTitle = document.getElementById("tdAdminHeaderTitle");',
    '      const tdSubtitle = document.getElementById("tdAdminHeaderSubtitle");',
    '      const tdCrumb = document.getElementById("tdAdminBreadcrumb");',
    '      if(tdDashboard) tdDashboard.hidden = !tdOverview;',
    '      if(tdBack) tdBack.hidden = tdOverview;',
    '      if(tdTitle) tdTitle.textContent = tdOverview ? "Security Command Center" : tdAdminTitles[tabName];',
    '      if(tdSubtitle) tdSubtitle.textContent = tdOverview ? "Oversee real platform activity, manage reports and protect the community." : "Dedicated secure management workspace · Use Overview to return.";',
    '      if(tdCrumb) tdCrumb.textContent = "Security Team / " + tdAdminTitles[tabName];',
    '      const tdAudit = document.getElementById("tdAdminAccountAudit");',
    '      if(tdAudit) tdAudit.hidden = !tdOverview;',
    tabAnchor
  ].join('\n');
  // This replacement scopes to the admin navigation handler, not other code.
  const routerStart=source.indexOf('    function setAdminTab(tabName, subOption){',templateStart);
  const routeAnchor=source.indexOf(tabAnchor,routerStart);
  if(routerStart<0||routeAnchor<0||routeAnchor-routerStart>1000) fail('module navigation router changed');
  source=source.slice(0,routeAnchor)+tabLogic+source.slice(routeAnchor+tabAnchor.length);
  source=changeOnce(source,
    "    $('adminRefreshBtn')?.addEventListener('click', renderAdmin);",
    "    $('adminRefreshBtn')?.addEventListener('click', renderAdmin);\n    $('tdAdminBackOverview')?.addEventListener('click', () => setAdminTab('overview'));",
    'overview back navigation');
  const newBindings=modules.map(([,id,route])=>
    "    if($('"+id+"')) $('"+id+"').onclick = () => setAdminTab('"+route+"');"
  ).join('\n');
  const navEnd="    setAdminTab(initialTab, initialTab === 'posts' ? window._currentAdminPostsSubTab : undefined);";
  source=changeOnce(source,navEnd,newBindings+'\n\n'+navEnd,'new module links');

  // Remove the old duplicate six-card launchpad inside the overview while
  // preserving all real review queues, fraud cases and management functionality.
  const overview=source.indexOf('  function sfAdminOverview(users, posts');
  const duplicate=source.indexOf('        <!-- Distinct Section Quick-Launch Cards -->',overview);
  const priority=source.indexOf('        <!-- Priority Attention Section: Orders Security Review Queue -->',duplicate);
  if(overview<0||duplicate<0||priority<0||priority-duplicate>22000) fail('overview duplicated launchpad changed');
  const queueHeader=[
    '          <div class="td-admin-section-heading td-admin-queue-heading">',
    '            <div><p class="td-admin-overline">SAFETY OPERATIONS</p>',
    '              <h2>Priority review queues</h2><p>Open pending cases, reports and moderation work.</p></div>',
    '          </div>',
    ''
  ].join('\n');
  source=source.slice(0,duplicate)+queueHeader+source.slice(priority);

  // Apply a label to the account auditing panel inserted by the prior safe
  // metrics patch so its visibility follows the overview.
  const auditNeedle='<div role="status" class="rounded-xl border border-amber-200 bg-amber-50';
  if(source.includes(auditNeedle)){
    source=changeOnce(source,auditNeedle,
      '<div id="tdAdminAccountAudit" role="status" class="rounded-xl border border-amber-200 bg-amber-50',
      'verified account audit');
  }

  for(const [,id,route] of modules){
    if(!source.includes('id="'+id+'"')||!source.includes("setAdminTab('"+route+"')"))
      fail('missing clickable workspace '+route);
  }
  for(const id of ['dashCardUsers','dashCardGhanaCards','dashCardOrders','dashCardPosts',
    'dashCardStores','dashCardProducts','dashCardFrauds','dashCardRestoration','dashCardJobsEvents']){
    if(!source.includes('id="'+id+'"')) fail('existing workspace lost: '+id);
  }
  if(!source.includes("$('tdAdminBackOverview')?.addEventListener('click', () => setAdminTab('overview'));"))
    fail('back navigation must use local admin router');
  if(!source.includes('id="dashCardBlueChecks"') || !source.includes("setAdminTab('blue_checks')")) fail('blue-check hub navigation missing');
  if(!source.includes('tdAdminBackOverview')||!source.includes('tdDashboard.hidden = !tdOverview'))
    fail('missing dedicated-workspace navigation');
  return source;
}
if(process.argv[1] && import.meta.url==='file://'+process.argv[1]){
  const dir=(process.argv[2]||'.').replace(/\/$/,'');
  const cssFile=process.argv[3];
  if(!cssFile) fail('CSS file argument required');
  const file=dir+'/index.html';
  const original=fs.readFileSync(file,'utf8');
  const updated=patchTraydaqAdminUi(original,fs.readFileSync(cssFile,'utf8'));
  if(updated===original) fail('no patch generated');
  fs.writeFileSync(file,updated);
  console.log('PASS: Traydaq Security Team Portal modernized; 12 click-through workspaces preserved.');
}
