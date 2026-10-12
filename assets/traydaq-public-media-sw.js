/* TRAYDAQ Android public-media cache; never stores personal or signed content. */
'use strict';
const CACHE_NAME = 'td-public-images-20261012-v1';
const CACHE_PREFIX = 'td-public-images-';
const MAX_ENTRIES = 24; // Opaque cross-origin responses use conservative quota.
const revalidated = new Map();
const DAY = 24 * 60 * 60 * 1000;
const PROJECT_HOST = 'vvpwntehstjbccarqqzp.supabase.co';
function eligible(request) {
  if (!request || request.method !== 'GET' || request.destination !== 'image') return false;
  if (request.headers.has('authorization') || request.headers.has('range') ||
      request.headers.has('x-api-key')) return false;
  let url;
  try { url = new URL(request.url); } catch (_) { return false; }
  if (url.protocol !== 'https:' || url.hostname !== PROJECT_HOST ||
      url.search || url.hash) return false;
  // Only explicitly PUBLIC post/photo paths. Never music, IDs, CVs or moderation.
  return /^\/storage\/v1\/object\/public\/traydaq-public-media\/media\/[A-Za-z0-9_-]{1,128}\/(?:posts(?:\/covers)?|products|stores|profiles|avatars|banners|reviews|events|jobs)\/[A-Za-z0-9_-]{10,140}\.(?:jpe?g|png|webp|gif|avif)$/i.test(url.pathname);
}
async function trim(cache) {
  const keys = await cache.keys();
  if (keys.length > MAX_ENTRIES) {
    for (const old of keys.slice(0,keys.length - MAX_ENTRIES)) {
      await cache.delete(old);
    }
  }
}
async function cacheResponse(cache, request, response) {
  if (!response || !(response.ok || response.type === 'opaque')) return;
  try { await cache.put(request,response.clone()); await trim(cache); } catch (_) {}
}
async function handleImage(request, event) {
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(request);
  if (hit) {
    // Refresh at most once daily per SW lifetime, never block first paint.
    const last = revalidated.get(request.url) || 0;
    if (Date.now() - last > DAY) {
      revalidated.set(request.url,Date.now());
      event.waitUntil(fetch(request).then(r=>cacheResponse(cache,request,r)).catch(()=>{}));
    }
    return hit;
  }
  try {
    const result = await fetch(request);
    if (result.ok || result.type === 'opaque') {
      event.waitUntil(cacheResponse(cache,request,result));
    }
    return result;
  } catch (error) {
    // Do not replace a broken media URL with a fake success response.
    throw error;
  }
}
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const names=await caches.keys();
  for(const name of names){
    if(name.startsWith(CACHE_PREFIX)&&name!==CACHE_NAME) await caches.delete(name);
  }
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  if (!eligible(event.request)) return;
  event.respondWith(handleImage(event.request,event));
});
