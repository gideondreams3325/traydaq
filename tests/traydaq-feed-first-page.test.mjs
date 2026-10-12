import assert from 'node:assert/strict';
import {patchInitialFeedPage,FIRST_PAGE_MARKER} from '../scripts/patch-private-feed-first-page.mjs';
const begin='async function renderFeed(targetPostId, options){';
const ordered="const sorted = await getDocs(query(collection(db,'posts'), orderBy('createdAt','desc'), limit(100)));";
const fallback="return getDocs(query(collection(db,'posts'), limit(100)));";
const more='window._sfFeedHasMore = snap.docs.length >= 100;';
const source='<html><body><script>'+begin+"\n"+
' const postIsSafe = isEligibleFeedPost(p);'+'\n'+ordered+'\n'+fallback+'\n'+more+
"\n}function verifyBadge(s){}"+'</script></body></html>';
const changed=patchInitialFeedPage(source);
assert(changed.includes(FIRST_PAGE_MARKER));
assert(changed.includes(ordered.replace('100','36')));
assert(changed.includes(fallback.replace('100','36')));
assert(changed.includes('window._sfFeedHasMore = snap.docs.length >= 36;'));
assert(changed.includes('isEligibleFeedPost(p)'), 'moderation must remain untouched');
assert.throws(()=>patchInitialFeedPage(changed),/already installed/);
assert.throws(()=>patchInitialFeedPage(source.replace('limit(100)','limit(50)')),/Unable to safely/);
assert(!changed.includes('snap.docs.length >= 100;'));
console.log('PASS: first fetch is bounded, moderation and paging untouched, fail closed on changed source.');
