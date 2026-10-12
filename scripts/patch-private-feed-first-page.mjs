import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const FIRST_PAGE_MARKER='tdFeedFirstPage20261012';
const ordered="const sorted = await getDocs(query(collection(db,'posts'), orderBy('createdAt','desc'), limit(100)));";
const fallback="return getDocs(query(collection(db,'posts'), limit(100)));";
const hasMore='window._sfFeedHasMore = snap.docs.length >= 100;';
function once(src,before,after,label){
 const i=src.indexOf(before);
 if(i<0||src.indexOf(before,i+before.length)>=0)throw Error('Feed first-page contract changed: '+label);
 return src.slice(0,i)+after+src.slice(i+before.length);
}
export function patchInitialFeedPage(html){
 if(typeof html!=='string')throw TypeError('Expected app HTML');
 if(html.includes(FIRST_PAGE_MARKER))throw Error('Feed page optimizer already installed');
 const begin=html.indexOf('async function renderFeed(targetPostId, options){');
 const end=html.indexOf('function verifyBadge(s){',begin);
 if(begin<0||end<begin)throw Error('For You feed loader changed');
 let block=html.slice(begin,end);
 // Only change the initial fetch. Never remove moderation, ownership, or
 // the existing pagination/cursor controls.
 for(const marker of [ordered,fallback,hasMore]){
   if(!block.includes(marker))throw Error('Unable to safely identify initial feed query');
 }
 block=once(block,ordered,ordered.replace('limit(100)','limit(36)'),'ordered first fetch');
 block=once(block,fallback,fallback.replace('limit(100)','limit(36)'),'fallback first fetch');
 block=once(block,hasMore,hasMore.replace('>= 100','>= 36'),'hasMore initial threshold');
 block='/* '+FIRST_PAGE_MARKER+': 36 initial posts; existing follow-up paging retained. */\n'+block;
 return html.slice(0,begin)+block+html.slice(end);
}
export function main(root='.'){
 const file=path.join(path.resolve(root),'index.html');
 const html=fs.readFileSync(file,'utf8');
 const updated=patchInitialFeedPage(html);
 fs.writeFileSync(file,updated,'utf8');
 console.log('PASS: initial For You network batch reduced 100 -> 36, existing paging and filters preserved.');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main(process.argv[2]||'.');
