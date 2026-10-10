# Safe Firebase test-account cleanup (Android / Cloud Shell)

**Target:** Firebase project `sellerflow-efaab` (Traydaq's existing Firebase Authentication project).

The public Traydaq GitHub repository is **an APK build controller**, not a copy of the live accounts database. It cannot determine by itself which Firebase accounts are genuine. This helper **never automatically deletes** all accounts matching an email pattern. **Do not upload Firebase credentials, real user lists, or customer identifiers to GitHub Actions or this public repository.**

## Run a private, read-only audit from your Android phone

1. In your Android browser, open [Google Cloud Shell](https://shell.cloud.google.com/?project=sellerflow-efaab) using the Google account with permission to manage Firebase Authentication in this project. If the page is cramped, choose **Desktop site** in the browser.
2. In the Cloud Shell terminal, run:

```sh
gcloud config set project sellerflow-efaab
gcloud auth application-default login
git clone https://github.com/gideondreams3325/traydaq.git
cd traydaq
npm install --no-save firebase-admin
node scripts/firebase-auth-test-cleanup.cjs audit
```

This prints possible fixture accounts **in your private Cloud Shell only** (UID, email, date and why each was flagged). `REVIEW_ONLY` means **not yet verified as fake**. No records are deleted. The tool does not assume that an unverified email, Google account, or an account with an incomplete profile is fake. If you have already cloned the repository, run `git pull --ff-only` in that folder instead of cloning it again.

## Approve only known test accounts

Look up each suggested UID in [Firebase Authentication → Users](https://console.firebase.google.com/project/sellerflow-efaab/authentication/users) and check whether it genuinely belongs to a disposable test account. If you are uncertain about any account, leave it alone.

Create a file **outside the public repository**, with **only the confirmed test UIDs**, one per line. For example, substitute real UIDs for these placeholders:

```sh
cat > /tmp/traydaq-test-uids.txt <<'EOF'
REPLACE_WITH_CONFIRMED_TEST_UID_1
REPLACE_WITH_CONFIRMED_TEST_UID_2
EOF
```

Run a **preflight preview** first. It checks every chosen UID and prints the exact allowed IDs but deletes nothing:

```sh
node scripts/firebase-auth-test-cleanup.cjs delete --uids-file=/tmp/traydaq-test-uids.txt --confirm-project=sellerflow-efaab
```

Only if every approved UID is a confirmed disposable test account, run the actual deletion:

```sh
node scripts/firebase-auth-test-cleanup.cjs delete --uids-file=/tmp/traydaq-test-uids.txt --confirm-project=sellerflow-efaab --execute
rm -f /tmp/traydaq-test-uids.txt
```

The deletion command first checks **every** listed UID. It stops without deleting **any** if any has no strong test signature or has known protective signals: the platform admin account, a Google identity, a verified email, a phone sign-in, admin privileges, verified badges, identity/KYC records, or positive activity counters in user profiles. Manual UID approval is required even after these checks.

Deletion is **irreversible** for Authentication sign-in identity: accounts and their password credentials cannot be restored simply by recreating a matching UID. Do not proceed unless you are sure each UID is disposable. If a real account is not a detectable fixture, do not override the safeguard; leave it untouched.

## Important: dashboard counts and database cleanup

This tool deletes the **Firebase Authentication user account only**. It intentionally does **not** delete profile data in Firebase Realtime Database, Firestore, storage, posts, orders or messages. Those could belong to genuine users or be important evidence, and deleting Auth users can leave orphaned app data. If dashboard counts are still wrong afterward, audit the actual count query and profile records separately; deleting Auth accounts alone may not fix it.

The `scripts/patch-private-admin-metrics.mjs` script already in the public builder distinguishes profile-linked accounts and Auth-only records for dashboards, without treating Auth-only accounts as fake. Neither that patch nor this helper provides proof of who is fake.

## Security

- Keep your Firebase Admin SDK service-account JSON **out of GitHub**. Cloud Shell uses your own Google Cloud credentials with Application Default Credentials.
- Never paste credentials, access tokens, or real user UID lists into the public GitHub repository, workflow inputs, issues, or screenshots.
- Avoid running a deletion tool from **public GitHub Actions**, because logs and artifacts in public repositories may be visible to others.
- If Cloud Shell reports **PERMISSION_DENIED**, stop and verify the Firebase project, signed-in Google account, and IAM roles; don't bypass checks.
