import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {patchHomeRecovery,HOME_RECOVERY_MARKER} from '../scripts/patch-private-home-recovery.mjs';

const runtime=fs.readFileSync(new URL('../assets/traydaq-home-recovery.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../assets/traydaq-home-recovery.css',import.meta.url),'utf8');
test('Home does not display Retry or Reload and automatically retries one feed request',()=>{
  assert.doesNotThrow(()=>new Function(runtime));
  assert.ok(runtime.includes('resumeFeedAutomatically'));
  assert.ok(runtime.includes("typeof window.renderFeed === 'function'"));
  assert.ok(runtime.includes("typeof window.navigate === 'function'"));
  assert.ok(runtime.includes('Loading posts…'));
  assert.ok(runtime.includes('AUTO_REFRESH_MS = 8500'));
  for(const forbidden of ['Retry Home','Reload app','Home is taking longer than expected',
    'window.location.reload()', 'td-home-state-fixed','makeButton(']){
    assert.ok(!runtime.includes(forbidden),'Old blocking Home recovery remains: '+forbidden);
  }
});
test('Home indicator is small and non-interactive, not a full-screen takeover',()=>{
  assert.match(css,/pointer-events:\s*none/);
  assert.match(css,/top:\s*12px/);
  assert.match(css,/\.td-home-loading-hint/);
  assert.doesNotMatch(css,/position:\s*fixed/);
  assert.doesNotMatch(css,/\.td-home-state-fixed/);
});
test('Home runtime safely patches app shell only once',()=>{
  const html='<html><head></head><body><div id="reelFeed"></div></body></html>';
  const result=patchHomeRecovery(html,runtime,css);
  assert.ok(result.includes('id="'+HOME_RECOVERY_MARKER+'"'));
  assert.ok(result.includes('id="'+HOME_RECOVERY_MARKER+'Style"'));
  assert.ok(result.includes('td-home-loading-hint'));
  assert.ok(result.indexOf('id="reelFeed"')<result.indexOf('<script id="'+HOME_RECOVERY_MARKER+'"'));
  assert.throws(()=>patchHomeRecovery(result,runtime,css),/already present/);
  assert.throws(()=>patchHomeRecovery('<body></body>',runtime,css),/feed root changed/);
});