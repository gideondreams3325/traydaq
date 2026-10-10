#!/usr/bin/env node
'use strict';

/**
 * Traydaq / sellerflow-efaab: manual-review-first Firebase Authentication cleanup.
 *
 * Run ONLY in a private, authenticated Google Cloud Shell (never in public Actions).
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
const fail = msg => { console.error('BLOCKED: ' + msg); process.exit(1); };
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
const db = getDatabase(app);

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
  const { ref, get } = require('firebase-admin/database');
  const nodes = ['users','accounts','publicProfiles','identityVerifications','buyerKycRecords'];
  const snapshots = await Promise.all(nodes.map(n => get(ref(db, n + '/' + uid))));
  return Object.fromEntries(nodes.map((n, i) => [n, snapshots[i].val()]));
}
async function audit() {
  let cursor, total = 0, suspected = 0, protectedCount = 0;
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
        console.log('REVIEW_ONLY\t' + user.uid + '\t' + (user.email || '(no email)') + '\t' + reason +
          '\tcreated=' + (user.metadata.creationTime || '?') +
          '\tlastSignIn=' + (user.metadata.lastSignInTime || '?'));
      }
    }
    cursor = page.pageToken;
  } while (cursor);
  console.log('TOTAL_AUTH=' + total + ' REVIEW_CANDIDATES=' + suspected + ' EXPLICIT_ADMIN_PROTECTED=' + protectedCount);
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
  for (const uid of approved) console.log('APPROVED_FOR_REVIEW_UID=' + uid);
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
      console.log('DELETED_AUTH_UID=' + uid);
    } catch (e) {
      failures++;
      console.error('FAILED_AUTH_UID=' + uid + ' CODE=' + (e.code || 'unknown'));
    }
  }
  console.log('DELETED=' + success + ' FAILED=' + failures + ' RTDB_UNCHANGED=true');
  if (failures) process.exitCode = 1;
}
(mode === 'audit' ? audit() : deletion()).catch(err => {
  // Avoid dumping account data, access tokens, or full secret-bearing stack traces.
  console.error('FAILED: ' + (err.code || err.message || 'unknown error'));
  process.exitCode = 1;
});
