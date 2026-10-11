// Traydaq blue-check authority. Public code; NEVER expose Firebase credentials.
import {createRemoteJWKSet, jwtVerify} from 'npm:jose@5.9.6';

const PROJECT = 'sellerflow-efaab';
const ADMIN_EMAIL = 'gideondreams3325@gmail.com';
const DATABASE = 'https://sellerflow-efaab-default-rtdb.firebaseio.com';
const API = 'https://identitytoolkit.googleapis.com/v1/projects/sellerflow-efaab/accounts:lookup';
const ALLOWED_ORIGINS = new Set(['https://sellerflow-efaab.web.app','https://sellerflow-sigma.vercel.app','https://sellerflow.onrender.com','https://localhost','http://localhost','capacitor://localhost']);
const UID = /^[A-Za-z0-9_-]{6,128}$/;
const CACHE = {account:null, token:null, expiresAt:0, official:null, officialExpiresAt:0};
const encoder=new TextEncoder();
const jwks=createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
function headers(origin='') {
 const h = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization, apikey, x-client-info'};
 if(origin&&ALLOWED_ORIGINS.has(origin))h['Access-Control-Allow-Origin']=origin;
 return h;
}
function send(body,status=200,origin=''){return new Response(JSON.stringify(body),{status,headers:headers(origin)});}
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
function signedPayload(v){return b64(encoder.encode(JSON.stringify(v)));}
function usableServiceAccount(value){
 try{
  const obj=typeof value==='string'?JSON.parse(value):value;
  return obj?.type==='service_account'&&obj.project_id===PROJECT &&
    typeof obj.private_key==='string' && obj.private_key.startsWith('-----BEGIN PRIVATE KEY-----') &&
    typeof obj.client_email==='string' && obj.client_email.endsWith('@sellerflow-efaab.iam.gserviceaccount.com') ? obj:null;
 }catch{return null;}
}
async function credential(){
 if(CACHE.account)return CACHE.account;
 const direct=usableServiceAccount(Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON')||'');
 if(direct){CACHE.account=direct;return direct;}
 const url=(Deno.env.get('SUPABASE_URL')||'').replace(/\/+$/,'');
 const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
 if(!url.startsWith('https://')||!key)throw Error('CREDENTIAL_UNAVAILABLE');
 const res=await fetch(url+'/rest/v1/rpc/traydaq_server_firebase_credentials',{
  method:'POST',headers:{'Content-Type':'application/json',apikey:key,Authorization:'Bearer '+key},
  body:'{}',signal:AbortSignal.timeout(8000)
 });
 if(!res.ok)throw Error('CREDENTIAL_UNAVAILABLE');
 const val=usableServiceAccount(await res.json());
 if(!val)throw Error('CREDENTIAL_UNAVAILABLE');
 CACHE.account=val;return val;
}
async function googleAccessToken(){
 if(CACHE.token&&CACHE.expiresAt>Date.now()+60000)return CACHE.token;
 const cred=await credential();
 const pem=cred.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+/g,'');
 const der=Uint8Array.from(atob(pem),ch=>ch.charCodeAt(0));
 const key=await crypto.subtle.importKey('pkcs8',der,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 const now=Math.floor(Date.now()/1000);
 const header=signedPayload({alg:'RS256',typ:'JWT'});
 const payload=signedPayload({iss:cred.client_email,scope:'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/identitytoolkit',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
 const unsigned=header+'.'+payload;
 const signature=b64(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,encoder.encode(unsigned))));
 const result=await fetch('https://oauth2.googleapis.com/token',{
  method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:unsigned+'.'+signature}).toString()
 });
 if(!result.ok)throw Error('GOOGLE_OAUTH_HTTP_'+result.status);
 const json=await result.json();
 if(!json.access_token)throw Error('CREDENTIAL_UNAVAILABLE');
 CACHE.token=json.access_token;CACHE.expiresAt=Date.now()+Number(json.expires_in||3000)*1000;return CACHE.token;
}
async function dbRequest(path,method='GET',body){
 const token=await googleAccessToken();
 const url=new URL(DATABASE+'/'+path+'.json');
 url.searchParams.set('access_token',token);
 const res=await fetch(url.toString(),{
  method,headers:{'Cache-Control':'no-store',...(body===undefined?{}:{'Content-Type':'application/json'})},
  ...(body===undefined?{}:{body:JSON.stringify(body)})
 });
 if(!res.ok)throw Error('RTDB_HTTP_'+res.status);
 return res.json();
}
// Server-side diagnostic categories only: never log user tokens, keys or claims.
function logBadgeFailure(area,error){
 const msg=String(error?.message||'');
 const known=/^(CREDENTIAL_UNAVAILABLE|GOOGLE_OAUTH_HTTP_\d{3}|RTDB_HTTP_\d{3}|OFFICIAL_AUTH_LOOKUP_HTTP_\d{3}|AUTH_LOOKUP_HTTP_\d{3}|OFFICIAL_IDENTITY_AMBIGUOUS)$/;
 console.error('TRAYDAQ_BADGES_'+area+'_'+(known.test(msg)?msg:'UNEXPECTED_'+String(error?.name||'Error').replace(/[^A-Za-z]/g,'').slice(0,24)));
}
async function requireAdmin(req){
 const match=/^Bearer\s+(.+)$/i.exec(req.headers.get('authorization')||'');
 if(!match) return {error:401};
 try {
  const {payload}=await jwtVerify(match[1],jwks,{issuer:'https://securetoken.google.com/'+PROJECT,audience:PROJECT,algorithms:['RS256']});
  if(!payload.sub||typeof payload.sub!=='string')return {error:401};
  if(payload.admin!==true && !(payload.email_verified===true && String(payload.email||'').toLowerCase()===ADMIN_EMAIL))
   return {error:403};
  return {uid:payload.sub};
 }catch{return {error:401};}
}
// Resolve the platform owner using Firebase Authentication as the authority.
// Never trust a display name, profile role, public email field, or user-supplied UID.
async function officialAdminUid(){
 if(CACHE.officialExpiresAt>Date.now())return CACHE.official;
 const token=await googleAccessToken();
 const res=await fetch(API,{
  method:'POST',
  headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','Cache-Control':'no-store'},
  body:JSON.stringify({email:[ADMIN_EMAIL]})
 });
 if(!res.ok)throw Error('OFFICIAL_AUTH_LOOKUP_HTTP_'+res.status);
 const info=await res.json();
 const candidates=(Array.isArray(info.users)?info.users:[]).filter(user=>
  UID.test(String(user?.localId||'')) &&
  String(user?.email||'').trim().toLowerCase()===ADMIN_EMAIL &&
  user?.emailVerified===true && user?.disabled!==true
 );
 if(candidates.length>1)throw Error('OFFICIAL_IDENTITY_AMBIGUOUS');
 const uid=candidates.length===1?String(candidates[0].localId):null;
 CACHE.official=uid;
 CACHE.officialExpiresAt=Date.now()+(uid?300000:30000);
 return uid;
}
async function userExists(uid){
 const token=await googleAccessToken();
 const res=await fetch(API,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify({localId:[uid]})});
 if(!res.ok)throw Error('AUTH_LOOKUP_HTTP_'+res.status);
 const data=await res.json();
 return Array.isArray(data.users)&&data.users.some(u=>u.localId===uid&&!u.disabled);
}
export async function handleBadgeRequest(req){
 const origin=req.headers.get('origin')||'';
 if(origin&&!ALLOWED_ORIGINS.has(origin))return send({success:false,error:'Origin not allowed'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:headers(origin)});
 if(req.method==='GET'){
  // Resolve the official account independently of ordinary grants. A broken RTDB
  // grant read must NEVER hide an authenticated, active official account.
  const [grantResult, officialResult]=await Promise.allSettled([
   dbRequest('blueBadgeGrants'),officialAdminUid()
  ]);
  const grantsAvailable=grantResult.status==='fulfilled';
  const officialAvailable=officialResult.status==='fulfilled';
  if(!grantsAvailable)logBadgeFailure('GRANTS',grantResult.reason);
  if(!officialAvailable)logBadgeFailure('OFFICIAL_AUTH',officialResult.reason);
  if(!grantsAvailable&&!officialAvailable)
   return send({success:false,error:'Blue-check registry temporarily unavailable'},503,origin);
  const rows=grantsAvailable?grantResult.value:null;
  const officialUid=officialAvailable?officialResult.value:null;
  const approved=new Set(Object.entries(rows&&typeof rows==='object'?rows:{})
   .filter(([uid,r])=>UID.test(uid)&&r&&r.status==='active').map(([uid])=>uid));
  // Firebase Auth identity, never a spoofable display name, is the authority.
  if(officialUid)approved.add(officialUid);
  return send({
   success:true,blueVerifiedUids:[...approved],officialAdminUid:officialUid,
   registryOnline:grantsAvailable&&officialAvailable,
   officialLookupOnline:officialAvailable
  },200,origin);
 }
 if(req.method!=='POST')return send({success:false,error:'Method not allowed'},405,origin);
 const admin=await requireAdmin(req);
 if(admin.error)return send({success:false,error:admin.error===401?'Firebase authentication required':'Traydaq Security Team only'},admin.error,origin);
 let body;
 try{
  if(Number(req.headers.get('content-length')||0)>2048)throw Error('Invalid body');
  const raw=await req.text();
  if(raw.length>2048)throw Error('Invalid body');
  body=JSON.parse(raw);
 }catch{return send({success:false,error:'Invalid request'},400,origin);}
 const uid=String(body?.uid||'').trim(),action=String(body?.action||'').trim(),reason=String(body?.reason||'').trim();
 if(!UID.test(uid)||!['grant','revoke'].includes(action)||reason.length<10||reason.length>220)
  return send({success:false,error:'Valid UID, action, and 10–220 character reason are required'},400,origin);
 try{
  // Resolve this identity from the server, before processing any revoke/grant.
  // A forged role, changed username, or even a stale grant cannot remove it.
  const officialUid=await officialAdminUid();
  if(officialUid && uid===officialUid){
   if(action==='revoke')
    return send({success:false,error:'The official Traydaq account has a permanent blue check and cannot be revoked here'},403,origin);
   return send({success:true,unchanged:true,active:true,official:true},200,origin);
  }
  if(!(await userExists(uid)))return send({success:false,error:'Target must be an active Firebase Authentication account'},404,origin);
  const existing=await dbRequest('blueBadgeGrants/'+uid);
  if((existing?.status==='active')===(action==='grant'))return send({success:true,unchanged:true,active:action==='grant'},200,origin);
  const eventId='badge_'+crypto.randomUUID().replace(/-/g,'');
  const stamp=new Date().toISOString();
  const active=action==='grant';
  const data={
   ['blueBadgeGrants/'+uid]:{status:active?'active':'revoked',updatedAt:stamp,updatedBy:admin.uid,reason},
   ['blueBadgeAudit/'+eventId]:{targetUid:uid,action,reason,actorUid:admin.uid,createdAt:stamp},
   ['notifications/'+uid+'/'+eventId]:{
     userId:uid,recipientId:uid,senderName:'Traydaq Security Team',
     title:active?'Blue check approved':'Blue check removed',
     message:active?'The Traydaq Security Team has awarded your profile a blue check.':'Your Traydaq blue check has been removed. Contact support for details.',
     type:'blue_badge',fromAdmin:true,read:false,createdAt:stamp
   }
  };
  // One atomic RTDB multi-location update: badge, audit and user notification.
  await dbRequest('', 'PATCH',data);
  return send({success:true,uid,active},200,origin);
 }catch{return send({success:false,error:'Badge change could not be completed securely'},503,origin);}
}
Deno.serve(handleBadgeRequest);
