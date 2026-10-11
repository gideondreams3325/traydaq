import assert from 'node:assert/strict';
import vm from 'node:vm';
import {test} from 'node:test';
import {repairStartupSyntax,validateInlineScripts} from '../scripts/patch-private-startup-syntax.mjs';

const make=(route,second='')=>'<html><head></head><body><script>function renderProfile(){};'+
  'function renderStore(){};function renderAdmin(){};'+
  'function navigate(currentPage){const map={profile:renderProfile,store:renderStore,'+
  route+',settings:renderStore};return map[currentPage];}</script>'+
  second+'</body></html>';
test('repairs route-key parse error observed in published APK without changing user-facing branding',()=>{
 const broken=make('TRAYDAQ Traydaq Security Team:renderAdmin',
 '<h1>TRAYDAQ Security Team</h1><script id="other">const greeting="TRAYDAQ Team";</script>');
 assert.throws(()=>validateInlineScripts(broken),/invalid inline script/);
 const {html,repaired}=repairStartupSyntax(broken);
 assert.equal(repaired,true);
 assert.match(html,/admin:renderAdmin/);
 assert.match(html,/<h1>TRAYDAQ Security Team<\/h1>/);
 assert.doesNotThrow(()=>validateInlineScripts(html));
 assert.equal(repairStartupSyntax(html).repaired,false);
});
test('repairs all known Team-name navigation variants',()=>{
  for(const label of ['TRAYDAQ Security Team','Traydaq Security Team','Security Team','TRAYDAQ Team']){
    const source=make(label+':renderAdmin');
    const fixed=repairStartupSyntax(source);
    assert.equal(fixed.repaired,true,label);
    assert.doesNotThrow(()=>validateInlineScripts(fixed.html));
  }
});
test('repairs broken branded DOM selectors without changing team-facing copy',()=>{
  const source=make('admin:renderAdmin',
    '<div data-TRAYDAQ Traydaq Security Team-takedown-reel="post"></div>'+
    '<h1>TRAYDAQ Security Team</h1>'+
    '<script id="feed-selectors">const selector="[data-TRAYDAQ Traydaq Security Team-takedown-reel]";'+
    'document.querySelectorAll(selector);</script>');
  assert.throws(()=>validateInlineScripts(source),/admin data-\* selector/);
  const fixed=repairStartupSyntax(source);
  assert.equal(fixed.repaired,true);
  assert.equal(fixed.selectorRepairs,2);
  assert.match(fixed.html,/data-admin-takedown-reel="post"/);
  assert.match(fixed.html,/\[data-admin-takedown-reel\]/);
  assert.match(fixed.html,/<h1>TRAYDAQ Security Team<\/h1>/);
  assert.doesNotThrow(()=>validateInlineScripts(fixed.html));
  assert.equal(repairStartupSyntax(fixed.html).repaired,false);
});
test('repairs every observed technical team-name variant while preserving other selectors',()=>{
  for(const label of ['TRAYDAQ Security Team','Traydaq Security Team',
    'Security Team','TRAYDAQ Team','TRAYDAQ Traydaq Security Team']){
    const html=make('admin:renderAdmin',
      '<script id="selectors">document.querySelectorAll("[data-'+label+'-takedown-reel]");'+
      'document.querySelectorAll("[data-user-delete-reel]");</script>');
    const fixed=repairStartupSyntax(html);
    assert.equal(fixed.selectorRepairs,1,label);
    assert.match(fixed.html,/\[data-admin-takedown-reel\]/);
    assert.match(fixed.html,/\[data-user-delete-reel\]/);
  }
});
test('rejects other syntax mistakes instead of shipping a blank app',()=>{
 assert.throws(()=>repairStartupSyntax(make('admin:renderAdmin',
 '<script id="bad">const = broken;</script>')),/invalid inline script/);
});
test('keeps role, API path and user-facing copy untouched',()=>{
 const source=make('TRAYDAQ Traydaq Security Team:renderAdmin',
 '<script id="role">const role="admin";const api="/api/admin";const label="TRAYDAQ Security Team";</script>');
 const out=repairStartupSyntax(source).html;
 assert.match(out,/const role="admin"/);
 assert.match(out,/const api="\/api\/admin"/);
 assert.match(out,/const label="TRAYDAQ Security Team"/);
});
