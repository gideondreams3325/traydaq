import fs from 'node:fs';

// Build-only patch for the temporary PRIVATE Traydaq checkout. Never publish private files.
const MARK='tdVerifiedVideoViews2026';
function once(source, before, after, label) {
  if (source.indexOf(before)<0 || source.indexOf(before)!==source.lastIndexOf(before)) {
    throw Error('Video views source changed: '+label);
  }
  return source.replace(before,after);
}
export function patchVideoClient(html) {
  if (html.includes(MARK)) throw Error('Video tracking already installed');
  const script=String.raw\`
<script id="tdVerifiedVideoViews2026">
(function(win,doc){
  'use strict';
  if(win.TraydaqVideoViewTracker) return;
  const states=new WeakMap(), submitted=new Set();
  const valid=id=>/^[A-Za-z0-9_-]{1,128}$/.test(String(id||''));
  const now=()=>Date.now();
  const db=()=>win.firebase&&typeof win.firebase.database==='function'?win.firebase.database():null;
  const uid=()=>win.firebase&&win.firebase.auth&&win.firebase.auth().currentUser?.uid || '';
  const isLive=video=>{
    if (!video || !video.isConnected || video.paused || video.ended || video.seeking) return false;
    if (doc.visibilityState === 'hidden') return false;
    const r=video.getBoundingClientRect?.();
    if(!r||r.width<=0||r.height<=0) return false;
    const visibleWidth=Math.max(0,Math.min(r.right,win.innerWidth)-Math.max(r.left,0));
    const visibleHeight=Math.max(0,Math.min(r.bottom,win.innerHeight)-Math.max(r.top,0));
    return visibleWidth*visibleHeight >= r.width*r.height*.5;
  };
  const postId=video=>{
    const card=video.closest?.('[data-reel-id],[data-profile-post],[data-post-id],[data-sf-open-post]');
    const id=card?.dataset?.reelId||card?.dataset?.profilePost||card?.dataset?.postId||card?.dataset?.sfOpenPost||video.dataset?.postId;
    return valid(id)?id:'';
  };
  const required=video=>{
    const seconds=Number(video.duration);
    return Number.isFinite(seconds)&&seconds>0 ? Math.max(.8,Math.min(3,seconds*.5)) : 3;
  };
  function state(video){
    let value=states.get(video);
    if(!value){value={lastMedia:null,lastWall:null,watched:0,pending:false,done:false};states.set(video,value);}
    return value;
  }
  async function submit(video, record, id, actor){
    const key=actor+'/'+id;
    if(record.done||record.pending||submitted.has(key)) return;
    if(!valid(actor)||!valid(id)) return;
    record.pending=true;
    try{
      const firebaseDb=db();
      if(!firebaseDb) return;
      const post=(await firebaseDb.ref('posts/'+id).once('value')).val();
      if(!post||!win.TraydaqProfilePostMetrics?.isVideo(post) ||
         String(post.sellerId||post.authorId||'')===actor ||
         post.deleted||post.isDeleted||post.hidden||post.safeContent===false||
         ['deleted','removed','hidden','rejected','violation','taken_down'].includes(String(post.status||'').toLowerCase())||
         ['rejected','violation','removed','taken_down'].includes(String(post.reviewStatus||'').toLowerCase())||
         ['private','followers'].includes(String(post.privacy||'public').toLowerCase()))return;
      // ServerValue.TIMESTAMP is enforced by Firebase security rules.
      await firebaseDb.ref('postViews/'+id+'/'+actor).set(win.firebase.database.ServerValue.TIMESTAMP);
      submitted.add(key);
      record.done=true;
    }catch(error){
      // A previous device already recorded this user's view: immutable claims
      // reject duplicates. Do not artificially bump local counters.
      if (String(error?.code||'').includes('PERMISSION_DENIED') ||
          String(error?.message||'').includes('PERMISSION_DENIED')) {
        submitted.add(key); record.done=true;
      }
    }finally{record.pending=false;}
  }
  function update(video){
    if(!video || !valid(postId(video)))return;
    const entry=state(video), time=now(), media=Number(video.currentTime);
    if(!isLive(video)||!Number.isFinite(media)){
      entry.lastMedia=null;entry.lastWall=null;return;
    }
    if(entry.lastMedia!==null&&entry.lastWall!==null){
      const delta=media-entry.lastMedia, elapsed=Math.max(0,(time-entry.lastWall)/1000);
      // Seeking, hidden videos, paused videos and playback-rate tricks do not
      // earn watch duration. Count meaningful playback only.
      const cap=elapsed*Math.min(2,Math.max(.25,Number(video.playbackRate)||1))+.35;
      if(delta>0&&elapsed>0&&elapsed<=5&&delta<=Math.max(.6,cap)){
        entry.watched+=Math.min(delta,cap);
      }else if(delta<0||delta>Math.max(1,cap))entry.watched=0;
    }
    entry.lastMedia=media;entry.lastWall=time;
    if(entry.watched>=required(video)){
      const actor=uid(),id=postId(video);
      if(actor&&valid(actor))void submit(video,entry,id,actor);
    }
  }
  function reset(video){const s=states.get(video);if(s){s.lastMedia=null;s.lastWall=null;}}
  doc.addEventListener('timeupdate',e=>{if(e.target?.tagName==='VIDEO')update(e.target);},true);
  doc.addEventListener('playing',e=>{if(e.target?.tagName==='VIDEO')reset(e.target);},true);
  for(const event of ['pause','waiting','seeking','ended'])doc.addEventListener(event,e=>{
    if(e.target?.tagName==='VIDEO')reset(e.target);
  },true);
  doc.addEventListener('visibilitychange',()=>{
    if(doc.visibilityState==='hidden')doc.querySelectorAll('video').forEach(reset);
  });
  if(win.firebase?.auth)win.firebase.auth().onAuthStateChanged?.(()=>submitted.clear());
  win.TraydaqVideoViewTracker={update,postId,required};
})(window,document);
</script>
\`;
  return once(html,'</body>',script+'\n</body>','install video watch logger');
}
export function patchViewRules(source){
  const doc=JSON.parse(source),r=doc.rules;
  if(!r?.posts?.['$postId'])throw Error('Cannot verify canonical Firebase posts rules');
  if(r.postViews||r.videoViewCounters)throw Error('Video rules already present; reconcile first');
  r.postViews={
    '$postId':{
      '.read':false,
      '$uid':{
        '.write':"auth != null && auth.uid === $uid && !data.exists() && newData.isNumber() && root.child('posts').child($postId).exists() && !root.child('deletedPosts').child($postId).exists() && root.child('posts').child($postId).child('sellerId').val() !== auth.uid && root.child('posts').child($postId).child('authorId').val() !== auth.uid && root.child('posts').child($postId).child('hidden').val() !== true && root.child('posts').child($postId).child('isDeleted').val() !== true && root.child('posts').child($postId).child('safeContent').val() !== false && root.child('posts').child($postId).child('privacy').val() !== 'private' && root.child('posts').child($postId).child('privacy').val() !== 'followers' && root.child('posts').child($postId).child('status').val() !== 'deleted' && root.child('posts').child($postId).child('status').val() !== 'removed' && root.child('posts').child($postId).child('status').val() !== 'rejected' && root.child('posts').child($postId).child('reviewStatus').val() !== 'violation'",
        '.validate':"newData.val() >= now - 300000 && newData.val() <= now + 5000"
      }
    }
  };
  r.videoViewCounters={'.read':false,'.write':false};
  return JSON.stringify(doc,null,2)+'\n';
}
export function patchViewFunction(source){
  if(source.includes('tdCountVideoView'))throw Error('Video view function already exists');
  source=once(source,"import { getAuth } from 'firebase-admin/auth';",
    "import { getAuth } from 'firebase-admin/auth';\nimport { getDatabase } from 'firebase-admin/database';\nimport { onValueCreated } from 'firebase-functions/v2/database';",
    'Cloud Function import');
  const handler=String.raw\`
// Authenticated viewer creates one immutable claim; only the trusted backend
// can aggregate it into the public counter. Server-side deduplication survives
// retries and multiple devices. The per-viewer ledger is never publicly readable.
export async function tdCountVideoViewHandler(event, database) {
  const postId=String(event.params?.postId||''),viewer=String(event.params?.uid||'');
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(postId)||!/^[A-Za-z0-9_-]{1,128}$/.test(viewer))return;
  if(!Number.isFinite(Number(event.data?.val())))return;
  const postRef=database.ref('posts/'+postId);
  const snap=await postRef.get(),post=snap.val();
  if(!post||post.deleted||post.isDeleted||post.hidden||post.safeContent===false||
     ['private','followers'].includes(String(post.privacy||'public').toLowerCase())||
     ['deleted','removed','hidden','rejected','violation','taken_down'].includes(String(post.status||'').toLowerCase())||
     ['rejected','violation','removed','taken_down'].includes(String(post.reviewStatus||'').toLowerCase())||
     viewer===String(post.sellerId||post.authorId||''))return;
  const isVideo=[post.mediaType,post.type,post.postType,post.kind,post.mimeType,
    post.media?.type,post.media?.mimeType].some(v=>/video/i.test(String(v||'')))||
    /\\.(mp4|webm|mov|m4v|ogv)(?:[?#]|$)/i.test(String(post.mediaUrl||post.videoUrl||''));
  if(!isVideo)return;
  const ledger=database.ref('videoViewCounters/'+postId);
  const result=await ledger.transaction(before=>{
    const current=before&&typeof before==='object'?before:null;
    if(current?.seen?.[viewer])return;
    const count=Math.max(0,Number(current?.count??post.viewCount)||0);
    return {count:count+1,seen:{...(current?.seen||{}),[viewer]:true}};
  },undefined,false);
  const counted=Math.max(0,Number(result.snapshot.val()?.count)||0);
  if(!counted)return;
  // Monotone mirror prevents a slower, concurrent trigger overwriting newer
  // totals. Also repairs the mirror on retries after a committed claim.
  await postRef.child('viewCount').transaction(old=>Math.max(Math.max(0,Number(old)||0),counted),undefined,false);
}
export const tdCountVideoView=onValueCreated({
  ref:'/postViews/{postId}/{uid}',
  instance:'sellerflow-efaab-default-rtdb',
  region:'us-central1'
},async event=>tdCountVideoViewHandler(event,getDatabase(app,'https://sellerflow-efaab-default-rtdb.firebaseio.com')));
\`;
  return once(source,"// Android-only HTTP API gateway; locked until endpoint parity is verified.",
    handler+"\n// Android-only HTTP API gateway; locked until endpoint parity is verified.",
    'Firebase views function');
}
export function main(root, mode='app'){
  if(mode==='app'){
    const file=root+'/index.html',before=fs.readFileSync(file,'utf8');
    const after=patchVideoClient(before);
    fs.writeFileSync(file,after);
    console.log('PASS: authenticated video playback logger installed in private Android checkout');
  }else if(mode==='backend'){
    for(const [path,patch] of [['database.rules.json',patchViewRules],['functions/index.js',patchViewFunction]]){
      const file=root+'/'+path,old=fs.readFileSync(file,'utf8'),next=patch(old);
      fs.writeFileSync(file,next);
    }
    console.log('PASS: private Firebase rules and trusted view counter staged');
  }else throw Error('Unknown mode');
}
if(process.argv[1]&&import.meta.url==='file://'+process.argv[1])
  main((process.argv[2]||'.').replace(/\/$/,''),process.argv[3]||'app');
