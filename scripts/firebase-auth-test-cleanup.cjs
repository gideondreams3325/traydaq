#!/usr/bin/env node
'use strict';

/**
 * Traydaq / sellerflow-efaab: manual-review-first Firebase Authentication cleanup.
 *
 * Run privately in Cloud Shell or in the guarded manual GitHub Actions workflow.
 * Public workflow runs MUST use --redact; no PII in logs or downloadable artifacts.
 * Does not change RTDB, Firestore, posts, or admin dashboard data.
 * No automated deletion or bulk deletion by email-pattern is permitted.
 */
const fs = require('node:fs');
const path = require('node:path');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getDatabase } = require('firebase-admin/database');

const PROJECT = 'sellerflow-efaab';
const ADMIN_EMAIL = 'gideondreams3325@gmail.com';
const args = process.argv.slice(2);
const mode = args[0];
const value = key => args.find(x => x.startsWith(key + '='))?.slice(key.length + 1);
const present = flag => args.includes(flag);
const redact = present('--redact');
const fail = msg => { console.error('BLOCKED: ' + (redact ? 'Preflight rejected an account or configuration; no further deletions attempted.' : msg)); process.exit(1); };
if (process.env.GITHUB_ACTIONS === 'true' && !redact) fail('Public workflow requires --redact.');
if (!['audit', 'delete'].includes(mode)) {
  console.log('Usage: node scripts/firebase-auth-test-cleanup.cjs audit');
  console.log('       node scripts/firebase-auth-test-cleanup.cjs delete --uids-file=/tmp/traydaq-test-uids.txt --confirm-project=sellerflow-efaab --execute');
  process.exit(1);
}
if (process.env.GOOGLE_CLOUD_PROJECT && process.env.GOOGLE_CLOUD_PROJECT !== PROJECT) {
  fail('Wrong active Google Cloud project. Expected ' + PROJECT);
}
const app = initializeApp({
  credential: applicationDefault(),
  projectId: PROJECT,
  databaseURL: 'https://sellerflow-efaab-default-rtdb.firebaseio.com',
});
const auth = getAuth(app);
let db = null; // Don't open RTDB sockets for read-only Authentication audits.

const STRONG_TEST_EMAIL = /^(?:plain_user_|pers_user_|test[_+.-]|fake[_+.-]|fixture[_+.-]|seed[_+.-]|mock[_+.-]|demo[_+.-]|qa[_+.-])/i;
const STRONG_TEST_NAME = /^(?:plain_user_|pers_user_|test[_+.-]|fake[_+.-]|fixture[_+.-]|seed[_+.-]|mock[_+.-]|demo[_+.-]|qa[_+.-])/i;
const protectedFlags = ['admin','isAdmin','isOwner','isModerator','verified','identityVerified','isVerified','blueVerified','sellerVerified','kycVerified'];
const truthy = value => value === true || value === 1 || value === 'true';
function fixtureHint(user, profiles = []) {
  const emailName = String(user.email || '').split('@')[0];
  if (STRONG_TEST_EMAIL.test(emailName)) return 'test-style email prefix';
  if (STRONG_TEST_NAME.test(user.displayName || '')) return 'test-style display name';
  for (const profile of profiles) {
    if (!profile || typeof profile !== 'object') continue;
    if (['isTestAccount','testAccount','isFixture','syntheticFixture'].some(k => truthy(profile[k]))) {
      return 'explicit test/fixture marker';
    }
    if (STRONG_TEST_NAME.test(String(profile.username || ''))) return 'test-style username';
  }
  return null;
}
function privileged(data) {
  if (!data || typeof data !== 'object') return false;
  if (protectedFlags.some(k => truthy(data[k]))) return true;
  return ['role','accountRole','userRole'].some(k =>
    /^(admin|owner|moderator|staff|security)$/i.test(String(data[k] || '')));
}
async function getProfiles(uid) {
  // If one check fails, abort deletion; we must not guess about account safety.
  if (!db) db = getDatabase(app);
  const nodes = ['users','accounts','publicProfiles','identityVerifications','buyerKycRecords'];
  const snapshots = await Promise.all(nodes.map(n => db.ref(n + '/' + uid).get()));
  return Object.fromEntries(nodes.map((n, i) => [n, snapshots[i].val()]));
}

// Read-only RTDB correlation. These are aggregate indicators, not proof a
// flagged account is disposable. Some legacy activity may live in Firestore.
async function auditAppEvidence(candidateUids) {
  if (!candidateUids.size) {
    console.log('RTDB_EVIDENCE_NO_CANDIDATES=true');
    return;
  }
  if (!db) db = getDatabase(app);
  const paths = ['users','publicProfiles','posts','stores','products','orders','jobs','events','following','conversations'];
  const owners = ['uid','userId','userUid','ownerUid','ownerId','sellerUid','sellerId',
    'storeOwnerUid','storeOwnerId','creatorUid','creatorId','authorUid','authorId',
    'posterId','postedBy','createdByUid','createdBy','buyerUid','buyerId','hostUid',
    'hostId','organizerUid','organizerId','employerId','merchantUid','merchantId'];
  const profileUids = new Set();
  const activityUids = new Set();
  const matchedByPath = {};
  const incomplete = [];
  for (const path of paths) {
    try {
      // Each query is one collection-level read, rather than 906 individual
      // requests. If slow or unavailable, mark the evidence incomplete.
      const snapshot = await Promise.race([
        db.ref(path).get(),
        new Promise((_, reject) => setTimeout(() => reject(Error('TIME_LIMIT')), 15000))
      ]);
      const contents = snapshot.val();
      const records = contents && typeof contents === 'object' ? Object.entries(contents) : [];
      const matched = new Set();
      for (const [key, record] of records) {
        if (!record || typeof record !== 'object') continue;
        if (path === 'users' || path === 'publicProfiles') {
          if (candidateUids.has(key)) { matched.add(key); profileUids.add(key); }
          continue;
        }
        if (path === 'following' && candidateUids.has(key)) matched.add(key);
        const identifiers = owners.map(field => record[field]).filter(v => typeof v === 'string');
        if (path === 'conversations' && Array.isArray(record.participants))
          identifiers.push(...record.participants.filter(x => typeof x === 'string'));
        for (const id of identifiers) if (candidateUids.has(id)) matched.add(id);
      }
      if (path !== 'users' && path !== 'publicProfiles')
        for (const uid of matched) activityUids.add(uid);
      matchedByPath[path] = matched.size;
      console.log('RTDB_MATCHING_CANDIDATES_' + path.toUpperCase() + '=' + matched.size);
    } catch (_error) {
      incomplete.push(path);
      console.log('RTDB_EVIDENCE_' + path.toUpperCase() + '=UNAVAILABLE');
    }
  }
  let both = 0;
  for (const uid of profileUids) if (activityUids.has(uid)) both++;
  const noMatch = incomplete.length === 0
    ? String([...candidateUids].filter(uid => !profileUids.has(uid) && !activityUids.has(uid)).length)
    : 'UNKNOWN';
  console.log('RTDB_CANDIDATES_WITH_PROFILE=' + profileUids.size +
    ' WITH_LINKED_ACTIVITY=' + activityUids.size + ' WITH_BOTH=' + both +
    ' WITH_NO_MATCH_IN_CHECKED_PATHS=' + noMatch +
    ' INCOMPLETE_PATHS=' + incomplete.length);
  if (incomplete.length) console.log('RTDB_EVIDENCE_INCOMPLETE=true DO_NOT_INFER_NO_ACTIVITY=true');
  console.log('RTDB evidence is non-exhaustive. No matching record does NOT prove an account is fake. Firestore, nested social activity, and other paths are not fully audited.');
}

async function audit() {
  let cursor, total = 0, suspected = 0, protectedCount = 0;
  const candidates = new Set();
  const evidence = {
    flaggedEmailVerified: 0,
    flaggedGoogleProvider: 0,
    flaggedPhoneLinked: 0,
    flaggedOtherProvider: 0,
    flaggedDisabled: 0,
    flaggedNoLastSignIn: 0,
    flaggedHasLastSignIn: 0,
    flaggedAuthOnlyEvidence: 0,
    flaggedEmailPrefix: 0,
    flaggedDisplayName: 0
  };
  console.log('READ-ONLY review for Firebase project ' + PROJECT);
  console.log('A flagged name is NOT proof of a fake account. Never bulk-delete by name.');
  do {
    const page = await auth.listUsers(1000, cursor);
    for (const user of page.users) {
      total++;
      if (user.email?.toLowerCase() === ADMIN_EMAIL || user.customClaims && privileged(user.customClaims)) {
        protectedCount++; continue;
      }
      const reason = fixtureHint(user);
      if (reason) {
        suspected++;
        candidates.add(user.uid);
        if (reason === 'test-style email prefix') evidence.flaggedEmailPrefix++;
        if (reason === 'test-style display name') evidence.flaggedDisplayName++;
        if (user.emailVerified) evidence.flaggedEmailVerified++;
        if (user.phoneNumber) evidence.flaggedPhoneLinked++;
        if (user.disabled) evidence.flaggedDisabled++;
        if (user.metadata?.lastSignInTime) evidence.flaggedHasLastSignIn++;
        else evidence.flaggedNoLastSignIn++;
        const providers = (user.providerData || []).map(p => p.providerId);
        if (providers.includes('google.com')) evidence.flaggedGoogleProvider++;
        if (providers.some(p => p && !['google.com', 'password'].includes(p))) evidence.flaggedOtherProvider++;
        if (!user.emailVerified && !user.phoneNumber && !providers.includes('google.com')) evidence.flaggedAuthOnlyEvidence++;
        if (!redact) console.log('REVIEW_ONLY\t' + user.uid + '\t' + (user.email || '(no email)') + '\t' + reason +
          '\tcreated=' + (user.metadata.creationTime || '?') +
          '\tlastSignIn=' + (user.metadata.lastSignInTime || '?'));
      }
    }
    cursor = page.pageToken;
  } while (cursor);
  console.log('TOTAL_AUTH=' + total + ' REVIEW_CANDIDATES=' + suspected + ' EXPLICIT_ADMIN_PROTECTED=' + protectedCount);
  console.log('REVIEW_CANDIDATES_WITH_VERIFIED_EMAIL=' + evidence.flaggedEmailVerified +
    ' WITH_GOOGLE_PROVIDER=' + evidence.flaggedGoogleProvider +
    ' WITH_PHONE=' + evidence.flaggedPhoneLinked +
    ' WITH_OTHER_PROVIDER=' + evidence.flaggedOtherProvider +
    ' DISABLED=' + evidence.flaggedDisabled);
  console.log('REVIEW_CANDIDATES_WITH_LAST_SIGN_IN=' + evidence.flaggedHasLastSignIn +
    ' NO_RECORDED_LAST_SIGN_IN=' + evidence.flaggedNoLastSignIn);
  console.log('REVIEW_CANDIDATES_EMAIL_PREFIX=' + evidence.flaggedEmailPrefix +
    ' DISPLAY_NAME_ONLY=' + evidence.flaggedDisplayName +
    ' AUTH_UNVERIFIED_NO_PHONE_GOOGLE=' + evidence.flaggedAuthOnlyEvidence);
  console.log('These signals do not identify fake accounts or establish lack of app activity.');
  if (present('--redact')) await auditAppEvidence(candidates);
  if (redact) console.log('Public report is aggregate-only. To select accounts, review Firebase Console privately; do not copy UIDs into public logs or workflow inputs.');
  console.log('No accounts were deleted. Select only UIDs you personally confirm are test accounts.');
}
async function deletion() {
  if (value('--confirm-project') !== PROJECT) {
    fail('Requires --confirm-project=' + PROJECT + ' for preflight and deletion.');
  }
  const uidFile = value('--uids-file');
  if (!uidFile) fail('A private file containing approved UIDs is required.');
  const absolute = path.resolve(uidFile);
  const repoRoot = path.resolve(__dirname, '..') + path.sep;
  if (absolute.startsWith(repoRoot)) fail('Keep UID files OUTSIDE the public git repository (e.g. /tmp/traydaq-test-uids.txt).');
  let input;
  try { input = fs.readFileSync(absolute, 'utf8'); } catch { fail('Cannot read approved UID file.'); }
  const lines = input.split(/\r?\n/).map(x => x.trim()).filter(x => x && !x.startsWith('#'));
  if (!lines.length || lines.length > 1000 || new Set(lines).size !== lines.length) {
    fail('Provide 1-1000 unique, explicitly approved UIDs. Never pass email addresses or wildcards.');
  }
  for (const uid of lines) {
    if (!/^[a-zA-Z0-9_-]{6,128}$/.test(uid)) fail('Invalid UID in approval file.');
  }
  // Fail the entire operation before deleting a single account if any item is unsafe.
  const approved = [];
  for (const uid of lines) {
    const user = await auth.getUser(uid);
    const profileMap = await getProfiles(uid);
    const profileValues = Object.values(profileMap);
    const hint = fixtureHint(user, profileValues);
    if (!hint) fail('UID ' + uid + ' has no strong fixture indicator; review it manually in Firebase Console.');
    if (user.email?.toLowerCase() === ADMIN_EMAIL) fail('Admin account is protected.');
    if (user.emailVerified || user.phoneNumber || (user.providerData || []).some(p => p.providerId === 'google.com')) {
      fail('UID ' + uid + ' has verified, phone, or Google sign-in credentials; protected.');
    }
    if (privileged(user.customClaims) || profileValues.some(privileged)) {
      fail('UID ' + uid + ' has verified, privileged, or moderation-related profile data; protected.');
    }
    if (profileMap.identityVerifications || profileMap.buyerKycRecords) {
      fail('UID ' + uid + ' has identity verification records; protected.');
    }
    if (profileValues.some(p => p && typeof p === 'object' &&
      ['postsCount','productsCount','ordersCount','followersCount','followingCount','likesCount'].some(k => Number(p[k]) > 0))) {
      fail('UID ' + uid + ' has account activity counters; protected.');
    }
    approved.push(uid);
  }
  console.log('Passed safeguards for ' + approved.length + ' manually selected suspected test accounts.');
  if (!redact) for (const uid of approved) console.log('APPROVED_FOR_REVIEW_UID=' + uid);
  if (!present('--execute')) {
    console.log('PREVIEW ONLY: no users deleted. Rerun with --execute only if every UID is confirmed test data.');
    return;
  }
  console.log('Deleting Firebase AUTH only; app database records are NOT changed.');
  // Delete one-by-one so errors are visible and unsuccessful UIDs are never reported as deleted.
  let success = 0, failures = 0;
  for (const uid of approved) {
    try {
      await auth.deleteUser(uid);
      success++;
      if (!redact) console.log('DELETED_AUTH_UID=' + uid);
    } catch (e) {
      failures++;
      console.error('FAILED_AUTH_UID=' + (redact ? '[redacted]' : uid) + ' CODE=' + (e.code || 'unknown'));
    }
  }
  console.log('DELETED=' + success + ' FAILED=' + failures + ' RTDB_UNCHANGED=true');
  if (failures) process.exitCode = 1;
}
// Firebase Admin may hold open sockets even when Authentication enumeration
// has finished. Finalize after all asynchronous work has completed, so the
// public GitHub audit is marked successful instead of timing out after 20 min.
(mode === 'audit' ? audit() : deletion()).then(() => {
  process.stdout.write('AUDIT_OR_CLEANUP_TASK_COMPLETE\n', () => process.exit(process.exitCode || 0));
}).catch(err => {
  // Avoid dumping account data, access tokens, or full secret-bearing stack traces.
  const label = redact ? (err.code || 'Firebase operation failed; details withheld from public logs.') : (err.code || err.message || 'unknown error');
  process.stderr.write('FAILED: ' + label + '\n', () => process.exit(1));
});
