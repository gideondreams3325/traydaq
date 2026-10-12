import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {patchHtml,CACHE_MARKER} from '../scripts/patch-private-public-media-cache.mjs';
const get=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');
const sw=get('assets/traydaq-public-media-sw.js');
const register=get('assets/traydaq-public-media-register.js');
assert.doesNotThrow(()=>new vm.Script(sw));
assert.doesNotThrow(()=>new vm.Script(register));
const html=patchHtml('<html><head></head><body><div>app</div></body></html>',register);
assert(html.includes('id="'+CACHE_MARKER+'"'));
assert.throws(()=>patchHtml(html,register),/already installed/);
const hooks={};
vm.runInNewContext(sw,{self:{
  addEventListener(type,cb){hooks[type]=cb;},
  skipWaiting(){return Promise.resolve();},
  clients:{claim(){return Promise.resolve();}}
},URL});
assert(typeof hooks.fetch==='function');
function shouldFetch(url,destination='image',headers={}) {
  const event={request:{url,method:'GET',destination,headers:{has(k){return Object.keys(headers).some(v=>v.toLowerCase()===k);}}},respondWith(){throw Error('eligible: '+url)}};
  try{hooks.fetch(event);return false;}catch(e){return /^eligible:/.test(e.message);}
}
const base='https://vvpwntehstjbccarqqzp.supabase.co/storage/v1/object/public/traydaq-public-media/media/u_123/posts/1234567890.jpg';
assert(shouldFetch(base),'public photos should use caching');
assert(!shouldFetch(base+'?token=abc'),'signed URLs cannot be cached');
assert(!shouldFetch(base,'video'),'videos and partial content cannot be cached');
assert(!shouldFetch(base,'image',{range:'bytes=0-100'}),'range requests not cached');
assert(!shouldFetch(base.replace('/posts/','/ghana-card/')),'ID scans not cached');
assert(!shouldFetch(base.replace('/object/public/','/object/sign/')),'private media not cached');
assert(!shouldFetch(base.replace('vvpwntehstjbccarqqzp.supabase.co','example.com')),'host must be exact');
assert(!shouldFetch(base,'image',{authorization:'Bearer x'}),'authenticated content not cached');
console.log('PASS: app shell patch and strict public-only image cache eligibility.');
