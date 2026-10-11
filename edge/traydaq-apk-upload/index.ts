// Allows ONLY this repository's short-lived, signed GitHub Actions OIDC identities
// to request a one-file Supabase Storage signed upload URL. Never accepts a
// GitHub token, an arbitrary repository identity or raw APK media in this Edge fn.
import { createClient } from 'npm:@supabase/supabase-js@2.75.0';

const PROJECT = 'vvpwntehstjbccarqqzp';
const REPOSITORY = 'gideondreams3325/traydaq';
const REPOSITORY_ID = '1413115583';
const WORKFLOW_REF = REPOSITORY + '/.github/workflows/traydaq-android-apk.yml@refs/heads/main';
const AUDIENCE = 'traydaq-apk-upload-v1';
const KEY_ENDPOINT = 'https://token.actions.githubusercontent.com/.well-known/jwks';
const FILENAME = 'Traydaq-debug.apk';

function decodeBase64Url(encoded: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) throw Error('Malformed identity token');
  const text = encoded.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - encoded.length % 4) % 4);
  return Uint8Array.from(atob(text), ch => ch.charCodeAt(0));
}
function decodeJson(encoded: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(encoded)));
}
async function authorize(token: string) {
  if (token.length > 12000) throw Error('Identity token too large');
  const parts = token.split('.');
  if (parts.length !== 3) throw Error('Invalid JWT structure');
  const header = decodeJson(parts[0]);
  const claims = decodeJson(parts[1]);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw Error('Invalid JWT algorithm');
  const keysResponse = await fetch(KEY_ENDPOINT, { signal: AbortSignal.timeout(7000) });
  if (!keysResponse.ok) throw Error('Could not load GitHub identity signing keys');
  const document = await keysResponse.json();
  const key = document.keys?.find((item: Record<string,unknown>) =>
    item.kid === header.kid && item.kty === 'RSA' && (item.use === 'sig' || !item.use));
  if (!key) throw Error('Untrusted GitHub identity key');
  const publicKey = await crypto.subtle.importKey('jwk', key, {
    name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'
  }, false, ['verify']);
  const sig = decodeBase64Url(parts[2]);
  const signed = new TextEncoder().encode(parts[0] + '.' + parts[1]);
  if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, sig, signed)) {
    throw Error('Invalid GitHub identity signature');
  }
  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== 'https://token.actions.githubusercontent.com' ||
      claims.sub !== 'repo:' + REPOSITORY + ':ref:refs/heads/main' ||
      claims.repository !== REPOSITORY ||
      String(claims.repository_id) !== REPOSITORY_ID ||
      claims.ref !== 'refs/heads/main' ||
      claims.workflow_ref !== WORKFLOW_REF ||
      !['push', 'workflow_dispatch'].includes(String(claims.event_name)) ||
      !(claims.aud === AUDIENCE || Array.isArray(claims.aud) && claims.aud.includes(AUDIENCE)) ||
      typeof claims.exp !== 'number' || claims.exp < now ||
      typeof claims.iat !== 'number' || claims.iat > now + 30 ||
      (typeof claims.nbf === 'number' && claims.nbf > now + 30)) {
    throw Error('Unauthorized GitHub workflow identity');
  }
}
Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return new Response('Use POST', {status: 405});
  const authorization = request.headers.get('authorization') || '';
  const match = /^Bearer ([-.A-Za-z0-9_]+)$/.exec(authorization);
  if (!match) return new Response('GitHub workflow identity required', {status: 401});
  try { await authorize(match[1]); }
  catch (error) {
    console.warn('Rejected TRAYDAQ APK upload identity:', String(error).slice(0,160));
    return new Response('GitHub workflow authentication failed', {status: 403});
  }
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey || !url.includes(PROJECT + '.supabase.co'))
    return new Response('Storage service unavailable', {status: 503});
  const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await supabase.storage.from('traydaq-apk')
    .createSignedUploadUrl(FILENAME, { upsert: true });
  if (error || !data?.signedUrl) {
    console.error('TRAYDAQ APK signed upload URL failed:', String(error?.message || 'no URL').slice(0,120));
    return new Response('Upload URL temporarily unavailable', {status: 503});
  }
  const publicUrl = supabase.storage.from('traydaq-apk').getPublicUrl(FILENAME).data.publicUrl;
  return new Response(JSON.stringify({ success: true, signedUrl: data.signedUrl, publicUrl }), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
      'x-content-type-options': 'nosniff' }
  });
});
