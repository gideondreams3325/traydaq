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
// A service worker normally has global CacheStorage and fetch APIs. Node's vm
// does not. Simulate both so eligible requests can settle without unhandled
// promise rejections, and verify that the cache is actually bounded.
const hooks={};
const stored=new Map();
let remoteFetches=0;
const testCache={
  async match(request){return stored.get(request.url)||undefined;},
  async keys(){return Array.from(stored.keys(),url=>({url}));},
  async put(request,response){stored.set(request.url,response);},
  async delete(request){return stored.delete(request.url);}
};
const caches={
  async open(){return testCache;},
  async keys(){return [];},
  async delete(){return true;}
};
const fetch=async()=>{
  remoteFetches++;
  return {ok:true,status:200,type:'basic',clone(){return this;}};
};
vm.runInNewContext(sw,{self:{
  addEventListener(type,cb){hooks[type]=cb;},
  skipWaiting(){return Promise.resolve();},
  clients:{claim(){return Promise.resolve();}}
},URL,caches,fetch});
assert(typeof hooks.fetch==='function');
async function shouldFetch(url,destination='image',headers={}) {
  const background=[];
  let response=null;
  const event={
    request:{url,method:'GET',destination,headers:{has(k){return Object.keys(headers).some(v=>v.toLowerCase()===k);}}},
    respondWith(promise){response=Promise.resolve(promise);},
    waitUntil(promise){background.push(Promise.resolve(promise));}
  };
  hooks.fetch(event);
  if(!response)return false;
  await response;
  await Promise.all(background);
  return true;
}
const base='https://vvpwntehstjbccarqqzp.supabase.co/storage/v1/object/public/traydaq-public-media/media/u_123/posts/1234567890.jpg';
assert(await shouldFetch(base),'public photos should use caching');
assert(!await shouldFetch(base+'?token=abc'),'signed URLs cannot be cached');
assert(!await shouldFetch(base,'video'),'videos and partial content cannot be cached');
assert(!await shouldFetch(base,'image',{range:'bytes=0-100'}),'range requests not cached');
assert(!await shouldFetch(base.replace('/posts/','/ghana-card/')),'ID scans not cached');
assert(!await shouldFetch(base.replace('/object/public/','/object/sign/')),'private media not cached');
assert(!await shouldFetch(base.replace('vvpwntehstjbccarqqzp.supabase.co','example.com')),'host must be exact');
assert(!await shouldFetch(base,'image',{authorization:'Bearer x'}),'authenticated content not cached');
// Cached images must not cause a second CDN fetch on revisits.
const requestsBeforeRevisit=remoteFetches;
assert(await shouldFetch(base));
assert.equal(remoteFetches,requestsBeforeRevisit,'cached public image was fetched again');
// The worker's LRU-style cap protects low-storage Android devices.
for(let i=0;i<28;i++){
  const key='https://vvpwntehstjbccarqqzp.supabase.co/storage/v1/object/public/traydaq-public-media/media/u_123/posts/'+String(i).padStart(10,'0')+'.jpg';
  assert(await shouldFetch(key));
}
assert(stored.size<=24,'public media cache exceeded 24 objects');
console.log('PASS: image-only eligibility, signed/private media exclusion and bounded service-worker cache.');
