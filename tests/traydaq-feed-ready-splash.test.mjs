import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {patchFeedGateHtml,patchFeedGateActivity,STARTUP_GATE_MARKER}
  from '../scripts/patch-private-feed-ready-splash.mjs';
const runtime=fs.readFileSync(new URL('../assets/traydaq-feed-ready-splash.js',import.meta.url),'utf8');

test('startup JS detects first decoded media and safe exits',()=>{
  assert.doesNotThrow(()=>new Function(runtime));
  for(const x of ['firstReadyMedia','naturalWidth > 0','readyState >= 2','loadeddata',
    'visibleOtherScreen','MAX_WAIT_MS','bridge.mediaReady()','first-media-ready']) assert.ok(runtime.includes(x),x);
  assert.doesNotMatch(runtime,/document\.querySelectorAll\('\.reel-card'\)/);
  assert.match(runtime,/MAX_WAIT_MS = 11500/);
});
test('picture-only empty feed does not hold Android wheel splash unnecessarily',()=>{
  assert.ok(runtime.includes("!Array.from(feed.querySelectorAll('.reel-card')).some(isVisible)"));
  assert.ok(runtime.includes('no picture posts'));
});
test('HTML runtime installs only once',()=>{
  const html='<html><head></head><body><main id="reelFeed"><article class="reel-card"></article></main></body></html>';
  const patched=patchFeedGateHtml(html,runtime);
  assert.ok(patched.includes('id="'+STARTUP_GATE_MARKER+'"'));
  assert.throws(()=>patchFeedGateHtml(patched,runtime),/already installed/);
  assert.throws(()=>patchFeedGateHtml('<html></html>',runtime),/markup changed/);
});
test('native Android first-frame hold is time bounded and releases from WebView',()=>{
  const java='package com.sellerflow.app;\npublic class MainActivity extends BridgeActivity {\n'+
   '  protected void onCreate(android.os.Bundle savedInstanceState) {\n'+
   '    super.onCreate(savedInstanceState);\n'+
   '    android.webkit.WebView webView = getBridge().getWebView();\n'+
   '                // Native Android Google Sign-In bridge.\n'+
   '    webView.addJavascriptInterface(new Object(){}, "ExistingBridge");\n'+
   '  }\n}\n';
  const patched=patchFeedGateActivity(java);
  assert.match(patched,/SplashScreen\.installSplashScreen\(this\)/);
  assert.ok(patched.indexOf('installSplashScreen(this)')<patched.indexOf('super.onCreate'));
  assert.match(patched,/setKeepOnScreenCondition/);
  assert.match(patched,/11500L/);
  assert.match(patched,/volatile boolean tdFirstMediaReady/);
  assert.match(patched,/TraydaqStartupGate/);
  assert.match(patched,/@android\.webkit\.JavascriptInterface public void mediaReady\(\)/);
  assert.throws(()=>patchFeedGateActivity(patched),/already patched/);
  assert.throws(()=>patchFeedGateActivity('class MainActivity {}'),/onCreate/);
});
