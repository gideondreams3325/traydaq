// TRAYDAQ comment likes: Firebase Auth stays authoritative.
// Supabase service_role is server-only; viewers never receive database credentials.
import {createRemoteJWKSet,jwtVerify} from 'npm:jose@5.9.6';
const PROJECT='sellerflow-efaab';
const DB='https://sellerflow-efaab-default-rtdb.firebaseio.com';
const JWKS=createRemoteJWKSet(new URL(
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
));
const ORIGINS=new Set(['capacitor://localhost','https://localhost','http://localhost',
  'https://sellerflow-efaab.web.app','https://sellerflow.onrender.com',
  'https://sellerflow-sigma.vercel.app']);
const valid=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
const supabase=()=>String(Deno.env.get('SUPABASE_URL')||'').replace(/\/+$/,'');
const secret=()=>String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'');
function headers(origin){
  const h={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
    'Vary':'Origin','Access-Control-Allow-Methods':'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers':'Authorization,Content-Type,apikey,x-client-info'};
  if(ORIGINS.has(origin))h['Access-Control-Allow-Origin']=origin;
  return h;
}
function json(value,status,origin){
  return new Response(JSON.stringify(value),{status,headers:headers(origin)});
}
async function verify(req){
  const match=/^Bearer\s+(.+)$/i.exec(req.headers.get('authorization')||'');
  if(!match)return '';
  const {payload}=await jwtVerify(match[1],JWKS,{
    issuer:'https://securetoken.google.com/'+PROJECT,
    audience:PROJECT,algorithms:['RS256']});
  return valid(payload.sub)?payload.sub:'';
}
async function readDb(path){
  const url=DB+'/'+path+'.json';
  const response=await fetch(url,{headers:{'Cache-Control':'no-store'},signal:AbortSignal.timeout(9000)});
  if(!response.ok)throw Error('Public Firebase read unavailable');
  return await response.json();
}
function visiblePost(post){
  return !!(post&&typeof post==='object'&&!Array.isArray(post)&&
    !post.deleted&&!post.isDeleted&&!post.isPermanentlyDeleted&&!post.hidden&&
    post.safeContent!==false&&post.liveOnForYou!==false&&
    !['private','followers'].includes(String(post.privacy||'public').toLowerCase())&&
    !['deleted','removed','hidden','violation','rejected','taken_down','pending_review'].includes(
      String(post.status||'').toLowerCase())&&
    !['deleted','removed','hidden','violation','rejected','taken_down'].includes(
      String(post.reviewStatus||'').toLowerCase()));
}
async function fetchPost(postId){
  const [post,deleted]=await Promise.all([
    readDb('posts/'+postId),readDb('deletedPosts/'+postId)
  ]);
  return !deleted&&visiblePost(post)?post:null;
}
function validComment(comment){
  return !!(comment&&typeof comment==='object'&&!comment.deleted&&!comment.isDeleted&&
    !comment.hidden&&!comment.removed&&!comment.isRemoved);
}
async function commentExists(postId,commentId,post){
  const legacy=post.comments;
  if(legacy&&typeof legacy==='object'){
    const match=legacy[commentId]||
      (Array.isArray(legacy)?legacy.find(c=>c&&c.id===commentId):null)||
      Object.values(legacy).find(c=>c&&typeof c==='object'&&c.id===commentId);
    if(validComment(match))return true;
  }
  const remote=await readDb('comments/'+postId+'/'+commentId);
  return validComment(remote);
}
function serviceHeaders(extra={}){
  if(!/^https:\/\//.test(supabase())||!secret())throw Error('Supabase configuration missing');
  return {apikey:secret(),Authorization:'Bearer '+secret(),
    'Cache-Control':'no-store',...extra};
}
async function snapshot(postId,uid){
  const response=await fetch(supabase()+'/rest/v1/rpc/traydaq_comment_like_snapshot',{
    method:'POST',headers:serviceHeaders({'Content-Type':'application/json'}),
    body:JSON.stringify({p_post_id:postId,p_viewer_uid:uid||null}),
    signal:AbortSignal.timeout(10000)
  });
  if(!response.ok)throw Error('Comment like read backend unavailable');
  const data=await response.json();
  return data&&typeof data==='object'&&!Array.isArray(data)?data:{};
}
async function setReaction(postId,commentId,uid,liked){
  const path=supabase()+'/rest/v1/traydaq_comment_likes';
  if(liked){
    const response=await fetch(path+'?on_conflict=post_id%2Ccomment_id%2Cviewer_uid',{
      method:'POST',headers:serviceHeaders({'Content-Type':'application/json',
        Prefer:'resolution=ignore-duplicates,return=minimal'}),
      body:JSON.stringify({post_id:postId,comment_id:commentId,viewer_uid:uid}),
      signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw Error('Comment like insert failed');
  }else{
    const query='?post_id=eq.'+encodeURIComponent(postId)+
      '&comment_id=eq.'+encodeURIComponent(commentId)+'&viewer_uid=eq.'+encodeURIComponent(uid);
    const response=await fetch(path+query,{method:'DELETE',
      headers:serviceHeaders(),signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw Error('Comment like removal failed');
  }
}
Deno.serve(async req=>{
  const origin=req.headers.get('origin')||'';
  if(origin&&!ORIGINS.has(origin))return json({success:false,error:'Origin not allowed'},403,origin);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:headers(origin)});
  const pathname=new URL(req.url).pathname;
  if(req.method==='GET'&&pathname.endsWith('/health')){
    try{
      await snapshot('tdHealthCheckNoUser','');
      return json({success:true,provider:'supabase',commentLikes:'ready'},200,origin);
    }catch(e){console.error('Comment backend health:',String(e?.message||'failure').slice(0,90));
      return json({success:false,commentLikes:'unavailable'},503,origin);}
  }
  if(req.method!=='GET'&&req.method!=='POST')
    return json({success:false,error:'Unsupported method'},405,origin);
  let uid='';
  try{uid=await verify(req);}
  catch{return json({success:false,error:'Invalid Firebase authentication'},401,origin);}
  if(req.method==='POST'&&!uid)
    return json({success:false,error:'Sign in to like comments'},401,origin);
  let postId='',commentId='',liked;
  if(req.method==='GET'){postId=new URL(req.url).searchParams.get('postId')||'';}
  else try{
    if(Number(req.headers.get('content-length')||0)>2048)throw Error('Large body');
    const raw=await req.text();
    if(raw.length>2048)throw Error('Large body');
    const value=JSON.parse(raw);postId=value.postId;commentId=value.commentId;liked=value.liked;
  }catch{return json({success:false,error:'Invalid comment request'},400,origin);}
  if(!valid(postId)||(req.method==='POST'&&(!valid(commentId)||typeof liked!=='boolean')))
    return json({success:false,error:'Invalid comment ID'},400,origin);
  try{
    const post=await fetchPost(postId);
    if(!post)return json({success:false,error:'Post unavailable'},404,origin);
    if(req.method==='POST'){
      if(!await commentExists(postId,commentId,post))
        return json({success:false,error:'Comment no longer exists'},404,origin);
      await setReaction(postId,commentId,uid,liked);
    }
    const likes=await snapshot(postId,uid);
    return json({success:true,postId,likes},200,origin);
  }catch(error){
    console.error('Comment likes unavailable:',String(error?.message||'backend error').slice(0,125));
    return json({success:false,error:'Comment reactions temporarily unavailable'},503,origin);
  }
});
