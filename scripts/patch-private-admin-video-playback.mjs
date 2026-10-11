import fs from 'node:fs';
import path from 'node:path';

// Public APK-build patch. Private source and media records stay private.
// tdAdminPlayableVideo2026 is a build marker, not a user-data migration.
const MARKER = 'tdAdminPlayableVideo2026';
const DECLARATIONS = [
  { re: /\bfunction\s+adminPostCard\s*\(/g, replace: 'function tdAdminOriginalPostCard(' },
  { re: /\b(?:const|let)\s+adminPostCard\s*=\s*(?:async\s*)?function\s*\(/g,
    replace: match => match.replace('adminPostCard', 'tdAdminOriginalPostCard') },
  { re: /\b(?:const|let)\s+adminPostCard\s*=\s*(?:async\s*)?\(/g,
    replace: match => match.replace('adminPostCard', 'tdAdminOriginalPostCard') }
];

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

function adminPostCard(id, post) {
  const html = tdAdminOriginalPostCard(id, post);
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
  const found = [];
  for (const definition of DECLARATIONS) {
    for (const match of html.matchAll(definition.re)) found.push({ ...definition, match });
  }
  if (found.length !== 1) {
    throw new Error('Expected one adminPostCard definition; found ' + found.length);
  }
  const { match, replace } = found[0];
  const renamed = typeof replace === 'function' ? replace(match[0]) : replace;
  const runtime = '// ' + MARKER + '\n' +
    [tdAdminSafeVideoUrl, tdAdminVideoPostSource, adminPostCard].map(fn => fn.toString()).join('\n\n');
  const i = match.index;
  const next = html.slice(0, i) + runtime + '\n' + renamed +
    html.slice(i + match[0].length);
  if (!next.includes('function adminPostCard(id, post)') ||
      !next.includes('tdAdminOriginalPostCard(')) {
    throw new Error('Original moderation renderer not preserved');
  }
  return next;
}

export function selfTest() {
  const stub = '<html><script>function adminPostCard(id,p) {' +
    'return "<article><img class=\\"w-full object-cover\\" src=\\"poster.jpg\\"></article>";' +
    '}</script></html>';
  const patched = patchAdminPlayableVideos(stub);
  const script = patched.slice(patched.indexOf('<script>') + 8, patched.indexOf('</script>'));
  new Function(script);
  if (!patched.includes('player.controls = true') ||
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
