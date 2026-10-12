// TRAYDAQ Media Engine v1 request gateway (not deployed automatically).
// Firebase Auth signs the user; Supabase service_role stays ONLY on the server.
import {createRemoteJWKSet,jwtVerify} from 'jose';

const PROJECT='sellerflow-efaab';
const STORAGE='https://vvpwntehstjbccarqqzp.supabase.co';
const BUCKET='traydaq-public-media';
const VIDEO_PATH=/^media\/([A-Za-z0-9_-]{1,128})\/posts\/([A-Za-z0-9_-]{10,140})\.(mp4|webm|mov|m4v|3gp)$/i;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const ORIGINS=new Set([
 'https://sellerflow-efaab.web.app','https://sellerflow-efaab.firebaseapp.com',
 'http://localhost','https://localhost','capacitor://localhost'
]);
const JWKS=createRemoteJWKSet(new URL(
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
function headers(origin='') {
 const h:Record<string,string>={
  'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin',
  'Access-Control-Allow-Headers':'Authorization,Content-Type,apikey,x-client-info',
  'Access-Control-Allow-Methods':'POST,GET,OPTIONS',
  'X-Content-Type-Options':'nosniff'
 };
 if(ORIGINS.has(origin))h['Access-Control-Allow-Origin']=origin;
 return h;
}
function reply(payload:unknown,status=200,origin='') {
 return new Response(JSON.stringify(payload),{status,headers:headers(origin)});
}
function bearerValue(req:Request) {
 return /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization')||'')?.[1]||'';
}
async function firebaseUid(req:Request) {
 const token=bearerValue(req);
 if(!token)throw Error('AUTH_REQUIRED');
 const {payload}=await jwtVerify(token,JWKS,{
  issuer:'https://securetoken.google.com/'+PROJECT,audience:PROJECT,algorithms:['RS256']
 });
 if(typeof payload.sub!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(payload.sub))
  throw Error('AUTH_INVALID');
 return payload.sub;
}
function restHeaders() {
 const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
 if(!key)throw Error('SERVICE_NOT_CONFIGURED');
 return {apikey:key,Authorization:'Bearer '+key};
}
async function rest(path:string,options:RequestInit={}) {
 const r=await fetch(STORAGE+'/rest/v1/'+path,{
  ...options,headers:{...restHeaders(),...(options.headers||{})},
  signal:AbortSignal.timeout(9000)
 });
 if(!r.ok)throw Error('DB_HTTP_'+r.status);
 return r.status===204?[]:r.json();
}
function urlFor(path:string) {
 if(!/^media\/[A-Za-z0-9_-]{1,128}\/posts\/[A-Za-z0-9_./-]{1,280}$/.test(path)||
    path.includes('..'))throw Error('INVALID_OUTPUT_PATH');
 return STORAGE+'/storage/v1/object/public/'+BUCKET+'/'+path;
}
function publicJob(row:Record<string,unknown>) {
 const result:Record<string,unknown>={
  id:row.id,state:row.state,attempts:row.attempts,createdAt:row.created_at
 };
 if(row.state==='ready'){
  result.playback={
   hlsUrl:urlFor(String(row.hls_path||'')),
   mp4Url:urlFor(String(row.mp4_path||'')),
   posterUrl:row.poster_path?urlFor(String(row.poster_path)):null,
   originalUrl:urlFor(String(row.source_path||''))
  };
 }
 if(row.state==='failed')result.error='Video optimization failed; original media is still available.';
 return result;
}
async function getOwnedJob(uid:string,id:string) {
 const params=new URLSearchParams({
  select:'id,state,attempts,created_at,hls_path,mp4_path,poster_path,source_path',
  id:'eq.'+id,firebase_uid:'eq.'+uid,limit:'1'
 });
 const rows=await rest('traydaq_media_jobs?'+params);
 return Array.isArray(rows)?rows[0]||null:null;
}
async function submit(req:Request,uid:string,origin:string) {
 let raw:unknown;
 try{
  if(Number(req.headers.get('content-length')||0)>2048)throw Error('oversized');
  const body=await req.text();
  if(body.length>2048)throw Error('oversized');
  raw=JSON.parse(body);
 }catch{return reply({success:false,error:'Invalid upload metadata'},400,origin);}
 const input=raw as {sourcePath?:string};
 const sourcePath=String(input?.sourcePath||'');
 const match=VIDEO_PATH.exec(sourcePath);
 if(!match||match[1]!==uid)
  return reply({success:false,error:'Video path is not owned by this account'},403,origin);

 // Detect duplicates BEFORE quota check: re-submitting the same upload is safe.
 const existing=await rest('traydaq_media_jobs?'+new URLSearchParams({
  select:'id,state,attempts,created_at,hls_path,mp4_path,poster_path,source_path',
  source_path:'eq.'+sourcePath,firebase_uid:'eq.'+uid,limit:'1'
 }));
 if(Array.isArray(existing)&&existing.length)
  return reply({success:true,job:publicJob(existing[0])},200,origin);

 // Enforce a basic anti-abuse limit independently of client-side UI.
 const day=new Date(Date.now()-86400000).toISOString();
 const recent=await rest('traydaq_media_jobs?'+new URLSearchParams({
  select:'id',firebase_uid:'eq.'+uid,created_at:'gte.'+day,limit:'21'
 }));
 if(!Array.isArray(recent)||recent.length>=20)
  return reply({success:false,error:'Daily processing allowance reached'},429,origin);
 const queued=await rest('traydaq_media_jobs?'+new URLSearchParams({
  select:'id',firebase_uid:'eq.'+uid,state:'in.(queued,processing)',limit:'5'
 }));
 if(!Array.isArray(queued)||queued.length>=4)
  return reply({success:false,error:'Finish existing video processing first'},429,origin);

 // Only request bytes from our own public storage. No user-controlled URL.
 const head=await fetch(urlFor(sourcePath),{method:'HEAD',signal:AbortSignal.timeout(8000)});
 if(!head.ok)return reply({success:false,error:'Upload original video first'},409,origin);
 const size=Number(head.headers.get('content-length')||0);
 if(!Number.isSafeInteger(size)||size<1024||size>50*1024*1024)
  return reply({success:false,error:'Uploaded video must be 1KB–50MB'},413,origin);
 const kind=String(head.headers.get('content-type')||'').toLowerCase();
 if(!kind.startsWith('video/')&&!kind.includes('octet-stream'))
  return reply({success:false,error:'Original object is not a video'},415,origin);

 const rows=await rest('traydaq_media_jobs?on_conflict=source_path',{
  method:'POST',headers:{
   'Content-Type':'application/json',
   'Prefer':'resolution=ignore-duplicates,return=representation'
  },
  body:JSON.stringify({firebase_uid:uid,source_path:sourcePath})
 });
 if(Array.isArray(rows)&&rows.length)
  return reply({success:true,job:publicJob(rows[0])},202,origin);
 const retry=await rest('traydaq_media_jobs?'+new URLSearchParams({
  select:'id,state,attempts,created_at,hls_path,mp4_path,poster_path,source_path',
  source_path:'eq.'+sourcePath,firebase_uid:'eq.'+uid,limit:'1'
 }));
 if(!Array.isArray(retry)||retry.length!==1)throw Error('FAILED_TO_ENQUEUE');
 return reply({success:true,job:publicJob(retry[0])},200,origin);
}
async function handle(req:Request) {
 const origin=req.headers.get('origin')||'';
 if(origin&&!ORIGINS.has(origin))return reply({success:false,error:'Origin not allowed'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:headers(origin)});
 if(!['GET','POST'].includes(req.method))return reply({success:false,error:'Unsupported method'},405,origin);
 let uid;
 try{uid=await firebaseUid(req);}
 catch{return reply({success:false,error:'Firebase sign-in required'},401,origin);}
 try{
  if(req.method==='POST')return await submit(req,uid,origin);
  const id=new URL(req.url).searchParams.get('id')||'';
  if(!UUID.test(id))return reply({success:false,error:'Invalid job ID'},400,origin);
  const job=await getOwnedJob(uid,id);
  if(!job)return reply({success:false,error:'Job not found'},404,origin);
  return reply({success:true,job:publicJob(job)},200,origin);
 }catch(error){
  console.error('TRAYDAQ media gateway error',String((error as Error)?.message||'').slice(0,120));
  return reply({success:false,error:'Media engine temporarily unavailable'},503,origin);
 }
}
Deno.serve(handle);
