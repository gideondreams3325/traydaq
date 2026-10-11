import assert from 'node:assert/strict';
import test from 'node:test';
import {patchVisitorProfiles,patchVisitorStyles} from '../scripts/patch-private-profile-visitors.mjs';

const oldBlock = [
  'async function openVisits() {',
  '    try {',
  '      const rows = await Promise.all(visitors.map(async ([id,info]) => {',
  '        let profile = {};',
  "        try { profile = (await database.ref('publicProfiles/' + id).once('value')).val() || {}; } catch (_) {}",
  "        const handle = profile.username || profile.name || 'Traydaq user';",
  '        return \'<button type="button" class="sf-social-visitor" data-sf-visitor="\' + esc(id) + \'"><span>@\' +',
  '          esc(handle) + \'</span><small>\' + esc(new Date(info.visitedAt).toLocaleDateString("en-GH")) + \'</small></button>\';',
  '      }));',
  '      if (!result || !overlay.isConnected) return;',
  "      result.innerHTML = rows.join('');",
  "      result.querySelectorAll('[data-sf-visitor]').forEach(b => b.addEventListener('click', () => {",
  '        close();',
  "        if (typeof win.openUserProfile === 'function') win.openUserProfile(b.dataset.sfVisitor);",
  '      }));',
  '    } catch (_) {',
  '      /* preserve error message */',
  '    }',
  '}'
].join('\n');
const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g,
  c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;

test('patch builds avatar and public profile navigation without changing owner privacy', () => {
  const result = patchVisitorProfiles(oldBlock);
  assert.match(result, /td-visitor-avatar/);
  assert.match(result, /td-visitor-username/);
  assert.match(result, /profile\.photoURL/);
  assert.match(result, /profile\.avatarUrl/);
  assert.match(result, /win\.openUserProfile\(visitorUid/);
  assert.match(result, /uid\(\) !== owner/);
  assert.match(result, /publicProfiles\//);
  assert.ok(result.includes('profileVisitLogs') === false, 'Do not change visit storage in this patch');
  assert.throws(() => patchVisitorProfiles(result), /already applied/);
  assert.throws(() => patchVisitorProfiles('async function openVisits() {}'), /visit listing changed/);
});

test('visitors render real safe avatar URLs and link by visitor UID when row is tapped', async () => {
  const output = patchVisitorProfiles(oldBlock);
  const block = output.slice(output.indexOf('      const rows = '), output.indexOf('\n    } catch (_) {'));
  const render = new AsyncFunction('visitors','database','result','overlay','uid','owner','esc','valid','win','close',block);
  const profiles = {
    uid123: {username:'traydaq',photoURL:'https://images.example.org/avatar.jpg'},
    uid456: {username:'cute"<script>',avatarUrl:'javascript:alert(1)'},
    uid789: {displayName:'Akosua'},
  };
  let buttonEvents = [];
  let photoEvents = [];
  let removed = false;
  let closed = 0;
  const routes = [];
  const result = {
    innerHTML:'',
    querySelectorAll(selector) {
      if (selector === '[data-sf-visitor]') {
        const list = [...this.innerHTML.matchAll(/data-sf-visitor="([^"]+)" data-sf-visitor-username="([^"]*)"/g)];
        return list.map(match => ({dataset:{sfVisitor:match[1],sfVisitorUsername:match[2]},
          addEventListener: (evt, cb) => {if(evt === 'click') buttonEvents.push(cb);}}));
      }
      if (selector === '.td-visitor-photo') {
        return [{addEventListener:(event,cb)=>photoEvents.push(cb),remove:()=>{removed=true;}}];
      }
      return [];
    }
  };
  const database = {ref:(key) => ({once:async () => ({val:() => profiles[key.split('/').at(-1)]})})};
  await render([
    ['uid123',{visitedAt:Date.now()}],
    ['uid456',{visitedAt:Date.now()}],
    ['uid789',{visitedAt:Date.now()}]
  ], database, result, {isConnected:true}, ()=>'ownerUid', 'ownerUid', esc,
  (id)=>/^[A-Za-z0-9_-]+$/.test(id),
  {openUserProfile:(...args)=>routes.push(args)},()=>closed++);
  assert.match(result.innerHTML, /src="https:\/\/images\.example\.org\/avatar\.jpg"/);
  assert.match(result.innerHTML, /@traydaq/);
  assert.match(result.innerHTML, /td-visitor-initial/);
  assert.doesNotMatch(result.innerHTML, /src="javascript:/);
  assert.doesNotMatch(result.innerHTML, /<script>/);
  assert.match(result.innerHTML, /Akosua/);
  assert.equal(buttonEvents.length,3);
  buttonEvents[0]();
  assert.deepEqual(routes, [['uid123',{username:'traydaq'}]]);
  assert.equal(closed,1);
  photoEvents[0]();
  assert.equal(removed,true,'Broken image falls back to initial');
});

test('profile visit rows remain light-theme legible', () => {
  const html = patchVisitorStyles('<html><head></head><body></body></html>');
  assert.match(html, /id="tdProfileVisitors2026"/);
  assert.match(html, /#sfProfileVisitsList \.td-visitor-row/);
  assert.match(html, /#dbb13c/);
  assert.throws(() => patchVisitorStyles(html), /duplicate patch/);
});
