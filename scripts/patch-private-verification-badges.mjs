
import fs from 'node:fs';
// Applied to the private Android build checkout by the PUBLIC Traydaq builder.
// Separate account ID verification from admin-only blue checks.
const endpoint='https://vvpwntehstjbccarqqzp.supabase.co/functions/v1/traydaq-blue-badges';
function once(source,before,after,label){
 const index=source.indexOf(before);
 if(index<0||source.indexOf(before,index+before.length)!==-1)throw Error('Traydaq badge patch requires exact source: '+label);
 return source.slice(0,index)+after+source.slice(index+before.length);
}
export function patchVerificationBadges(source){
 if(!source.includes('id="tdAdminDashboard"')||!source.includes('tdAdminAppendMore'))throw Error('Apply admin UI and freeze patches first');
 if(source.includes('tdTrustBadgeHtml'))throw Error('Badge separation already patched');
 const badgeCss = '<style id="tdBadgeSeparationStyles">'+
   '.td-id-badge{display:inline-flex;align-items:center;gap:3px;border:1px solid #dcc88a;background:#fff8df;color:#574415;border-radius:999px;padding:2px 7px;font-size:10px;font-weight:800;vertical-align:middle;white-space:nowrap}'+
   '.td-blue-badge{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;width:20px;height:20px;background:#1686e0;color:#fff;font-size:14px;line-height:1;font-weight:900;vertical-align:middle;box-shadow:0 0 0 2px #dcedff;flex-shrink:0;margin-inline-start:3px}'+
   '.td-trust-badge-slot:empty{display:none}'+
   '.td-blue-hub section{max-width:100%}.td-blue-hub-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:10px}'+
   '.td-blue-hub-row{min-width:0;background:#fff;border:1px solid #d9e8df;border-radius:15px;padding:12px}'+
   '.td-blue-hub-row button{padding:9px 13px;border-radius:10px;background:#17653c;color:white;font-weight:800;font-size:12px}'+
   '.td-blue-hub-row button[data-revoke]{background:#fff0e9;color:#8a341d;border:1px solid #ebc4ad}'+
   '.td-blue-hub-row button:disabled{opacity:.5;cursor:not-allowed}</style>';
 source=once(source,'</head>',badgeCss+'\n</head>','badge CSS');
 const helper=[
  'const tdBlueBadgeEndpoint='+JSON.stringify(endpoint)+';',
  'window.sfBlueBadgeUidSet=new Set();',
  'window.sfOfficialTraydaqUid=null;',
  'window.sfBlueBadgeRegistryOnline=false;',
  'let tdBlueBadgeFetch=null,tdBlueBadgeUpdatedAt=0;',
  'async function sfRefreshBlueBadges(force=false){',
  '  if(tdBlueBadgeFetch)return tdBlueBadgeFetch;',
  '  if(!force&&Date.now()-tdBlueBadgeUpdatedAt<60000){if(!window.sfBlueBadgeRegistryOnline)await tdResolveSignedInOfficialBadge();tdRefreshVisibleTrustBadges();return window.sfBlueBadgeUidSet;}',
  '  tdBlueBadgeFetch=(async()=>{',
  '    try{',
  '      const res=await fetch(tdBlueBadgeEndpoint,{method:"GET",cache:"no-store",signal:(typeof AbortSignal!=="undefined"&&typeof AbortSignal.timeout==="function")?AbortSignal.timeout(7000):undefined});',
  '      if(!res.ok)throw Error("Registry unavailable");',
  '      const data=await res.json();',
  '      if(!data.success||!Array.isArray(data.blueVerifiedUids))throw Error("Invalid registry");',
  '      window.sfBlueBadgeUidSet=new Set(data.blueVerifiedUids.filter(u=>typeof u==="string"&&/^[A-Za-z0-9_-]{6,128}$/.test(u)));',
  '      window.sfOfficialTraydaqUid=(typeof data.officialAdminUid==="string"&&/^[A-Za-z0-9_-]{6,128}$/.test(data.officialAdminUid))?data.officialAdminUid:null;',
  '      if(window.sfOfficialTraydaqUid)window.sfBlueBadgeUidSet.add(window.sfOfficialTraydaqUid);',
  '      else if(data.officialLookupOnline===false)await tdResolveSignedInOfficialBadge();',
  '      window.sfBlueBadgeRegistryOnline=data.registryOnline!==false;',
  '      tdRefreshVisibleTrustBadges();',
  '    }catch(_){window.sfBlueBadgeRegistryOnline=false;await tdResolveSignedInOfficialBadge();tdRefreshVisibleTrustBadges();}',
  '    finally{tdBlueBadgeUpdatedAt=Date.now();tdBlueBadgeFetch=null;}',
  '    return window.sfBlueBadgeUidSet;',
  '  })();',
  '  return tdBlueBadgeFetch;',
  '}',
  // When the public badge service is unavailable, the currently signed-in',
  '  // official owner can still prove their account directly to Firebase Auth.',
  '  // Never apply this fallback to a different user or a profile email field.',
  '  async function tdResolveSignedInOfficialBadge(){',
  '    try{',
  '      const signedIn=typeof auth!=="undefined"?auth?.currentUser:null;',
  '      if(!signedIn||typeof signedIn.getIdTokenResult!=="function")return;',
  '      const result=await signedIn.getIdTokenResult(true);',
  '      const claims=result?.claims||{};',
  '      if(claims.email_verified!==true||String(claims.email||"").toLowerCase()!=="gideondreams3325@gmail.com"||',
  '         String(claims.user_id||claims.sub||"")!==signedIn.uid)return;',
  '      window.sfOfficialTraydaqUid=signedIn.uid;',
  '      window.sfBlueBadgeUidSet.add(signedIn.uid);',
  '    }catch(_){/* Keep the server-verified registry; never trust profile fields. */}',
  '  }',
  'function sfAccountVerified(u){',
  '  return !!u&&(u.accountVerificationStatus==="VERIFIED"||u.accountVerified===true||u.verificationStatus==="approved");',
  '}',
  'function tdBadgeMarkup(uid,verified){',
  '  if(uid&&window.sfBlueBadgeUidSet?.has(uid))return \'<span class="td-blue-badge" title="Official Traydaq blue check" aria-label="Official blue check">✓</span>\';',
  '  if(verified)return \'<span class="td-id-badge" title="Traydaq account identity verified">🆔 Verified</span>\';',
  '  return "";',
  '}',
  'function tdRefreshVisibleTrustBadges(){',
  '  if(typeof document==="undefined")return;',
  '  document.querySelectorAll("[data-td-trust-uid]").forEach(slot=>{',
  '    const uid=slot.getAttribute("data-td-trust-uid");',
  '    const verified=slot.getAttribute("data-td-account-verified")==="1";',
  '    const html=tdBadgeMarkup(uid,verified);',
  '    if(slot.innerHTML!==html)slot.innerHTML=html;',
  '  });',
  '}',
  'function tdTrustBadgeHtml(u){',
  '  if(!u)return "";',
  '  const uid=String(u.uid||u.userId||u.ownerUid||u.firebaseUid||u.ownerId||u.id||"");',
  '  const verified=sfAccountVerified(u);',
  '  if(!/^[A-Za-z0-9_-]{6,128}$/.test(uid))return tdBadgeMarkup("",verified);',
  '  return \' <span class="td-trust-badge-slot" data-td-trust-uid="\'+uid+\'" data-td-account-verified="\'+(verified?"1":"0")+\'">\'+tdBadgeMarkup(uid,verified)+\'</span>\';',
  '}',
  'window.sfRefreshBlueBadges=sfRefreshBlueBadges;',
  'window.sfTrustBadgeHtml=tdTrustBadgeHtml;',
  'sfRefreshBlueBadges().catch(()=>{});',
  'if(typeof window!=="undefined"&&typeof document!=="undefined"){',
  '  window.setInterval(()=>{if(document.visibilityState==="visible")sfRefreshBlueBadges().catch(()=>{});},90000);',
  '  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")sfRefreshBlueBadges(true).catch(()=>{});});',
  '}',
  ''
 ].join('\n');
 const vfStart=source.indexOf('function verifyBadge(s){'),vfEnd=source.indexOf('function isBusinessVerified(s){',vfStart);
 if(vfStart<0||vfEnd<0||vfEnd-vfStart>1000)throw Error('Verification helper changed');
 source=source.slice(0,vfStart)+helper+'function verifyBadge(s){return tdTrustBadgeHtml(s);}\n'+source.slice(vfEnd);
 const old='function sfIsVerifiedBadgeActive(u) {\n  if (!u) return false;\n  if (u.role === \'admin\' || u.isAdmin === true) return true;\n  const isPro = (u.subscription === \'PRO\' || u.plan === \'PRO\' || u.isPro === true);\n  const isAccountVerified = (u.accountVerificationStatus === \'VERIFIED\' || u.accountVerified === true || u.verificationStatus === \'approved\');\n  return isPro && isAccountVerified;\n}';
 source=once(source,old,'function sfIsVerifiedBadgeActive(u) {\n  return !!(u?.uid && window.sfBlueBadgeUidSet?.has(u.uid));\n}','official badge determination');
 source=once(source,'async function loadPublicProfiles(){','async function loadPublicProfiles(){\n  sfRefreshBlueBadges().catch(()=>{});','hydrate authoritative badges');
 // User/creator badge ternaries which formerly treated legacy verified flags as official blue checks.
 const rawBadge=/\$\{\s*([A-Za-z_]\w*)\??\.verified\s*\?\s*([\x27`])\s*<span class="verified-badge[^\n]*?>✓<\/span>\s*\2\s*:\s*\x27\x27\s*\}/g;
 let basic=0;
 source=source.replace(rawBadge,(_all,identity)=>{basic++;return '$'+'{tdTrustBadgeHtml('+identity+')}';});
 if(basic<14)throw Error('Expected at least 14 direct blue badge renderers; found '+basic);
 // The four unconditionally rendered legacy blue checks must not imply verification.
 source=once(source,
  '<span class="verified-badge text-[10px]">✓</span>\n                <span>Verified Seller</span>',
  '${tdTrustBadgeHtml(s)}\n                <span>Seller</span>','marketplace badge');
 source=once(source,
  '<span class="verified-badge text-xs">✓</span>\n              ${businessCertBadge(cachedStore || profile, \'compact\')}',
  '${tdTrustBadgeHtml(profile || cachedStore)}\n              ${businessCertBadge(cachedStore || profile, \'compact\')}','store header badge');
 source=once(source,'<span class="verified-badge shrink-0">✓</span>\n                    </div>\n                    <div class="text-[10px] sm:text-[11px] text-gray-600 truncate">@yourstore',
  '<span class="td-id-badge">🆔 Verified</span>\n                    </div>\n                    <div class="text-[10px] sm:text-[11px] text-gray-600 truncate">@yourstore','example merchant status');
 source=once(source,'<span class="verified-badge ml-1">✓</span>\n            </div>\n            <span class="text-[10px] font-bold bg-gold',
  '<span aria-hidden="true">🛡️</span>\n            </div>\n            <span class="text-[10px] font-bold bg-gold','security icon');
 // For verified users, show ID badge; blue-check is never implied by verification.
 source=once(source,'      '+ '`'+' : p.verified ? '+'`', '      '+'`'+' : sfAccountVerified(p) ? '+'`','verification status condition');
 source=once(source,'You are verified <span class="verified-badge ml-1">✓</span><div class="muted text-sm mt-1">Your blue Traydaq badge may appear beside your seller name.</div>',
  'Account verification complete <span class="td-id-badge">🆔 Verified</span><div class="muted text-sm mt-1">Blue checks are awarded separately by the Traydaq Security Team.</div>',
  'verification explanatory state');
 source=once(source,'<div class="bg-white rounded-xl p-3 text-sm">✓ Trust badge</div>','<div class="bg-white rounded-xl p-3 text-sm">🆔 Verified label</div>','verification explainer');
 source=once(source,
  '${currentProfile.verified?\'<div class="font-bold mt-4 flex items-center gap-2 text-emerald-400"><span class="verified-badge">✓</span><span>Verified seller</span></div>\':',
  '${sfAccountVerified(currentProfile)?\'<div class="font-bold mt-4 flex items-center gap-2 text-[#17653c]"><span class="td-id-badge">🆔 Verified</span><span>Account verified</span></div>\':','seller identity status');
 source=once(source,
  '${p.verified?\'<div class="text-sm font-bold mt-1 flex items-center gap-2"><span class="verified-badge">✓</span><span>Verified seller</span></div>\':\'\'}',
  '${sfAccountVerified(p)?\'<div class="text-sm font-bold mt-1 flex items-center gap-2"><span class="td-id-badge">🆔 Verified</span><span>Account verified</span></div>\':\'\'}','profile identity status');
 const hub=[
 '  function sfAdminBlueChecks(users){',
 '    const host=document.getElementById("adminWorkspace");',
 '    if(!host)return;',
 '    host.innerHTML=\'<div class="td-blue-hub space-y-4"><section class="card p-5 bg-white border border-[#dce9df] rounded-2xl"><h2 class="text-xl font-black text-[#17653c]">🔵 Official Blue Check Hub</h2><p class="text-sm text-gray-700 mt-2">Blue checks are awarded only by the Traydaq Security Team. Ordinary account verification earns 🆔 Verified, not a blue check. The official Traydaq admin account has a permanent blue check tied to Firebase Authentication.</p><div id="tdBlueHubStatus" class="text-xs text-gray-600 mt-3" role="status">Connecting to the official badge registry…</div></section><div class="flex gap-2 items-center flex-wrap"><input id="tdBlueHubSearch" aria-label="Search accounts" placeholder="Search users, emails or UID" class="min-w-0 flex-1 p-3 border rounded-xl text-sm" /><button id="tdBlueHubRefresh" type="button" class="td-admin-control">↻ Refresh</button></div><div id="tdBlueHubList" class="td-blue-hub-list"></div><button id="tdBlueHubMore" type="button" class="td-admin-control" hidden>Load more accounts</button></div>\';',
 '    const all=(users?.docs||[]).filter(d=>d?.id&&d.data);',
 '    let shown=24;',
 '    const showStatus=()=>{const el=document.getElementById("tdBlueHubStatus");if(el)el.textContent=window.sfBlueBadgeRegistryOnline?"Live badge registry connected · "+window.sfBlueBadgeUidSet.size+" blue checks":"Badge registry unavailable — awarding is disabled until it reconnects.";};',
 '    function showRows(){',
 '      const list=document.getElementById("tdBlueHubList"),more=document.getElementById("tdBlueHubMore");',
 '      if(!list)return;',
 '      list.replaceChildren();',
 '      const q=String(document.getElementById("tdBlueHubSearch")?.value||"").toLowerCase().trim();',
 '      const filtered=all.filter(d=>{const u=d.data();return !q||[u.name,u.username,u.email,d.id].some(v=>String(v||"").toLowerCase().includes(q));});',
 '      if(!filtered.length){const p=document.createElement("p");p.textContent="No matching accounts.";list.append(p);}',
 '      for(const d of filtered.slice(0,shown)){',
 '        const u=d.data(),uid=d.id,active=window.sfBlueBadgeUidSet?.has(uid)===true,official=uid===window.sfOfficialTraydaqUid;',
 '        const card=document.createElement("article");card.className="td-blue-hub-row";',
 '        const name=document.createElement("div");name.className="font-black text-gray-900 break-words";name.textContent=String(u.name||u.username||"User");',
 '        const account=document.createElement("div");account.className="text-xs text-gray-600 mt-1 break-all";account.textContent=String(u.email||"")+" · "+uid;',
 '        const status=document.createElement("div");status.className="text-xs font-bold my-3";status.textContent=official?"🔵 Official Traydaq account · permanent blue check":active?"🔵 Blue check active":sfAccountVerified(u)?"🆔 Account verified · No blue check":"Account not ID verified · No blue check";',
 '        const btn=document.createElement("button");btn.type="button";btn.textContent=official?"Permanent official badge":active?"Revoke blue check":"Grant blue check";',
 '        if(active)btn.setAttribute("data-revoke","true");',
 '        btn.disabled=official||!window.sfBlueBadgeRegistryOnline;',
 '        btn.addEventListener("click",async()=>{',
 '          const action=active?"revoke":"grant";',
 '          if(!window.confirm((active?"Revoke":"Award")+" official blue check for "+String(u.name||u.username||uid)+"?"))return;',
 '          const reason=window.prompt("Administrative reason (10–220 characters). This is recorded securely:","");',
 '          if(reason===null)return;',
 '          if(reason.trim().length<10||reason.trim().length>220){alert("Enter a reason between 10 and 220 characters.");return;}',
 '          btn.disabled=true;btn.textContent="Saving…";',
 '          try{',
 '            const signedIn=auth?.currentUser;',
 '            if(!signedIn||typeof signedIn.getIdToken!=="function")throw Error("Administrator sign-in required");',
 '            const token=await signedIn.getIdToken(true);',
 '            const res=await fetch(tdBlueBadgeEndpoint,{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify({uid,action,reason:reason.trim()}),cache:"no-store"});',
 '            const result=await res.json();',
 '            if(!res.ok||!result.success)throw Error(result.error||"Action failed");',
 '            await sfRefreshBlueBadges(true);',
 '            showStatus();showRows();',
 '            if(typeof toast==="function")toast("Blue-check "+(active?"revoked":"granted"),"success");',
 '          }catch(error){alert("Blue-check update failed: "+String(error?.message||"Unknown issue"));showStatus();showRows();}',
 '        });',
 '        card.append(name,account,status,btn);list.append(card);',
 '      }',
 '      if(more){more.hidden=filtered.length<=shown;more.textContent="Show next 24 · "+Math.max(0,filtered.length-shown)+" remaining";}',
 '    }',
 '    document.getElementById("tdBlueHubSearch")?.addEventListener("input",()=>{shown=24;showRows();});',
 '    document.getElementById("tdBlueHubMore")?.addEventListener("click",()=>{shown+=24;showRows();});',
 '    document.getElementById("tdBlueHubRefresh")?.addEventListener("click",async()=>{await sfRefreshBlueBadges(true);showStatus();showRows();});',
 '    sfRefreshBlueBadges(true).then(()=>{if(document.getElementById("tdBlueHubList")){showStatus();showRows();}});',
 '  }',
 ''
 ].join('\n');
 source=once(source,'  function sfAdminUsers(users, pending, initialFilter){',hub+'  function sfAdminUsers(users, pending, initialFilter){','blue-check hub view');
 source=once(source,"      else if(tabName === 'users') sfAdminUsers(users, pending, subOption);",
                    "      else if(tabName === 'blue_checks') sfAdminBlueChecks(users);\n      else if(tabName === 'users') sfAdminUsers(users, pending, subOption);",'blue hub routing');
 // Only remove automatic blue symbols in real-user contexts. Marketing/demo
 // graphics and genuinely unrelated release markers are left untouched.
 if(!source.includes('sfAdminBlueChecks(users)')||!source.includes('tdTrustBadgeHtml(currentProfile)'))throw Error('Missing badge UI/route');
 return source;
}
if(process.argv[1] && import.meta.url==='file://'+process.argv[1]){
 const root=(process.argv[2]||'.').replace(/\/$/,'');
 const filepath=root+'/index.html';
 const original=fs.readFileSync(filepath,'utf8');
 const updated=patchVerificationBadges(original);
 if(original===updated)throw Error('No verification changes');
 fs.writeFileSync(filepath,updated);
 console.log('PASS: ID badges separated, admin blue-check hub installed, verified backend required.');
}
