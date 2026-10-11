import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

// This script runs only in the private source checkout in the APK build job.
// The public repo never receives private source files, runtime tokens or user data.
const DAMAGED_ROUTE=/\bTRAYDAQ\s+Traydaq\s+Security\s+Team\s*:\s*renderAdmin\b/g;
const ROUTE='admin:renderAdmin';
const scriptTag=/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;

export function validateInlineScripts(html){
  if(typeof html!=='string'||!html.includes('</body>'))throw Error('TRAYDAQ startup: missing HTML app shell.');
  const invalid=[], scripts=[];
  for(const match of html.matchAll(scriptTag)){
    const attrs=match[1]||'', code=match[2]||'';
    if(/\bsrc\s*=/.test(attrs)||!code.trim())continue;
    if(/\btype\s*=\s*["'](?:application\/(?:json|ld\+json)|text\/template)["']/.test(attrs))continue;
    // Main bundle and all installed APK patches are classic scripts.
    // Never execute code, only parse it.
    const kind=/\btype\s*=\s*["']module["']/.test(attrs)?'module':'classic';
    if(kind==='module') {
      throw Error('TRAYDAQ startup: unexpected inline module, update syntax validator');
    }
    const id=(/\bid\s*=\s*["']([^"']+)["']/.exec(attrs)||[])[1]||'inline-'+scripts.length;
    scripts.push(id);
    try {new vm.Script(code,{filename:'bundled-'+id,displayErrors:false});}
    catch(error){invalid.push({id,message:String(error?.message||'syntax error').slice(0,130)});}
  }
  if(!scripts.length)throw Error('TRAYDAQ startup: no executable inline scripts found');
  if(invalid.length)throw Error('TRAYDAQ startup: invalid inline script(s): '+
    invalid.map(x=>x.id+' ('+x.message+')').join('; '));
  return scripts.length;
}

export function repairStartupSyntax(html){
  if(typeof html!=='string')throw Error('TRAYDAQ startup: missing HTML');
  const matches=[...html.matchAll(DAMAGED_ROUTE)];
  const occurrences=matches.length;
  if(occurrences>1)throw Error('TRAYDAQ startup: multiple mutated route keys need inspection');
  // Restore only the executable route map property. Do not modify user-facing
  // team headings, security permissions, roles, API keys or account data.
  if(occurrences===1){
    const context=matches[0].index;
    const left=html.slice(Math.max(0,context-1800),context);
    const right=html.slice(context+matches[0][0].length,context+matches[0][0].length+320);
    if(!/render(Profile|Store|Settings|Cart)/.test(left) ||
       !/^\s*,/.test(right)) throw Error('TRAYDAQ startup: damaged route appears outside approved navigation map');
    html=html.replace(DAMAGED_ROUTE,ROUTE);
  }
  // Other valid source revisions may space or quote their admin map key differently.
  // Parsing every script is the authoritative invariant, not matching one formatting style.
  validateInlineScripts(html);
  return {html,repaired:occurrences===1};
}

export function main(root='.'){
  const file=path.join(path.resolve(root),'index.html');
  const before=fs.readFileSync(file,'utf8');
  const {html,repaired}=repairStartupSyntax(before);
  if(repaired)fs.writeFileSync(file,html,'utf8');
  console.log('PASS: TRAYDAQ Android root route and all '+validateInlineScripts(html)+
    ' inline startup scripts parse. Damaged route '+(repaired?'repaired.':'not present.'));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main(process.argv[2]||'.');
}