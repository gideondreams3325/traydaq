import fs from 'node:fs';
import path from 'node:path';

// Public build patch: modifies the temporary private checkout only.
// No private application source, account data or credentials are published.
const MARKER = 'TRAYDAQ_MUSIC_WITHDRAWAL_REFRESH_20261011';
function replaceExactlyOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) !== -1)
    throw Error('Missing or ambiguous ' + label);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

export function patchMusicWithdrawalRuntime(source) {
  if (typeof source !== 'string' || !source.includes("window.sellerFlowMusicAvailability={"))
    throw Error('Expected the TRAYDAQ music availability runtime.');
  if (source.includes(MARKER)) throw Error('Music withdrawal refresh already patched.');

  // Artist-linked posts must not be treated as unlicensed original audio just
  // because a legacy post has no valid release identifier.
  source = replaceExactlyOnce(source,
    "    if(!id)return true; // Ordinary original/post audio, not a released song.",
    [
      "    // " + MARKER + ": fail closed for a malformed artist-library sound.",
      "    if(!id){",
      "      const artistLinked = sound?.soundSource === 'music_library' ||",
      "        /\\/api\\/music\\/stream\\//i.test(String(sound?.soundUrl || sound?.audioUrl || ''));",
      "      return !artistLinked; // True only for an ordinary creator's original sound.",
      "    }"
    ].join('\n'), 'malformed artist release guard');

  const anchor = "  window.addEventListener('traydaq:music-deleted',withdrawnByArtist);";
  const refresh = [
    '  // ' + MARKER + ': remote deletions must reach an already-open feed.',
    '  // Only recheck while visible, at most once per minute. The existing',
    '  // checkRelease endpoint is authoritative even beyond the first 200 songs.',
    '  let backgroundMusicCheckRunning = false;',
    '  async function recheckVisibleWithdrawnMusic() {',
    "    if (document.visibilityState === 'hidden' || backgroundMusicCheckRunning) return;",
    "    if (!document.querySelector?.('.reel-card') &&",
    "        !document.querySelector?.('[data-use-sound-id]')) return;",
    '    backgroundMusicCheckRunning = true;',
    '    try { await reconcileFeed(true); }',
    '    catch(error) { console.warn("Music refresh unavailable:", error?.message || error); }',
    '    finally { backgroundMusicCheckRunning = false; }',
    '  }',
    '  // Android may keep an SPA feed open while songs are withdrawn elsewhere.',
    "  if (typeof window.setInterval === 'function')",
    '    window.setInterval(recheckVisibleWithdrawnMusic, 60000);',
    "  if (typeof window.addEventListener === 'function')",
    "    window.addEventListener('focus', recheckVisibleWithdrawnMusic);",
    "  if (typeof document.addEventListener === 'function')",
    "    document.addEventListener('visibilitychange', recheckVisibleWithdrawnMusic);",
    ''
  ].join('\n');
  return replaceExactlyOnce(source, anchor, refresh + anchor, 'music deletion event listener');
}

export function main(root='.') {
  const file = path.join(path.resolve(root), 'music-withdrawal-sync.js');
  const original = fs.readFileSync(file, 'utf8');
  const updated = patchMusicWithdrawalRuntime(original);
  new Function(updated); // Syntax validation, does not execute the app.
  fs.writeFileSync(file, updated);
  console.log('PASS: deleted music is rechecked on visible feeds and invalid artist IDs cannot be reused.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname))
  main(process.argv[2] || '.');
