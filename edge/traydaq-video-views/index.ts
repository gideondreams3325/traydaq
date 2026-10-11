import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5.9.6';
import { eligibleVideoPost } from './eligible.mjs';

// A trusted Supabase Edge endpoint, not a Firebase Cloud Function.
// Firebase Authentication and RTDB stay in place; the unique view ledger is private Supabase Postgres.
const FIREBASE_PROJECT='sellerflow-efaab';
const DATABASE='https://sellerflow-efaab-default-rtdb.firebaseio.com';
const JWKS=createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
const ORIGINS=new Set(['capacitor://localhost','https://localhost','http://localhost',
  'https://sellerflow-efaab.web.app','https://sellerflow.onrender.com',
  'https://sellerflow-sigma.vercel.app']);
const validId=value=>typeof value==='string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const enc=new TextEncoder();
const serviceUrl=()=>String(Deno.env.get('SUPABASE_URL')||'').replace(/\/+$/,'');
const serviceKey=()=>String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'');
let cachedAccount=null,accountUntil=0,accessToken='',accessUntil=0;
function cors(origin){
  const h={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin',
    'Access-Control-Allow-Headers':'Authorization,Content-Type,apikey,x-client-info',
    'Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
  if(ORIGINS.has(origin))h['Access-Control-Allow-Origin']=origin;
  return h;
}
function result(body,status,origin){
  return new Response(JSON.stringify(body),{status,headers:cors(origin)});
}
function base64url(bytes){
  let output='';for(const byte of bytes)output+=String.fromCharCode(byte);
  return btoa(output).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
const signedJson=data=>base64url(enc.encode(JSON.stringify(data)));
function checkAccount(x){
  return x&&x.type==='service_account'&&x.project_id===FIREBASE_PROJECT &&
    typeof x.private_key==='string'&&x.private_key.startsWith('-----BEGIN PRIVATE KEY-----')&&
    typeof x.client_email==='string'&&x.client_email.endsWith('@sellerflow-efaab.iam.gserviceaccount.com');
}
async function account(){
  if(cachedAccount&&Date.now()<accountUntil)return cachedAccount;
  const direct=Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');
  if(direct){
    try{const parsed=JSON.parse(direct);if(checkAccount(parsed)){
      cachedAccount=parsed;accountUntil=Date.now()+600000;return parsed;
    }}catch{/* Try existing encrypted Supabase Vault integration. */}
  }
  if(!serviceUrl()||!serviceKey())throw Error('Supabase server configuration unavailable');
  const res=await fetch(serviceUrl()+'/rest/v1/rpc/traydaq_server_firebase_credentials',{
    method:'POST',headers:{apikey:serviceKey(),Authorization:'Bearer '+serviceKey(),
      'Content-Type':'application/json','Cache-Control':'no-store'},body:'{}',
    signal:AbortSignal.timeout(10000)
  });
  if(!res.ok)throw Error('Secure Firebase administrator access unavailable');
  const body=await res.json();
  const parsed=typeof body==='string'?JSON.parse(body):body;
  if(!checkAccount(parsed))throw Error('Trusted Firebase credentials unavailable');
  cachedAccount=parsed;accountUntil=Date.now()+600000;return parsed;
}
async function googleAccessToken(){
  if(accessToken&&Date.now()<accessUntil-60000)return accessToken;
  const service=await account();
  const pem=service.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+/g,'');
  const key=await crypto.subtle.importKey('pkcs8',Uint8Array.from(atob(pem),c=>c.charCodeAt(0)),
    {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const now=Math.floor(Date.now()/1000),head=signedJson({alg:'RS256',typ:'JWT'});
  const body=signedJson({iss:service.client_email,
    scope:'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
    aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
  const signature=base64url(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,enc.encode(head+'.'+body))));
  const response=await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:head+'.'+body+'.'+signature}),
    signal:AbortSignal.timeout(12000)
  });
  if(!response.ok)throw Error('Firebase database service access unavailable');
  const data=await response.json();
  if(!data.access_token)throw Error('Firebase service token unavailable');
  accessToken=data.access_token;accessUntil=Date.now()+Number(data.expires_in||3000)*1000;
  return accessToken;
}
async function firebaseRequest(path,method='GET',body,headers={}){
  const url=new URL(DATABASE+'/'+path+'.json');
  url.searchParams.set('access_token',await googleAccessToken());
  const response=await fetch(url,{method,
    headers:{'Cache-Control':'no-store',...headers,
      ...(body===undefined?{}:{'Content-Type':'application/json'})},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(12000)});
  if(!response.ok&&response.status!==412)throw Error('Firebase database operation unavailable');
  return response;
}
async function firebaseRead(path){
  const response=await firebaseRequest(path);
  return await response.json();
}
async function verifyViewer(req){
  const match=/^Bearer\s+(.+)$/i.exec(req.headers.get('authorization')||'');
  if(!match) return '';
  const {payload}=await jwtVerify(match[1],JWKS,{
    issuer:'https://securetoken.google.com/'+FIREBASE_PROJECT,
    audience:FIREBASE_PROJECT,algorithms:['RS256']
  });
  return validId(payload.sub)?payload.sub:'';
}
function tableUrl(query=''){
  return serviceUrl()+'/rest/v1/traydaq_video_views'+query;
}
function serviceHeaders(extra={}){
  if(!serviceUrl()||!serviceKey())throw Error('Supabase server configuration unavailable');
  return {apikey:serviceKey(),Authorization:'Bearer '+serviceKey(),'Cache-Control':'no-store',...extra};
}
async function recordUnique(postId,viewerUid){
  const res=await fetch(tableUrl('?on_conflict=post_id%2Cviewer_uid'),{
    method:'POST',headers:serviceHeaders({'Content-Type':'application/json',
      Prefer:'resolution=ignore-duplicates,return=minimal'}),
    body:JSON.stringify({post_id:postId,viewer_uid:viewerUid}),signal:AbortSignal.timeout(12000)});
  if(!res.ok)throw Error('Protected view receipt unavailable');
  const filter='?post_id=eq.'+encodeURIComponent(postId)+'&select=post_id&limit=1';
  const counted=await fetch(tableUrl(filter),{method:'HEAD',
    headers:serviceHeaders({Prefer:'count=exact'}),signal:AbortSignal.timeout(12000)});
  if(!counted.ok)throw Error('Authoritative view count unavailable');
  const match=/\/(\d+)$/.exec(counted.headers.get('content-range')||'');
  if(!match)throw Error('Authoritative count response incomplete');
  return Number(match[1]);
}
async function syncPublicCounter(postId,total){
  const path='posts/'+postId+'/viewCount';
  for(let attempt=0;attempt<7;attempt++){
    const before=await firebaseRequest(path,'GET',undefined,{'X-Firebase-ETag':'true'});
    const tag=before.headers.get('etag');
    if(!tag)throw Error('Atomic view counter unavailable');
    const current=Math.max(0,Number(await before.json())||0);
    if(current>=total)return current;
    const next=await firebaseRequest(path,'PUT',total,{'If-Match':tag});
    if(next.status===412)continue;
    return total;
  }
  throw Error('Concurrent video counter update requires retry');
}
async function health(){
  if(!serviceUrl()||!serviceKey())throw Error('Supabase not configured');
  const table=await fetch(tableUrl('?select=post_id&limit=0'),{
    method:'HEAD',headers:serviceHeaders(),signal:AbortSignal.timeout(9000)});
  if(!table.ok)throw Error('Protected table unavailable');
  await firebaseRead('posts/__traydaq_video_view_health__');
}
Deno.serve(async req=>{
  const origin=req.headers.get('origin')||'';
  if(origin&&!ORIGINS.has(origin))return result({success:false,error:'Origin not allowed'},403,origin);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(origin)});
  if(req.method==='GET'&&new URL(req.url).pathname.endsWith('/health')){
    try{await health();return result({success:true,provider:'supabase-edge',counter:'ready'},200,origin);}
    catch(error){console.error('Video view health failed:',String(error?.message||'unavailable'));
      return result({success:false,counter:'unavailable'},503,origin);}
  }
  if(req.method!=='POST')return result({success:false,error:'POST required'},405,origin);
  let uid='';
  try{uid=await verifyViewer(req);}catch{/* The Firebase token is invalid or expired. */}
  if(!uid)return result({success:false,error:'Firebase sign-in required'},401,origin);
  let postId='';
  try{
    if(Number(req.headers.get('content-length')||0)>1024)throw Error('oversized');
    const data=await req.json();postId=data?.postId;
  }catch{return result({success:false,error:'Invalid request'},400,origin);}
  if(!validId(postId))return result({success:false,error:'Invalid post ID'},400,origin);
  try{
    const [post,removed]=await Promise.all([
      firebaseRead('posts/'+postId),firebaseRead('deletedPosts/'+postId)
    ]);
    if(removed||!eligibleVideoPost(post,uid))
      return result({success:false,error:'Video is unavailable for counting'},404,origin);
    const total=await recordUnique(postId,uid);
    const published=await syncPublicCounter(postId,total);
    return result({success:true,viewCount:published},200,origin);
  }catch(error){
    console.error('Traydaq video view service:',String(error?.message||'unavailable').slice(0,130));
    return result({success:false,error:'Video views temporarily unavailable; retry'},503,origin);
  }
});
