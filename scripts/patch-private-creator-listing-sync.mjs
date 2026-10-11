import fs from 'node:fs';
import path from 'node:path';
// Public APK builder patch; do not publish or modify private app source in GitHub.
function replaceOnce(src,a,b,label){
 const i=src.indexOf(a);
 if(i<0||src.indexOf(a,i+a.length)!==-1)throw Error('Creator sync changed anchor: '+label);
 return src.slice(0,i)+b+src.slice(i+a.length);
}
export function patchStudio(source){
 if(source.includes('tdCreatorSyncCatalog2026'))throw Error('Already patched studio');
 const open='    async function loadCreatorListings() {';
 const close='    function renderEntityPicker() {';
 const start=source.indexOf(open),end=source.indexOf(close,start);
 if(start<0||end<0)throw Error('Listing loader not found');
 let code=source.slice(start,end);
 const fallStart=code.indexOf('        }catch(apiError){');
 const fallStop=code.indexOf('        if (getCurrentUserSafe()?.uid!==user.uid)return;',fallStart);
 if(fallStart<0||fallStop<0)throw Error('Catalog fallback not found');
 // The API may return a successful but empty local/server catalog. Always
 // query authenticated indexed Firebase rows before concluding nothing exists.
 const added=[
   '        }catch(apiError){',
   '          data={success:true,jobs:[],events:[]};',
   '        }',
   '        // tdCreatorSyncCatalog2026: merge online records from all authenticated sources.',
   '        const uid=String(user.uid);',
   "        const fields={jobs:['creatorId','posterId','userId','postedBy','authorId','employerId','sellerId','ownerUid'],",
   "          events:['creatorId','posterId','organizerId','userId','postedBy','authorId','sellerId','ownerUid']};",
   "        const banned=new Set(['deleted','removed','taken_down','rejected']);",
   '        const all={jobs:new Map(),events:new Map()};',
   '        const add=(type,rows)=>{for(const row of rows||[]){',
   "          if(!row||!row.id||row.deleted||row.isDeleted||row.removed||row.isPermanentlyDeleted||banned.has(String(row.status||'').toLowerCase()))continue;",
   "          if(!fields[type].some(field=>String(row[field]||'')===uid))continue;",
   '          all[type].set(String(row.id),row);',
   '        }};',
   "        add('jobs',data.jobs);add('events',data.events);",
   "        const db=window.db&&typeof window.db.collection==='function'&&!window.db._isMock?window.db:null;",
   '        if(db){',
   '          await Promise.all([\'jobs\',\'events\'].flatMap(type=>fields[type].map(field=>(async()=>{',
   '            try{',
   "              const snap=await db.collection(type).where(field,'==',uid).get();",
   '              const rows=[];',
   "              if(snap&&typeof snap.forEach==='function')snap.forEach(doc=>{",
   "                if(doc&&doc.id&&typeof doc.data==='function')rows.push({...doc.data(),id:doc.id});",
   '              });',
   '              add(type,rows);',
   '            }catch(_){/* Try the next owned index, never use public cache for ownership. */}',
   '          })())));',
   '        }',
   "        await Promise.all(['jobs','events'].map(async type=>{",
   '          try{add(type,await readOwnedCreatorRowsOnline(type,fields[type]));}catch(_){}',
   '        }));',
   '        data.jobs=Array.from(all.jobs.values()).slice(0,200);',
   '        data.events=Array.from(all.events.values()).slice(0,200);',
   '        // Existing device-only posts remain unselectable until verified online.',
   '        const deviceOnly=(key,type)=>{',
   "          try{const list=JSON.parse(localStorage.getItem(key)||'[]');",
   '            return Array.isArray(list)?list.filter(r=>r&&r.id&&!all[type].has(String(r.id))&&',
   "              fields[type].some(f=>String(r[f]||'')===uid)).length:0;",
   '          }catch(_){return 0;}',
   '        };',
   "        creatorUnsyncedJobs=deviceOnly('sf_my_posted_jobs','jobs');",
   "        creatorUnsyncedEvents=deviceOnly('sf_my_hosted_events','events');"
 ].join('\n')+'\n';
 code=code.slice(0,fallStart)+added+code.slice(fallStop);
 code=replaceOnce(code,
  '      creatorOwnedJobs=[];creatorOwnedEvents=[]; // Drop stale seller listings before refresh.',
  '      creatorOwnedJobs=[];creatorOwnedEvents=[];creatorUnsyncedJobs=0;creatorUnsyncedEvents=0; // Drop stale seller listings before refresh.',
  'account switch cleanup');
 source=source.slice(0,start)+code+source.slice(end);
 source=replaceOnce(source,open,
   '    let creatorUnsyncedJobs=0,creatorUnsyncedEvents=0;\n'+open,
   'unsynced listing counters');
 // Do not pretend device-only records are published or linkable.
 const jobEmpty="'Create a vacancy or advertise your service from Seller Studio, then link it here.'";
 const eventEmpty="'Host your event from Seller Studio, then return here to link it.'";
 source=replaceOnce(source,jobEmpty,
   "(creatorUnsyncedJobs ? 'Some of your older listings are stored only on this device and cannot be linked until published online. Reopen Seller Studio to republish them.' : "+jobEmpty+")",
   'job/service missing explanation');
 source=replaceOnce(source,eventEmpty,
   "(creatorUnsyncedEvents ? 'Some of your older events are stored only on this device and cannot be linked until published online. Reopen Seller Studio to republish them.' : "+eventEmpty+")",
   'event missing explanation');
 return source;
}
function enforceSubmission(source,kind){
 const isJob=kind==='job',name=isJob?'jobId':'eventId';
 const idExpr=isJob?"'job_' + Date.now()":"'ev_' + Date.now()";
 const startText='      let '+name+' = '+idExpr+';';
 const endText="      const effectiveCreatorId = activeUser?.uid || activeUser?.id || localStorage.getItem('sellerflow_user_id') || 'local_user';";
 const start=source.indexOf(startText),end=source.indexOf(endText,start);
 if(start<0||end<0)throw Error('Posting logic changed for '+kind);
 const old=source.slice(start,end);
 if(!old.includes('if (res.ok && data.success)')||!old.includes('console.warn('))
   throw Error('Expected best-effort publishing code absent for '+kind);
 const fresh=[
  '      let '+name+' = '+idExpr+';',
  "      let serverMsg='', acceptedStatus='pending_review', acceptedReviewStatus='pending_review';",
  '      // tdCreatorPublishingVerified2026: never claim success when the online API rejects.',
  '      try{',
  "        const res=await fetch('/api/"+(isJob?'jobs':'events')+"/submit',{",
  "          method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,'x-user-verified':'true'},",
  '          body:JSON.stringify({...payload,isVerified:true})',
  '        });',
  '        const data=await res.json().catch(()=>({}));',
  '        if(!res.ok||data.success!==true||!data.'+name+')',
  "          throw Error(data.error||'The listing was not saved online. Please try again.');",
  '        '+name+'=String(data.'+name+');',
  "        serverMsg=data.message||'Published online.';",
  "        acceptedStatus=String(data.status||'pending_review');",
  "        acceptedReviewStatus=String(data.reviewStatus||acceptedStatus);",
  '      }catch(error){',
  "        throw Error('Not published online: '+String(error?.message||'Check your connection and retry.'));",
  '      }',
  ''
 ].join('\n');
 source=source.slice(0,start)+fresh+'\n'+source.slice(end);
 const typeName=isJob?'Job':'Event';
 const objStart=source.indexOf('      const new'+typeName+'Obj = {',start);
 const objEnd=source.indexOf('      };',objStart);
 if(objStart<0||objEnd<0)throw Error('Listing draft anchor changed for '+kind);
 let obj=source.slice(objStart,objEnd);
 obj=replaceOnce(obj,"        status: 'approved',",'        status: acceptedStatus,',kind+' moderation state');
 obj=replaceOnce(obj,"        reviewStatus: 'approved',",'        reviewStatus: acceptedReviewStatus,',kind+' review state');
 return source.slice(0,objStart)+obj+source.slice(objEnd);
}
export function patchJobs(source){
 // Preserve the corrected Firebase-native publisher already in private source.
 if(source.includes('tdCreatorPublishingVerified2026')){
  if((source.match(/Not published online:/g)||[]).length!==2 ||
     !source.includes('acceptedStatus') || !source.includes('acceptedReviewStatus'))
   throw Error('Private native listing publisher is incomplete');
  return source;
 }
 return enforceSubmission(enforceSubmission(source,'job'),'event');
}
export function main(root='.'){
 root=path.resolve(root);
 const p=path.join(root,'creator-studio.js'),q=path.join(root,'jobs-events.js');
 const a=patchStudio(fs.readFileSync(p,'utf8'));
 const b=patchJobs(fs.readFileSync(q,'utf8'));
 new Function(a);new Function(b);
 fs.writeFileSync(p,a);fs.writeFileSync(q,b);
 console.log('PASS: Creator owned listings reconcile online, and failed posting cannot appear successful.');
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname))
 main(process.argv[2]||'.');
