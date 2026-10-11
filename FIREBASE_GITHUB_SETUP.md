# Connect Firebase to Traydaq GitHub Actions (Android-friendly)

This sets up **manual** Firebase Authentication test-account audits and explicitly approved deletions for project **`sellerflow-efaab`**. It does not connect Firebase directly to ChatGPT, and does not fix the app's dashboard counts or remove Realtime Database profiles.

## 1. Create a private Firebase Admin credential

1. On Android, sign in to [Firebase Console — Service Accounts](https://console.firebase.google.com/project/sellerflow-efaab/settings/serviceaccounts/adminsdk). Turn on **Desktop site** if buttons are hard to reach.
2. Make sure the active project is **sellerflow-efaab**.
3. Create/download a **new** service-account private key for this project (or use a dedicated service account with only the permissions needed to read Firebase Auth and Realtime Database user profiles and delete approved Firebase Auth users). **Keep the JSON on your device**, not in a public repo or chat.
4. If a private key was previously shared publicly or in chat, **revoke that old key and use a newly generated one**.
5. On GitHub open [Traydaq Actions Secrets](https://github.com/gideondreams3325/traydaq/settings/secrets/actions). Tap **New repository secret** and create:
   - Name: `TRAYDAQ_FIREBASE_ADMIN_JSON`
   - Value: the **entire private service-account JSON** downloaded from the correct Firebase project.

**Never** paste your private key, token, or credential JSON into ChatGPT, GitHub source code, workflow inputs, issues, or screenshots. GitHub Secrets are encrypted, though maintainers who can modify workflows may indirectly use them. Use a dedicated least-privilege short-lived key and revoke it after cleanup.

## 2. Run a read-only account audit

1. Open [Traydaq Firebase Accounts workflow](https://github.com/gideondreams3325/traydaq/actions/workflows/traydaq-firebase-account-cleanup.yml).
2. Tap **Run workflow**, select **Branch: main**, choose **operation: audit**, and run it.
3. Open the run's job logs. They contain **counts only**, including potential test-style names, not emails or user UIDs.

**Important:** A suspicious username or unverified email is NOT proof of a fake user. The audit uses a name-pattern hint and cannot check all app activity. Inspect users carefully in the private [Firebase Authentication Users console](https://console.firebase.google.com/project/sellerflow-efaab/authentication/users) and, where necessary, their related app profiles. Never delete uncertain users.

## 3. Privately approve confirmed disposable test accounts

Find the **UID** of each *confirmed* test account in Firebase Authentication (not the email or username). For now, this is manual review: the public Actions logs deliberately do not show a real user list.

1. In the same [GitHub Actions secrets](https://github.com/gideondreams3325/traydaq/settings/secrets/actions) page, create the repository secret `TRAYDAQ_CLEANUP_APPROVED_UIDS`.
2. For the value, enter the **approved Firebase Authentication UIDs only**, **one per line**, without bullets, quotes or commas. Do not put UIDs in GitHub workflow inputs, commit messages, or public issues.
3. Reopen the [cleanup workflow](https://github.com/gideondreams3325/traydaq/actions/workflows/traydaq-firebase-account-cleanup.yml) and select **operation: preview**. The workflow checks every approved account and prints only generic results. **No accounts are deleted.**
4. If the preview succeeds and you have personally verified the listed UIDs are disposable, run the workflow a **second** time with **operation: delete** and the exact confirmation phrase `DELETE CONFIRMED TEST ACCOUNTS`.

Deletion is irreversible for the Firebase Auth user account. The workflow rejects the whole batch before deletion if **any** UID lacks a test-style signal, is your admin account, has a Google provider, verified email or phone, protected role/badge/KYC profile, or positive profile activity counters. These are safety filters, not proof. Other app activity may be stored in different collections, so you must still manually confirm account ownership and real activity. GitHub Actions can stop mid-deletion due to a network error, so inspect the result counts.

## 4. After cleanup

1. Review the **aggregate deletion counts** in Actions. Verify totals in Firebase Authentication.
2. **Delete both temporary repository secrets** (particularly the JSON service-account credential), and revoke the **private key** in Google Cloud IAM. Do not delete the service account itself if another app uses it.
3. Review orphaned profiles, posts and dashboard counts **separately**. This tool **does not** remove data from RTDB, Firestore or Storage, because doing that without an owner/activity audit may erase genuine user content.

## Troubleshooting

- If **Run workflow** does not show, sign in to the `gideondreams3325` GitHub account, enable Android browser **Desktop site**, and select the **main** branch.
- `Missing TRAYDAQ_FIREBASE_ADMIN_JSON`: save the credential JSON as the exact secret name.
- `Credential does not match project`: download a credential belonging to `sellerflow-efaab`; don't edit the `project_id` field.
- Firebase **permission denied**: the credential needs the necessary IAM roles. Do **not** bypass permission checks.
- `Preflight rejected`: no deletions occur if an account is rejected during initial validation. Check UIDs privately in Firebase Console. The public log intentionally withholds their identities.
- A public repository's Actions logs may be visible to everyone. Only counts and generic failures are logged; do not print credential or UID secrets when troubleshooting.
