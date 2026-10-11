import assert from 'node:assert/strict';
import fs from 'node:fs';

const profile=fs.readFileSync('profile-social-panels.js','utf8');
const feed=fs.readFileSync('post-social.js','utf8');
const html=fs.readFileSync('index.html','utf8');
assert(profile.includes('function watchReceivedLikes(owner, counter, visiblePostIds = [])'));
assert(profile.includes("database.ref('likes/' + id)"));
assert(!profile.includes('const postsSnap = await database.ref(\'posts\').orderByChild(\'sellerId\').equalTo(owner).once(\'value\')'));
assert(feed.includes("action === 'like' ? countEntries(all) : Math.max(legacy, countEntries(all))"));
assert.equal(html.split('id="sfProfileReceivedLikes"').length-1,2,'Both own and visitor profiles need real-time counters');
assert.equal(html.split('data-sf-received-post-likes=').length-1,2,'Both profile galleries need live per-post counts');
assert(html.includes('watchModernProfile?.(targetUid,posts.map(p=>p.id))'));

const start=profile.indexOf('  function watchReceivedLikes(');
const end=profile.indexOf('  let stopModernWatch = null;',start);
assert(start>=0&&end>start);
const observers=new Map();
const ref=path=>({
  path,
  orderByChild(){return this;},
  equalTo(owner){this.path+=':'+owner;return this;},
  on(_event,cb){if(!observers.has(this.path))observers.set(this.path,new Set());observers.get(this.path).add(cb);},
  off(_event,cb){observers.get(this.path)?.delete(cb);}
});
const db=()=>({ref});
const valid=value=>/^[A-Za-z0-9_-]{1,128}$/.test(value);
const entries=value=>value&&typeof value==='object'?Object.entries(value):[];
const watcher=new Function('db','valid','entries','document',profile.slice(start,end)+';return watchReceivedLikes;')(
  db,valid,entries,{querySelectorAll:()=>[]}
);
function profileView(owner,ids){
  const labels=ids.map(id=>({dataset:{sfReceivedPostLikes:id},textContent:'',isConnected:true}));
  const scope={querySelectorAll:()=>labels};
  const element={textContent:'',isConnected:true,closest:()=>scope};
  return {element,labels,stop:watcher(owner,element,ids)};
}
function emit(path,value) {
  for(const fn of [...(observers.get(path)||[])])fn({val:()=>value});
}
const a=profileView('creatorA',['p1','p2']);
emit('posts:creatorA',{p1:{sellerId:'creatorA'},p2:{sellerId:'creatorA'}});
assert.equal(a.element.textContent,'…','Do not show an unverified 0 while counts load');
emit('likes/p1',{u1:true,u2:true});
emit('likes/p2',{u3:true});
assert.equal(a.element.textContent,'3');
assert.deepEqual(a.labels.map(label=>label.textContent),['❤️ 2','❤️ 1']);
emit('likes/p1',{u2:true});
assert.equal(a.element.textContent,'2','A live unlike must decrement without reopening the page');
emit('likes/p2',null);
assert.equal(a.element.textContent,'1');
assert.equal(a.labels[1].textContent,'❤️ 0');
emit('posts:creatorA',{p1:{sellerId:'creatorA'},p2:{sellerId:'creatorA',deleted:true}});
assert.equal(a.element.textContent,'1');
assert.equal(observers.get('likes/p2')?.size,0,'Deleted posts must release their listeners');
const b=profileView('creatorB',['p3']);
emit('posts:creatorB',{p3:{sellerId:'creatorB'}});
emit('likes/p3',{v1:true,v2:true,v3:true});
assert.equal(b.element.textContent,'3');
assert.equal(a.element.textContent,'1','Other creators must not affect the viewed account');
a.stop();b.stop();
assert([...observers.values()].every(callbacks=>callbacks.size===0),'Listeners must clean up after profile navigation');
console.log('PASS: live likes for own/visitor profiles, per-post tiles, unlike, deletion and listener cleanup.');
