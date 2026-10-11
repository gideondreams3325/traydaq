/* TRAYDAQ comment identity and likes; loaded into private APK at build time. */
(function () {
  'use strict';
  if (window.__tdCommentSocialLoaded) return;
  window.__tdCommentSocialLoaded = true;
  const validId = value => /^[A-Za-z0-9_-]{1,128}$/.test(String(value || ''));
  const profiles = new Map();
  const loading = new Set();
  let activePanel = null;
  let activePostId = '';
  // tdSupabaseCommentLikes2026: never write comment reactions to missing Firebase rules.
  const likesApi = 'https://vvpwntehstjbccarqqzp.supabase.co/functions/v1/traydaq-comment-likes';
  let remoteLikes = {};
  let refreshTimer = null;
  let refreshBusy = false;
  let comments = [];
  let refreshQueued = false;
  const pending = new Set();

  function database() {
    try { return window.firebase && typeof window.firebase.database === 'function'
      ? window.firebase.database() : null; } catch (_) { return null; }
  }
  function currentUid() {
    try { return (window.firebase && window.firebase.auth && window.firebase.auth().currentUser || {}).uid ||
      (window.auth && window.auth.currentUser || {}).uid || ''; } catch (_) { return ''; }
  }
  function inform(message) {
    if (typeof window.toast === 'function') window.toast(message, 'error');
    else if (typeof toast === 'function') toast(message, 'error');
    else console.warn(message);
  }
  function members(value) {
    if (Array.isArray(value)) return value.filter(x => typeof x === 'string');
    if (value && typeof value === 'object')
      return Object.keys(value).filter(uid => value[uid] && validId(uid));
    return [];
  }
  function commentById(id) {
    return comments.find(c => c && String(c.id) === String(id)) || null;
  }
  function likeMembers(id) {
    // Existing embedded likes remain visible; new reactions have their own server ledger.
    return new Set(members(commentById(id)?.likes));
  }
  function existingCount(button) {
    if (!button.dataset.tdBaseCount) {
      const spans = button.querySelectorAll('span');
      const raw = spans.length ? spans[spans.length - 1].textContent : button.textContent;
      button.dataset.tdBaseCount = String(Math.max(0, Number(raw) || 0));
    }
    return Number(button.dataset.tdBaseCount) || 0;
  }
  function installLegacyLikeButtons() {
    // Some older comment cards contain no reaction button. Only add one when
    // the post record, author UID and exact comment text identify ONE comment.
    if (!activePanel || !activePanel.isConnected || !comments.length) return;
    activePanel.querySelectorAll('[id^="commentItem_"]').forEach(row => {
      if (row.querySelector('[data-comment-react]')) return;
      const user = row.querySelector('[data-comment-profile]');
      const uid = user && user.dataset.commentProfile;
      const body = row.querySelector('.text-sm.mt-1');
      if (!validId(uid) || !body) return;
      const matches = comments.filter(c => String(c.uid) === uid &&
        String(c.text || '').trim() === body.textContent.trim());
      if (matches.length !== 1 || !validId(matches[0].id)) return;
      const actions = row.querySelector('.flex-1');
      if (!actions) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'td-comment-fallback-like';
      button.dataset.commentReact = matches[0].id;
      button.innerHTML = '<span>♡</span><span>0</span>';
      button.setAttribute('aria-label', 'Like comment');
      actions.appendChild(button);
    });
  }
  function drawLikes() {
    if (!activePanel || !activePanel.isConnected) return;
    activePanel.querySelectorAll('[data-comment-react]').forEach(button => {
      const id = button.dataset.commentReact;
      if (!validId(id)) return;
      const known = commentById(id);
      const old = likeMembers(id);
      const server = remoteLikes[id] || {};
      const remoteCount = Math.max(0, Number(server.count) || 0);
      const baseline = known ? old.size : existingCount(button);
      const count = baseline + remoteCount;
      const on = server.liked === true;
      const spans = button.querySelectorAll('span');
      if (spans.length >= 2) {
        if (spans[0].textContent !== (on ? '❤️' : '♡')) spans[0].textContent = on ? '❤️' : '♡';
        if (spans[spans.length - 1].textContent !== String(count))
          spans[spans.length - 1].textContent = String(count);
      } else {
        const content = (on ? '❤️ ' : '♡ ') + count;
        if (button.textContent !== content) button.textContent = content;
      }
      button.classList.toggle('td-comment-liked', on);
      button.setAttribute('aria-pressed', String(on));
      button.setAttribute('aria-label', (on ? 'Unlike' : 'Like') + ' comment, ' + count + ' likes');
      button.title = on ? 'Unlike comment' : 'Like comment';
    });
  }
  function profilePhoto(profile) {
    if (!profile || profile.avatarRemoved === true || profile.avatarRemoved === 'true') return '';
    const value = profile.avatarUrl || profile.photoURL || profile.photoUrl ||
      profile.profilePicture || profile.profilePic || profile.avatar || profile.imageUrl ||
      profile.picture || profile.photo || '';
    const result = typeof value === 'string' ? value : (value && value.url || '');
    return /^(https:\/\/|\/(?!\/)|data:image\/(?:png|jpe?g|webp|gif);base64,)/i.test(result) ? result : '';
  }
  function applyProfile(uid, profile) {
    if (!activePanel || !activePanel.isConnected) return;
    const username = String(profile.username || profile.userName || profile.handle || '')
      .trim().replace(/^@/, '');
    const handle = /^[A-Za-z0-9_][A-Za-z0-9_.-]{1,49}$/.test(username) ? username : '';
    const photo = profilePhoto(profile);
    activePanel.querySelectorAll('[data-comment-profile]').forEach(button => {
      if (button.dataset.commentProfile !== uid) return;
      button.classList.add('td-comment-profile-link');
      button.dataset.tdUsername = handle;
      button.setAttribute('aria-label', 'View ' + (handle ? '@' + handle : 'member') + ' profile');
      const picture = button.querySelector('img');
      if (picture) {
        if (photo && picture.getAttribute('src') !== photo) picture.setAttribute('src', photo);
        picture.removeAttribute('data-view-image');
      } else if (handle && button.textContent.trim() !== '@' + handle) {
        button.textContent = '@' + handle;
      }
    });
  }
  async function hydrate(uid) {
    if (!validId(uid) || loading.has(uid)) return;
    if (profiles.has(uid)) { applyProfile(uid, profiles.get(uid)); return; }
    loading.add(uid);
    try {
      const base = database();
      if (!base) return;
      const snap = await base.ref('publicProfiles/' + uid).once('value');
      const profile = snap.val();
      if (profile && typeof profile === 'object') {
        profiles.set(uid, profile);
        applyProfile(uid, profile);
      }
    } catch (_) { /* Preserve existing avatar/name; never invent someone else's identity. */ }
    finally { loading.delete(uid); }
  }
  function drawProfiles() {
    if (!activePanel || !activePanel.isConnected) return;
    const users = new Set();
    activePanel.querySelectorAll('[data-comment-profile]').forEach(button => {
      const uid = button.dataset.commentProfile;
      if (validId(uid)) users.add(uid);
      else button.disabled = true;
    });
    [...users].slice(0, 80).forEach(uid => {
      if (profiles.has(uid)) applyProfile(uid, profiles.get(uid));
      else hydrate(uid);
    });
  }
  function refresh() {
    refreshQueued = false;
    const panel = document.querySelector('#modalRoot .comment-sheet');
    const id = panel && panel.dataset.tdCommentPostId;
    if (!panel || !validId(id)) { stop(); return; }
    if (panel !== activePanel || id !== activePostId) start(panel, id);
    drawProfiles();
    drawLikes();
  }
  function queueRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(refresh);
    else Promise.resolve().then(refresh);
  }
  function stop() {
    if (refreshTimer !== null) window.clearInterval(refreshTimer);
    refreshTimer = null;
    activePanel = null;
    activePostId = '';
    remoteLikes = {};
    comments = [];
    refreshBusy = false;
  }
  async function userToken() {
    const user = window.firebase?.auth?.().currentUser || window.auth?.currentUser;
    if (!user || typeof user.getIdToken !== 'function') return '';
    return await user.getIdToken();
  }
  async function fetchLikes(postId, panel) {
    if (refreshBusy || pending.size || document.visibilityState === 'hidden') return;
    refreshBusy = true;
    try {
      const token = await userToken().catch(() => '');
      const response = await fetch(likesApi + '?postId=' + encodeURIComponent(postId), {
        method: 'GET', headers: token ? {Authorization:'Bearer ' + token} : {},
        cache: 'no-store', signal: AbortSignal.timeout(11000)
      });
      const body = await response.json();
      if (!response.ok || body.success !== true) throw Error('Comment likes unavailable');
      if (panel !== activePanel || postId !== activePostId || pending.size) return;
      remoteLikes = body.likes && typeof body.likes === 'object' ? body.likes : {};
      drawLikes();
    } catch (error) {
      console.warn('Comment likes refresh unavailable:', String(error?.message || 'offline').slice(0,80));
    } finally { refreshBusy = false; }
  }
  function start(panel, postId) {
    stop();
    activePanel = panel;
    activePostId = postId;
    const base = database();
    void fetchLikes(postId, panel);
    refreshTimer = window.setInterval(() => {
      if (activePanel === panel && activePostId === postId)
        void fetchLikes(postId, panel);
    }, 9000);
    if (!base) return;
    Promise.all([
      base.ref('posts/' + postId + '/comments').once('value').then(s => s.val()).catch(() => null),
      base.ref('comments/' + postId).once('value').then(s => s.val()).catch(() => null)
    ]).then(([inside,canonical]) => {
      if (activePostId !== postId || activePanel !== panel) return;
      const source = inside && (Array.isArray(inside) ? inside.length : Object.keys(inside).length) ? inside : canonical;
      comments = Array.isArray(source) ? source.filter(Boolean) :
        source && typeof source === 'object'
          ? Object.entries(source).map(([id,c]) => c && typeof c === 'object' ? {id,...c} : null).filter(Boolean)
          : [];
      comments = comments.map((c,i) => ({...c,id:c.id || 'c_' + (c.createdAt || i) + '_' + i}));
      installLegacyLikeButtons();
      drawLikes();
    }).catch(() => {});
  }
  document.addEventListener('click', async event => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const profileBtn = target.closest('#modalRoot .comment-sheet [data-comment-profile]');
    if (profileBtn) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const uid = profileBtn.dataset.commentProfile;
      if (!validId(uid)) return;
      const username = profiles.get(uid)?.username || profileBtn.dataset.tdUsername || '';
      try { if (typeof window.closeModal === 'function') window.closeModal(); } catch (_) {}
      if (typeof window.openUserProfile === 'function')
        window.openUserProfile(uid, { username: String(username).replace(/^@/, '') });
      return;
    }
    const likeBtn = target.closest('#modalRoot .comment-sheet [data-comment-react]');
    if (!likeBtn) return;
    // Prevent the obsolete handler from editing the post author's /posts record.
    event.preventDefault();
    event.stopImmediatePropagation();
    const postId = activePostId;
    const cid = likeBtn.dataset.commentReact;
    const uid = currentUid();
    if (!uid) {
      if (typeof window.showAuthPrompt === 'function') window.showAuthPrompt('like comments');
      else inform('Sign in to like comments.');
      return;
    }
    if (!validId(postId) || !validId(cid) || !validId(uid) || !database()) {
      inform('Comment likes are temporarily unavailable. Please try again.');
      return;
    }
    const key = postId + '/' + cid + '/' + uid;
    if (pending.has(key)) return;
    const current = remoteLikes[cid] || {count:0, liked:false};
    const old = {count:Math.max(0,Number(current.count)||0),liked:current.liked===true};
    const next = !old.liked;
    pending.add(key);
    remoteLikes[cid] = {count:Math.max(0,old.count+(next?1:-1)),liked:next};
    drawLikes();
    try {
      const token = await userToken();
      if (!token || currentUid() !== uid) throw Error('Sign-in changed');
      const response = await fetch(likesApi, {
        method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
        body:JSON.stringify({postId,commentId:cid,liked:next}),
        signal:AbortSignal.timeout(14000)
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.success !== true || !body.likes)
        throw Error('Comment like service rejected request');
      if (activePostId === postId) {
        remoteLikes = body.likes;
        drawLikes();
      }
    } catch (error) {
      if (activePostId === postId) {
        remoteLikes[cid] = old;
        drawLikes();
      }
      inform('Unable to save comment like. Check your connection and try again.');
    } finally { pending.delete(key); }
  }, true);

  function init() {
    const root = document.getElementById('modalRoot');
    if (!root || typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(queueRefresh);
    observer.observe(root, {subtree:true, childList:true});
    queueRefresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();