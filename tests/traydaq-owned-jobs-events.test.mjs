import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  tdOwnedRow,tdOwnedCached,tdAppendOwnedCache,tdCurrentUid
} from '../scripts/patch-private-owned-jobs-events.mjs';

const saved=new Map();
globalThis.localStorage={
  getItem(key){return saved.has(key)?saved.get(key):null;},
  setItem(key,value){saved.set(key,String(value));},
  removeItem(key){saved.delete(key);}
};
let viewer={uid:'alice'};
globalThis.getActiveUser=()=>viewer;

test('records are visible to exactly their owner, never local_user or guests',()=>{
  for(const [type,key] of [
    ['applications','applicantId'],['registrations','attendeeId'],
    ['jobs','creatorId'],['events','creatorId']
  ]){
    assert.equal(tdOwnedRow(type,{[key]:'alice'},'alice'),true);
    assert.equal(tdOwnedRow(type,{[key]:'bob'},'alice'),false);
    assert.equal(tdOwnedRow(type,{[key]:'local_user'},'alice'),false);
    assert.equal(tdOwnedRow(type,{[key]:'alice'},''),false);
    assert.equal(tdOwnedRow(type,{[key]:'alice'},'local_user'),false);
    assert.equal(tdOwnedRow(type,{},'alice'),false);
  }
  assert.equal(tdOwnedRow('jobs',{ownerUid:'alice'},'alice'),true);
  assert.equal(tdOwnedRow('events',{organizerId:'alice'},'alice'),true);
  assert.equal(tdOwnedRow('jobs',{creatorId:'bob',posterId:'alice'},'alice'),false);
  assert.equal(tdOwnedRow('jobs',{creatorId:'local_user',posterId:'alice'},'alice'),true);
});

test('shared legacy application cache is filtered by Firebase UID',()=>{
  saved.clear();
  localStorage.setItem('sf_my_job_applications',JSON.stringify([
    {id:'b1',applicantId:'bob',jobTitle:'Other user'},
    {id:'a1',applicantId:'alice',jobTitle:'My vacancy'},
    {id:'fake',applicantId:'local_user',jobTitle:'Shared placeholder'},
    {id:'missing',jobTitle:'Unknown owner'}
  ]));
  assert.deepEqual(tdOwnedCached('sf_my_job_applications','applications','alice').map(r=>r.id),['a1']);
  assert.deepEqual(tdOwnedCached('sf_my_job_applications','applications','bob').map(r=>r.id),['b1']);
});

test('writes are UID-scoped and cannot be impersonated across account switches',()=>{
  saved.clear();
  viewer={uid:'alice'};
  assert.equal(tdCurrentUid(),'alice');
  assert.equal(tdAppendOwnedCache('sf_my_job_applications','applications',
    {id:'a2',applicantId:'alice'},'alice'),true);
  assert.ok(localStorage.getItem('sf_my_job_applications_alice'));
  assert.equal(localStorage.getItem('sf_my_job_applications'),null);
  viewer={uid:'bob'};
  assert.deepEqual(tdOwnedCached('sf_my_job_applications','applications','bob'),[]);
  assert.equal(tdAppendOwnedCache('sf_my_job_applications','applications',
    {id:'a3',applicantId:'alice'},'alice'),false);
  assert.equal(tdAppendOwnedCache('sf_my_job_applications','applications',
    {id:'b2',applicantId:'bob'},'bob'),true);
  assert.deepEqual(tdOwnedCached('sf_my_job_applications','applications','alice').map(r=>r.id),['a2']);
  assert.deepEqual(tdOwnedCached('sf_my_job_applications','applications','bob').map(r=>r.id),['b2']);
});

test('patched APK source enforces owner checks before showing personal sections',()=>{
  const code=fs.readFileSync('jobs-events.js','utf8');
  for(const needed of [
    'tdOwnedAccountIsolation2026',
    "tdOwnedRow('applications',row,viewerUid)",
    'tdOnlyActualListingOwner2026',
    "tdOwnedRow('registrations',row,viewerUid)",
    "tdListingBelongsToSignedInUid(row, ownerUid)",
    "tdOwnedCached('sf_my_job_applications','applications',viewerUid)",
    "tdListingBelongsToSignedInUid(sj, ownerUid)",
    "tdListingBelongsToSignedInUid(se, ownerUid)",
    "tdOwnedCached('sf_my_event_registrations','registrations',viewerUid)",
    "tdCanManageOnline('jobs',jobId,viewerUid)",
    "tdCanManageOnline('events',eventId,viewerUid)",
    "viewerUid!==tdCurrentUid()",
    "tdAppendOwnedCache('sf_my_job_applications','applications',newAppObj,activeUser?.uid)",
    "tdAppendOwnedCache('sf_my_event_registrations','registrations',newRegObj,activeUser?.uid)"
  ])assert.ok(code.includes(needed),'missing owner guard: '+needed);
  assert.ok(!code.includes("j.creatorId === 'local_user'"));
  assert.ok(!code.includes("e.creatorId === 'local_user'"));
  const applicantView=code.split('// Modal: Review Candidates')[1].split('async function renderSavedJobs')[0];
  const attendeeView=code.split('// Modal: Review Registered Attendees')[1].split('// 3. SECURITY DESK EXTENSION')[0];
  assert.ok(!applicantView.includes("localStorage.getItem('sf_my_job_applications')"),
    'candidate list must not read shared applicant caches');
  assert.ok(!attendeeView.includes("localStorage.getItem('sf_my_event_registrations')"),
    'attendee list must not read shared ticket caches');
});
