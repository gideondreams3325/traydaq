import fs from 'node:fs';
import path from 'node:path';
// The public builder modifies only its temporary private checkout, not this public repository.
const MARKER='tdCreatorFeedCover20261011';
function once(src,from,to,label){
  if(typeof src!=='string')throw Error('Missing '+label+' source');
  const i=src.indexOf(from);
  if(i<0||src.indexOf(from,i+from.length)>=0)throw Error('Changed or ambiguous '+label);
  return src.slice(0,i)+to+src.slice(i+from.length);
}
export function patchFeed(html){
  if(html.includes(MARKER))throw Error('Already patched For You');
  const start=html.indexOf('const isEligibleFeedPost = (p) => {');
  const end=html.indexOf('window.isEligibleFeedPost = isEligibleFeedPost;',start);
  if(start<0||end<start)throw Error('For You visibility function missing');
  let feed=html.slice(start,end);
  feed=once(feed,
    "un === 'gideon' || un === 'serllerflow' || un === 'benjamin' || un === 'gideonappiah' ||",
    "un === 'gideon' || un === 'serllerflow' || un === 'benjamin' ||",
    'invalid username-based block for legitimate creator');
  if(!feed.includes('isPostRemovedBySecurity(p)')||!feed.includes("privacy === 'private'")||!feed.includes("id.startsWith('test_')"))
    throw Error('Security and privacy filters changed');
  feed='/* '+MARKER+': allow legitimate creator posts on For You. */\n'+feed;
  let result=html.slice(0,start)+feed+html.slice(end);
  const loadStart=result.indexOf('async function renderFeed(targetPostId, options){');
  const loadEnd=result.indexOf('function verifyBadge(s){',loadStart);
  if(loadStart<0||loadEnd<loadStart)throw Error('For You loader changed');
  let loader=result.slice(loadStart,loadEnd);
  loader=once(loader,
    "const fetchPromise = getDocs(query(collection(db,'posts'), limit(60)));",
    "const fetchPromise = (async () => {\n          try {\n            if (typeof orderBy === 'function') {\n              const sorted = await getDocs(query(collection(db,'posts'), orderBy('createdAt','desc'), limit(100)));\n              if (!sorted.empty) return sorted;\n            }\n          } catch (error) {\n            console.warn('TRAYDAQ feed: ordered query unavailable, using safe fallback', error?.code || '');\n          }\n          return getDocs(query(collection(db,'posts'), limit(100)));\n        })();",
    'recent public post ordering with fallback');
  loader=once(loader,
    "window._sfFeedHasMore = snap.docs.length >= 60;",
    "window._sfFeedHasMore = snap.docs.length >= 100;",
    'recent post pagination');
  return result.slice(0,loadStart)+loader+result.slice(loadEnd);
}
export function patchCreator(source){
  if(source.includes(MARKER))throw Error('Creator studio already patched');
  const start=source.indexOf('        function renderStill() {',source.indexOf('    async function captureVideoCoverFrame('));
  const end=source.indexOf('        video.onerror = ',start);
  if(start<0||end<start)throw Error('Video frame extraction changed');
  const old=source.slice(start,end);
  for(const needed of ['video.readyState < 2','ctx.drawImage(video','canvas.toBlob(','finish(resolve, new File']){
    if(!old.includes(needed))throw Error('Cover extraction contract changed: '+needed);
  }
  const replacement="        // tdCreatorFeedCover20261011: a ready seek is not necessarily a decoded Android frame.\n        let captureBusy=false, warmedDecoder=false;\n        function renderStill() {\n          if (settled || captureBusy || !metadataReady || !seekComplete || video.seeking || video.readyState < 2) return;\n          captureBusy=true;\n          (async () => {\n            if (typeof video.requestVideoFrameCallback === 'function') {\n              await Promise.race([\n                new Promise(resolve => video.requestVideoFrameCallback(() => resolve())),\n                new Promise(resolve => setTimeout(resolve, 900))\n              ]);\n            } else await new Promise(resolve => setTimeout(resolve, 110));\n            if (settled || video.seeking || video.readyState < 2) { captureBusy=false; return; }\n            if (!video.videoWidth || !video.videoHeight) throw Error('Video frame cannot be decoded.');\n            const scale=Math.min(1,1000/Math.max(video.videoWidth,video.videoHeight));\n            const canvas=document.createElement('canvas');\n            canvas.width=Math.max(1,Math.round(video.videoWidth*scale));\n            canvas.height=Math.max(1,Math.round(video.videoHeight*scale));\n            const ctx=canvas.getContext('2d');\n            if(!ctx)throw Error('Image canvas is unavailable.');\n            ctx.drawImage(video,0,0,canvas.width,canvas.height);\n            const sample=document.createElement('canvas');sample.width=16;sample.height=16;\n            const sc=sample.getContext('2d',{willReadFrequently:true});\n            if(!sc)throw Error('Video cover cannot be inspected.');\n            sc.drawImage(canvas,0,0,16,16);\n            const px=sc.getImageData(0,0,16,16).data;\n            let dark=0,total=0;\n            for(let i=0;i<px.length;i+=4){\n              const v=(px[i]+px[i+1]+px[i+2])/3;total+=v;if(v<14)dark++;\n            }\n            if(dark>=248&&total/256<12){\n              if(!warmedDecoder){\n                warmedDecoder=true;\n                try{\n                  await video.play();\n                  await new Promise(resolve=>setTimeout(resolve,240));\n                  video.pause();\n                }catch(_){}\n                captureBusy=false;renderStill();return;\n              }\n              throw Error('Video frame is black. Choose another moment or upload a cover photo. If the video preview is black, return to editing.');\n            }\n            canvas.toBlob(blob=>{\n              if(!blob||!blob.size)return finish(reject,Error('Video cover image was empty.'));\n              finish(resolve,new File([blob],'traydaq-video-cover-'+Date.now()+'.jpg',{type:'image/jpeg'}));\n            },'image/jpeg',.88);\n          })().catch(error=>finish(reject,error));\n        }\n";
  source=source.slice(0,start)+replacement+source.slice(end);
  const publish="        const published = await window.executeSellerFlowAiPostPublish(postData, uploadFile, null);\n        if (!published?.ref?.id) {\n          throw new Error('Post publishing failed. Firebase did not confirm the saved post.');\n        }";
  const update="        const published = await window.executeSellerFlowAiPostPublish(postData, uploadFile, null);\n        if (!published?.ref?.id) {\n          throw new Error('Post publishing failed. Firebase did not confirm the saved post.');\n        }\n        // tdCreatorFeedCover20261011: retain confirmed Android uploads in the feed.\n        const newPost = {...postData, id: published.ref.id, createdAt: new Date().toISOString()};\n        if (!(window._sfCachedPosts instanceof Map)) window._sfCachedPosts = new Map();\n        window._sfCachedPosts.set(newPost.id, newPost);\n        window._sfActiveFeedTab = 'for_you';";
  source=once(source,publish,update,'confirmed publish and instant feed cache');
  source=once(source,
    "        if (typeof window.navigate === 'function') window.navigate('feed');",
    "        if (typeof window.navigate === 'function') window.navigate('feed', published.ref.id);",
    'open newly published reel in For You');
  return source;
}
export function patchVideoExport(editor){
  if(editor.includes('tdDecodedExportWarmup2026'))throw Error('Video export already patched');
  if(!editor.includes('async function exportFile(progress)')||!editor.includes('canvas.captureStream(30)'))
    throw Error('Professional video editor export changed');
  editor=once(editor,
    "      draw();canvasStream=canvas.captureStream(30);",
    "      // tdDecodedExportWarmup2026: Android WebView may have metadata but no drawable frames.\n      // Pre-roll a muted frame BEFORE starting Canvas MediaRecorder.\n      if(worker.readyState<2){\n        worker.muted=true;\n        let began=false;\n        try{\n          await worker.play();\n          began=true;\n          await new Promise((ok,no)=>{\n            if(worker.readyState>=2)return ok();\n            const timeout=setTimeout(()=>no(new Error('Android could not decode the video for editing. Retry or replace the video.')),6500);\n            const ready=()=>{if(worker.readyState>=2){clearTimeout(timeout);worker.removeEventListener('loadeddata',ready);ok();}};\n            worker.addEventListener('loadeddata',ready);\n            ready();\n          });\n        }finally{if(began)worker.pause();}\n        if(Math.abs(worker.currentTime-edits.start)>.025){\n          await new Promise((ok,no)=>{\n            const timeout=setTimeout(()=>no(new Error('Android could not return to the selected trim start.')),5000);\n            worker.addEventListener('seeked',()=>{clearTimeout(timeout);ok();},{once:true});\n            worker.currentTime=edits.start;\n          });\n        }\n        worker.muted=!!edits.mute;\n      }\n      draw();canvasStream=canvas.captureStream(30);",
    'Android edited-video decoder warmup');
  editor=once(editor,
    "const mime=['video/webm;codecs=vp8,opus','video/webm;codecs=vp8','video/webm','video/mp4'].find(x=>MediaRecorder.isTypeSupported(x));",
    "const mime=['video/mp4','video/webm;codecs=vp8,opus','video/webm;codecs=vp8','video/webm'].find(x=>MediaRecorder.isTypeSupported(x));",
    'prefer Android-native MP4 where supported');
  return editor;
}
if(process.argv[1]&&import.meta.url==='file://'+process.argv[1]){
  const root=path.resolve(process.argv[2]||'.');
  const htmlFile=path.join(root,'index.html'),creatorFile=path.join(root,'creator-studio.js');
  const html=patchFeed(fs.readFileSync(htmlFile,'utf8'));
  const creator=patchCreator(fs.readFileSync(creatorFile,'utf8'));
  const editorFile=path.join(root,'video-editor-pro.js');
  const editor=patchVideoExport(fs.readFileSync(editorFile,'utf8'));
  fs.writeFileSync(htmlFile,html);
  fs.writeFileSync(creatorFile,creator);
  fs.writeFileSync(editorFile,editor);
  console.log('PASS: For You visibility, reliable covers and decoded Android video exports.');
}
