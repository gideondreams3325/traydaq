import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const PICTURE_ONLY_MARKER='tdPictureOnly20261012';
const FEED_PREDICATE='const isEligibleFeedPost = (p) => {';
const CREATOR_CALL='        const published = await window.executeSellerFlowAiPostPublish(postData, tdOptimizedUpload, null);';
function once(src,before,after,label){
 const hits=src.split(before).length-1;
 if(hits!==1)throw Error('TRAYDAQ picture-only source contract changed: '+label+' ('+hits+')');
 return src.replace(before,after);
}
export function patchPictureOnlyHtml(html,runtime,css){
 if([html,runtime,css].some(x=>typeof x!=='string'))throw TypeError('Missing HTML, JS or CSS');
 if(html.includes(PICTURE_ONLY_MARKER))throw Error('Picture-only mode already installed');
 if(!html.includes('reelFeed')||html.split('</body>').length!==2||html.split('</head>').length!==2)
   throw Error('Unexpected TRAYDAQ Home shell');
 if(!runtime.includes('guardNewPost')||!runtime.includes('isVideoPost')||!runtime.includes('tdPictureOnly2026'))
   throw Error('Incomplete picture-only runtime');
 if(/<\/script/i.test(runtime)||/<\/style/i.test(css))throw Error('Unexpected inline terminator');
 new Function(runtime);
 // Keep existing feed moderation, security, privacy and ownership logic intact.
 html=once(html,FEED_PREDICATE,
  FEED_PREDICATE+'\n    // '+PICTURE_ONLY_MARKER+': old videos are archived, not removed from storage.\n'+
  '    if (window.tdPictureOnly2026?.isVideoPost(p)) return false;',
  'main For You/Following eligibility filter');
 html=html.replace('</head>','<style id="'+PICTURE_ONLY_MARKER+'Style">\n'+css+'\n</style>\n</head>');
 return html.replace('</body>','<script id="'+PICTURE_ONLY_MARKER+'">\n'+runtime+'\n</script>\n</body>');
}
export function patchPictureOnlyCreator(source){
 if(typeof source!=='string')throw TypeError('Missing Creator Studio');
 if(source.includes(PICTURE_ONLY_MARKER))throw Error('Picture-only Creator Studio already patched');
 return once(source,CREATOR_CALL,
  '        // '+PICTURE_ONLY_MARKER+': block new videos before publish side effects.\n'+
  '        if (!window.tdPictureOnly2026?.guardNewPost) throw Error("Picture-only upload protection is unavailable. Reopen TRAYDAQ.");\n'+
  '        window.tdPictureOnly2026.guardNewPost(postData, tdOptimizedUpload);\n'+CREATOR_CALL,
  'Creator Studio signed publish');
}
export function main(root='.',runtimeFile,cssFile){
 if(!runtimeFile||!cssFile)throw Error('Usage: patch-private-picture-only.mjs <root> <runtime.js> <style.css>');
 const base=path.resolve(root);
 const htmlPath=path.join(base,'index.html');
 const creatorPath=path.join(base,'creator-studio.js');
 const html=patchPictureOnlyHtml(fs.readFileSync(htmlPath,'utf8'),fs.readFileSync(runtimeFile,'utf8'),fs.readFileSync(cssFile,'utf8'));
 const creator=patchPictureOnlyCreator(fs.readFileSync(creatorPath,'utf8'));
 new Function(creator);
 fs.writeFileSync(htmlPath,html,'utf8');
 fs.writeFileSync(creatorPath,creator,'utf8');
 console.log('PASS: picture-only feeds, Creator Studio video publish guard; music and verification video unchanged.');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main(process.argv[2]||'.',process.argv[3],process.argv[4]);
