import fs from 'node:fs';
import path from 'node:path';

// Public APK build-time patch: never publish the private application source.
export function legalPolicyText(legalHtml) {
  const from = legalHtml.indexOf('<h1>Terms & Conditions');
  const to = legalHtml.lastIndexOf('</main>');
  if (from < 0 || to <= from) throw new Error('Current Traydaq legal agreement is missing.');
  const html = legalHtml.slice(from, to);
  const decoded = html
    .replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(/<\/(?:h1|h2|h3|p|ul|li|section|header)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n').trim();
  for (const required of ['Traydaq', 'Music, sound recordings', 'Allow Creator Reuse',
    'copyright', 'Electronic Transactions Act', 'Advertising', 'privacy', 'Terms & Conditions']) {
    if (!decoded.toLowerCase().includes(required.toLowerCase())) {
      throw new Error('Legal agreement missing section: ' + required);
    }
  }
  return decoded;
}

export function patchTraydaqTerms(source, legalHtml) {
  const policy = legalPolicyText(legalHtml);
  if (source.includes('TD_TRAYDAQ_LEGAL_POLICY_TEXT')) {
    throw new Error('Traydaq legal terms patch has already been applied.');
  }
  const start = source.indexOf('const DEFAULT_TERMS=');
  if (start < 0) throw new Error('Legacy DEFAULT_TERMS declaration not found.');
  const quote = source[start + 'const DEFAULT_TERMS='.length];
  if (quote !== String.fromCharCode(96)) throw new Error('Legacy terms literal format changed.');
  const end = source.indexOf(String.fromCharCode(96) + ';', start + 'const DEFAULT_TERMS='.length + 1);
  if (end < 0 || end - start > 20000) throw new Error('Cannot safely bound legacy terms.');
  const original = source.slice(start, end + 2);
  // The private app may already use Traydaq branding and may have updated its
  // section numbering. The uniquely named DEFAULT_TERMS literal and the
  // separately validated modal/hydration call-sites are the safety anchors.
  if (!/\b(?:SellerFlow|Traydaq)\b|Terms\s*&?\s*Conditions/i.test(original) ||
      !/\b(?:terms|conditions|platform|account|content|lawful|conduct|user)\b/i.test(original)) {
    throw new Error('Existing app terms literal is not recognizable; refusing unrelated replacement.');
  }
  const replacement = [
    'const TD_TRAYDAQ_LEGAL_POLICY_TEXT=' + JSON.stringify(policy) + ';',
    'const DEFAULT_TERMS=TD_TRAYDAQ_LEGAL_POLICY_TEXT;',
    'function tdTermsFromApp(value){',
    '  const text=String(value||"");',
    '  if(!text.trim() || /SellerFlow may be used only for lawful|Do not use SellerFlow for scams|SellerFlow Terms & Conditions/i.test(text))return TD_TRAYDAQ_LEGAL_POLICY_TEXT;',
    '  return text;',
    '}'
  ].join('\n');
  let updated = source.slice(0, start) + replacement + source.slice(end + 2);

  let modalCount = 0;
  updated = updated.replace(
    /(function showTermsModal\s*\(\s*acceptMode\s*=\s*false\s*\)\s*\{\s*const text\s*=\s*)appTerms\s*\|\|\s*DEFAULT_TERMS/g,
    (_, prefix) => { modalCount++; return prefix + 'tdTermsFromApp(appTerms)'; }
  );
  let hydrationCount = 0;
  updated = updated.replace(/appTerms\s*=\s*t\.text\s*\|\|\s*DEFAULT_TERMS/g, () => {
    hydrationCount++;
    return 'appTerms=tdTermsFromApp(t.text)';
  });
  if (modalCount !== 1 || hydrationCount !== 1) {
    throw new Error('Terms modal or remote terms hydration changed; modal=' + modalCount + ', hydration=' + hydrationCount);
  }
  updated = updated.replace(/termData\.text\s*\|\|\s*DEFAULT_TERMS/g, 'tdTermsFromApp(termData.text)');
  if (!updated.includes('TD_TRAYDAQ_LEGAL_POLICY_TEXT') || !updated.includes('tdTermsFromApp(appTerms)')) {
    throw new Error('Traydaq legal policy patch did not apply.');
  }
  return updated;
}

if (process.argv[1] && import.meta.url === 'file://' + process.argv[1]) {
  const root = path.resolve(process.argv[2] || '.');
  const page = path.join(root, 'index.html');
  const legal = path.join(root, 'legal', 'terms.html');
  const before = fs.readFileSync(page, 'utf8');
  const after = patchTraydaqTerms(before, fs.readFileSync(legal, 'utf8'));
  fs.writeFileSync(page, after);
  console.log('PASS: Traydaq terms updated in Settings and registration; music, copyright and creator reuse present.');
}
