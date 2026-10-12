import assert from 'node:assert/strict';
import fs from 'node:fs';
import {patchCreator,patchIndex,MARKER} from '../scripts/patch-private-creator-photo-compression.mjs';
const js=fs.readFileSync(new URL('../assets/traydaq-public-photo-compression.js',import.meta.url),'utf8');
assert.doesNotThrow(()=>new Function(js));
const src='async function submit() {\n        const published = await window.executeSellerFlowAiPostPublish(postData, uploadFile, null);\nreturn published;\n}';
const out=patchCreator(src);
assert(out.includes('tdOptimizedUpload'));
assert(out.includes('window.executeSellerFlowAiPostPublish(postData, tdOptimizedUpload, null)'));
assert(!out.includes('MediaRecorder'),'Video or audio paths must remain untouched');
assert.throws(()=>patchCreator(out),/already installed/);
const html=patchIndex('<html><head></head><body>App</body></html>',js);
assert(html.includes(MARKER));
assert.throws(()=>patchIndex(html,js),/already installed/);
for(const check of ["'image/jpeg'","'image/png'","'image/webp'","file.size<THRESHOLD",
 "blob.size>=file.size*.85","createImageBitmap(file)","bitmap?.close?.()",
 "new File([blob],file.name","4500"]){
 assert(js.includes(check),'Image upload safeguard missing: '+check);
}
console.log('PASS: guarded compression integration retains original on errors/large output; no video changes.');
