import fs from 'node:fs';
// Build-only patch. This repository never stores private app code or real user records.
function once(s, before, after, label) {
  const i=s.indexOf(before);
  if(i<0 || s.indexOf(before,i+before.length)>=0) throw Error('Unsafe admin metrics patch: '+label);
  return s.slice(0,i)+after+s.slice(i+before.length);
}
export function patchAdminHtml(s) {
  const begin='    const activeUsers = users.docs.filter(d => {';
  const i=s.indexOf(begin), j=i<0?-1:s.indexOf('    });',i);
  if(j<0) throw Error('Active users block unavailable');
  const block=s.slice(i,j+'    });'.length);
  const predicate='return !u.blocked && !isSusp && !u.postingRestricted;';
  if(!block.includes(predicate)) throw Error('Active count semantics changed');
  const replacement=[
    '    // An Auth-only account might be legitimate; never delete it automatically.',
    '    const linkedProfileUsers = users.docs.filter(d => d.data().profileIncomplete !== true);',
    '    const authOnlyUserCount = users.size - linkedProfileUsers.length;',
    '    const activeUsers = linkedProfileUsers.filter(d => {',
    '      const u = d.data();',
    '      const isSusp = !!u.suspended || (u.suspendedUntil && ts(u.suspendedUntil) > Date.now());',
    '      return !u.disabled && !u.blocked && !isSusp && !u.postingRestricted;',
    '    });'
  ].join('\n');
  s=once(s,block,replacement,'main enabled count');
  s=once(s,"\${registryVerified ? users.size : '—'}</div>",
    "\${registryVerified ? linkedProfileUsers.length : '—'}</div>",'main card count');
  s=once(s,"\${registryVerified ? activeUsers.length : '—'} Enabled",
    "\${registryVerified ? activeUsers.length : '—'} Profile enabled",'enabled badge');
  const banner=[
    "      \${registryVerified ? \x60<div role=\"status\" class=\"rounded-xl border border-amber-200 bg-amber-50 p-3 mb-4 text-xs text-amber-950\">",
    "        <b>Account audit:</b> \${linkedProfileUsers.length} profile-linked app accounts; \${authOnlyUserCount} Firebase Auth-only entries; \${users.size} Auth records after explicit fixture filtering.",
    "        Auth-only does not mean fake. Review these entries in the Accounts directory or Firebase Authentication before deleting anything.",
    "      </div>\x60 : ''}",
    ''
  ].join('\n');
  s=once(s,'      <!-- Dashboard-Style Executive Cards Grid -->',
    banner+'      <!-- Dashboard-Style Executive Cards Grid -->','audit explanation');
  const pos=s.indexOf('  function sfAdminOverview(users, posts');
  if(pos<0) throw Error('Secondary dashboard unavailable');
  const start=s.indexOf('    const activeCount = users.docs.filter(d => {',pos);
  const end=start<0?-1:s.indexOf('    }).length;',start);
  if(end<0) throw Error('Secondary account block unavailable');
  const original=s.slice(start,end+'    }).length;'.length);
  if(!original.includes(predicate)) throw Error('Secondary enabled count changed');
  s=once(s,original,original.replace(predicate,
    'return !u.disabled && !u.profileIncomplete && !u.blocked && !isSusp && !u.postingRestricted;'),
    'secondary enabled count');
  return s;
}
export function patchEdgeOverview(s) {
  s=once(s,'    const auth=new Map();','    const auth=new Map();\n    let excludedFixtureCount=0;','fixture count');
  s=once(s,'        disabled:account.disabled===true,\n        profileIncomplete:',
    '        disabled:account.disabled===true,\n        emailVerified:account.emailVerified===true,\n        profileIncomplete:','email status');
  s=once(s,'      if(!fixture(combined))auth.set(uid,combined);',
    '      if(fixture(combined)){excludedFixtureCount++;continue;}\n      auth.set(uid,combined);','fixture exclusion');
  s=once(s,'    const realUids=new Set(auth.keys());',[
    '    const realUids=new Set(auth.keys());',
    '    const rows=[...auth.values()];',
    '    const accountAudit={',
    '      firebaseAuthCount:new Set(authAccounts.map(a=>String(a.uid||"").trim()).filter(Boolean)).size,',
    '      countedAuthAccounts:realUids.size,',
    '      profileLinked:rows.filter(a=>!a.profileIncomplete).length,',
    '      authOnly:rows.filter(a=>a.profileIncomplete).length,',
    '      disabled:rows.filter(a=>a.disabled).length,',
    '      emailUnverified:rows.filter(a=>!a.emailVerified).length,',
    '      excludedExplicitFixtures:excludedFixtureCount',
    '    };'
  ].join('\n'),'audit breakdown');
  s=once(s,'return response({success:true,userRegistryVerified:true,registeredUserCount:realUids.size,',
    'return response({success:true,userRegistryVerified:true,registeredUserCount:realUids.size,accountAudit,',
    'account audit API');
  return s;
}
export function patchFirebaseAdminRest(s) {
  return once(s,"uid:String(user.localId),email:String(user.email||''),",
    "uid:String(user.localId),email:String(user.email||''),emailVerified:user.emailVerified===true,",
    'Firebase email verification');
}
if(process.argv[1] && import.meta.url===new URL('file://'+process.argv[1]).href){
  const root=(process.argv[2]||'.').replace(/\/$/,'');
  for(const [p,transform] of [
    ['index.html',patchAdminHtml],
    ['supabase/functions/sellerflow-api/admin-overview.mjs',patchEdgeOverview],
    ['supabase/functions/sellerflow-api/firebase-admin-rest.mjs',patchFirebaseAdminRest]
  ]){
    const filepath=root+'/'+p, original=fs.readFileSync(filepath,'utf8');
    const updated=transform(original);
    if(updated===original) throw Error('No change made to '+p);
    fs.writeFileSync(filepath,updated);
    console.log('Applied Traydaq admin count audit patch to '+p);
  }
}
