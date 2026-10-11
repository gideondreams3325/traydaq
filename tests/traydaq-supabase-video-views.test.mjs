import assert from 'node:assert/strict';
import test from 'node:test';
import { eligibleVideoPost } from '../edge/traydaq-video-views/eligible.mjs';
import { patchVideoCounterClient } from '../scripts/patch-private-supabase-video-views.mjs';

test('only eligible public videos count authenticated non-owner viewers',()=>{
  const v={sellerId:'owner',mediaType:'video/mp4',mediaUrl:'https://cdn.example/video.mp4'};
  assert.equal(eligibleVideoPost(v,'viewer'),true);
  assert.equal(eligibleVideoPost(v,'owner'),false);
  assert.equal(eligibleVideoPost({...v,mediaType:'image/png',mediaUrl:'https://cdn.example/photo.png'},'viewer'),false);
  assert.equal(eligibleVideoPost({...v,hidden:true},'viewer'),false);
  assert.equal(eligibleVideoPost({...v,deleted:true},'viewer'),false);
  assert.equal(eligibleVideoPost({...v,privacy:'followers'},'viewer'),false);
  assert.equal(eligibleVideoPost({...v,privacy:'private'},'viewer'),false);
  assert.equal(eligibleVideoPost({...v,status:'taken_down'},'viewer'),false);
  assert.equal(eligibleVideoPost({...v,reviewStatus:'pending_review'},'viewer'),false);
  assert.equal(eligibleVideoPost({...v,safeContent:false},'viewer'),false);
});
test('Android claims are sent to server without author-supplied counter writes',()=>{
  const original=[
    '(function(win,doc){',
    'const TRAYDAQ_VIDEO_VIEWS_2026 = true;',
    "function viewer(){return 'viewer';}",
    'async function save(id,actor){',
    '      // Firebase security rules ensure that only this viewer may create a claim.',
    "      await db.ref('postViews/' + id + '/' + actor).set(win.firebase.database.ServerValue.TIMESTAMP);",
    '}',
    '})(window,document);'
  ].join('\n');
  const next=patchVideoCounterClient(original);
  assert.match(next,/tdSupabaseVideoViews2026/);
  assert.match(next,/traydaq-video-views/);
  assert.match(next,/signedIn\.getIdToken\(\)/);
  assert.match(next,/response\.success !== true/);
  assert.doesNotMatch(next,/postViews\//);
  assert.equal(patchVideoCounterClient(next),next);
  assert.throws(()=>patchVideoCounterClient('(function(){})()'),/anchor changed/);
});
