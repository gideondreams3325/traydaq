import fs from 'node:fs';
import path from 'node:path';

// Public build-time branding patch; never edit roles, database paths or user content.
const TICK = String.fromCharCode(96);
const ADMIN_WORD = /\badmin(?:istrator|istrators|istrative)?\b/i;
function teamCopy(value) {
  if (!ADMIN_WORD.test(value)) return value;
  return value
    .replace(/\bnon-admin\b/gi, 'unauthorized')
    .replace(/\b(?:TRAYDAQ|Traydaq)\s+Admin(?:istrator)?\b/gi, 'TRAYDAQ Security Team')
    .replace(/\bAdmin(?:istrator)?\s+(?:Dashboard|Portal|Panel|Console)\b/gi, 'TRAYDAQ Security Team Portal')
    .replace(/\b(?:contact|message|email|reach|ask|notify)\s+(?:the\s+)?admin\b/gi, m =>
      m.replace(/\badmin\b/i, 'TRAYDAQ Team'))
    .replace(/\badministrators\b/gi, 'TRAYDAQ Security Team members')
    .replace(/\badministrator\b/gi, 'TRAYDAQ Security Team member')
    .replace(/\badministrative\b/gi, 'security team')
    .replace(/\badmins\b/gi, 'TRAYDAQ Security Team members')
    .replace(/\badmin\b/gi, 'TRAYDAQ Security Team');
}
function looksLikeCopy(text) {
  if (!ADMIN_WORD.test(text)) return false;
  const s = text.trim();
  if (!s || s === 'admin') return false; // authentication role value
  if (/^(?:\/|https?:|wss?:|[.#]|data-|aria-|sf-|td-)/i.test(s)) return false;
  if (/^(?:admin|administrator)[_./-][\w./-]+$/i.test(s)) return false;
  if (/[\w./-]+[_./-](?:admin|administrator)(?:[_./-]|$)/i.test(s) && !/\s/.test(s)) return false;
  if (/^(?:role|type|user_role|userRole)\s*[:=]/i.test(s)) return false;
  if (/^(?:\/api\/|api\/|admin\/)/i.test(s)) return false;
  return /[A-Z\s!?]/.test(s) || /[<>]/.test(s);
}
function renameVisible(value) {
  return looksLikeCopy(value) ? teamCopy(value) : value;
}
function renameTagAttributes(tag) {
  // Never edit href, name, value, data-*, class, id, action, role or handlers.
  return tag.replace(/\b(placeholder|aria-label|title|alt|content)\s*=\s*(["'])([\s\S]*?)\2/gi,
    (match, key, quote, value) => key + '=' + quote + renameVisible(value) + quote);
}
function rewriteMarkup(source) {
  return source.split(/(<[^>]*>)/g).map(part => part.startsWith('<')
    ? renameTagAttributes(part) : renameVisible(part)).join('');
}
function rewriteLiteral(body) {
  if (!ADMIN_WORD.test(body)) return body;
  if (body.includes('<') && body.includes('>')) return rewriteMarkup(body);
  return renameVisible(body);
}
function rawQuoteEnd(source, i) {
  const quote = source[i]; let j = i + 1;
  for (; j < source.length; j++) {
    if (source[j] === '\\') { j++; continue; }
    if (source[j] === quote) return j;
  }
  return source.length;
}
function interpolationEnd(source, start) {
  let depth = 1;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (c === "'" || c === '"' || c === TICK) { i = rawQuoteEnd(source, i); continue; }
    if (c === '/' && source[i + 1] === '/') {
      i = source.indexOf('\n', i + 2); if (i < 0) return -1; continue;
    }
    if (c === '/' && source[i + 1] === '*') {
      i = source.indexOf('*/', i + 2); if (i < 0) return -1; i++; continue;
    }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  return -1;
}
export function rewriteJavaScript(source) {
  let out = '';
  for (let i = 0; i < source.length;) {
    const c = source[i];
    if (c === '/' && source[i + 1] === '/') {
      let end = source.indexOf('\n', i + 2);
      if (end < 0) end = source.length;
      out += source.slice(i, end); i = end; continue;
    }
    if (c === '/' && source[i + 1] === '*') {
      let end = source.indexOf('*/', i + 2);
      if (end < 0) end = source.length - 2;
      out += source.slice(i, end + 2); i = end + 2; continue;
    }
    if (c !== "'" && c !== '"' && c !== TICK) { out += c; i++; continue; }
    const quote = c;
    out += quote; i++;
    let start = i;
    let ended = false;
    while (i < source.length) {
      if (source[i] === '\\') { i += 2; continue; }
      if (quote === TICK && source[i] === '$' && source[i + 1] === '{') {
        out += rewriteLiteral(source.slice(start, i)) + '$' + '{';
        const end = interpolationEnd(source, i + 2);
        if (end < 0) throw Error('Unbalanced template expression in source');
        out += rewriteJavaScript(source.slice(i + 2, end)) + '}';
        i = end + 1; start = i; continue;
      }
      if (source[i] === quote) {
        out += rewriteLiteral(source.slice(start, i)) + quote;
        i++; ended = true; break;
      }
      i++;
    }
    if (!ended) {
      out += source.slice(start);
      i = source.length;
    }
  }
  return out;
}
export function rewriteHtml(source) {
  const blocks = [];
  const masked = source.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, block => {
    const id = blocks.length;
    blocks.push(block);
    return 'TRAYDAQ_PRESERVE_BLOCK_' + id + '_END';
  });
  const visible = rewriteMarkup(masked);
  return visible.replace(/TRAYDAQ_PRESERVE_BLOCK_(\d+)_END/g, (_, n) => {
    const block = blocks[Number(n)];
    if (/^<style\b/i.test(block)) return block;
    return block.replace(/^(<script\b[^>]*>)([\s\S]*?)(<\/script\s*>)$/i,
      (_, open, js, close) => open + rewriteJavaScript(js) + close);
  });
}
export function patchTraydaqTeamBranding(root) {
  const files = [];
  for (const folder of ['', 'admin', 'legal']) {
    const dir = path.join(root, folder);
    if (!fs.existsSync(dir)) continue;
    for (const item of fs.readdirSync(dir, {withFileTypes:true})) {
      if (!item.isFile() || !/\.(?:html|js)$/i.test(item.name)) continue;
      if (!folder && /^(?:server|capacitor|sw|firebase-messaging-sw)\.js$/i.test(item.name)) continue;
      files.push(path.join(dir, item.name));
    }
  }
  if (!files.some(p => p === path.join(root, 'index.html'))) {
    throw Error('TRAYDAQ team branding: app entry point not found');
  }
  const changed = [];
  for (const file of files) {
    const before = fs.readFileSync(file, 'utf8');
    const after = file.endsWith('.html') ? rewriteHtml(before) : rewriteJavaScript(before);
    if (after !== before) {
      fs.writeFileSync(file, after, 'utf8');
      changed.push(path.relative(root, file));
    }
  }
  const app = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  if (!app.includes('TRAYDAQ Security Team') && !app.includes('TRAYDAQ Team')) {
    throw Error('No team branding found in main app after patch');
  }
  console.log('PASS: TRAYDAQ user-facing branding; updated ' + changed.length +
    ' client files. Administrator roles and technical keys remain unchanged.');
  return changed;
}
if (process.argv[1] && import.meta.url === 'file://' + process.argv[1]) {
  patchTraydaqTeamBranding(path.resolve(process.argv[2] || '.'));
}
