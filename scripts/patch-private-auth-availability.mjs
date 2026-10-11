import fs from 'node:fs';
// Stops read-only email availability checks from creating temporary Firebase
// Authentication users. Applies only to the checkout used by the public APK
// builder; the private repository is not modified by this script.
export function patchAuthAvailability(source){
  const route="/api/auth/check-availability";
  const routeStart=source.indexOf("app.post('"+route+"'");
  const start=source.indexOf('// 1. Identity Toolkit REST API check',routeStart);
  const end=source.indexOf('// 2. Check Admin Auth',start);
  if(routeStart<0||start<routeStart||end<start||end-start>3500
     ||source.indexOf('// 1. Identity Toolkit REST API check',start+3)!==-1)
    throw Error('Auth availability handler has changed; refusing unsafe patch.');
  const insecure=source.slice(start,end);
  if(!insecure.includes('accounts:signUp')||!insecure.includes('accounts:delete'))
    throw Error('Expected temporary account creation not found.');
  const replacement="// 1. Never create Authentication users merely to check availability.\n"+
    "      // The Admin getUserByEmail read below is the authoritative, read-only\n"+
    "      // check. Registration itself performs the final uniqueness check.\n\n      ";
  return source.slice(0,start)+replacement+source.slice(end);
}
if(process.argv[1]&&import.meta.url==='file://'+process.argv[1]){
  const root=(process.argv[2]||'.').replace(/\/$/,'');
  const file=root+'/server.js';
  const before=fs.readFileSync(file,'utf8');
  const after=patchAuthAvailability(before);
  if(after===before)throw Error('No auth availability changes.');
  fs.writeFileSync(file,after);
  console.log('PASS: Firebase availability checks no longer create temporary auth users.');
}
