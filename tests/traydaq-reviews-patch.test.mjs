import assert from 'node:assert/strict';
import fs from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(process.argv[2]||'.');
const {handleCommunityFeedbackRequest}=await import(pathToFileURL(resolve(root,'supabase/functions/sellerflow-api/community-feedback.mjs')).href);
const client=fs.readFileSync(resolve(root,'community-feedback.js'),'utf8');
assert(client.includes('data-sf-reviews-retry'),'Reviews must expose a working Retry action');
assert(client.includes('vacancy|entrepreneur'),'Mobile reviews must use the live backend');

const records={
 jobs:{v1:{id:'v1',creatorId:'employer',listingType:'vacancy',title:'Test job'},
       e1:{id:'e1',creatorId:'owner',listingType:'entrepreneur',title:'Test service'}},
 publicProfiles:{alice:{name:'Alice'},employer:{name:'Employer'},owner:{name:'Owner'}},
 legalAcceptances:{alice:{version:'sellerflow_terms_2026-10-08_v1'},
                   employer:{version:'sellerflow_terms_2026-10-08_v1'}},
 communityFeedback:{},communityModeration:{}
};
const at=p=>p.split('/').reduce((o,k)=>o?.[k],records)??null;
const adminDb={
 readPath:async p=>structuredClone(at(p)),
 setPath:async(p,v)=>{
   const parts=p.split('/');const last=parts.pop();
   const parent=parts.reduce((o,k)=>o[k]??={},records);
   if(v==null)delete parent[last];else parent[last]=structuredClone(v);
 },
 pushPath:async(p,v)=>{await adminDb.setPath(p+'/m_'+Date.now(),v);return 'm_'+Date.now();}
};
const verifyFirebaseUser=async token=>({uid:token,email:'test@example.com',email_verified:true});
const base='https://vvpwntehstjbccarqqzp.supabase.co/functions/v1/sellerflow-api/api/community-feedback/';
async function test(url,method='GET',body,uid,overrides={}){
 const req=new Request(base+url,{method,headers:{...(uid?{Authorization:'Bearer '+uid}:{}),
 ...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 const res=await handleCommunityFeedbackRequest(req,{adminDb,verifyFirebaseUser,...overrides});
 return {status:res.status,payload:await res.json()};
}
let x=await test('vacancy/v1/reviews');
assert.equal(x.status,200);assert.equal(x.payload.count,0);
x=await test('entrepreneur/v1/reviews');assert.equal(x.status,404,'listing kind enforced');
x=await test('vacancy/v1/reviews','POST',{rating:5,text:'Good information'});
assert.equal(x.status,401,'review write requires Firebase ID token');
x=await test('vacancy/v1/reviews','POST',{rating:5,text:'Good information'},'employer');
assert.equal(x.status,403,'listing owner cannot self-review');
x=await test('vacancy/v1/reviews','POST',{rating:0,text:'Good information'},'alice');
assert.equal(x.status,400,'rating validated');
x=await test('vacancy/v1/reviews','POST',{rating:4,text:'A genuine review of this vacancy'},'alice');
assert.equal(x.status,200,'valid reviews save through admin API');
x=await test('vacancy/v1/reviews');assert.equal(x.payload.count,1);assert.equal(x.payload.average,4);
x=await test('vacancy/v1/reviews','POST',{rating:5,text:'Updated details of vacancy'},'alice');
assert.equal(x.status,200);assert.equal(x.payload.updated,true);
x=await test('vacancy/v1/reviews');assert.equal(x.payload.count,1);assert.equal(x.payload.average,5);
assert.equal(at('communityFeedback/vacancy/v1/reviews/alice').reviewerName,'Alice');
records.communityFeedback.vacancy.v1.reviews.alice.hidden=true;
x=await test('vacancy/v1/reviews','POST',{rating:5,text:'Avoid moderation'},'alice');
assert.equal(x.status,403,'hidden reviews cannot reappear');
x=await test('vacancy/v1/reviews');assert.equal(x.payload.count,0,'hidden reviews excluded');
records.jobs.v1.status='taken_down';
x=await test('vacancy/v1/reviews');assert.equal(x.status,404,'removed jobs hidden');
x=await test('entrepreneur/e1/reviews');assert.equal(x.status,200);
x=await test('entrepreneur/e1/reviews','POST',{rating:4,text:'Reliable entrepreneur'},'alice');
assert.equal(x.status,200);
x=await test('entrepreneur/e1/reviews');assert.equal(x.payload.count,1);
console.log('PASS: Android vacancy and entrepreneur reviews: online reads, authentication, permissions, moderation permanence, statistics, and Retry UI.');
