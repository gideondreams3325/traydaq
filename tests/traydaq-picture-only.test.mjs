import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import {patchPictureOnlyHtml,patchPictureOnlyCreator,PICTURE_ONLY_MARKER} from '../scripts/patch-private-picture-only.mjs';
const runtime=fs.readFileSync(new URL('../assets/traydaq-picture-only.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../assets/traydaq-picture-only.css',import.meta.url),'utf8');
const html='<html><head></head><body><div id="reelFeed"></div><script>const isEligibleFeedPost = (p) => { if(isPostRemovedBySecurity(p)) return false; if (p.privacy === "private") return false; return true; }; window.isEligibleFeedPost = isEligibleFeedPost;</script></body></html>';
const creator='async function submit(){const postData={mediaType:"image"};const tdOptimizedUpload=null;\n        const published = await window.executeSellerFlowAiPostPublish(postData, tdOptimizedUpload, null);\n return published;}';
test('mode installs once without removing safety filters',()=>{
 const revised=patchPictureOnlyHtml(html,runtime,css);
 assert(revised.includes(PICTURE_ONLY_MARKER));
 assert(revised.includes('if(isPostRemovedBySecurity(p))'));
 assert(revised.includes('p.privacy === "private"'));
 assert(revised.includes('window.tdPictureOnly2026?.isVideoPost(p)'));
 assert.throws(()=>patchPictureOnlyHtml(revised,runtime,css),/already installed/);
 assert.throws(()=>patchPictureOnlyHtml(html.replace('const isEligibleFeedPost','const replacedPredicate'),runtime,css),/contract changed/);
 const compact=html.replace('const isEligibleFeedPost = (p) => {','const isEligibleFeedPost=(p)=>{');
 assert(patchPictureOnlyHtml(compact,runtime,css).includes(PICTURE_ONLY_MARKER));
 const declaration=html.replace('const isEligibleFeedPost = (p) => {','function isEligibleFeedPost(p) {');
 assert(patchPictureOnlyHtml(declaration,runtime,css).includes(PICTURE_ONLY_MARKER));
});
test('new video publishing fails closed',()=>{
 const revised=patchPictureOnlyCreator(creator);
 assert(revised.indexOf('guardNewPost(')<revised.indexOf('executeSellerFlowAiPostPublish('));
 assert(revised.includes('upload protection is unavailable'));
 assert.throws(()=>patchPictureOnlyCreator(revised),/already patched/);
 assert.throws(()=>patchPictureOnlyCreator('function other(){}'),/contract changed/);
 const plain=creator.replace('tdOptimizedUpload, null','uploadFile, null');
 assert(patchPictureOnlyCreator(plain).includes('guardNewPost(postData, uploadFile)'));
 const compact=creator.replace('        const published = await window.executeSellerFlowAiPostPublish(postData, tdOptimizedUpload, null);',
   '  const published=await window.executeSellerFlowAiPostPublish(postData, tdOptimizedUpload,null);');
 assert(patchPictureOnlyCreator(compact).includes('guardNewPost(postData, tdOptimizedUpload)'));
});
test('pictures accepted, video archived, music audio unaffected',()=>{
 const win={};const doc={readyState:'loading',addEventListener(){}};
 vm.runInNewContext(runtime,{window:win,document:doc,MutationObserver:class{},console});
 const p=win.tdPictureOnly2026;
 assert(p&&p.isVideoPost&&p.guardNewPost);
 assert.equal(p.isVideoPost({mediaType:'image',mediaUrl:'https://e/photo.jpg'}),false);
 assert.equal(p.isVideoPost({mediaType:'video',coverUrl:'https://e/cover.jpg'}),true);
 assert.equal(p.isVideoPost({mediaUrl:'https://e/clip.mp4?token=1'}),true);
 assert.equal(p.isVideoPost({attachments:[{mimeType:'video/webm'}]}),true);
 assert.equal(p.isVideoPost({type:'event',mediaUrl:'https://e/photo.webp'}),false);
 assert.equal(p.isVideoPost({type:'audio',audioUrl:'https://e/song.mp3',coverUrl:'cover.jpg'}),false);
 const picture={type:'image/png'};
 assert.equal(p.guardNewPost({},picture),picture);
 assert.throws(()=>p.guardNewPost({mediaType:'video'},picture),/picture posts only/);
 assert.throws(()=>p.guardNewPost({}, {type:'video/mp4'}),/temporarily disabled/);
 assert.equal(p.guardNewPost({},null),null);
});
test('DOM-only archive does not delete media or interfere with camera',()=>{
 assert(runtime.includes('video.pause()'));
 assert(runtime.includes('if(!picture||!video||/audio'));
 assert(!runtime.includes('firebase.database().ref('));
 assert(css.includes('data-td-picture-only-hidden'));
});
