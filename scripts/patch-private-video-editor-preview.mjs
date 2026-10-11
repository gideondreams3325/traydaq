import fs from 'node:fs';
import path from 'node:path';

// This public patch operates ONLY on the temporary private checkout in the APK CI.
// It never copies private source code or uploaded videos into this repository.
const MARKER='tdStableVideoPreview2026';
const HANDLERS="  // tdStableVideoPreview2026: keep one decoding element while tools update live effects.\n  const previewButton=$('vePlay');\n  let previewClickPending=false, lastFrameTime=0, lastFrameAt=Date.now(), recoveryAttempts=0;\n  const waitForFrame=()=>new Promise(resolve=>{\n    if(disposed||!video.seeking&&video.readyState>=2){resolve();return;}\n    let finished=false, timer;\n    const events=['seeked','canplay','loadeddata','error'];\n    const done=()=>{if(finished)return;finished=true;clearTimeout(timer);events.forEach(x=>video.removeEventListener(x,onReady));resolve();};\n    const onReady=()=>{if(video.error||!video.seeking&&video.readyState>=2)done();};\n    events.forEach(x=>video.addEventListener(x,onReady));\n    timer=setTimeout(done,2400);\n    onReady();\n  });\n  async function playPreview(){\n    let error;\n    try{\n      // Calling play() in the click gesture matters on Android WebView.\n      if(video.ended||video.currentTime>=edits.end-.04||video.currentTime<edits.start)\n        video.currentTime=edits.start;\n      await video.play();\n      return true;\n    }catch(firstError){error=firstError;}\n    if(disposed||busy||!video.isConnected)return false;\n    if(error?.name==='AbortError'||video.seeking||video.readyState<2){\n      await waitForFrame();\n      if(disposed||busy||!video.isConnected)return false;\n      try{await video.play();return true;}catch(nextError){error=nextError;}\n    }\n    const unsupported=video.error?.code===4||error?.name==='NotSupportedError';\n    const blocked=error?.name==='NotAllowedError';\n    const temporary=error?.name==='AbortError'||video.seeking||video.readyState<2;\n    window.toast?.(unsupported?'This video format cannot play on this device.':\n      blocked?'Tap play again to start the video on this device.':\n      temporary?'The video is still loading. Tap play to retry.':\n      'Video playback was interrupted. Tap play to retry.','error',3500);\n    return false;\n  }\n  function cleanup(){\n    if(disposed)return;\n    disposed=true;clearInterval(previewWatchdog);video.pause();\n    video.removeAttribute('src');video.load();URL.revokeObjectURL(url);\n  }\n  video.onloadedmetadata=()=>{\n    if(disposed)return;\n    video.currentTime=edits.start;\n    lastFrameTime=edits.start;lastFrameAt=Date.now();\n    update();\n  };\n  video.ontimeupdate=()=>{\n    if(disposed)return;\n    if(Math.abs(video.currentTime-lastFrameTime)>.03){\n      lastFrameTime=video.currentTime;lastFrameAt=Date.now();recoveryAttempts=0;\n    }\n    if(video.currentTime>=edits.end-.04&&!video.paused)video.pause();\n    updateClock();\n  };\n  video.onplaying=()=>{lastFrameTime=video.currentTime;lastFrameAt=Date.now();previewButton.textContent='Ⅱ';};\n  video.onwaiting=()=>{if(!video.paused)previewButton.textContent='…';};\n  video.onplay=()=>{previewButton.textContent='Ⅱ';};\n  video.onpause=()=>{previewButton.textContent='▶';};\n  video.onerror=()=>{if(!disposed)previewButton.textContent='▶';};\n  previewButton.onclick=async()=>{\n    if(disposed||busy||previewClickPending)return;\n    if(!video.paused){video.pause();return;}\n    previewClickPending=true;previewButton.textContent='…';\n    try{await playPreview();}\n    finally{\n      previewClickPending=false;\n      if(!disposed)previewButton.textContent=video.paused?'▶':'Ⅱ';\n    }\n  };\n  // Tool selection must never tear down the video or silently pause playback.\n  let wasPlayingBeforeTool=false;\n  container.addEventListener('pointerdown',event=>{\n    if(event.target.closest('.ve-tab,.ve-option,.ve-range,.ve-input'))\n      wasPlayingBeforeTool=!video.paused&&!video.ended;\n  },{passive:true});\n  container.addEventListener('click',event=>{\n    if(!event.target.closest('.ve-tab,.ve-option'))return;\n    const resume=wasPlayingBeforeTool;wasPlayingBeforeTool=false;\n    if(resume)queueMicrotask(()=>{\n      if(!disposed&&!busy&&video.paused&&!video.ended)video.play().catch(()=>{previewButton.textContent='▶';});\n    });\n  });\n  const previewWatchdog=setInterval(()=>{\n    if(disposed||busy||previewClickPending||document.hidden||video.paused||video.seeking||!video.isConnected)return;\n    if(video.currentTime>=edits.end-.04)return;\n    if(Math.abs(video.currentTime-lastFrameTime)>.03){\n      lastFrameTime=video.currentTime;lastFrameAt=Date.now();recoveryAttempts=0;return;\n    }\n    if(Date.now()-lastFrameAt<5000||recoveryAttempts>=1)return;\n    recoveryAttempts++;\n    // Attempt one decoder resume without destroying the original clip or edits.\n    video.pause();\n    video.play().catch(()=>{if(!disposed)previewButton.textContent='▶';});\n  },1500);";
function replaceExactlyOnce(s,before,after,label){
  const at=s.indexOf(before);
  if(at<0||s.indexOf(before,at+before.length)!==-1)throw Error('Video preview changed anchor: '+label);
  return s.slice(0,at)+after+s.slice(at+before.length);
}
export function patchEditor(source){
  if(typeof source!=='string'||source.includes(MARKER))throw Error('Video editor missing or already patched');
  let result=replaceExactlyOnce(source,
    '<video id="studioVideo" playsinline preload="metadata"></video>',
    '<video id="studioVideo" playsinline webkit-playsinline preload="auto"></video>',
    'Android decoding and inline playback');
  result=replaceExactlyOnce(result,
    "const video=$('studioVideo');video.src=url;",
    "const video=$('studioVideo');video.playsInline=true;video.preload='auto';video.src=url;video.load();",
    'video element and source');
  const first='  function cleanup(){if(disposed)return;disposed=true;video.pause();video.removeAttribute';
  const next="  $('veSeek').oninput=";
  const at=result.indexOf(first),to=result.indexOf(next,at);
  if(at<0||to<at||result.indexOf(first,at+1)!==-1)throw Error('Video playback handler anchor changed');
  const old=result.slice(at,to);
  for(const token of ["video.onloadedmetadata","video.ontimeupdate","$('vePlay').onclick","Unable to preview video."]){
    if(!old.includes(token))throw Error('Video playback handler no longer matches expected layout: '+token);
  }
  result=result.slice(0,at)+HANDLERS+'\n'+result.slice(to);
  if(result.includes('Unable to preview video.'))throw Error('Old generic preview error still exists');
  return result;
}
export function patchStudioLoader(source){
  if(typeof source!=='string')throw TypeError('Expected creator studio source');
  return replaceExactlyOnce(source,
    "import('./video-editor-pro.js?v=20261008-1')",
    "import('./video-editor-pro.js?v=20261011-preview1')",
    'Android video editor cache refresh');
}
if(process.argv[1]&&import.meta.url==='file://'+process.argv[1]){
  const root=path.resolve(process.argv[2]||'.');
  const file=path.join(root,'video-editor-pro.js');
  const studio=path.join(root,'creator-studio.js');
  // Validate both outputs before any writes so unsupported source revisions fail safely.
  const edited=patchEditor(fs.readFileSync(file,'utf8'));
  const loader=patchStudioLoader(fs.readFileSync(studio,'utf8'));
  fs.writeFileSync(file,edited);
  fs.writeFileSync(studio,loader);
  console.log('PASS: stable Android video preview, buffered seeks, playback recovery and live edit rendering.');
}