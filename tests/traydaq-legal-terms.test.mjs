import assert from 'node:assert/strict';
import { legalPolicyText, patchTraydaqTerms } from '../scripts/patch-private-legal-terms.mjs';

// Public fixture only. Never include private application source in this test.
const legalHtml = `<main>
<h1>Terms & Conditions</h1>
<p>Traydaq music and content publishing policy.</p>
<h2>Music, sound recordings</h2>
<p>Artists must own or license their releases. Allow Creator Reuse is optional.</p>
<h2>Copyright</h2>
<p>Respect copyright, uploaded content, privacy and Advertising rules.</p>
<h2>Ghanaian law</h2>
<p>Electronic Transactions Act and applicable Ghanaian laws.</p>
<p>Legacy SellerFlow references must not appear.</p>
</main>`;
const policy = legalPolicyText(legalHtml);
assert.match(policy, /Music, sound recordings/);
assert.match(policy, /Allow Creator Reuse/);
assert.doesNotMatch(policy, /\bSellerFlow\b/i);

const legacySource = [
  'const DEFAULT_TERMS=`SellerFlow Terms & Conditions: Do not use SellerFlow for scams.`;',
  'function showTermsModal(acceptMode=false){const text=appTerms||DEFAULT_TERMS;return text;}',
  'appTerms=t.text||DEFAULT_TERMS;',
  'const display=termData.text||DEFAULT_TERMS;'
].join('\n');
const patched = patchTraydaqTerms(legacySource, legalHtml);
assert.match(patched, /const DEFAULT_TERMS=TD_TRAYDAQ_LEGAL_POLICY_TEXT/);
assert.match(patched, /const text=tdTermsFromApp\(appTerms\)/);
assert.match(patched, /appTerms=tdTermsFromApp\(t.text\)/);
assert.match(patched, /tdTermsFromApp\(termData.text\)/);
assert.throws(() => patchTraydaqTerms(patched, legalHtml), /already been applied/);

const beforeModal = patched.slice(0, patched.indexOf('function showTermsModal'));
const fromStoredTerms = new Function(beforeModal + '\nreturn tdTermsFromApp;')();
assert.equal(fromStoredTerms(''), policy);
assert.equal(fromStoredTerms('SellerFlow may be used only for lawful activity'), policy);
assert.equal(fromStoredTerms('Traydaq Terms & Conditions - an older incomplete agreement'), policy);
assert.equal(fromStoredTerms(policy), policy);
assert.equal(fromStoredTerms(policy + '\nUpdated instructions for artists.'), policy + '\nUpdated instructions for artists.');
assert.equal(fromStoredTerms(policy + '\nSellerFlow'), policy);

assert.throws(() => legalPolicyText('<main><h1>Terms & Conditions</h1><p>Traydaq only</p></main>'), /missing section/i);
console.log('PASS: full modern Traydaq music/content terms override stale SellerFlow Terms in Settings and registration.');
