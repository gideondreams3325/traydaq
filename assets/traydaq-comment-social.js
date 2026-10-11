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
  let likesRef = null;
  let likesListener = null;
  let edges = {};
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
    const result = new Set(members(commentById(id)?.likes));
    const overlay = edges[id] || {};
    if (overlay && typeof overlay === 'object') {
      Object.keys(overlay).forEach(uid => {
        if (!validId(uid)) return;
        if (overlay[uid] === true) result.add(uid);
        else if (overlay[uid] === false) result.delete(uid);
      });
    }
    return result;
  }
  function existingCount(button) {
    if (!button.dataset.tdBaseCount) {
      const spans = button.querySelectorAll('span');
      const raw = spans.length ? spans[spans.length - 1].textContent : button.textContent;
      button.dataset.tdBaseCount = String(Math.max(0, Number(raw) || 0));
    }
    return Number(button.dataset.tdBaseCount) || 0;
  }
  function drawLikes() {
    if (!activePanel || !activePanel.isConnected) return;
    activePanel.querySelectorAll('[data-comment-react]').forEach(button => {
      const id = button.dataset.commentReact;
      if (!validId(id)) return;
      const who = currentUid();
      const found = commentById(id);
      const participants = likeMembers(id);
      const on = !!who && participants.has(who);
      let count = found ? participants.size : existingCount(button);
      if (!found) {
        count += Object.values(edges[id] || {}).filter(v => v === true).length;
      }
      const spans = button.querySelectorAll('span');
      if (spans.length >= 2) {
        if (spans[0].textContent !== (on ? '❤️' : '♡')) spans[0].textContent = on ? '❤️' : '♡';
        if (spans[spans.length - 1].textContent !== String(count)) spans[spans.length - 1].textContent = String(count);
      } else {
        const text = (on ? '❤️ ' : '♡ ') + count;
        if (button.textContent !== text) button.textContent = text;
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
    if (likesRef && likesListener) {
      try { likesRef.off('value', likesListener); } catch (_) {}
    }
    activePanel = null;
    activePostId = '';
    likesRef = null;
    likesListener = null;
    edges = {};
    comments = [];
  }
  function start(panel, postId) {
    stop();
    activePanel = panel;
    activePostId = postId;
    const base = database();
    if (!base) return;
    const ref = base.ref('commentLikes/' + postId);
    likesRef = ref;
    likesListener = snap => {
      if (postId !== activePostId) return;
      edges = snap.val() || {};
      drawLikes();
    };
    try { ref.on('value', likesListener, error => console.warn('Comment likes read unavailable:', error?.code || error)); }
    catch (_) { /* Fallback to cached comment likes while offline. */ }
    base.ref('posts/' + postId + '/comments').once('value').then(snapshot => {
      if (activePostId !== postId || activePanel !== panel) return;
      const value = snapshot.val();
      comments = Array.isArray(value) ? value.filter(Boolean) :
        value && typeof value === 'object'
          ? Object.entries(value).map(([id, c]) => c && typeof c === 'object' ? {id, ...c} : null).filter(Boolean)
          : [];
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
    pending.add(key);
    const old = Object.prototype.hasOwnProperty.call(edges[cid] || {}, uid)
      ? edges[cid][uid] : undefined;
    const next = !likeMembers(cid).has(uid);
    edges[cid] = {...(edges[cid] || {}), [uid]: next};
    drawLikes(); // immediate visual feedback, including on your own comment
    try {
      await database().ref('commentLikes/' + key).set(next);
    } catch (error) {
      if (old === undefined) delete edges[cid][uid];
      else edges[cid][uid] = old;
      drawLikes();
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