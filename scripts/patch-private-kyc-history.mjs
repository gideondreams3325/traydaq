// Public APK builder injects verification ID deletion + history into admin workspace.
import fs from 'node:fs';
function once(source,before,after,label) {
  const first=source.indexOf(before);
  if(first<0 || source.indexOf(before,first+before.length)!==-1)
    throw Error('Traydaq ID-history source drift: '+label);
  return source.slice(0,first)+after+source.slice(first+before.length);
}
export function patchTraydaqKycHistory(source,helper) {
  if(!source.includes('function sfAdminGhanaCardsTab(') ||
     !source.includes('id="adminKycRefreshBtn"') ||
     !source.includes('tdTrustBadgeHtml'))
    throw Error('Apply admin portal and verified-badge patches before ID history');
  if(source.includes('tdKycDeleteDossier') || source.includes('tdKycHistoryBtn'))
    throw Error('ID-history patch has already been applied');
  if(!helper.includes('function tdKycDeleteDossier(') ||
     !helper.includes('function tdKycHistoryBind('))
    throw Error('The deletion helper is missing safety controls');
  const filterBefore=[
    '    const allGhanaCardRecords = Array.from(kycMap.values()).filter(record =>',
    "      registryVerified && approvedAccountIds.has(String(record.uid || record.id || ''))",
    '    );'
  ].join('\n');
  const filterAfter=[
    '    const tdKycRegisteredUsers=new Map(users.docs.map(d=>[String(d.id),d.data()||{}]));',
    '    const allGhanaCardRecords=Array.from(kycMap.values()).filter(record=>{',
    "      const uid=String(record.uid||record.id||'');",
    '      const user=tdKycRegisteredUsers.get(uid)||{};',
    '      const deletedAt=Number(user.kycDeletedAt||0);',
    '      const submittedAt=typeof ts==="function" ? Number(ts(user.verificationSubmittedAt)||0) : 0;',
    '      return registryVerified && approvedAccountIds.has(uid) &&',
    '        (!deletedAt || submittedAt>deletedAt);',
    '    });'
  ].join('\n');
  source=once(source,filterBefore,filterAfter,'exclude deleted ID dossiers, allow later resubmissions');
  const start=source.indexOf('  function sfAdminGhanaCardsTab(');
  const stop=source.indexOf('  window.sfAdminGhanaCardsTab = sfAdminGhanaCardsTab;',start);
  if(start<0||stop<0 || stop-start>50000)
    throw Error('Cannot locate the existing protected ID verification workspace');
  let segment=source.slice(start,stop);
  segment=once(segment,
    '<button type="button" id="adminKycRefreshBtn"',
    '<button type="button" id="tdKycHistoryBtn" class="border border-[#bdd6c6] bg-white text-[#145337] px-3.5 py-2 rounded-xl text-xs font-bold min-h-[44px]">🕘 Deletion History</button>\n              <button type="button" id="adminKycRefreshBtn"',
    'history navigation');
  segment=once(segment,
    '        <!-- Filter & Search Bar -->',
    '        <p id="tdKycDeleteStatus" role="status" aria-live="polite" hidden></p>\n        <!-- Filter & Search Bar -->',
    'private deletion status');
  segment=once(segment,"              <div class=\"flex items-center gap-1.5\">\n                ${!isVer ? `","              <button type=\"button\" data-td-delete-dossier=\"${uid}\" class=\"border border-red-200 text-red-800 bg-red-50 hover:bg-red-100 px-3 py-2 rounded-xl text-xs font-extrabold min-h-[42px]\">🗑️ Delete ID</button>\n              <div class=\"flex items-center gap-1.5\">\n                ${!isVer ? `",
    'individual record delete action');
  segment=once(segment,
    "    $('kycSearchInput')?.addEventListener('input', renderKycList);\n    renderKycList();",
    "    $('kycSearchInput')?.addEventListener('input', renderKycList);\n    tdKycHistoryBind(allRecords);\n    renderKycList();",
    'bind safe deletion actions');
  source=source.slice(0,start)+helper+'\n'+segment+source.slice(stop);
  for(const required of ['tdKycDeleteDossier','tdKycHistoryBtn','tdKycHistoryBind(allRecords)','kycDeletedAt']) {
    if(!source.includes(required)) throw Error('Missing ID vault deletion feature: '+required);
  }
  return source;
}
if(process.argv[1] && import.meta.url==='file://'+process.argv[1]) {
  const dir=(process.argv[2]||'.').replace(/\/$/,'');
  const helperPath=process.argv[3];
  if(!helperPath) throw Error('Deletion helper asset path required');
  const file=dir+'/index.html';
  const original=fs.readFileSync(file,'utf8');
  const updated=patchTraydaqKycHistory(original,fs.readFileSync(helperPath,'utf8'));
  fs.writeFileSync(file,updated);
  console.log('PASS: Owner-only Delete ID and audit history installed into verification hub.');
}
