import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const MARKER='tdCreatorPhotoCompression20261012';
const CALL='        const published = await window.executeSellerFlowAiPostPublish(postData, uploadFile, null);';
export function patchCreator(source) {
 if(typeof source!=='string')throw TypeError('Creator source required');
 if(source.includes(MARKER))throw Error('Creator photo compression already installed');
 if(source.split(CALL).length!==2)throw Error('Creator post publish call changed');
 return source.replace(CALL,
   '        // '+MARKER+': smaller public photos; never transcode videos here.\n'+
   '        const tdOptimizedUpload = typeof window.traydaqOptimizePublicImage === "function"\n'+
   '          ? await window.traydaqOptimizePublicImage(uploadFile) : uploadFile;\n'+
   '        const published = await window.executeSellerFlowAiPostPublish(postData, tdOptimizedUpload, null);');
}
export function patchIndex(html,runtime) {
 if(typeof html!=='string'||typeof runtime!=='string')throw TypeError('Invalid HTML/runtime');
 if(html.includes(MARKER))throw Error('Compression runtime already installed');
 if(html.split('</body>').length!==2)throw Error('Unexpected app shell');
 for(const s of ['traydaqOptimizePublicImage','createImageBitmap','canvas.toBlob','MAX_EDGE','Promise.race'])
   if(!runtime.includes(s))throw Error('Photo optimizer missing '+s);
 if(/<\/script/i.test(runtime))throw Error('Unsafe optimizer script');
 new Function(runtime);
 return html.replace('</body>','<script id="'+MARKER+'">\n'+runtime+'\n</script>\n</body>');
}
export function main(root='.',runtimePath) {
 if(!runtimePath)throw Error('Usage: patch-private-creator-photo-compression.mjs <root> <runtime>');
 const base=path.resolve(root);
 const cp=path.join(base,'creator-studio.js');
 const hp=path.join(base,'index.html');
 const nextCreator=patchCreator(fs.readFileSync(cp,'utf8'));
 const nextHtml=patchIndex(fs.readFileSync(hp,'utf8'),fs.readFileSync(runtimePath,'utf8'));
 new Function(nextCreator);
 fs.writeFileSync(cp,nextCreator,'utf8');
 fs.writeFileSync(hp,nextHtml,'utf8');
 console.log('PASS: Creator Studio compresses large public JPEG/PNG/WebP photos without changing video/audio or failure behavior.');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main(process.argv[2]||'.',process.argv[3]);
