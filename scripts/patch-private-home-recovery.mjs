import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const HOME_RECOVERY_MARKER='tdHomeRecovery20261011';

export function patchHomeRecovery(html,runtime,css){
  if(typeof html!=='string'||typeof runtime!=='string'||typeof css!=='string')throw Error('Invalid TRAYDAQ Home inputs');
  if(html.includes(HOME_RECOVERY_MARKER))throw Error('TRAYDAQ Home guard already present');
  if(html.split('</head>').length!==2||html.split('</body>').length!==2||!html.includes('id="reelFeed"'))
    throw Error('TRAYDAQ feed root changed; inspect before patching');
  if(/<\/script/i.test(runtime))throw Error('Unexpected inline script terminator');
  for(const name of ['tdInstallHomeRecovery','homeTabSelected','Retry Home','Reload app','reelFeed']){
    if(!runtime.includes(name))throw Error('TRAYDAQ feed recovery missing '+name);
  }
  if(/<\/style/i.test(css)||!css.includes('.td-home-state'))throw Error('Invalid TRAYDAQ Home styles');
  new Function(runtime);
  return html.replace('</head>', '<style id="'+HOME_RECOVERY_MARKER+'Style">\n'+css+'\n</style>\n</head>')
    .replace('</body>',
    '<script id="'+HOME_RECOVERY_MARKER+'">\n'+runtime+'\n</script>\n</body>');
}

export function main(root='.',file,cssFile){
  if(!file||!cssFile)throw Error('Usage: patch-private-home-recovery.mjs <app-root> <runtime-file> <css-file>');
  const location=path.join(path.resolve(root),'index.html');
  const before=fs.readFileSync(location,'utf8');
  const after=patchHomeRecovery(before,fs.readFileSync(file,'utf8'),fs.readFileSync(cssFile,'utf8'));
  if(after===before)throw Error('TRAYDAQ Home recovery patch did not apply');
  fs.writeFileSync(location,after,'utf8');
  console.log('PASS: Home feed has non-blocking retry/reload recovery instead of an indefinitely blank screen.');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main(process.argv[2]||'.',process.argv[3],process.argv[4]);