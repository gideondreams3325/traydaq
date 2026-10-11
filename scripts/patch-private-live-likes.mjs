import fs from 'node:fs';

// Public build-only patch. Private application files stay private.
function replaceExactlyOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) !== -1)
    throw new Error('Traydaq live likes: source anchor changed: ' + label);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

export function patchFeedLikes(source) {
  source = replaceExactlyOnce(source,
    'setCounter(card, action, Math.max(legacy, countEntries(all)));',
    "setCounter(card, action, action === 'like' ? countEntries(all) : Math.max(legacy, countEntries(all)));",
    'authoritative feed like count');
  return source;
}

export function patchProfileMarkup(source) {
  source = replaceExactlyOnce(source,
    '<span class="text-base sm:text-lg font-black text-amber-600">${likes}</span>',
    '<span id="sfProfileReceivedLikes" class="text-base sm:text-lg font-black text-amber-600">${likes}</span>',
    'visitor profile total likes');
  source = replaceExactlyOnce(source,
    '<span class="flex items-center gap-1">❤️ ${x.likes?.length||0}</span>',
    '<span class="flex items-center gap-1" data-sf-received-post-likes="${esc(x.id)}">❤️ ${x.likes?.length||0}</span>',
    'posted media grid like count');
  source = replaceExactlyOnce(source,
    '<span>❤️ ${x.likes?.length||0}</span>',
    '<span data-sf-received-post-likes="${esc(x.id)}">❤️ ${x.likes?.length||0}</span>',
    'profile gallery like count');
  source = replaceExactlyOnce(source,
    'window.SellerFlowProfileSocial?.watchModernProfile?.(targetUid);',
    'window.SellerFlowProfileSocial?.watchModernProfile?.(targetUid,posts.map(p=>p.id));',
    'live watcher includes visible owned posts');
  return source;
}

const receivedLikesWatcher = `  // Canonical per-post /likes records are the source of truth across accounts.
  // This counts likes received by the creator, not their private likedPosts.
  function watchReceivedLikes(owner, counter, visiblePostIds = []) {
    const database = db();
    if (!database || !valid(owner) || !counter) return () => {};
    const postsRef = database.ref('posts').orderByChild('sellerId').equalTo(owner);
    const subscriptions = new Map();
    let stopped = false;
    let postsLoaded = false;
    const countable = post => post && typeof post === 'object' &&
      !post.deleted && !post.isDeleted && !post.isPermanentlyDeleted &&
      !post.hidden && post.safeContent !== false &&
      !['deleted','removed','taken_down','hidden','violation','rejected'].includes(String(post.status || '').toLowerCase()) &&
      !['removed','taken_down','violation','rejected'].includes(String(post.reviewStatus || '').toLowerCase());
    const countLikes = data => entries(data).filter(([, value]) => value !== null && value !== false).length;
    function stop() {
      if (stopped) return;
      stopped = true;
      try { postsRef.off('value',onPosts); } catch (_) {}
      for (const item of subscriptions.values()) {
        try { item.ref.off('value',item.onLikes); } catch (_) {}
      }
      subscriptions.clear();
    }
    function renderCounts() {
      if (stopped) return;
      if (!counter.isConnected) { stop(); return; }
      let total = 0;
      let complete = postsLoaded;
      for (const item of subscriptions.values()) {
        if (!item.ready) complete = false;
        else total += item.count;
      }
      counter.textContent = complete ? String(total) : '…';
      const scope = counter.closest('.sf-profile-fixed-root') ||
        counter.closest('.sf-social-profile-panel') || document;
      for (const label of scope.querySelectorAll('[data-sf-received-post-likes]')) {
        const item = subscriptions.get(label.dataset.sfReceivedPostLikes);
        if (item && item.ready) label.textContent = '❤️ ' + item.count;
      }
    }
    function onPosts(snapshot) {
      if (stopped || !counter.isConnected) { stop(); return; }
      const posts = new Map(entries(snapshot.val()));
      const desired = new Set();
      for (const [id, post] of posts) {
        if (valid(id) && countable(post) && String(post.sellerId || '') === owner) desired.add(id);
      }
      // Include visible legacy-shadow posts only when they are not taken down.
      for (const id of visiblePostIds) {
        if (valid(id) && (!posts.has(id) || countable(posts.get(id)))) desired.add(id);
      }
      for (const [id, item] of subscriptions) {
        if (desired.has(id)) continue;
        try { item.ref.off('value',item.onLikes); } catch (_) {}
        subscriptions.delete(id);
      }
      postsLoaded = true;
      for (const id of desired) {
        if (subscriptions.has(id)) continue;
        const ref = database.ref('likes/' + id);
        const item = {ref, ready:false, count:0, onLikes:null};
        item.onLikes = snap => {
          if (stopped || !counter.isConnected) { stop(); return; }
          item.count = countLikes(snap.val());
          item.ready = true;
          renderCounts();
        };
        subscriptions.set(id,item);
        try {
          ref.on('value',item.onLikes,() => {
            if (stopped) return;
            item.ready = false;
            renderCounts();
          });
        } catch (_) { item.ready = false; }
      }
      renderCounts();
    }
    counter.textContent = '…';
    try { postsRef.on('value',onPosts,() => {
      if (stopped) return;
      postsLoaded = false;
      if (counter.isConnected) counter.textContent = '—';
      stop();
    }); } catch (_) { counter.textContent = '—'; stop(); }
    return stop;
  }

`;

export function patchProfileLikes(source) {
  if (!source.includes("const valid = value =>") ||
      !source.includes('win.SellerFlowProfileSocial = {'))
    throw Error('Traydaq live likes: unexpected private profile module.');
  source = replaceExactlyOnce(source,
    '  let stopModernWatch = null;',
    receivedLikesWatcher + '  let stopModernWatch = null;',
    'insert reusable received-like watcher');
  source = replaceExactlyOnce(source,
    '  function watchModernProfile(owner) {',
    '  function watchModernProfile(owner, visiblePostIds = []) {',
    'watch profile for all viewers and post tiles');
  source = replaceExactlyOnce(source,
    '      watchStop = () => ref.off(\'value\',handler);',
    "      const stopLikes = watchReceivedLikes(owner,panel.querySelector('#sfSocialLikes'));\n      watchStop = () => { ref.off('value',handler); stopLikes(); };",
    'legacy profile live like subscription');
  const begin = source.indexOf("      database.ref('posts').orderByChild('sellerId').equalTo(owner).limitToLast(100).once('value')");
  const end = begin < 0 ? -1 : source.indexOf("\n    }\n    showTab('posts');", begin);
  if (begin < 0 || end < 0 || end - begin > 750 ||
      !source.slice(begin,end).includes("sfSocialLikes"))
    throw Error('Traydaq live likes: legacy snapshot block changed.');
  source = source.slice(0,begin) + source.slice(end);
  const modernBegin = source.indexOf('    // Likes received are the real count of unique RTDB /likes edges on owned posts,');
  const modernEnd = modernBegin < 0 ? -1 : source.indexOf('\n  }\n\n  win.SellerFlowProfileSocial = {',modernBegin);
  if (modernBegin < 0 || modernEnd < 0 || modernEnd-modernBegin > 2000 ||
      !source.slice(modernBegin,modernEnd).includes('sfProfileReceivedLikes'))
    throw Error('Traydaq live likes: modern one-shot counter changed.');
  const replacement = `    // Update own and visitor profiles from canonical online RTDB /likes.
    const stopLikes = watchReceivedLikes(owner,document.getElementById('sfProfileReceivedLikes'),visiblePostIds);
    const stopPreviousWatch = stopModernWatch;
    stopModernWatch = () => { stopPreviousWatch?.(); stopLikes(); };`;
  source = source.slice(0,modernBegin) + replacement + source.slice(modernEnd);
  return source;
}

function main(root) {
  for (const [path, patch] of [
    ['index.html',patchProfileMarkup],
    ['profile-social-panels.js',patchProfileLikes],
    ['post-social.js',patchFeedLikes]
  ]) {
    const file = root + '/' + path;
    const initial = fs.readFileSync(file,'utf8');
    const updated = patch(initial);
    if (initial === updated) throw Error('Traydaq live likes made no changes to ' + path);
    fs.writeFileSync(file,updated);
    console.log('PASS: synchronized Traydaq like counts patched in ' + path);
  }
}
if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href)
  main((process.argv[2] || '.').replace(/\/$/,''));