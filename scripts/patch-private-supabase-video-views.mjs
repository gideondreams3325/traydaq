import fs from 'node:fs';
import path from 'node:path';

// Applied only to the temporary private source checkout during public TRAYDAQ Android APK builds.
const marker='tdSupabaseVideoViews2026';
const before=[
  '      // Firebase security rules ensure that only this viewer may create a claim.',
  "      await db.ref('postViews/' + id + '/' + actor).set(win.firebase.database.ServerValue.TIMESTAMP);"
].join('\n');
const replacement=[
  '      // '+marker+': signed Firebase JWT goes to Supabase; the service, not the client, writes counts.',
  '      const signedIn = win.firebase?.auth?.().currentUser;',
  "      if (!signedIn || signedIn.uid !== actor) return;",
  '      const token = await signedIn.getIdToken();',
  "      if (viewer() !== actor) return;",
  "      const receipt = await fetch('https://vvpwntehstjbccarqqzp.supabase.co/functions/v1/traydaq-video-views', {",
  "        method:'POST',",
  "        headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},",
  "        body:JSON.stringify({postId:id}),",
  '        signal:AbortSignal.timeout(15000)',
  '      });',
  '      const response = await receipt.json().catch(()=>({}));',
  "      if (!receipt.ok || response.success !== true) throw Error('Video view syncing is temporarily unavailable');"
].join('\n');
export function patchVideoCounterClient(source){
  if(source.includes(marker))return source;
  const first=source.indexOf(before);
  if(first<0||source.indexOf(before,first+1)>=0)
    throw Error('TRAYDAQ original Firebase video receipt anchor changed: refusing an unverified APK');
  const revised=source.replace(before,replacement);
  if(!revised.includes('TRAYDAQ_VIDEO_VIEWS_2026')||revised.includes("db.ref('postViews/' + id + '/' + actor).set"))
    throw Error('Unverified video tracking code remains in client');
  new Function(revised);
  return revised;
}
export function main(root='.'){
  const file=path.resolve(root,'post-social.js');
  const source=fs.readFileSync(file,'utf8');
  const revised=patchVideoCounterClient(source);
  if(revised===source){console.log('PASS: Supabase video view tracker already installed');return;}
  fs.writeFileSync(file,revised);
  console.log('PASS: TRAYDAQ Android sends authenticated video-watch receipts to Supabase Edge, not Firebase Cloud Functions.');
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname))
  main(process.argv[2]||'.');
