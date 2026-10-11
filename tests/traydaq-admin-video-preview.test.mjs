import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {patchAdminVideoPreviews} from '../scripts/patch-private-admin-video-preview.mjs';
const runtime = fs.readFileSync(new URL('../assets/traydaq-admin-video-preview.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../assets/traydaq-admin-video-preview.css', import.meta.url), 'utf8');
const sample = [
  '<html><head></head><body>',
  '  function renderAdminPostItem(uid, p, mode){',
  "    let mediaElement = '';",
  "    if(p.mediaUrl){",
  '      mediaElement = "esc(isVid ? (p.coverUrl || p.thumbnailUrl)";',
  '      onerror="window.__sfAdminMediaError(this, \'photo\')"',
  "    } else { mediaElement = 'No media attached'; }",
  "    let statusPill = '';",
  '    return "<button data-admin-takedown-post></button>";',
  '  }',
  '  function sfAdminPosts(posts, livePosts, reviewPosts, takenDownPosts, initialSubTab){',
  '  }',
  '</body></html>'
].join('\n');
test('admin videos use native playback while photos, text and moderation survive', () => {
  const result = patchAdminVideoPreviews(sample, runtime, css);
  for (const item of ['<video class="td-admin-video-player"', 'controls playsinline',
    'preload="metadata"', 'data-td-admin-play', 'tdAdminVideoPreview2026',
    'No media attached', 'window.__sfAdminMediaError', 'data-admin-takedown-post',
    'esc(tdAdminVideoPoster)', 'tdAdminMediaUrl = p.mediaUrl || p.videoUrl']) {
    assert.ok(result.includes(item), 'Missing ' + item);
  }
  assert.throws(() => patchAdminVideoPreviews(result, runtime, css), /already installed/);
});
test('changed admin markup fails closed rather than patching another page', () => {
  assert.throws(() => patchAdminVideoPreviews(sample.replace('No media attached', 'Unknown'),runtime,css),/source changed/);
  assert.throws(() => patchAdminVideoPreviews(sample.replace('renderAdminPostItem', 'otherRenderer'),runtime,css),/anchor/);
});
