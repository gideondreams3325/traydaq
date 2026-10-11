import fs from 'node:fs';
import path from 'node:path';

// Apply inside the temporary private checkout during the PUBLIC Traydaq APK build.
// No private source, account records, or authentication credentials are published.
function fail(label){throw Error('Traydaq owned records: '+label);}
function once(src, before, after, label){
  const i=src.indexOf(before);
  if(i<0||src.indexOf(before,i+before.length)!==-1)fail('missing/duplicate '+label);
  return src.slice(0,i)+after+src.slice(i+before.length);
}
function first(src,before,after,label){
  const i=src.indexOf(before);if(i<0)fail('missing '+label);
  return src.slice(0,i)+after+src.slice(i+before.length);
}
function region(src,begin,end,edit,label){
  const a=src.indexOf(begin);
  const b=src.indexOf(end,a+begin.length);
  if(a<0||b<0||src.indexOf(begin,a+begin.length)!==-1)fail('region '+label);
  const part=edit(src.slice(a,b));
  if(part===src.slice(a,b))fail('region unchanged '+label);
  return src.slice(0,a)+part+src.slice(b);
}

// Exact Firebase UID equality is mandatory. Never accept 'local_user',
// a missing UID, a display name, email, or another session's shared cache.
export function tdOwnedRow(type,row,uid){
  const id=String(uid||'').trim();
  if(!id||id==='local_user'||!row||typeof row!=='object')return false;
  const byType={
    applications:['applicantId'],
    registrations:['attendeeId'],
    jobs:['creatorId','ownerUid','ownerId','posterId','userId','employerId','sellerId'],
    events:['creatorId','ownerUid','ownerId','posterId','userId','organizerId','sellerId']
  };
  const fields=byType[type]||[];
  const owner=fields.map(k=>String(row[k]||'').trim()).find(v=>v&&v!=='local_user'&&v!=='system_seed');
  return !!owner&&owner===id;
}
export function tdCurrentUid(){
  const user=getActiveUser();
  const uid=String(user?.uid||'').trim();
  return uid&&uid!=='local_user'?uid:'';
}
export function tdOwnedCached(key,type,uid){
  if(!uid)return [];
  const read=k=>{
    try{const data=JSON.parse(localStorage.getItem(k)||'[]');return Array.isArray(data)?data:[];}
    catch(_){return [];}
  };
  const seen=new Set(),all=[];
  // Scoped items take precedence, legacy cache is read only for migration.
  for(const row of [...read(key+'_'+uid),...read(key)]){
    if(!row?.id||!tdOwnedRow(type,row,uid)||seen.has(String(row.id)))continue;
    seen.add(String(row.id));all.push(row);
  }
  return all;
}
export function tdAppendOwnedCache(key,type,row,uid){
  if(!tdOwnedRow(type,row,uid)||uid!==tdCurrentUid())return false;
  const records=tdOwnedCached(key,type,uid).filter(item=>String(item.id)!==String(row.id));
  try{
    localStorage.setItem(key+'_'+uid,JSON.stringify([row,...records].slice(0,250)));
    return true;
  }catch(_){return false;}
}
async function tdCanManageOnline(type,id,uid){
  if(!uid||uid!==tdCurrentUid()||!id)return false;
  try{
    const db=getJobsEventsDb();
    if(!db?.collection)return false;
    const snap=await db.collection(type).doc(id).get();
    const exists=typeof snap?.exists==='function'?snap.exists():snap?.exists;
    if(!exists||typeof snap.data!=='function')return false;
    return uid===tdCurrentUid()&&tdOwnedRow(type,snap.data(),uid);
  }catch(_){return false;} // Fail closed when the real owner cannot be verified.
}

export function patchOwnedJobsEvents(source){
  if(source.includes('tdOwnedAccountIsolation2026'))fail('already patched');
  source=once(source,'const JOBS_TERMS_VERSION =',
    '// tdOwnedAccountIsolation2026: account-owned data must never use a device-wide identity.\n'+
    [tdOwnedRow,tdCurrentUid,tdOwnedCached,tdAppendOwnedCache,tdCanManageOnline].map(fn=>fn.toString()).join('\n\n')+
    '\n\nconst JOBS_TERMS_VERSION =','insert ownership helpers');

  // On application submit, only write an account-scoped backup. Do not
  // append sensitive details to the shared sf_my_job_applications key.
  source=region(source,'async function openApplyJobModal(jobId) {',
    '// Modal: Job Details Viewer',s=>{
    return once(s,
      "        const myApps = JSON.parse(localStorage.getItem('sf_my_job_applications') || '[]');\n        myApps.unshift(newAppObj);\n        localStorage.setItem('sf_my_job_applications', JSON.stringify(myApps));",
      "        tdAppendOwnedCache('sf_my_job_applications','applications',newAppObj,activeUser?.uid);",
      'application submission cache');
  },'submit application');

  source=region(source,'// Sub-view: My Applications',
    '// Sub-view: Employer Desk',s=>{
    s=once(s,'  const user = getActiveUser();\n  if (!user) {',
      '  const user = getActiveUser();\n  const viewerUid = tdCurrentUid();\n  if (!user || !viewerUid) {','authenticated applications');
    s=once(s,".where('applicantId', '==', user.uid)",".where('applicantId', '==', viewerUid)",'applications database filter');
    s=once(s,
      '          seenAppIds.add(d.id);\n          apps.push({ id: d.id, ...d.data() });',
      "          const row={...d.data(),id:d.id};\n          if(tdOwnedRow('applications',row,viewerUid)){\n            seenAppIds.add(d.id);apps.push(row);\n          }",
      'application read ownership');
    const begin="    try {\n      const myApps = JSON.parse(localStorage.getItem('sf_my_job_applications') || '[]');";
    const end="    } catch (_) {}";
    const i=s.indexOf(begin),j=s.indexOf(end,i);
    if(i<0||j<0)fail('application legacy cache block');
    s=s.slice(0,i)+"    for(const ma of tdOwnedCached('sf_my_job_applications','applications',viewerUid)){\n"+
      "      if(!seenAppIds.has(String(ma.id))){seenAppIds.add(String(ma.id));apps.push(ma);}\n"+
      "    }\n"+s.slice(j+end.length);
    s=first(s,
      "    const target = _$('jobsContentArea') || container;",
      "    if(viewerUid!==tdCurrentUid()||activeJobsTab!=='my_applications')return;\n    const target = _$('jobsContentArea') || container;",
      'applications account switch guard');
    return s;
  },'my applications');

  if(!source.includes('tdOnlyActualListingOwner2026')){
  source=region(source,'// Sub-view: Employer Desk',
    '// Modal: Review Candidates',s=>{
    s=once(s,'  const user = getActiveUser();\n  if (!user) {',
      '  const user = getActiveUser();\n  const viewerUid = tdCurrentUid();\n  if (!user || !viewerUid) {','authenticated employer');
    s=once(s,".where('creatorId', '==', user.uid)",".where('creatorId', '==', viewerUid)",'owned vacancy database filter');
    s=once(s,'          seenJobIds.add(d.id);\n          myJobs.push({ id: d.id, ...d.data() });',
      "          const row={...d.data(),id:d.id};\n          if(tdOwnedRow('jobs',row,viewerUid)){\n            seenJobIds.add(d.id);myJobs.push(row);\n          }",
      'vacancy database ownership check');
    const begin="    try {\n      const storedJobs = JSON.parse(localStorage.getItem('sf_my_posted_jobs') || '[]');";
    const end='    } catch (_) {}';
    const i=s.indexOf(begin),j=s.indexOf(end,i);
    if(i<0||j<0)fail('vacancy legacy cache block');
    s=s.slice(0,i)+"    for(const sj of tdOwnedCached('sf_my_posted_jobs','jobs',viewerUid)){\n"+
      "      if(!seenJobIds.has(String(sj.id))){seenJobIds.add(String(sj.id));myJobs.push(sj);}\n"+
      "    }\n"+s.slice(j+end.length);
    const match=/          if \(j && j\.id && !seenJobIds\.has\(j\.id\)\) \{\n            const matches = [^\n]+;\n            if \(matches\) \{/;
    if(!match.test(s))fail('vacancy API wildcard filter');
    s=s.replace(match,
      "          if(j?.id&&!seenJobIds.has(String(j.id))){\n            const matches=tdOwnedRow('jobs',j,viewerUid);\n            if(matches){");
    s=first(s,
      "    const target = _$('jobsContentArea') || container;",
      "    if(viewerUid!==tdCurrentUid()||activeJobsTab!=='employer_desk')return;\n    const target = _$('jobsContentArea') || container;",
      'vacancy account switch guard');
    return s;
  },'my listings');
  }

  // No applicant CV or phone number may be read unless the live online
  // vacancy belongs to this session. A locally cached fake listing is insufficient.
  source=region(source,'// Modal: Review Candidates',
    'async function renderSavedJobs(container) {',s=>{
    s=once(s,'async function openApplicantsModal(jobId) {\n  const modal',
      "async function openApplicantsModal(jobId) {\n  const viewerUid=tdCurrentUid();\n"+
      "  if(!await tdCanManageOnline('jobs',jobId,viewerUid)){\n"+
      "    toast('Only the verified listing owner can view candidates.','error');return;\n"+
      "  }\n  const modal",'candidate online owner check');
    const begin="    try {\n      const myApps = JSON.parse(localStorage.getItem('sf_my_job_applications') || '[]');";
    const end="    } catch (_) {}";
    const i=s.indexOf(begin),j=s.indexOf(end,i);
    if(i<0||j<0)fail('candidate cache block');
    s=s.slice(0,i)+
      "    // Only server-backed applications are shown to a verified employer.\n"+
      s.slice(j+end.length);
    s=once(s,"    const area = modal.querySelector('#applicantsListArea');",
      "    if(viewerUid!==tdCurrentUid()||!modal.isConnected){modal.remove();return;}\n"+
      "    const area = modal.querySelector('#applicantsListArea');",
      'candidate switch guard');
    s=once(s,"        const appId = btn.dataset.appStatus;",
      "        if(viewerUid!==tdCurrentUid()||!await tdCanManageOnline('jobs',jobId,viewerUid)){\n"+
      "          modal.remove();toast('Access to candidates has changed.','error');return;\n"+
      "        }\n        const appId = btn.dataset.appStatus;",
      'candidate status recheck');
    const localStart="          try {\n            const myApps = JSON.parse(localStorage.getItem('sf_my_job_applications') || '[]');";
    const localEnd="          } catch (_) {}";
    const x=s.indexOf(localStart),y=s.indexOf(localEnd,x);
    if(x<0||y<0)fail('shared candidate status cache block');
    s=s.slice(0,x)+s.slice(y+localEnd.length);
    return s;
  },'candidate privacy');

  // Tickets are personal just like job applications.
  source=region(source,'async function renderMyRegistrations(container) {',
    'async function renderOrganizerDesk(container) {',s=>{
    s=once(s,'  const user = getActiveUser();\n  if (!user) {',
      '  const user = getActiveUser();\n  const viewerUid=tdCurrentUid();\n  if (!user || !viewerUid) {','authenticated tickets');
    s=once(s,".where('attendeeId', '==', user.uid)",".where('attendeeId', '==', viewerUid)",'ticket query');
    s=once(s,'          seenRegIds.add(d.id);\n          regs.push({ id: d.id, ...d.data() });',
      "          const row={...d.data(),id:d.id};\n          if(tdOwnedRow('registrations',row,viewerUid)){\n            seenRegIds.add(d.id);regs.push(row);\n          }",
      'ticket owner check');
    const begin="    try {\n      const storedRegs = JSON.parse(localStorage.getItem('sf_my_event_registrations') || '[]');";
    const end="    } catch (_) {}";
    const i=s.indexOf(begin),j=s.indexOf(end,i);
    if(i<0||j<0)fail('tickets shared cache block');
    s=s.slice(0,i)+"    for(const sr of tdOwnedCached('sf_my_event_registrations','registrations',viewerUid)){\n"+
      "      if(!seenRegIds.has(String(sr.id))){seenRegIds.add(String(sr.id));regs.push(sr);}\n"+
      "    }\n"+s.slice(j+end.length);
    s=first(s,"    const target = _$('eventsContentArea') || container;",
      "    if(viewerUid!==tdCurrentUid()||activeEventsTab!=='my_registrations')return;\n    const target = _$('eventsContentArea') || container;",
      'tickets switch guard');
    return s;
  },'my registrations');

  if(!source.includes('tdOnlyActualListingOwner2026')){
  source=region(source,'async function renderOrganizerDesk(container) {',
    '// Modal: Review Registered Attendees',s=>{
    s=once(s,'  const user = getActiveUser();\n  if (!user) {',
      '  const user = getActiveUser();\n  const viewerUid=tdCurrentUid();\n  if (!user || !viewerUid) {','authenticated organizer');
    s=once(s,".where('creatorId', '==', user.uid)",".where('creatorId', '==', viewerUid)",'organizer database query');
    s=once(s,'          seenEventIds.add(d.id);\n          myEvents.push({ id: d.id, ...d.data() });',
      "          const row={...d.data(),id:d.id};\n          if(tdOwnedRow('events',row,viewerUid)){\n            seenEventIds.add(d.id);myEvents.push(row);\n          }",'organizer direct ownership');
    const begin="    try {\n      const storedEvents = JSON.parse(localStorage.getItem('sf_my_hosted_events') || '[]');";
    const end="    } catch (_) {}";
    const i=s.indexOf(begin),j=s.indexOf(end,i);
    if(i<0||j<0)fail('events shared cache block');
    s=s.slice(0,i)+"    for(const se of tdOwnedCached('sf_my_hosted_events','events',viewerUid)){\n"+
      "      if(!seenEventIds.has(String(se.id))){seenEventIds.add(String(se.id));myEvents.push(se);}\n"+
      "    }\n"+s.slice(j+end.length);
    const match=/          if \(e && e\.id && !seenEventIds\.has\(e\.id\)\) \{\n            const matches = [^\n]+;\n            if \(matches\) \{/;
    if(!match.test(s))fail('event API wildcard filter');
    s=s.replace(match,
      "          if(e?.id&&!seenEventIds.has(String(e.id))){\n            const matches=tdOwnedRow('events',e,viewerUid);\n            if(matches){");
    s=first(s,"    const target = _$('eventsContentArea') || container;",
      "    if(viewerUid!==tdCurrentUid()||activeEventsTab!=='organizer_desk')return;\n    const target = _$('eventsContentArea') || container;",
      'events switch guard');
    return s;
  },'my events');
  }

  source=region(source,'// Modal: Review Registered Attendees',
    '// 3. SECURITY DESK EXTENSION',s=>{
    s=once(s,'async function openAttendeesModal(eventId) {\n  const modal',
      "async function openAttendeesModal(eventId) {\n  const viewerUid=tdCurrentUid();\n"+
      "  if(!await tdCanManageOnline('events',eventId,viewerUid)){\n"+
      "    toast('Only the verified event owner can view attendees.','error');return;\n"+
      "  }\n  const modal",'attendee online owner check');
    const begin="    try {\n      const myRegs = JSON.parse(localStorage.getItem('sf_my_event_registrations') || '[]');";
    const end="    } catch (_) {}";
    const i=s.indexOf(begin),j=s.indexOf(end,i);
    if(i<0||j<0)fail('attendee shared cache block');
    s=s.slice(0,i)+"    // Confidential attendee data comes only from online registration records.\n"+
      s.slice(j+end.length);
    s=once(s,"    const area = modal.querySelector('#attendeesListArea');",
      "    if(viewerUid!==tdCurrentUid()||!modal.isConnected){modal.remove();return;}\n"+
      "    const area = modal.querySelector('#attendeesListArea');",
      'attendee switch guard');
    return s;
  },'attendee privacy');

  // New ticket confirmations are backed up under the current UID, not a shared key.
  source=once(source,
    "        const myRegs = JSON.parse(localStorage.getItem('sf_my_event_registrations') || '[]');\n        myRegs.unshift(newRegObj);\n        localStorage.setItem('sf_my_event_registrations', JSON.stringify(myRegs));",
    "        tdAppendOwnedCache('sf_my_event_registrations','registrations',newRegObj,activeUser?.uid);",
    'ticket submission backup');

  return source;
}

export function main(root='.'){
  const name=path.join(path.resolve(root),'jobs-events.js');
  const current=fs.readFileSync(name,'utf8');
  const updated=patchOwnedJobsEvents(current);
  new Function(updated);
  fs.writeFileSync(name,updated);
  console.log('PASS: My Applications, My Listings, Events, tickets and private attendee data are UID-isolated.');
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname))
  main(process.argv[2]||'.');
