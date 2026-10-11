import fs from 'node:fs';
import path from 'node:path';

// Public build-time patch for the temporary private TRAYDAQ APK checkout.
// Never commit the private app files, account records or credentials here.
function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) !== -1) {
    throw Error('TRAYDAQ Profile Visits source changed: ' + label);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

const visitorBlock = [
  '      const rows = await Promise.all(visitors.map(async ([id,info]) => {',
  '        let profile = {};',
  "        try { profile = (await database.ref('publicProfiles/' + id).once('value')).val() || {}; } catch (_) {}",
  '        // Never invent a username from the display name. Route by immutable UID.',
  "        const username = String(profile.username || profile.userName || profile.handle || '').replace(/^@/, '').trim();",
  "        const display = username ? '@' + username : String(profile.displayName || profile.name || 'TRAYDAQ member');",
  '        const initial = (display.replace(/^@/, "").trim().charAt(0) || "T").toUpperCase();',
  '        const pictureValue = profile.photoURL || profile.photoUrl || profile.avatarUrl || profile.avatarURL ||',
  '          profile.profilePicture || profile.profileImage || profile.profilePic || profile.avatar ||',
  '          profile.imageUrl || profile.picture || profile.photo || "";',
  '        const picture = typeof pictureValue === "string" ? pictureValue :',
  '          (pictureValue && typeof pictureValue === "object" ? pictureValue.url || pictureValue.src || "" : "");',
  '        // Only render safe image URL schemes; always keep an initial fallback.',
  '        const avatar = typeof picture === "string" &&',
  '          (/^https:\\/\\//i.test(picture) || /^\\/(?!\\/)/.test(picture) || /^data:image\\/(?:png|jpe?g|webp|gif);base64,/i.test(picture)) ? picture : "";',
  '        const fallback = \'<span class="td-visitor-initial" aria-hidden="true">\' + esc(initial) + \'</span>\';',
  '        const photo = avatar ? \'<img class="td-visitor-photo" src="\' + esc(avatar) + \'" loading="lazy" decoding="async" alt="">\' : "";',
  '        return \'<button type="button" class="sf-social-visitor td-visitor-row" data-sf-visitor="\' + esc(id) +',
  '          \'" data-sf-visitor-username="\' + esc(username) + \'" aria-label="View \' + esc(display) +',
  '          \' profile"><span class="td-visitor-person"><span class="td-visitor-avatar">\' + photo + fallback +',
  '          \'</span><span class="td-visitor-username">\' + esc(display) + \'</span></span><small>\' +',
  '          esc(new Date(info.visitedAt).toLocaleDateString("en-GH")) + \'</small></button>\';',
  '      }));',
  '      if (!result || !overlay.isConnected || uid() !== owner) return;',
  "      result.innerHTML = rows.join('');",
  "      result.querySelectorAll('.td-visitor-photo').forEach(photo => {",
  "        photo.addEventListener('error', () => { photo.remove(); });",
  '      });',
  "      result.querySelectorAll('[data-sf-visitor]').forEach(b => b.addEventListener('click', () => {",
  '        const visitorUid = b.dataset.sfVisitor;',
  '        if (!valid(visitorUid) || uid() !== owner || typeof win.openUserProfile !== "function") return;',
  '        close();',
  '        // Pass the real username as an identity hint, never use it instead of UID.',
  '        win.openUserProfile(visitorUid, { username: b.dataset.sfVisitorUsername || undefined });',
  '      }));'
].join('\n');

const css = [
  '/* TRAYDAQ Profile Visits: tappable avatar + username; white/green/gold. */',
  '#sfProfileVisitsList .td-visitor-row{min-height:70px;gap:12px;padding:11px 2px;cursor:pointer;color:#17291e}',
  '#sfProfileVisitsList .td-visitor-row:active{background:#f2f9f4}',
  '#sfProfileVisitsList .td-visitor-row:focus-visible{outline:3px solid #176d44;outline-offset:2px;border-radius:12px}',
  '#sfProfileVisitsList .td-visitor-person{display:flex;align-items:center;gap:12px;min-width:0;flex:1}',
  '#sfProfileVisitsList .td-visitor-avatar{display:grid;place-items:center;position:relative;width:48px;height:48px;flex:0 0 48px;overflow:hidden;border-radius:50%;background:#e5f4e9;border:2px solid #dbb13c;color:#14663a}',
  '#sfProfileVisitsList .td-visitor-initial{font-size:20px;font-weight:900;line-height:1}',
  '#sfProfileVisitsList .td-visitor-photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%;background:#e5f4e9}',
  '#sfProfileVisitsList .td-visitor-username{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:15px;font-weight:800}',
  '#sfProfileVisitsList .td-visitor-row small{flex:0 0 auto;font-size:12px;color:#61716a}',
  '@media(hover:hover){#sfProfileVisitsList .td-visitor-row:hover{background:#f2f9f4;border-radius:12px}}',
  '@media(max-width:370px){#sfProfileVisitsList .td-visitor-avatar{width:42px;height:42px;flex-basis:42px}#sfProfileVisitsList .td-visitor-person{gap:8px}}'
].join('\n');

export function patchVisitorProfiles(js) {
  if (typeof js !== 'string' || !js.includes('async function openVisits()')) {
    throw Error('TRAYDAQ Profile Visits: missing visitor module');
  }
  if (js.includes('td-visitor-row')) throw Error('TRAYDAQ Profile Visits: patch already applied');
  const start = js.indexOf('      const rows = await Promise.all(visitors.map(async ([id,info]) => {');
  const end = js.indexOf('\n    } catch (_) {', start);
  if (start < 0 || end <= start || end - start > 2200) {
    throw Error('TRAYDAQ Profile Visits: visit listing changed, refusing unsafe edit');
  }
  const old = js.slice(start,end);
  if (!old.includes("database.ref('publicProfiles/' + id)") ||
      !old.includes("win.openUserProfile(b.dataset.sfVisitor)") ||
      !old.includes('result.innerHTML = rows.join')) {
    throw Error('TRAYDAQ Profile Visits: expected visitor behavior missing');
  }
  return js.slice(0,start) + visitorBlock + js.slice(end);
}

export function patchVisitorStyles(html) {
  if (!html.includes('</head>') || html.includes('id="tdProfileVisitors2026"'))
    throw Error('TRAYDAQ Profile Visits: missing HTML head or duplicate patch');
  return replaceOnce(html, '</head>',
    '<style id="tdProfileVisitors2026">\n' + css + '\n</style>\n</head>', 'HTML head');
}

export function main(root = '.') {
  const folder = path.resolve(root);
  const jsFile = path.join(folder,'profile-social-panels.js');
  const htmlFile = path.join(folder,'index.html');
  const js = patchVisitorProfiles(fs.readFileSync(jsFile,'utf8'));
  const html = patchVisitorStyles(fs.readFileSync(htmlFile,'utf8'));
  new Function(js);
  // Write only when both patches and the JavaScript syntax check pass.
  fs.writeFileSync(jsFile,js);
  fs.writeFileSync(htmlFile,html);
  console.log('PASS: Profile Visits now shows real account avatars, usernames and UID-based profile links.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main(process.argv[2] || '.');
}
