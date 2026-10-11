import fs from 'node:fs';

// Build-time patch applied only to the privately checked-out Traydaq app.
// Never copy the app's source or Firebase data to this public repository.
function replaceOnce(input, before, after, label) {
  if (input.split(before).length !== 2) throw new Error('Profile live likes source changed: ' + label);
  return input.replace(before, after);
}

export function patchProfileLikesModule(input) {
  if (input.includes('function watchLiveReceivedLikes(')) throw new Error('Live likes patch already applied');
  const helper = [
    '  // Count verified Firebase RTDB like edges, not stale post.likeCount/likes arrays.',
    '  // Subscriptions remain active only for the profile currently on screen.',
    '  function watchLiveReceivedLikes(database, owner, output) {',
    '    if (!database || !valid(owner) || !output) return () => {};',
    '    const postsQuery = database.ref("posts").orderByChild("sellerId").equalTo(owner);',
    '    const tracked = new Map();',
    '    let active = true, postsLoaded = false, failed = false;',
    '    function render() {',
    '      if (!active) return;',
    '      if (!output.isConnected) { stop(); return; }',
    '      if (failed) { output.textContent = "—"; return; }',
    '      if (!postsLoaded || [...tracked.values()].some(x => x.count === null)) return;',
    '      output.textContent = String([...tracked.values()].reduce((sum, x) => sum + x.count, 0));',
    '      // Profile thumbnails previously rendered x.likes?.length (the stale Firestore copy).',
    '      document.querySelectorAll("[data-profile-post]").forEach(button => {',
    '        const row = tracked.get(button.dataset.profilePost);',
    '        if (!row || row.count === null) return;',
    '        const label = button.querySelector(".sf-tile-meta span:last-child");',
    '        if (label) label.textContent = "❤️ " + row.count;',
    '      });',
    '    }',
    '    function stop() {',
    '      if (!active) return;',
    '      active = false;',
    '      try { postsQuery.off("value", onPosts); } catch (_) {}',
    '      for (const {ref, handler} of tracked.values()) { try { ref.off("value", handler); } catch (_) {} }',
    '      tracked.clear();',
    '    }',
    '    function listen(id) {',
    '      const ref = database.ref("likes/" + id);',
    '      const row = {ref, handler: null, count: null};',
    '      const handler = snap => {',
    '        if (!active) return;',
    '        row.count = entries(snap.val()).filter(([reactor, value]) => valid(reactor) && value !== null && value !== false).length;',
    '        render();',
    '      };',
    '      row.handler = handler;',
    '      tracked.set(id, row);',
    '      try { ref.on("value", handler, () => { failed = true; render(); }); }',
    '      catch (_) { failed = true; render(); }',
    '    }',
    '    function onPosts(snap) {',
    '      if (!active) return;',
    '      const ids = new Set(entries(snap.val()).filter(([id,p]) => valid(id) && allowed(p)).map(([id]) => id));',
    '      for (const [id, row] of tracked) {',
    '        if (!ids.has(id)) { try { row.ref.off("value", row.handler); } catch (_) {} tracked.delete(id); }',
    '      }',
    '      for (const id of ids) if (!tracked.has(id)) listen(id);',
    '      postsLoaded = true;',
    '      render();',
    '    }',
    '    try { postsQuery.on("value", onPosts, () => { failed = true; render(); }); }',
    '    catch (_) { failed = true; render(); }',
    '    return stop;',
    '  }',
    ''
  ].join('\n');
  input = replaceOnce(input, '  function mountLegacyProfile() {',
    helper + '  function mountLegacyProfile() {', 'likes watcher insertion');

  const oldLegacy = [
    '      if (watchStop) watchStop();',
    '      watchStop = () => ref.off(\'value\',handler);',
    '      database.ref(\'posts\').orderByChild(\'sellerId\').equalTo(owner).limitToLast(100).once(\'value\')',
    '        .then(snap => {',
    '          const totals = entries(snap.val()).reduce((n,[,p]) => n + Math.max(',
    '            Array.isArray(p?.likes) ? p.likes.length : 0, Number(p?.likeCount || 0)),0);',
    '          if(panel.isConnected) panel.querySelector(\'#sfSocialLikes\').textContent = String(totals);',
    '        }).catch(()=>{ if(panel.isConnected) panel.querySelector(\'#sfSocialLikes\').textContent=\'—\';});'
  ].join('\n');
  const newLegacy = [
    '      if (watchStop) watchStop();',
    '      const stopLikes = watchLiveReceivedLikes(database, owner, panel.querySelector("#sfSocialLikes"));',
    '      watchStop = () => { ref.off("value", handler); stopLikes(); };'
  ].join('\n');
  input = replaceOnce(input, oldLegacy, newLegacy, 'legacy profile one-time stale likes');

  const oldStart = '    // Likes received are the real count of unique RTDB /likes edges on owned posts,';
  const start = input.indexOf(oldStart);
  const end = input.indexOf('\n  }\n\n  win.SellerFlowProfileSocial = {', start);
  if (start < 0 || end < start || end - start > 2300) {
    throw new Error('Modern profile likes block changed; refusing unsafe patch');
  }
  const newModern = [
    '    // Public profiles and own profiles both show live, unique received likes.',
    '    const likesElement = document.getElementById("sfProfileReceivedLikes");',
    '    if (likesElement) {',
    '      const stopLikes = watchLiveReceivedLikes(database, owner, likesElement);',
    '      const stopOthers = stopModernWatch;',
    '      stopModernWatch = () => { if (stopOthers) stopOthers(); stopLikes(); };',
    '    }'
  ].join('\n');
  input = input.slice(0, start) + newModern + input.slice(end);
  if (!input.includes('watchLiveReceivedLikes(database, owner, likesElement)') ||
      !input.includes('watchLiveReceivedLikes(database, owner, panel.querySelector("#sfSocialLikes"))')) {
    throw new Error('Live likes patch missing profile target');
  }
  return input;
}

export function patchCanonicalFeedLikes(input) {
  // Canonical Firebase /likes membership must win over stale legacy likes arrays
  // so unliking immediately decreases the number on visible feed posts.
  return replaceOnce(input,
    'setCounter(card, action, Math.max(legacy, countEntries(all)));',
    "setCounter(card, action, action === 'like' ? countEntries(all) : Math.max(legacy, countEntries(all)));",
    'live feed unlike count');
}

export function patchProfileHtml(input) {
  const guest = '<span class="text-base sm:text-lg font-black text-amber-600">' + '$' + '{likes}</span>';
  const live = '<span id="sfProfileReceivedLikes" class="text-base sm:text-lg font-black text-amber-600">' + '$' + '{likes}</span>';
  input = replaceOnce(input, guest, live, 'visitor profile likes target');
  const script = '/profile-social-panels.js?v=20261009-1';
  input = replaceOnce(input, script, '/profile-social-panels.js?v=20261011-live-likes-1',
    'force fresh live likes asset in APK/WebView');
  if (!input.includes('data-profile-post=') || !input.includes('watchModernProfile?.(targetUid)')) {
    throw new Error('Profile tiles or public routing changed');
  }
  return input;
}

if (process.argv[1] && import.meta.url === 'file://' + process.argv[1]) {
  const root = (process.argv[2] || '.').replace(/\/$/, '');
  for (const [path, patch] of [['profile-social-panels.js', patchProfileLikesModule], ['index.html', patchProfileHtml], ['post-social.js', patchCanonicalFeedLikes]]) {
    const full = root + '/' + path;
    const before = fs.readFileSync(full, 'utf8');
    const after = patch(before);
    if (before === after) throw new Error('No fix applied to ' + path);
    fs.writeFileSync(full, after);
    console.log('PASS: installed live received-like sync in ' + path + ' (private source never published)');
  }
}
