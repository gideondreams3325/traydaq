#!/usr/bin/env node
'use strict';
/* READ-ONLY selection of user-approved Traydaq fixture prefixes. The selected
   UID file stays in $RUNNER_TEMP; never print or upload its contents. */
const fs=require('node:fs');
const {initializeApp,applicationDefault}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getDatabase}=require('firebase-admin/database');
const {getFirestore}=require('firebase-admin/firestore');
const id='sellerflow-efaab', owner='gideondreams3325@gmail.com';
const out=process.argv[2];
function halt(reason){console.error('STOP: '+reason+'; no users changed.');process.exit(1);}
if(process.env.GITHUB_ACTIONS!=='true'||process.env.GOOGLE_CLOUD_PROJECT!==id||!out.startsWith('/home/runner/work/_temp/'))halt('Unexpected environment');
const app=initializeApp({credential:applicationDefault(),projectId:id,databaseURL:'https://sellerflow-efaab-default-rtdb.firebaseio.com'});
const auth=getAuth(app), db=getDatabase(app),firestore=getFirestore(app);
const patterns=[/^plain_user_/i,/^pers_user_/i];
const kind=u=>{const strings=[u.uid,u.displayName,(u.email||'').split('@')[0]];
return patterns.findIndex(p=>strings.some(x=>p.test(String(x||''))));};
const protectedRecord=x=>x&&typeof x==='object'&&(
 ['admin','isAdmin','isOwner','verified','identityVerified','kycVerified','accountVerified','blueVerified','isModerator'].some(k=>x[k]===true||x[k]===1)||
 ['role','accountRole','userRole'].some(k=>/^(admin|owner|staff|moderator|security)$/i.test(String(x[k]||'')))||
 ['accountVerificationStatus','verificationStatus'].some(k=>/^(verified|approved|pending|review)$/i.test(String(x[k]||'')))||
 ['postsCount','productsCount','ordersCount','followersCount','followingCount','likesCount','messagesCount'].some(k=>Number(x[k])>0));
const ownerFields=['uid','userId','userUid','ownerUid','ownerId','sellerUid','sellerId','creatorUid','creatorId','authorUid','authorId','postedBy','buyerUid','buyerId','senderUid','senderId','fromUid','recipientUid','reviewerId','applicantId'];
function linked(value,candidates){
 const found=new Set(), seen=new Set();
 function walk(x,depth){
  if(!x||typeof x!=='object'||seen.has(x)||depth>4)return;
  seen.add(x);
  if(Array.isArray(x)){for(const child of x){if(typeof child==='string'&&candidates.has(child))found.add(child);else walk(child,depth+1)}return;}
  for(const [key,v] of Object.entries(x)){
   if(candidates.has(key))found.add(key);
   if(ownerFields.includes(key)&&typeof v==='string'&&candidates.has(v))found.add(v);
   if(key==='participants'&&Array.isArray(v))for(const uid of v)if(candidates.has(uid))found.add(uid);
   if(key==='participants'&&v&&typeof v==='object')for(const uid of Object.keys(v))if(candidates.has(uid))found.add(uid);
   if(v&&typeof v==='object')walk(v,depth+1);
  }
 }
 walk(value,0);
 return found;
}
async function main(){
 const all=[];let cursor;
 do{const page=await auth.listUsers(1000,cursor);all.push(...page.users);cursor=page.pageToken;}while(cursor);
 const flagged=all.filter(u=>kind(u)>=0), plain=flagged.filter(u=>kind(u)===0).length,pers=flagged.filter(u=>kind(u)===1).length;
 if(plain!==452||pers!==452||flagged.length!==904)halt('Fixture count changed');
 for(const u of flagged){
  if(!u.uid||u.email?.toLowerCase()===owner||u.emailVerified||u.phoneNumber||
    (u.providerData||[]).some(p=>p.providerId==='google.com')||protectedRecord(u.customClaims))halt('Protected Firebase Auth identity found');
 }
 const ids=new Set(flagged.map(u=>u.uid)),hold=new Set();
 const profiles=['users','publicProfiles','accounts'];
 const direct=['identityVerifications','buyerKycRecords'];
 const activity=['posts','stores','products','orders','jobs','events','following','conversations','messages','comments','likes','savedPosts','jobApplications','eventRegistrations','reviews','profileVisits'];
 for(const node of [...profiles,...direct,...activity]){
  const snap=await db.ref(node).get(),data=snap.val();
  if(data!==null&&(typeof data!=='object'||Array.isArray(data)))halt('Unexpected database data');
  if(profiles.includes(node)){
   for(const [uid,record] of Object.entries(data||{}))if(ids.has(uid)&&protectedRecord(record))hold.add(uid);
  }else if(direct.includes(node)){
   for(const uid of Object.keys(data||{}))if(ids.has(uid))hold.add(uid);
  }else for(const uid of linked(data,ids))hold.add(uid);
 }
 // Legacy Firestore checks are mandatory, never silently skipped.
 for(const node of ['users','publicProfiles','identityVerifications','buyerKycRecords','posts','stores','products','orders','jobs','events','conversations','messages','comments','likes','reviews','jobApplications','eventRegistrations']){
  const snapshot=await firestore.collection(node).get();
  for(const doc of snapshot.docs){
   if(ids.has(doc.id)&&node!=='users'&&node!=='publicProfiles')hold.add(doc.id);
   if(ids.has(doc.id)&&protectedRecord(doc.data()))hold.add(doc.id);
   if(node!=='users'&&node!=='publicProfiles')for(const uid of linked(doc.data(),ids))hold.add(uid);
  }
 }
 const eligible=flagged.filter(u=>!hold.has(u.uid));
 console.log('TARGET_PLAIN='+plain+' TARGET_PERS='+pers+' HELD_FOR_PROTECTION='+hold.size+' ELIGIBLE='+eligible.length);
 if(hold.size!==1||eligible.length!==903)halt('Eligible count changed');
 fs.writeFileSync(out,eligible.map(u=>u.uid).join('\n')+'\n',{mode:0o600,flag:'wx'});
 console.log('PRIVATE_UID_SELECTION_READY=true. Nothing deleted by this step.');
}
main().then(()=>process.stdout.write('PREPARE_COMPLETE\n',()=>process.exit(0)))
.catch(()=>halt('Private record verification incomplete'));
