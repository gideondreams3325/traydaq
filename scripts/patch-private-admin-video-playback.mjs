import fs from 'node:fs';
import path from 'node:path';

// Public APK-build patch. Private source and media records stay private.
// tdAdminPlayableVideo2026 is a build marker, not a user-data migration.
const MARKER = 'tdAdminPlayableVideo2026';
// Calls are wrapped without modifying the original card renderer.

function tdAdminSafeVideoUrl(input) {
  if (typeof input !== 'string') return '';
  const url = input.trim();
  return /^(?:https?:\/\/|blob:|\/(?!\/)|\.\/)/i.test(url) ? url : '';
}

function tdAdminVideoPostSource(post) {
  if (!post || typeof post !== 'object') return '';
  const media = Array.isArray(post.media) ? post.media[0] :
    (post.media && typeof post.media === 'object' ? post.media : null);
  const kind = String(post.mediaType || post.mimeType || post.fileType ||
    post.mediaKind || post.kind || post.type ||
    (media && (media.type || media.mimeType)) || '').toLowerCase();
  const candidates = [
    post.videoUrl, post.mediaUrl, post.video, post.fileUrl, post.originalMediaUrl,
    media && (media.videoUrl || media.mediaUrl || media.url)
  ];
  const source = candidates.map(tdAdminSafeVideoUrl).find(Boolean) || '';
  const videoFile = /(?:\.|%2e)(?:mp4|webm|mov|m4v|ogv)(?:[?#&\/]|$)/i.test(source);
  return (/video|reel|clip/.test(kind) || videoFile) ? source : '';
}

function tdAdminPlayablePostCard(id, post) {
  const html = adminPostCard(id, post);
  if (typeof html !== 'string') return html;
  const source = tdAdminVideoPostSource(post);
  if (!source) return html;

  // Preserve all existing moderation buttons, badges and post metadata.
  const template = document.createElement('template');
  template.innerHTML = html;
  const imgs = Array.from(template.content.querySelectorAll('img'));
  const candidate = template.content.querySelector('video') ||
    imgs.find(img => /object-cover|w-full|aspect-/.test(img.className || '') &&
      !/avatar|rounded-full|profile/i.test(img.className || '')) ||
    imgs.find(img => !/avatar|profile/i.test(img.getAttribute('alt') || '') &&
      !/rounded-full/i.test(img.className || ''));
  if (!candidate) return html;

  const player = document.createElement('video');
  player.className = candidate.className || '';
  player.classList.add('td-admin-inline-video');
  player.src = source;
  player.controls = true;
  player.playsInline = true;
  player.preload = 'metadata';
  player.setAttribute('webkit-playsinline', '');
  player.setAttribute('aria-label', 'Play this video within admin moderation');
  // Interacting with playback must not navigate to Watch in Feed.
  player.setAttribute('onclick', 'event.stopPropagation()');
  player.setAttribute('onpointerdown', 'event.stopPropagation()');

  const posters = [
    post && post.coverUrl, post && post.thumbnailUrl, post && post.posterUrl,
    candidate.getAttribute('poster'), candidate.getAttribute('src')
  ];
  const poster = posters.find(value => {
    const url = typeof value === 'string' ? value.trim() : '';
    return /^(?:https?:\/\/|data:image\/|blob:|\/(?!\/)|\.\/)/i.test(url) &&
      !/\.(?:mp4|webm|mov|m4v|ogv)(?:[?#]|$)/i.test(url);
  });
  if (poster) player.poster = poster;
  candidate.replaceWith(player);
  return template.innerHTML;
}

export function patchAdminPlayableVideos(html) {
  if (typeof html !== 'string' || html.includes(MARKER)) {
    throw new Error('Admin playable-video source already patched or invalid');
  }
  // Keep the existing renderer intact. Wrap card calls in the overview,
  // review queue and Posts management screens with our video enhancement.
  let count = 0;
  html = html.replace(/\badminPostCard\s*\(/g, (match, index) => {
    const before = html.slice(Math.max(0, index - 90), index);
    if (/\bfunction\s+$/.test(before) || /[.\w]$/.test(before)) return match;
    count += 1;
    return 'tdAdminPlayablePostCard(';
  });
  if (count < 1 || !html.includes('tdAdminPlayablePostCard(x.id, x.data)')) {
    throw new Error('Expected admin post-card rendering calls not found');
  }
  const at = html.indexOf('  function sfAdminOverview(users, posts');
  if (at < 0) throw new Error('Admin renderer insertion point changed');
  const runtime = '// ' + MARKER + '\n' +
    [tdAdminSafeVideoUrl, tdAdminVideoPostSource, tdAdminPlayablePostCard].map(fn => fn.toString()).join('\n\n');
  return html.slice(0, at) + runtime + '\n' + html.slice(at);
}

export function selfTest() {
  const stub = '<html><script>function adminPostCard(id,p) {' +
    'return "<article><img class=\\"w-full object-cover\\" src=\\"poster.jpg\\"></article>";' +
    '} function useCard(){ return adminPostCard(1, {mediaType:"video",mediaUrl:"https://example.com/a.mp4"}); }' +
    '\n  function sfAdminOverview(users, posts){return adminPostCard(posts[0].id, posts[0].data);}' +
    '\n  function load(){ return adminPostCard(x.id, x.data); }' +
    '</script></html>';
  const patched = patchAdminPlayableVideos(stub);
  const script = patched.slice(patched.indexOf('<script>') + 8, patched.indexOf('</script>'));
  new Function(script);
  if (!patched.includes('tdAdminPlayablePostCard(x.id, x.data)') ||
      !patched.includes('player.controls = true') ||
      !patched.includes('player.playsInline = true') ||
      !patched.includes("player.preload = 'metadata'")) {
    throw new Error('Video controls or inline playback missing');
  }
  const video = { mediaType: 'video/mp4', mediaUrl: 'https://example.com/a.mp4' };
  if (tdAdminVideoPostSource(video) !== video.mediaUrl ||
      tdAdminVideoPostSource({ mediaType: 'image/jpeg', mediaUrl: 'https://example.com/a.jpg' })) {
    throw new Error('Video and photo classifications are incorrect');
  }
  let rejected = false;
  try { patchAdminPlayableVideos(patched); } catch (_) { rejected = true; }
  if (!rejected) throw new Error('Repeat patch was not rejected');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  if (process.argv[2] === '--self-test') {
    selfTest();
    console.log('PASS: inline admin video playback patch tests');
  } else {
    const filename = path.join(path.resolve(process.argv[2] || '.'), 'index.html');
    const previous = fs.readFileSync(filename, 'utf8');
    fs.writeFileSync(filename, patchAdminPlayableVideos(previous));
    console.log('PASS: video previews in admin post cards are directly playable');
  }
}
