/* TRAYDAQ_POST_LINKS_2026: Share a post ID, never a Supabase media-storage file URL. */
(function () {
  'use strict';
  if (window.__tdPostLinks2026) return;
  window.__tdPostLinks2026 = true;

  const SHARE_ENDPOINT = 'https://vvpwntehstjbccarqqzp.supabase.co/functions/v1/traydaq-open-post';
  const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
  const shareUrl = id => SHARE_ENDPOINT + '?postId=' + encodeURIComponent(id);
  window.traydaqPostShareUrl = id => validId(id) ? shareUrl(id) : '';

  function idFromLink(candidate) {
    if (typeof candidate !== 'string' || candidate.length > 2048) return '';
    const custom = candidate.match(/(?:traydaq|intent):\/\/post\/([A-Za-z0-9_-]{1,128})(?:[/?#]|$)/i);
    if (custom) return custom[1];
    try {
      const url = new URL(candidate);
      if (!/^https?:$/.test(url.protocol)) return '';
      if (url.pathname.endsWith('/traydaq-open-post')) {
        const id = url.searchParams.get('postId') || url.searchParams.get('id');
        return validId(id) ? id : '';
      }
      const matched = url.pathname.match(/\/(?:post|reel|video)\/([A-Za-z0-9_-]{1,128})(?:\/|$)/);
      return matched ? matched[1] : '';
    } catch (_) { return ''; }
  }
  function fromNode(node) {
    for (let element = node, depth = 0; element && depth < 7; element = element.parentElement, depth++) {
      const dataset = element.dataset || {};
      for (const candidate of [dataset.tdSharePostId, dataset.postId, dataset.postid,
        dataset.reelId, dataset.post, dataset.tdPostId]) {
        if (validId(candidate)) return candidate;
      }
      const inline = element.getAttribute && element.getAttribute('onclick');
      if (inline) {
        const call = inline.match(/(?:sharePost|openShareSheet|openPostShare|shareReel|showShareSheet)\s*\(\s*['"]([A-Za-z0-9_-]{1,128})['"]/i);
        if (call) return call[1];
      }
      const idAttr = element.getAttribute && element.getAttribute('id') || '';
      const idMatch = idAttr.match(/^(?:post|reel)[-_]([A-Za-z0-9_-]{1,128})$/i);
      if (idMatch) return idMatch[1];
    }
    return '';
  }
  function normalizeMedia(value) {
    if (typeof value !== 'string') return '';
    try {
      const u = new URL(value, location.href);
      if (!/^https?:$/.test(u.protocol)) return '';
      return u.origin + u.pathname;
    } catch (_) { return ''; }
  }
  // Only use cached media as an ID hint when exactly ONE post matches that media.
  // Never guess a different user's post from index position or a creator name.
  function uniqueMediaPostId(card) {
    const cached = window._sfCachedPosts;
    if (!(cached instanceof Map) || !card) return '';
    const media = Array.from(card.querySelectorAll('video,video source,img'))
      .map(el => normalizeMedia(el.currentSrc || el.src || el.getAttribute('src')))
      .filter(Boolean);
    const matched = new Set();
    for (const [key, post] of cached) {
      if (!post || typeof post !== 'object') continue;
      const id = validId(post.id) ? post.id : validId(key) ? key : '';
      if (!id) continue;
      const files = [post.mediaUrl, post.videoUrl, post.imageUrl, post.coverUrl, post.thumbnailUrl]
        .map(normalizeMedia).filter(Boolean);
      if (files.some(file => media.includes(file))) matched.add(id);
      if (matched.size > 1) return '';
    }
    return matched.size === 1 ? [...matched][0] : '';
  }

  let currentPostId = '';
  const actionText = el => String(el && (el.getAttribute('aria-label') ||
    el.textContent) || '').replace(/\s+/g, ' ').trim().toLowerCase();

  function findPanel() {
    const choices = document.querySelectorAll('button,a,[role="button"]');
    for (const choice of choices) {
      if (!actionText(choice).includes('share via android apps')) continue;
      for (let parent = choice.parentElement, depth = 0; parent && depth < 12;
        parent = parent.parentElement, depth++) {
        const t = String(parent.textContent || '').toLowerCase();
        if (t.length < 3000 && t.includes('share post') && t.includes('copy') &&
            t.includes('close') && t.includes('whatsapp')) return parent;
      }
    }
    return null;
  }
  function resolvePanelPostId(panel) {
    for (const input of panel.querySelectorAll('input,textarea,a[href]')) {
      const candidate = input.value || input.getAttribute('href') || '';
      const id = idFromLink(candidate);
      if (id) return id;
    }
    for (const el of panel.querySelectorAll('code,[data-post-id]')) {
      const id = fromNode(el) || idFromLink(el.textContent || '');
      if (id) return id;
    }
    return currentPostId;
  }
  function updateLinkDisplay(panel, id) {
    const link = shareUrl(id);
    for (const input of panel.querySelectorAll('input[readonly],textarea[readonly]')) {
      if (/^(?:https?:\/\/|traydaq:\/\/|intent:\/\/)/i.test(input.value || '')) {
        input.value = link;
        input.setAttribute('value', link);
      }
    }
    for (const node of panel.querySelectorAll('code')) {
      if (/^(?:https?:\/\/|traydaq:\/\/|intent:\/\/)/i.test(node.textContent.trim())) {
        node.textContent = link;
      }
    }
  }
  function notify(message) {
    if (typeof window.showToast === 'function') window.showToast(message);
    else {
      const notice = document.createElement('div');
      notice.setAttribute('role', 'status');
      notice.textContent = message;
      notice.style.cssText = 'position:fixed;bottom:88px;left:20px;right:20px;z-index:2147483000;padding:14px;background:#0b5c3d;color:white;text-align:center;border-radius:14px;font:600 14px system-ui';
      document.body.appendChild(notice);
      setTimeout(() => notice.remove(), 3500);
    }
  }
  async function copyLink(link) {
    try {
      if (!navigator.clipboard?.writeText) throw Error('Clipboard permission needed');
      await navigator.clipboard.writeText(link);
    } catch (_) {
      const input = document.createElement('textarea');
      input.value = link;
      input.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.appendChild(input);
      input.select();
      const copied = document.execCommand('copy');
      input.remove();
      if (!copied) throw Error('Copy unavailable');
    }
    notify('Post link copied');
  }
  function external(url) {
    // This is a user-click handler: popup protection will not reject the gesture.
    const popup = window.open(url, '_blank', 'noopener,noreferrer');
    if (!popup) window.location.assign(url);
  }
  function actionFor(button) {
    const s = actionText(button);
    if (s.includes('share via android apps')) return 'native';
    if (s === 'copy' || s === 'copy link' || s.endsWith(' copy')) return 'copy';
    if (s.includes('whatsapp')) return 'whatsapp';
    if (s.includes('telegram')) return 'telegram';
    if (s === 'x' || s.includes('twitter')) return 'x';
    if (s.includes('facebook')) return 'facebook';
    return '';
  }
  async function runShareAction(action, link) {
    const title = 'Watch this post on TRAYDAQ';
    try {
      if (action === 'copy') return await copyLink(link);
      if (action === 'native') {
        // Capacitor's Android chooser is preferred in the installed APK.
        const nativeShare = window.Capacitor?.Plugins?.Share;
        if (typeof nativeShare?.share === 'function') {
          await nativeShare.share({ title, text: title, url: link, dialogTitle: 'Share TRAYDAQ post' });
        } else if (typeof navigator.share === 'function') {
          await navigator.share({ title, text: title, url: link });
        } else return copyLink(link);
        return;
      }
      if (action === 'whatsapp') return external('https://wa.me/?text=' + encodeURIComponent(title + '\n' + link));
      if (action === 'telegram') return external('https://t.me/share/url?url=' + encodeURIComponent(link) + '&text=' + encodeURIComponent(title));
      if (action === 'x') return external('https://twitter.com/intent/tweet?url=' + encodeURIComponent(link) + '&text=' + encodeURIComponent(title));
      if (action === 'facebook') return external('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(link));
    } catch (error) {
      if (error && error.name !== 'AbortError') notify('Unable to share this post. Try copying its link.');
    }
  }
  document.addEventListener('click', event => {
    const button = event.target?.closest?.('button,a,[role="button"]');
    if (!button) return;
    const panel = findPanel();
    if (panel && panel.contains(button)) {
      const action = actionFor(button);
      if (!action) return; // Save media, close and other original controls keep their handlers.
      const id = resolvePanelPostId(panel);
      if (!validId(id)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        notify('Unable to find this post. Open the post and try sharing again.');
        return;
      }
      currentPostId = id;
      updateLinkDisplay(panel, id);
      event.preventDefault();
      event.stopImmediatePropagation(); // Prevent the old handler from sending a raw media URL.
      void runShareAction(action, shareUrl(id));
      return;
    }
    const label = actionText(button);
    const reel = button.closest('.reel-card,.post-card,.feed-post,[data-post-id],[data-reel-id]');
    if (reel && (/share/.test(label) || button.matches('[data-post-action="share"],[data-share-post]'))) {
      // Clear stale context before another post's share dialog opens.
      currentPostId = fromNode(button) || uniqueMediaPostId(reel);
    }
  }, true);

  function receivePost(id) {
    if (!validId(id)) return;
    window.__tdPostLinkPending = id;
    const start = Date.now();
    function open() {
      if (window.__tdPostLinkPending !== id) return;
      try {
        if (typeof window.navigate === 'function') {
          window._sfActiveFeedTab = 'for_you';
          window.navigate('feed', id); // Existing feed route accepts the target post ID.
          window.__tdPostLinkPending = '';
          return;
        }
      } catch (_) { /* Login or initial page boot can postpone routing. */ }
      if (Date.now() - start < 30000) setTimeout(open, 500);
    }
    open();
  }
  window.addEventListener('traydaq-post-link', event => receivePost(event.detail?.postId));
  try {
    const launch = window.TraydaqPostLinks?.currentPostId();
    if (launch) receivePost(launch);
  } catch (_) { /* Browser builds do not contain the Android bridge. */ }
  try {
    const app = window.Capacitor?.Plugins?.App;
    app?.getLaunchUrl?.().then(value => receivePost(idFromLink(value?.url))).catch(() => {});
    app?.addListener?.('appUrlOpen', value => receivePost(idFromLink(value?.url)));
  } catch (_) { /* The Android bridge above also handles launches without this plugin. */ }
})();
