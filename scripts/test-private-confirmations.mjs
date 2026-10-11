import assert from 'node:assert/strict';
import {patchSharedConfirmations} from './traydaq-confirmation-patch.mjs';

const fixture = '<!doctype html><html><head></head><body><div id="customDialogRoot"></div><script>\n'+
 'function customAlert(opts = {}){ oldAlert(); }\nwindow.customAlert = customAlert;\n'+
 'function customConfirm(options = {}){ oldConfirm(); }\n'+
 'function customPrompt(options = {}){ oldPrompt(); }\n'+
 'window.customConfirm = customConfirm;\nwindow.customPrompt = customPrompt;\n'+
 'if(!window.confirm((active?"Revoke":"Award")+" official blue check for "+String(u.name||u.username||uid)+"?"))return;\n'+
 'const reason=window.prompt("Administrative reason (10–220 characters). This is recorded securely:","");\n'+
 'if(reason.trim().length<10||reason.trim().length>220){alert("Enter a reason between 10 and 220 characters.");return;}\n'+
 '</script></body></html>';
const css='#tdDecisionLayer{} .td-decision-card{}';
const js='window.tdShowDecision=function(){};';
const result=patchSharedConfirmations(fixture,css,js);
for(const marker of ['tdConfirmationRuntime2026','tdConfirmationStyles2026',
  'window.tdShowDecision(options,"confirm")','window.tdShowDecision(options,"prompt")',
  'window.tdShowDecision(opts,"alert")','Confirm & Grant Badge',
  'whatHappensNext:active?','account:{name:','minLength:10,maxLength:220']){
  assert.ok(result.includes(marker),'Missing '+marker);
}
assert.ok(!result.includes('window.confirm((active?'));
assert.ok(!result.includes('const reason=window.prompt('));
assert.ok(!result.includes('alert("Enter a reason between 10 and 220 characters.")'));
assert.throws(()=>patchSharedConfirmations(result,css,js),/patch applied twice/);
assert.throws(()=>patchSharedConfirmations(fixture.replace('window.prompt("Administrative reason','window.prompt("Other reason'),css,js),/native prompt/);
console.log('PASS: shared app confirmations, prompts and alerts, badge grant/revoke and drift detection.');
