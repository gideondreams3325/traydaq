import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {patchPostLinkHtml,patchPostLinkManifest,patchPostLinkActivity}
  from '../scripts/patch-private-post-links.mjs';

const runtime = fs.readFileSync(new URL('../assets/traydaq-post-links.js',import.meta.url),'utf8');
const html = '<!doctype html><html><body><script>async function renderFeed(targetPostId, options){}</script></body></html>';
const manifest = '<?xml version="1.0"?><manifest xmlns:android="http://schemas.android.com/apk/res/android"><application><activity android:name=".MainActivity" android:exported="true" android:launchMode="singleTask"><intent-filter><action android:name="android.intent.action.MAIN"/></intent-filter></activity></application></manifest>';
const java = 'package com.sellerflow.app; public class MainActivity extends BridgeActivity {\n' +
  '  public void onCreate(Bundle state) {\n    webView.addJavascriptInterface(new Object() {}, "Example");\n' +
  '                // Native Android Google Sign-In bridge.\n  }\n}\n';

test('post sharing never exports raw Supabase media as a post URL',()=>{
  assert.match(runtime,/traydaqPostShareUrl/);
  assert.match(runtime,/functions\/v1\/traydaq-open-post/);
  assert.match(runtime,/postId=/);
  assert.match(runtime,/stopImmediatePropagation/);
  assert.match(runtime,/navigator\.share/);
  assert.match(runtime,/uniqueMediaPostId/);
  assert.match(runtime,/_sfCachedPosts/);
  assert.match(runtime,/window\.navigate\('feed', id\)/);
  assert.doesNotThrow(()=>new Function(runtime));
});
test('injects after the existing targeted feed handler without changing that handler',()=>{
  const patched=patchPostLinkHtml(html,runtime);
  assert.match(patched,/tdPostDeepLinks2026/);
  assert.match(patched,/async function renderFeed\(targetPostId, options\)/);
  assert.throws(()=>patchPostLinkHtml(patched,runtime),/already injected/);
  assert.throws(()=>patchPostLinkHtml('<body></body>',runtime),/post-targeted/);
});
test('Android accepts a custom scheme for the exact post, not generic Supabase file links',()=>{
  const patched=patchPostLinkManifest(manifest);
  assert.match(patched,/android:scheme="traydaq"/);
  assert.match(patched,/android:host="post"/);
  assert.match(patched,/android\.intent\.action\.VIEW/);
  assert.match(patched,/android\.intent\.category\.BROWSABLE/);
  assert.equal((patched.match(/TRAYDAQ_POST_DEEP_LINK_2026/g)||[]).length,1);
  assert.throws(()=>patchPostLinkManifest(patched),/already injected/);
});
test('native bridge handles launch and resumed links, validates IDs and escapes JavaScript',()=>{
  const patched=patchPostLinkActivity(java);
  assert.match(patched,/TraydaqPostLinks/);
  assert.match(patched,/onNewIntent\(android\.content\.Intent intent\)/);
  assert.match(patched,/getLastPathSegment/);
  assert.match(patched,/postId\.matches/);
  assert.match(patched,/JSONObject\.quote\(id\)/);
  assert.match(patched,/traydaq-post-link/);
  assert.throws(()=>patchPostLinkActivity(patched),/already installed/);
});
test('extends an existing Android onNewIntent without deleting plugin receivers',()=>{
  const preexisting=java.replace('  public void onCreate', '  @Override\n  protected void onNewIntent(android.content.Intent data) {\n    super.onNewIntent(data);\n    originalPluginReceiver(data);\n  }\n  public void onCreate');
  const patched=patchPostLinkActivity(preexisting);
  assert.match(patched,/originalPluginReceiver\(data\)/);
  assert.match(patched,/tdDispatchPostLink\(data\)/);
  assert.equal((patched.match(/onNewIntent\(android\.content\.Intent data\)/g)||[]).length,1);
});
