import fs from 'node:fs';
import path from 'node:path';
// Run in the private checkout of the public Android APK builder only.
const MARKER = 'tdAdminVideoPreview2026';
const FUNC = '  function renderAdminPostItem(uid, p, mode){';
const START = "    let mediaElement = '';";
const END = "    let statusPill = '';";
const NEW_MEDIA = "    const tdAdminMediaUrl = p.mediaUrl || p.videoUrl || '';\n    const tdAdminVideo = isVid || /^video(?:\\/|$)/i.test(String(p.type || p.kind || ''));\n    const tdAdminVideoPoster = [p.coverUrl, p.thumbnailUrl, p.posterUrl].find(u =>\n      typeof u === 'string' && u.trim() && !/\\.(?:mp4|webm|mov|m4v|ogv)(?:[?#]|$)/i.test(u)) || '';\n    let mediaElement = '';\n    if(tdAdminMediaUrl){\n      mediaElement = tdAdminVideo ? `\n        <div class=\"td-admin-video-shell relative w-full sm:w-56 aspect-video sm:aspect-[4/3] rounded-2xl overflow-hidden bg-black shrink-0 border border-gray-200\" data-td-admin-video-card>\n          <video class=\"td-admin-video-player\" src=\"${esc(tdAdminMediaUrl)}\" poster=\"${esc(tdAdminVideoPoster)}\" controls playsinline webkit-playsinline preload=\"metadata\" data-td-admin-video data-post-id=\"${esc(uid)}\" aria-label=\"Play this video in the moderation dashboard\">Your browser cannot play this video.</video>\n          <button type=\"button\" class=\"td-admin-video-play\" data-td-admin-play aria-label=\"Play video preview\"><span aria-hidden=\"true\">▶</span><small>Play video</small></button>\n          <span class=\"td-admin-video-label\" aria-hidden=\"true\">🎬 Video</span>\n          <span class=\"td-admin-video-error\" data-td-admin-video-error hidden role=\"status\">Video unavailable. Check the media file.</span>\n        </div>\n      ` : `\n        <div class=\"relative w-full sm:w-44 h-44 sm:h-48 rounded-2xl overflow-hidden bg-white shrink-0 border border-gray-200 group flex items-center justify-center\">\n          <img src=\"${esc(tdAdminMediaUrl)}\" class=\"w-full h-full object-cover group-hover:scale-105 transition duration-300 block\" alt=\"\" loading=\"lazy\" data-media-path=\"${esc(mediaPath)}\" data-post-id=\"${esc(uid)}\" onerror=\"window.__sfAdminMediaError(this, 'photo')\">\n          <span class=\"absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-white text-gray-900 border border-gray-200 pointer-events-none select-none z-10\">📷 Photo</span>\n        </div>\n      `;\n    } else {\n      mediaElement = `\n        <div class=\"relative w-full sm:w-44 h-28 sm:h-48 rounded-2xl overflow-hidden bg-white shrink-0 border border-gray-200 flex flex-col items-center justify-center p-3 text-center text-gray-500 select-none\">\n          <span class=\"text-2xl mb-1 text-gray-600\">📝</span>\n          <span class=\"text-xs font-bold text-gray-700\">Text Post</span>\n          <span class=\"text-[10px] text-gray-500 mt-0.5\">No media attached</span>\n        </div>\n      `;\n    }\n";
export function patchAdminVideoPreviews(source, runtime, css) {
  if (typeof source !== 'string' || typeof runtime !== 'string' || typeof css !== 'string')
    throw new TypeError('Source, runtime, and CSS must be strings');
  if (source.includes(MARKER)) throw new Error('Admin video preview patch already installed');
  if (!runtime.includes('__tdAdminVideoPreview2026') || !runtime.includes('video.play()') ||
      !css.includes('.td-admin-video-player')) throw new Error('Missing native video player assets');
  if (/<\/script/i.test(runtime) || /<\/style/i.test(css)) throw new Error('Unsafe inline asset content');
  new Function(runtime);
  const index = source.indexOf(FUNC);
  if (index === -1 || source.indexOf(FUNC, index + FUNC.length) !== -1)
    throw new Error('Admin post-card renderer anchor missing or duplicated');
  const start = source.indexOf(START, index + FUNC.length);
  const end = source.indexOf(END, start + START.length);
  const nextFunction = source.indexOf('  function sfAdminPosts(', index);
  if (start < 0 || end < 0 || nextFunction < end || end - start > 9000)
    throw new Error('Admin media section bounds changed');
  const current = source.slice(start, end);
  if (!current.includes('esc(isVid ? (p.coverUrl || p.thumbnailUrl') ||
      !current.includes("window.__sfAdminMediaError(this, 'photo')") ||
      !current.includes("No media attached"))
    throw new Error('Original thumbnail source changed; refusing unsafe patch');
  if (!source.includes('</head>') || !source.includes('</body>'))
    throw new Error('App document closing tags missing');
  let output = source.slice(0, start) + NEW_MEDIA + source.slice(end);
  output = output.replace('</head>', '<style id="tdAdminVideoPreview2026Styles">\n' + css + '\n</style>\n</head>');
  output = output.replace('</body>', '<script id="tdAdminVideoPreview2026">\n' + runtime + '\n</script>\n</body>');
  if (!output.includes('video[data-td-admin-video]') || !output.includes('data-admin-takedown-post'))
    throw new Error('Moderation playback or takedown action missing after patch');
  return output;
}
export function main(root='.', runtimeFile, cssFile) {
  if (!runtimeFile || !cssFile) throw new Error('Runtime JS and CSS paths required');
  const file=path.join(path.resolve(root), 'index.html');
  const input=fs.readFileSync(file,'utf8');
  const output=patchAdminVideoPreviews(input,fs.readFileSync(runtimeFile,'utf8'),fs.readFileSync(cssFile,'utf8'));
  fs.writeFileSync(file,output);
  console.log('PASS: moderation videos play inline in live, review and restoration tabs.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname))
  main(process.argv[2],process.argv[3],process.argv[4]);
