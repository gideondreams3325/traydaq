import fs from 'node:fs';
import path from 'node:path';
// Public Android-builder patch: applies only to temporary private checkout.
// Never copies private source, user data or credentials into the public repository.
function replaceRegion(html,startMarker,endMarker,code,label){
  const start=html.indexOf(startMarker);
  const end=html.indexOf(endMarker,start+startMarker.length);
  if(start<0||end<0||html.indexOf(startMarker,start+startMarker.length)>=0)
    throw new Error('TRAYDAQ confirmations: source anchor changed: '+label);
  return html.slice(0,start)+code+'\n'+html.slice(end);
}
function replaceOnce(source,needle,replacement,label){
  const i=source.indexOf(needle);
  if(i<0||source.indexOf(needle,i+needle.length)>=0)
    throw new Error('TRAYDAQ confirmations: source anchor changed: '+label);
  return source.slice(0,i)+replacement+source.slice(i+needle.length);
}
export function patchSharedConfirmations(html,css,js){
  if(!html.includes('<head>')||!html.includes('</head>')||
     !html.includes('id="customDialogRoot"'))
    throw new Error('TRAYDAQ confirmations: private app HTML layout missing');
  if(!css.includes('#tdDecisionLayer')||!css.includes('.td-decision-card')||
     !js.includes('window.tdShowDecision'))
    throw new Error('TRAYDAQ confirmations: shared assets are incomplete');
  if(html.includes('id="tdConfirmationStyles2026"')||
     html.includes('id="tdConfirmationRuntime2026"'))
    throw new Error('TRAYDAQ confirmations: patch applied twice');
  // Keep existing async customConfirm, customPrompt and customAlert contracts.
  // No global override of synchronous browser APIs: that breaks callers expecting booleans.
  html=replaceRegion(html,'function customAlert(opts = {}){','window.customAlert = customAlert;',
    'function customAlert(opts = {}){\n  return window.tdShowDecision(opts,"alert");\n}\n','shared alert');
  html=replaceRegion(html,'function customConfirm(options = {}){','function customPrompt(options = {}){',
    'function customConfirm(options = {}){\n  return window.tdShowDecision(options,"confirm");\n}\n','shared confirm');
  html=replaceRegion(html,'function customPrompt(options = {}){','window.customConfirm = customConfirm;',
    'function customPrompt(options = {}){\n  return window.tdShowDecision(options,"prompt");\n}\n','shared prompt');

  // Admin Blue Check Hub was the remaining native confirm/prompt flow in public builder.
  // Preserve auth, audit reason, server-side checks and permanent official-account protection.
  const oldCheck='if(!window.confirm((active?"Revoke":"Award")+" official blue check for "+String(u.name||u.username||uid)+"?"))return;';
  const newCheck=[
    'const confirmed=await customConfirm({',
    '  title:active?"Revoke official blue check?":"Grant official blue check?",',
    '  message:active?"This will remove the blue check from this account across TRAYDAQ.":"You are about to award the official blue check badge to this account. This badge will be visible across the app.",',
    '  type:active?"danger":"verification",',
    '  intent:active?"remove":"verify",',
    '  tag:"TRAYDAQ · Official Verification",',
    '  confirmText:active?"Confirm & Revoke Badge":"Confirm & Grant Badge",',
    '  cancelText:"Cancel",',
    '  account:{name:String(u.name||u.username||"User"),email:u.email||"",username:u.username||"",uid,avatar:u.avatarUrl||u.photoURL||""},',
    '  whatHappensNext:active?',
    '    ["The badge will stop appearing on this account","The action will be saved to the admin audit log"]:',
    '    ["The blue check will appear on the profile and posts","A reason will be recorded in the administrative audit log","An authorized administrator can revoke the badge later"]',
    '});',
    'if(!confirmed)return;'
  ].join('\n          ');
  html=replaceOnce(html,oldCheck,newCheck,'blue badge native confirmation');
  const oldReason='const reason=window.prompt("Administrative reason (10–220 characters). This is recorded securely:","");';
  const newReason=[
    'const reason=await customPrompt({',
    '  title:active?"Reason for badge revocation":"Reason for blue-check approval",',
    '  message:"This reason is required for the secure administrator audit log.",',
    '  inputLabel:"Administrative reason",',
    '  placeholder:"Explain why you are making this decision",',
    '  defaultValue:"",',
    '  required:true,minLength:10,maxLength:220,multiline:true,',
    '  confirmText:"Save reason",cancelText:"Cancel",type:active?"danger":"gold",',
    '  tag:"TRAYDAQ · Secure Admin Action"',
    '});'
  ].join('\n          ');
  html=replaceOnce(html,oldReason,newReason,'blue badge native prompt');
  html=replaceOnce(html,'alert("Enter a reason between 10 and 220 characters.");',
    'await customAlert({title:"Invalid reason",message:"Enter a reason between 10 and 220 characters.",type:"warning"});',
    'blue badge reason validation');

  const style='<style id="tdConfirmationStyles2026">\n'+css+'\n</style>\n';
  const runtime='<script id="tdConfirmationRuntime2026">\n'+js.replace(/<\/script/gi,'<\\/script')+'\n</script>\n';
  html=replaceOnce(html,'</head>',style+runtime+'</head>','shared style and runtime injection');
  for(const marker of ['tdConfirmationStyles2026','tdConfirmationRuntime2026',
    'window.tdShowDecision(options,"confirm")','window.tdShowDecision(options,"prompt")',
    'window.tdShowDecision(opts,"alert")','Confirm & Grant Badge','minLength:10,maxLength:220']){
    if(!html.includes(marker))throw new Error('TRAYDAQ confirmations: missing '+marker);
  }
  return html;
}
export function patchAdditionalConfirmationCallers(creatorJs,supportJs){
  if(typeof creatorJs!=='string'||typeof supportJs!=='string')
    throw new Error('TRAYDAQ confirmations: missing Creator Studio or Support Center files');
  creatorJs=replaceOnce(creatorJs,"closeBtn.onclick = () => {",
    "closeBtn.onclick = async () => {",'creator studio close handler');
  creatorJs=replaceOnce(creatorJs,
    "if (confirm('Discard your changes and close creator studio?')) {",
    'if (await window.customConfirm({title:"Discard Creator Studio changes?",message:"You have unsaved changes. Discard your edits and close Creator Studio?",warningText:"Unsaved drawings, text and stickers will be lost.",type:"warning",confirmText:"Discard changes",cancelText:"Keep editing"})) {',
    'creator studio native confirm');
  supportJs=replaceOnce(supportJs,
    "else alert('Sign in before reporting an app issue.');",
    'else if(typeof window.customAlert==="function")void window.customAlert({title:"Sign in required",message:"Sign in before reporting an app issue.",type:"info"});',
    'support report native alert');
  return {creatorJs,supportJs};
}

if(process.argv[1] && import.meta.url==='file://'+process.argv[1]){
  const root=path.resolve(process.argv[2]||'.');
  const cssFile=process.argv[3],jsFile=process.argv[4];
  if(!cssFile||!jsFile)throw new Error('Usage: patch-private-confirmations.mjs APP_ROOT CSS_FILE JS_FILE');
  const file=path.join(root,'index.html');
  const updated=patchSharedConfirmations(fs.readFileSync(file,'utf8'),
    fs.readFileSync(cssFile,'utf8'),fs.readFileSync(jsFile,'utf8'));
  const creatorFile=path.join(root,'creator-studio.js');
  const supportFile=path.join(root,'support-center.js');
  const extra=patchAdditionalConfirmationCallers(fs.readFileSync(creatorFile,'utf8'),fs.readFileSync(supportFile,'utf8'));
  fs.writeFileSync(file,updated,'utf8');
  fs.writeFileSync(creatorFile,extra.creatorJs,'utf8');
  fs.writeFileSync(supportFile,extra.supportJs,'utf8');
  console.log('PASS: TRAYDAQ shared confirm, prompt and alert screens, blue-check audit dialogs and Creator Studio confirmations installed.');
}
