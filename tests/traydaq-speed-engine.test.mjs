import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {patchSpeedEngine,SPEED_MARKER} from '../scripts/patch-private-speed-engine.mjs';
const js=readFileSync(new URL('../assets/traydaq-speed-engine.js',import.meta.url),'utf8');
assert.doesNotThrow(()=>new Function(js));
const markup='<!doctype html><html><head></head><body><div id="reelFeed"><div class="reel-card"><video></video></div></div></body></html>';
const output=patchSpeedEngine(markup,js);
assert(output.includes('id="'+SPEED_MARKER+'"'));
assert.equal(output.split(SPEED_MARKER).length,2);
assert.throws(()=>patchSpeedEngine(output,js),/already installed/);
assert.throws(()=>patchSpeedEngine(markup.replace('reelFeed','anything'),js),/Unexpected feed markup/);
assert.throws(()=>patchSpeedEngine(markup,js+'</script>'),/Unsafe inline/);
for(const feature of ['neighbors = constrained ? 1 : 2','el.preload = \'metadata\'',
  'el.preload = \'auto\'','el.pause()','img.loading = \'lazy\'',
  "performance.mark('traydaq-first-feed-media-ready')","connectionOrigins.size >= 3",
  "stats.firstMediaMs", "PerformanceObserver","requestIdleCallback"]) {
    assert(js.includes(feature), 'Speed regression: '+feature);
}
assert(!js.includes('localStorage.setItem('));
assert(!js.includes('fetch('));
assert(!js.includes('caches.open('));
assert(js.includes('pauseCurrent()'), 'Leaving Home must pause its video');
assert(js.includes('refreshBudget()'), 'Data Saver changes must update the preload budget');
assert(js.includes("connection.addEventListener('change'"), 'Network changes must update budgets');
console.log('PASS: safe app patch, preloading cap, startup instrumentation, lazy discovery images, no private data caching.');


// Browser-like Android WebView smoke test. No private data, network or app source.
const docListeners=new Map();
const video={
  tagName:'VIDEO', readyState:3, videoWidth:720, preload:'metadata',
  paused:false, src:'', poster:'', isConnected:true,
  closest(){return null;},
  pause(){this.paused=true;}
};
const card={
  isConnected:true,
  closest(){return null;},
  getBoundingClientRect(){return {width:360,height:620,top:0,bottom:620};},
  querySelectorAll(selector){return selector==='video,img'?[video]:[];}
};
const feed={
  isConnected:true,
  closest(){return null;},
  getBoundingClientRect(){return {width:360,height:620,top:0,bottom:620};},
  querySelectorAll(selector){return selector==='.reel-card'?[card]:[];}
};
const fakeDocument={
  readyState:'complete', hidden:false, visibilityState:'visible',body:{},
  getElementById(id){return id==='reelFeed'?feed:null;},
  querySelectorAll(){return [];},
  addEventListener(name,handler){
    const handlers=docListeners.get(name)||[];
    handlers.push(handler);docListeners.set(name,handlers);
  }
};
const fakePerformance={now(){return 555;},mark(){}};
const fakeWindow={
  performance:fakePerformance,innerHeight:760,innerWidth:360,
  requestAnimationFrame(handler){handler();},
  requestIdleCallback(handler){handler();},
  addEventListener(){}
};
class Observer {
  constructor(callback){this.callback=callback;}
  observe(){}
  disconnect(){}
}
vm.runInNewContext(js,{
  window:fakeWindow,document:fakeDocument,
  navigator:{deviceMemory:2,connection:{effectiveType:'2g',saveData:true}},
  localStorage:{getItem(){return 'true';}},
  performance:fakePerformance,
  IntersectionObserver:Observer,MutationObserver:Observer,
  setTimeout(){return 1;},clearTimeout(){},
  URL,location:{href:'https://localhost/index.html',origin:'https://localhost'}
},{timeout:1500});
assert(fakeWindow.__tdSpeedEngine2026,'Runtime must initialize on Android');
assert.equal(fakeWindow.__tdSpeedEngine2026.stats.nearbyPrefetch,1);
assert.equal(video.preload,'auto','Visible reel must be prepared immediately');
assert.equal(fakeWindow.__tdSpeedEngine2026.stats.firstMediaMs,555,
  'First frame should be measured from navigation start');
fakeDocument.hidden=true;
for(const handler of docListeners.get('visibilitychange')||[]) handler();
assert.equal(video.paused,true,'App background should pause live reel');
assert(fakeWindow.__tdSpeedEngine2026.stats.offscreenPaused>=1,
  'Offscreen pause should be recorded');
console.log('PASS: low-RAM feed prioritizes first video, measures real startup and pauses on background.');
