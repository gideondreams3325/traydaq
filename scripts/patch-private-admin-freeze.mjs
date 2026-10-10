import fs from 'node:fs';

// Applied only inside public GitHub Actions' private-source checkout.
// No user records are modified: list pagination changes DOM workload only.
function replaceOne(s, before, after, why){
  const i=s.indexOf(before);
  if(i<0||s.indexOf(before,i+before.length)!==-1)throw Error('Traydaq freeze protection changed source: '+why);
  return s.slice(0,i)+after+s.slice(i+before.length);
}
function inFunction(source, name, nextName, edit){
  const a=source.indexOf('  function '+name+'(');
  const b=a<0?-1:source.indexOf('  function '+nextName+'(',a+12);
  if(a<0||b<0)throw Error('Unable to locate admin view: '+name);
  const next=edit(source.slice(a,b));
  return source.slice(0,a)+next+source.slice(b);
}
function limitRows(s, {renderFn, target, collection='filtered', inline=false}){
  const anchor='    function '+renderFn+'(){';
  s=replaceOne(s,anchor,'    let tdVisibleLimit=24;\n'+anchor,renderFn+' paging state');
  const line=target+'.innerHTML = '+collection+'.map(';
  s=replaceOne(s,line,target+'.innerHTML = '+collection+'.slice(0,tdVisibleLimit).map(',renderFn+' row cap');
  if(inline){
    const full=target+'.innerHTML = '+collection+'.slice(0,tdVisibleLimit).map(';
    const i=s.indexOf(full),j=s.indexOf(".join('');",i);
    if(i<0||j<0||j-i>4000)throw Error('List inline renderer changed: '+renderFn);
    const at=j+".join('');".length;
    s=s.slice(0,at)+'\n      tdAdminAppendMore('+target+','+collection+'.length,tdVisibleLimit,()=>{tdVisibleLimit+=24;'+renderFn+'();});'+s.slice(at);
  }else{
    s=replaceOne(s,"      }).join('');",
      "      }).join('');\n      tdAdminAppendMore("+target+","+collection+".length,tdVisibleLimit,()=>{tdVisibleLimit+=24;"+renderFn+"();});",
      renderFn+' more rows');
  }
  return s;
}
export function patchAdminFreeze(source){
  const genericHelper=[
    '  // Do not build hundreds of complex moderation cards in one Android WebView frame.',
    '  function tdAdminAppendMore(parent,total,visible,onMore){',
    '    if(!parent||total<=visible)return;',
    '    const button=document.createElement("button");',
    '    button.type="button";',
    '    button.className="td-admin-load-more";',
    '    button.textContent="Show next 24 · "+(total-visible)+" remaining";',
    '    button.setAttribute("aria-label","Load more management records");',
    '    button.addEventListener("click",onMore,{once:true});',
    '    parent.appendChild(button);',
    '  }',
    ''
  ].join('\n');
  source=replaceOne(source,'  function sfAdminOverview(users, posts',
    genericHelper+'  function sfAdminOverview(users, posts','progressive card helper');
  // Opening the overview used to render *all* reviewed and archived posts
  // in card previews, even though a full review hub exists.
  source=replaceOne(source,
    "takenDownPosts.map(x => adminRestoreCard(x.id, x.data)).join('')",
    "takenDownPosts.slice(0,6).map(x => adminRestoreCard(x.id, x.data)).join('')",
    'overview restored post preview');
  source=replaceOne(source,
    "reviewPosts.map(x => adminPostCard(x.id, x.data)).join('')",
    "reviewPosts.slice(0,6).map(x => adminPostCard(x.id, x.data)).join('')",
    'overview review queue preview');

  source=inFunction(source,'sfAdminUsers','sfAdminReports',part=>{
    part=limitRows(part,{renderFn:'renderUserGrid',target:'listEl'});
    part=replaceOne(part,'listEl.innerHTML = filteredPending.map(d => adminUserCard(d.id, d.data())).join(\'\');',
      'listEl.innerHTML = filteredPending.slice(0,tdVisibleLimit).map(d => adminUserCard(d.id, d.data())).join(\'\');\n        tdAdminAppendMore(listEl,filteredPending.length,tdVisibleLimit,()=>{tdVisibleLimit+=24;renderUserGrid();});',
      'pending users row cap');
    part=replaceOne(part,
      "      return !u.blocked && !isSusp && !u.postingRestricted;",
      "      return !u.disabled && !u.profileIncomplete && !u.blocked && !isSusp && !u.postingRestricted;",
      'verified and enabled user count');
    part=replaceOne(part,
      "    $('sfAdminUserSearch')?.addEventListener('input', renderUserGrid);",
      "    let tdSearchTimer;\n    $('sfAdminUserSearch')?.addEventListener('input',()=>{clearTimeout(tdSearchTimer);tdVisibleLimit=24;tdSearchTimer=setTimeout(renderUserGrid,160);});",
      'debounced user search');
    part=replaceOne(part,
      "        userFilter = btn.dataset.userFilter;\n        renderUserGrid();",
      "        userFilter = btn.dataset.userFilter;\n        tdVisibleLimit=24;\n        renderUserGrid();",
      'user filter pagination reset');
    return part;
  });

  // These views contain media, complex actions or confidential ID previews.
  // Keep search/filter/all records but display only one page at a time.
  const specs=[
    ['sfAdminPosts','sfAdminRestorationHub','renderActivePostsList','container','filtered',true],
    ['sfAdminRestorationHub','sfAdminStores','renderRestorationList','container','items',false],
    ['sfAdminStores','sfAdminProducts','renderActiveStoresList','container','filtered',true],
    ['sfAdminProducts','sfAdminUsers','renderActiveProductsList','container','filtered',true],
    ['sfAdminReports','sfAdminFraudReportsTab','renderReportsList','listEl','filtered',false],
    ['sfAdminFraudReportsTab','sfAdminOrdersReviewTab','renderFraudList','listEl','filtered',false],
    ['sfAdminOrdersReviewTab','sfAdminGhanaCardsTab','renderOrdersList','listEl','filtered',false],
    ['sfAdminGhanaCardsTab','sfAdminNotifyTab','renderKycList','listEl','filtered',false]
  ];
  for(const [from,to,fn,target,list,inline] of specs){
    source=inFunction(source,from,to,part=>limitRows(part,{renderFn:fn,target,collection:list,inline}));
  }

  // Firestore activity used to restart every query and entire dashboard after
  // any snapshot notification. Pause that on sub-pages and throttle the overview.
  const live='      const triggerLiveAdminRefresh = () => {';
  source=replaceOne(source,live,[
    '      let tdLastListenerRefresh=0;',
    live,
    "        if(window._currentAdminTab && window._currentAdminTab!=='overview')return;",
    '        if(Date.now()-tdLastListenerRefresh<60000)return;',
    '        tdLastListenerRefresh=Date.now();'
  ].join('\n'),'background rerender throttling');

  const report=[
    'tdAdminAppendMore',
    'tdVisibleLimit+=24',
    'tdLastListenerRefresh<60000',
    'takenDownPosts.slice(0,6)',
    'reviewPosts.slice(0,6)'
  ];
  for(const token of report)if(!source.includes(token))throw Error('Missing expected freeze fix: '+token);
  return source;
}

if(process.argv[1] && import.meta.url==='file://'+process.argv[1]){
  const root=(process.argv[2]||'.').replace(/\/$/,'');
  const path=root+'/index.html';
  const before=fs.readFileSync(path,'utf8');
  if(!before.includes('id="tdAdminDashboard"'))throw Error('Modern Traydaq portal must be applied first');
  const after=patchAdminFreeze(before);
  if(before===after)throw Error('Freeze fix resulted in no source changes');
  fs.writeFileSync(path,after);
  console.log('PASS: user, post, store, product, report, fraud, order and ID views progressively render 24 records at a time; background refresh throttled.');
}
