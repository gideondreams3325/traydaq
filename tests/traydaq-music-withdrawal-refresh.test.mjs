import assert from 'node:assert/strict';
import { patchMusicWithdrawalRuntime } from '../scripts/patch-private-music-withdrawal.mjs';

const fixture = [
  'async function verifyReusable(sound) {',
  "    const id=releaseId(sound);",
  "    if(!id)return true; // Ordinary original/post audio, not a released song.",
  '    return true;',
  '}',
  "  window.addEventListener('traydaq:music-deleted',withdrawnByArtist);",
  '  window.sellerFlowMusicAvailability={releaseId,isUnavailable,reconcileFeed,verifyReusable};'
].join('\n');

const updated=patchMusicWithdrawalRuntime(fixture);
assert(updated.includes('TRAYDAQ_MUSIC_WITHDRAWAL_REFRESH_20261011'));
assert(updated.includes('return !artistLinked'));
assert(updated.includes('window.setInterval(recheckVisibleWithdrawnMusic, 60000)'));
assert(updated.includes("window.addEventListener('focus', recheckVisibleWithdrawnMusic)"));
assert(updated.includes("document.addEventListener('visibilitychange', recheckVisibleWithdrawnMusic)"));
assert.throws(()=>patchMusicWithdrawalRuntime(updated),/already patched/);
assert.throws(()=>patchMusicWithdrawalRuntime(fixture.replace('if(!id)return true;', 'if(!id)return false;')),/Missing or ambiguous/);
console.log('PASS: safe music withdrawal refresh patch contract.');
