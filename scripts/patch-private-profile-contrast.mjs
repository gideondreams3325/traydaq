import fs from 'node:fs';
import path from 'node:path';
// This public patch applies only on the temporary private Android build runner.
// No private source, account records, or credentials are exported.
const css = "/* Profile controls: direct source selectors; permanent white, green and gold theme. */\n.sf-profile-header-card .text-green-400,\n.sf-profile-header-card span:has(> .sf-online) {\n  color:#135b36 !important;\n  -webkit-text-fill-color:#135b36 !important;\n  font-weight:800 !important;\n  opacity:1 !important;\n  text-shadow:none !important;\n}\n.sf-profile-header-card .sf-online {\n  display:inline-block !important;\n  width:10px !important;\n  height:10px !important;\n  flex:0 0 10px !important;\n  border-radius:50% !important;\n  background:#16814a !important;\n  border:1px solid #0d5b34 !important;\n  box-shadow:0 0 0 3px #d6f0dd !important;\n  opacity:1 !important;\n}\n.sf-profile-header-card #profileVisitStoreBtn {\n  background:#f3bd1c !important;\n  background-image:linear-gradient(105deg,#ffce42,#f1bc0b) !important;\n  color:#17291e !important;\n  -webkit-text-fill-color:#17291e !important;\n  border:1px solid #c48f00 !important;\n  font-weight:800 !important;\n  opacity:1 !important;\n  text-shadow:none !important;\n}\n.sf-profile-header-card #profileVisitStoreBtn > span,\n.sf-profile-header-card #profileVisitStoreBtn > .td-profile-store-text {\n  color:#17291e !important;\n  -webkit-text-fill-color:#17291e !important;\n  background:transparent !important;\n  background-color:transparent !important;\n  background-image:none !important;\n  box-shadow:none !important;\n  border:0 !important;\n  padding:0 !important;\n  margin:0 !important;\n  opacity:1 !important;\n  font-weight:800 !important;\n  text-shadow:none !important;\n}\n.sf-profile-header-card #profileVisitStoreBtn:hover { filter:brightness(.97); }\n.sf-profile-header-card #profileVisitStoreBtn:focus-visible {\n  outline:3px solid #155f38 !important;\n  outline-offset:3px !important;\n}\n@media(prefers-reduced-motion:reduce) {\n .sf-profile-header-card #profileVisitStoreBtn {transition:none !important;}\n}";

function replaceOnce(source, before, after, label) {
  const index=source.indexOf(before);
  if(index<0 || source.indexOf(before,index+before.length)!==-1)
    throw Error('TRAYDAQ profile contrast: missing or duplicate '+label);
  return source.slice(0,index)+after+source.slice(index+before.length);
}
export function patchProfileContrast(html) {
  if(typeof html!=='string' || !html.includes('</head>'))
    throw Error('TRAYDAQ profile contrast: expected complete HTML');
  if(html.includes('id="tdProfileContrast2026"') || html.includes('td-profile-store-text'))
    throw Error('TRAYDAQ profile contrast: already installed');

  // The source is known: sfPresenceBadge uses a very pale green utility class.
  // Replace that utility inside the function only, not other badges app-wide.
  const start=html.indexOf('function sfPresenceBadge(u){');
  const end=html.indexOf('/* Profile Audio Preview Controller */',start);
  if(start<0 || end<start || end-start>900)
    throw Error('TRAYDAQ profile contrast: presence markup changed');
  const presence=html.slice(start,end);
  const fixed=replaceOnce(presence,
    "sfIsOnline(u)?'text-green-400':'text-gray-500'",
    "sfIsOnline(u)?'text-green-800 font-bold':'text-gray-500'",
    'presence green text');
  html=html.slice(0,start)+fixed+html.slice(end);

  // Use the real store action button. Never replace the button or its handler.
  if(!html.includes('id="profileVisitStoreBtn"'))
    throw Error('TRAYDAQ profile contrast: real store button missing');
  html=replaceOnce(html,'<span>Visit Store</span>',
    '<span class="td-profile-store-text" style="background:transparent!important;background-image:none!important;color:#17291e!important;-webkit-text-fill-color:#17291e!important">Visit Store</span>',
    'store button label');
  const style='<style id="tdProfileContrast2026">\n'+css+'\n</style>\n';
  return replaceOnce(html,'</head>',style+'</head>','HTML head');
}
if(process.argv[1] && import.meta.url==='file://'+path.resolve(process.argv[1])) {
  const target=path.join(path.resolve(process.argv[2]||'.'),'index.html');
  const result=patchProfileContrast(fs.readFileSync(target,'utf8'));
  fs.writeFileSync(target,result);
  console.log('PASS: high-contrast Online and Visit Store now use real profile source selectors.');
}
