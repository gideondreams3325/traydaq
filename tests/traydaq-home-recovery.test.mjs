import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {patchHomeRecovery,HOME_RECOVERY_MARKER} from '../scripts/patch-private-home-recovery.mjs';

const runtime=fs.readFileSync(new URL('../assets/traydaq-home-recovery.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../assets/traydaq-home-recovery.css',import.meta.url),'utf8');
test('Android feed recovery runtime is syntactically valid',()=>{
  assert.doesNotThrow(()=>new Function(runtime));
  for(const token of ['aria-live','Retry Home','Reload app','homeTabSelected','window.navigate','window.location.reload','validPost','data-td-home-pending','WAIT_MS = 4800']){
    assert.ok(runtime.includes(token),token);
  }
});
test('recovery safely patches the end of the main app only once',()=>{
  const original='<html><head></head><body><div id="reelFeed"></div></body></html>';
  const patched=patchHomeRecovery(original,runtime,css);
  assert.ok(patched.includes('id="'+HOME_RECOVERY_MARKER+'"'));
  assert.ok(patched.includes('data-td-home-recovery'));
  assert.ok(patched.includes('id="'+HOME_RECOVERY_MARKER+'Style"'));
  assert.ok(patched.includes('.td-home-state-fixed'));
  assert.ok(css.includes('background: #fbfcfa'));
  assert.ok(!runtime.includes('if(feed.querySelector(\'.reel-card\'))return true;'));
  assert.ok(patched.indexOf('id="reelFeed"')<patched.indexOf('<script id="'+HOME_RECOVERY_MARKER+'"'));
  assert.throws(()=>patchHomeRecovery(patched,runtime,css),/already present/);
  assert.throws(()=>patchHomeRecovery('<body></body>',runtime,css),/feed root changed/);
});