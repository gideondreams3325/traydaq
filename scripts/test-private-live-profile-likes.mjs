import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Executed only inside the Android runner's PRIVATE source checkout.
// No private app code, real UIDs, credentials, or database records are logged.
const source=fs.readFileSync('profile-social-panels.js','utf8');
const html=fs.readFileSync('index.html','utf8');
assert(source.includes('function watchLiveReceivedLikes('));
assert(source.includes('watchLiveReceivedLikes(database, owner, likesElement)'));
assert(source.includes('watchLiveReceivedLikes(database, owner, panel.querySelector("#sfSocialLikes"))'));
assert(html.includes('id="sfProfileReceivedLikes"'));
assert(!html.includes('/profile-social-panels.js?v=20261009-1'));
assert(html.includes('/profile-social-panels.js?v=20261011-video-views-1'));
assert(html.includes('id="tdProfileVideoMetrics2026"'));
assert.equal(html.split('data-profile-metric=').length-1,2, 'Both profile galleries must render views for videos');

const store=new Map([
 ['publicProfiles/creatorA',{followers:['viewerB'],following:[]}],
 ['publicProfiles/creatorB',{followers:[],following:[]}],
 ['posts',{p1:{sellerId:'creatorA',mediaUrl:'https://example.test/a.jpg',status:'published'}}],
 ['likes/p1',{viewerB:true}]
]);
const listeners=[];
const snap=value=>({val:()=>value});
const get=(path,filter)=>{
 const value=store.get(path)||null;
 if(!filter||!value||typeof value!=='object')return value;
 return Object.fromEntries(Object.entries(value).filter(([,item])=>item?.[filter.field]===filter.value));
};
class Ref {
 constructor(path,filter=null){this.path=path;this.filter=filter;}
 orderByChild(field){return new Ref(this.path,{field,value:null});}
 equalTo(value){return new Ref(this.path,{field:this.filter.field,value});}
 on(event,cb,error){assert.equal(event,'value');listeners.push({ref:this,cb,error});cb(snap(get(this.path,this.filter)));return cb;}
 off(event,cb){for(let i=listeners.length-1;i>=0;i--)if(listeners[i].ref===this&&listeners[i].cb===cb)listeners.splice(i,1);}
}
const db={ref:path=>new Ref(path)};
function emit(path,value){
 store.set(path,value);
 for(const record of [...listeners])if(record.ref.path===path&&listeners.includes(record))record.cb(snap(get(path,record.ref.filter)));
}
const follower={isConnected:true,textContent:''},following={isConnected:true,textContent:''};
const likes={isConnected:true,textContent:'stale'};
const tileLikes={textContent:'❤️ 0',dataset:{},setAttribute(){}};
const tile={dataset:{profilePost:'p1'},querySelector:s=>s==='.sf-tile-meta span:last-child'?tileLikes:null};
const tileViews={textContent:'👁 0',dataset:{profileMetric:'views'},setAttribute(){}};
const videoTile={dataset:{profilePost:'p3'},querySelector:s=>s==='.sf-tile-meta span:last-child'?tileViews:null};
const document={
 querySelector:s=>s==='[data-profile-stat="followers"] span:first-child'?follower:s==='[data-profile-stat="following"] span:first-child'?following:null,
 getElementById:s=>s==='sfProfileReceivedLikes'?likes:null,
 querySelectorAll:s=>s==='[data-profile-post]'?[tile,videoTile]:[]
};
let viewer='viewerB';
const window={
 firebase:{database:()=>db,auth:()=>({currentUser:viewer?{uid:viewer}:null})}
};
vm.runInNewContext(source,{window,document,console});
const watch=window.SellerFlowProfileSocial.watchModernProfile;
assert.equal(typeof watch,'function');
watch('creatorA');
assert.equal(likes.textContent,'1','Visitor must see correct creator likes from /likes');
assert.equal(tileLikes.textContent,'❤️ 1','Tile must show canonical likes, not stale x.likes');
emit('likes/p1',{viewerB:true,viewerC:true});
assert.equal(likes.textContent,'2','Like added on another account updates automatically');
assert.equal(tileLikes.textContent,'❤️ 2','Tile counter updates without refreshing');
emit('likes/p1',{viewerB:true});
assert.equal(likes.textContent,'1','Unlike immediately reduces live total');
emit('likes/p2',{viewerD:true,viewerE:true,viewerF:true});
emit('posts',{p1:{sellerId:'creatorA',mediaUrl:'https://example.test/a.jpg'},p2:{sellerId:'creatorA',mediaUrl:'https://example.test/b.jpg'}});
assert.equal(likes.textContent,'4','A new published post joins the profile live total');
emit('posts',{p2:{sellerId:'creatorA',mediaUrl:'https://example.test/b.jpg'}});
assert.equal(likes.textContent,'3','Removing a post removes its received likes');
// Videos display their RTDB view count, not the live likes of that post.
emit('posts',{p2:{sellerId:'creatorA',mediaUrl:'https://example.test/b.jpg'},p3:{sellerId:'creatorA',type:'video',mediaUrl:'https://example.test/c.mp4',viewCount:12}});
emit('likes/p3',{viewerB:true,viewerC:true});
assert.equal(tileViews.textContent,'👁 12','A video tile must use views instead of likes');
emit('posts',{p2:{sellerId:'creatorA',mediaUrl:'https://example.test/b.jpg'},p3:{sellerId:'creatorA',type:'video',mediaUrl:'https://example.test/c.mp4',viewCount:15}});
assert.equal(tileViews.textContent,'👁 15','Video view changes must update without reopening profile');
assert.equal(tileLikes.textContent,'❤️ 1','Image tile keeps the heart metric');
emit('posts',{p2:{sellerId:'creatorA',mediaUrl:'https://example.test/b.jpg'}});
watch('creatorB');
assert.equal(likes.textContent,'0','Switching to another creator does not retain prior likes');
const old=likes.textContent;
emit('likes/p2',{viewerD:true,viewerE:true,viewerF:true,viewerG:true});
assert.equal(likes.textContent,old,'Old profile listeners must detach on navigation');
viewer='';
watch('creatorA');
assert.equal(likes.textContent,'4','Guests must see the current four Firebase likes, not the old three-like snapshot');
assert(listeners.filter(x=>x.ref.path==='likes/p1').length<=1,'Navigation must not leak duplicate listeners');
console.log('PASS: public/owner profile likes, per-post counters, real-time like/unlike, post changes, navigation, and guest reads.');
