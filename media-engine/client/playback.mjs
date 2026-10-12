// Portable TRAYDAQ For You video source selector. Does not require hls.js.
// Clients may attach native HLS/hls.js separately; MP4 always remains usable.
const MEDIA_HOST='vvpwntehstjbccarqqzp.supabase.co';
const MEDIA_BASE='/storage/v1/object/public/traydaq-public-media/media/';

export function safePublicMediaUrl(value) {
  if(typeof value!=='string')return null;
  let url;
  try{url=new URL(value);}catch{return null;}
  if(url.protocol!=='https:'||url.hostname!==MEDIA_HOST||url.port||
     url.username||url.password||url.search||url.hash)return null;
  if(!url.pathname.startsWith(MEDIA_BASE)||url.pathname.includes('..')||
     !/^\/storage\/v1\/object\/public\/traydaq-public-media\/media\/[A-Za-z0-9_-]{1,128}\/posts\/[A-Za-z0-9_./-]+$/.test(url.pathname))
    return null;
  return url.href;
}
export function selectPlayback({playback,originalUrl,nativeHls=false}={}) {
  const original=safePublicMediaUrl(originalUrl)||safePublicMediaUrl(playback?.originalUrl);
  if(!original)return {source:null,type:null,fallback:null,poster:null};
  const mp4=safePublicMediaUrl(playback?.mp4Url);
  const hls=safePublicMediaUrl(playback?.hlsUrl);
  const poster=safePublicMediaUrl(playback?.posterUrl);
  if(nativeHls&&hls&&hls.endsWith('.m3u8'))
    return {source:hls,type:'application/vnd.apple.mpegurl',fallback:mp4||original,poster};
  if(mp4&&mp4.endsWith('.mp4'))
    return {source:mp4,type:'video/mp4',fallback:original,poster};
  return {source:original,type:'video/mp4',fallback:null,poster};
}
// React to a stream failure once; do not retry infinitely or fabricate a 200.
export function attachPlaybackFallback(video,selection) {
  if(!video||!selection?.source)return ()=>{};
  if(selection.poster&&!video.poster)video.poster=selection.poster;
  video.src=selection.source;
  let switched=false;
  function onError() {
    if(switched||!selection.fallback||selection.fallback===video.src)return;
    switched=true;
    video.src=selection.fallback;
    video.load();
  }
  video.addEventListener('error',onError);
  return ()=>video.removeEventListener('error',onError);
}
