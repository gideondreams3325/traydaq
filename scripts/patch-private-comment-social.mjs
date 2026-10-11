import fs from 'node:fs';
import path from 'node:path';

// Public APK build patch. Private files are changed only in the Actions runner.
export function patchCommentSocial(html, runtime) {
  if (typeof html !== 'string' || !html.includes('</body>') ||
      !html.includes('</head>')) throw Error('TRAYDAQ comments: app shell missing.');
  if (html.includes('tdCommentProfiles2026')) throw Error('TRAYDAQ comments: patch already installed.');
  if (typeof runtime !== 'string' || !runtime.includes('__tdCommentSocialLoaded') ||
      !runtime.includes("ref('commentLikes/' + key).set(next)"))
    throw Error('TRAYDAQ comments: incomplete client module.');
  const original = '<section class="comment-sheet">';
  const occurrences = html.split(original).length - 1;
  if (occurrences !== 2 || !html.includes('openCommentPanel=async function(id,initialPost)') ||
      !html.includes('data-comment-react=') || !html.includes('data-comment-profile=')) {
    throw Error('TRAYDAQ comments: comment markup changed; refusing incompatible build patch.');
  }
  // Both comment sheets use the authenticated immutable post identifier.
  html = html.split(original).join(
    '<section class="comment-sheet" data-td-comment-post-id="${esc(id)}">'
  );
  const css = [
    '.comment-sheet [data-comment-profile]{cursor:pointer;touch-action:manipulation;text-align:left;min-height:34px}',
    '.comment-sheet [data-comment-profile]:focus-visible,.comment-sheet [data-comment-react]:focus-visible{outline:3px solid #087743;outline-offset:2px;border-radius:10px}',
    '.comment-sheet [data-comment-profile]:active{opacity:.75}',
    '.comment-sheet [data-comment-profile] img{width:38px;height:38px;object-fit:cover;border-radius:50%;border:1.5px solid #e3b43e}',
    '.comment-sheet [data-comment-react]{display:inline-flex;gap:6px;align-items:center;justify-content:center;min-height:38px;min-width:53px;border:1px solid #e1e9df;border-radius:11px;color:#22563b;background:#fff;touch-action:manipulation}',
    '.comment-sheet [data-comment-react].td-comment-liked{color:#b3264c;background:#fff2f3;border-color:#f1bfca}',
    '.comment-sheet .td-comment-profile-link:not(:has(img)){color:#14673c;font-weight:800}',
    '.comment-sheet{color:#132a1b;background:#fff}',
    '@media(max-width:370px){.comment-sheet [data-comment-react]{min-width:46px}}'
  ].join('\n');
  if (runtime.includes('</script')) throw Error('TRAYDAQ comments: unescaped closing tag.');
  html = html.replace('</head>', '<style id="tdCommentProfiles2026">\n' + css + '\n</style>\n</head>');
  html = html.replace('</body>',
    '<script id="tdCommentProfiles2026Runtime">\n' + runtime + '\n</script>\n</body>');
  if (html.split('data-td-comment-post-id=').length !== 3 ||
      !html.includes("window.openUserProfile(uid, { username:")) {
    throw Error('TRAYDAQ comments: missing UID routing or post ID.');
  }
  return html;
}
export function main(root = '.', runtimeFile) {
  if (!runtimeFile) throw Error('TRAYDAQ comments: specify downloaded public runtime.');
  const target = path.join(path.resolve(root), 'index.html');
  const source = fs.readFileSync(target, 'utf8');
  const runtime = fs.readFileSync(runtimeFile, 'utf8');
  const patched = patchCommentSocial(source, runtime);
  fs.writeFileSync(target, patched, 'utf8');
  console.log('PASS: comment avatars, usernames, profile navigation and unique likes enabled.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname))
  main(process.argv[2] || '.', process.argv[3]);