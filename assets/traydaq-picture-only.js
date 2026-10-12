/* Picture-first Android mode: archive video posts; originals stay in storage. */
(function installTraydaqPictureOnly(){
 'use strict';
 if(window.__tdPictureOnly20261012)return;
 const IMAGE=/^image\/(?:jpeg|png|webp|gif|avif|heic|heif)$/i;
 const VIDEO_MIME=/^video(?:\/|$)/i;
 const VIDEO_URL=/\.(?:mp4|m4v|mov|webm|3gp|ogv|m3u8)(?:[?#]|$)/i;
 const VIDEO_TAG=/^(?:video|video-post|video_post|short-video)$/i;
 const EXCLUDE='.reel-avatar,.reel-actions,.reel-action-group,.reel-disc,.reel-sound,nav,header,footer';
 const PHOTO_ACCEPT='image/jpeg,image/png,image/webp,image/gif,image/avif,image/heic,image/heif';
 const FEEDS='#reelFeed,#followingFeed,#followingFeedList,.following-feed';
 let pending=false;
 function videoValue(v){
   if(typeof v==='string')return VIDEO_MIME.test(v)||VIDEO_URL.test(v)||VIDEO_TAG.test(v);
   if(!v||typeof v!=='object')return false;
   return ['type','kind','mediaType','mimeType','contentType','fileType','url','src','mediaUrl','videoUrl','fileUrl']
     .some(key=>typeof v[key]==='string'&&videoValue(v[key]));
 }
 function isVideoPost(p){
   if(!p||typeof p!=='object')return false;
   if(p.isVideo===true||p.hasVideo===true)return true;
   if(['mediaType','type','kind','contentType','mimeType','fileType','postType','videoUrl','mediaUrl',
       'fileUrl','originalMediaUrl','previewUrl','url','src'].some(key=>videoValue(p[key])))return true;
   return ['media','files','attachments','mediaFiles','mediaItems'].some(key=>{
     const v=p[key];return Array.isArray(v)?v.some(videoValue):videoValue(v);
   });
 }
 function isPicture(file){return !!file&&typeof file.type==='string'&&IMAGE.test(file.type);}
 function guardNewPost(post,file){
   if(isVideoPost(post))throw Error('TRAYDAQ currently supports picture posts only. Your existing videos are saved.');
   if(file!=null&&!isPicture(file))throw Error('Choose a JPG, PNG, WebP, GIF, AVIF or HEIC picture. Video uploads are temporarily disabled.');
   return file;
 }
 function notify(message){
   if(typeof window.toast==='function')window.toast(message,'error',5000);
   else if(typeof window.showToast==='function')window.showToast(message,'error');
   else if(typeof window.alert==='function')window.alert(message);
 }
 function isVideoCard(card){
   for(const video of card.querySelectorAll('video'))if(!video.closest(EXCLUDE))return true;
   const explicit=card.getAttribute('data-media-type')||card.getAttribute('data-post-type')||'';
   if(videoValue(explicit))return true;
   for(const node of card.querySelectorAll('[data-video-url],[data-media-type]')){
     if(node.closest(EXCLUDE))continue;
     if(videoValue(node.getAttribute('data-video-url'))||videoValue(node.getAttribute('data-media-type')))return true;
   }
   return false;
 }
 function hide(card){
   if(card.dataset.tdPictureOnlyHidden==='true')return;
   card.dataset.tdPictureOnlyHidden='true';
   for(const video of card.querySelectorAll('video')){
     if(video.closest(EXCLUDE))continue;
     try{
       video.pause();video.autoplay=false;video.preload='none';
       video.removeAttribute('src');
       for(const source of video.querySelectorAll('source'))source.removeAttribute('src');
       video.load();
     }catch(_){}
   }
 }
 function pruneFeed(){
   pending=false;
   for(const feed of document.querySelectorAll(FEEDS)){
     if(!feed.isConnected)continue;
     const cards=feed.querySelectorAll('.reel-card');
     let visible=0,archived=0;
     for(const card of cards){
       if(card.dataset.tdPictureOnlyHidden==='true'||isVideoCard(card)){hide(card);archived++;}
       else visible++;
     }
     const empty=feed.querySelector(':scope > .td-picture-only-empty');
     if(cards.length>0&&archived>0&&visible===0){
       if(!empty){
         const element=document.createElement('div');
         element.className='td-picture-only-empty';
         element.setAttribute('role','status');
         element.textContent='No picture posts yet. New photos will appear here.';
         feed.appendChild(element);
       }
     } else if(empty)empty.remove();
   }
 }
 function schedule(){
   if(pending)return;
   pending=true;
   const frame=window.requestAnimationFrame||(fn=>window.setTimeout(fn,16));
   frame(pruneFeed);
 }
 function limitPicker(input){
   if(!input||!input.matches?.('input[type="file"]'))return;
   const accept=String(input.getAttribute('accept')||'').toLowerCase();
   const picture=/image\/|\.jpe?g|\.png|\.webp|\.gif|\.avif|\.hei[cf]/.test(accept);
   const video=/video\/|\.mp4|\.webm|\.mov|\.m4v|\.3gp/.test(accept);
   // Identity capture, audio releases and private document pickers remain intact.
   if(!picture||!video||/audio\/|application\/pdf/.test(accept))return;
   input.setAttribute('accept',PHOTO_ACCEPT);
   input.dataset.tdPictureOnlyPicker='true';
 }
 function start(){
   const changes=new MutationObserver(records=>{
     for(const record of records)for(const node of record.addedNodes){
       if(node.nodeType!==1)continue;
       if(node.matches?.('input[type="file"]'))limitPicker(node);
       node.querySelectorAll?.('input[type="file"]').forEach(limitPicker);
     }
     if(records.some(r=>r.target.closest?.(FEEDS)||
       Array.from(r.addedNodes).some(n=>n.nodeType===1&&(n.matches?.(FEEDS)||n.querySelector?.(FEEDS)))))schedule();
   });
   changes.observe(document.body,{childList:true,subtree:true});
   document.querySelectorAll('input[type="file"]').forEach(limitPicker);
   document.addEventListener('change',event=>{
     const input=event.target;
     if(!input?.matches?.('input[type="file"]'))return;
     limitPicker(input);
     if(input.dataset.tdPictureOnlyPicker!=='true')return;
     if(Array.from(input.files||[]).some(file=>!isPicture(file))){
       input.value='';event.stopImmediatePropagation();
       notify('Picture-only mode: choose an image file instead of a video.');
     }
   },true);
   schedule();
   window.addEventListener('pageshow',schedule);
   document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
 }
 const api=Object.freeze({isVideoPost,guardNewPost,isPicture,pruneFeed,schedule});
 window.__tdPictureOnly20261012=api;
 window.tdPictureOnly2026=api;
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
 else start();
})();