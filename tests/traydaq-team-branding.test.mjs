import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const source = process.env.TD_BRANDING_PATCH_FILE ||
  path.resolve('scripts/patch-private-team-branding.mjs');
const {rewriteHtml, rewriteJavaScript, patchTraydaqTeamBranding} =
  await import(pathToFileURL(source).href);

const markup = [
  '<div id="adminArea" class="td-admin-settings">',
  '<h1>TRAYDAQ ADMIN</h1>',
  '<label>Administrator Username</label>',
  '<a href="/admin" aria-label="Admin Portal">Contact admin</a>',
  '<p>Music goes live and enters admin review.</p>',
  '<script>const role="admin"; const greeting="Admin";</script>',
  '</div>'
].join('');
const updated = rewriteHtml(markup);
assert.match(updated, /<h1>TRAYDAQ Security Team<\/h1>/);
assert.match(updated, /TRAYDAQ Security Team member Username/);
assert.match(updated, /Contact TRAYDAQ Team/);
assert.match(updated, /enters TRAYDAQ Security Team review/);
assert.match(updated, /aria-label="TRAYDAQ Security Team Portal"/);
assert.match(updated, /const greeting="TRAYDAQ Security Team"/);
assert.match(updated, /const role="admin"/);
assert.match(updated, /id="adminArea"/);
assert.match(updated, /class="td-admin-settings"/);
assert.match(updated, /href="\/admin"/);

const tick = String.fromCharCode(96);
const js = [
  'const teamLabel="Admin";',
  'const role="admin";',
  'const path="/api/admin/review";',
  'const input="Ask the admin for help";',
  'const card=' + tick + '<div class="admin-card">$' + '{user.role==="admin"?"Admin":"User"}</div>' + tick + ';',
  'const banner=' + tick + '<span>Admin access granted</span>' + tick + ';'
].join('\n');
const renamed = rewriteJavaScript(js);
const selectorCode = 'document.querySelectorAll("main [data-admin-takedown-reel]");';
assert.equal(rewriteJavaScript(selectorCode), selectorCode,
  'CSS selectors with spaces must not be mistaken for team-facing text');
const loneSelector = "document.querySelector('[data-admin-takedown-reel]')";
assert.equal(rewriteJavaScript(loneSelector), loneSelector);
assert.ok(renamed.includes('const teamLabel="TRAYDAQ Security Team"'));
assert.ok(renamed.includes('const role="admin"'));
assert.ok(renamed.includes('const path="/api/admin/review"'));
assert.ok(renamed.includes('Ask the TRAYDAQ Team for help'));
assert.ok(renamed.includes('class="admin-card"'));
assert.ok(renamed.includes('user.role==="admin"?"TRAYDAQ Security Team":"User"'));
assert.ok(renamed.includes('<span>TRAYDAQ Security Team access granted</span>'));

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'td-brand-test-'));
try {
  fs.mkdirSync(path.join(root, 'admin'));
  fs.writeFileSync(path.join(root, 'index.html'), markup);
  fs.writeFileSync(path.join(root, 'admin', 'app.js'), js);
  fs.writeFileSync(path.join(root, 'translations.js'), 'const langs={en:{nav_admin:"Admin"},tw:{nav_admin:"Panin Bea"}};');
  const first = patchTraydaqTeamBranding(root);
  assert.ok(first.includes('index.html') && first.includes('admin/app.js'));
  assert.equal((fs.readFileSync(path.join(root, 'translations.js'), 'utf8').match(/nav_admin:"TRAYDAQ Security Team"/g) || []).length, 2);
  const snapshot = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.deepEqual(patchTraydaqTeamBranding(root), []);
  assert.equal(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), snapshot);
} finally {
  fs.rmSync(root, {recursive:true, force:true});
}
console.log('PASS: team names updated without changing auth roles, API routes, DOM selectors or user content.');
