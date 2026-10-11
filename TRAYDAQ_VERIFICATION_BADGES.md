# Traydaq verification badges — implementation and rollout

Two **different** Trust & Safety credentials now exist:

| Badge | Meaning | Granting authority |
| --- | --- | --- |
| 🆔 Verified | Completed Traydaq first-party account verification | Existing account verification review flow |
| 🔵 Blue check | Official status awarded by Traydaq Security Team | An authenticated admin acting through Blue Check Hub |

A PRO subscription **does not** award the blue check. Completing identity verification **does not** award the blue check. The blue check does not automatically confer identity-verification approval or seller-publishing permissions.

**Permanent official account exception:** The active, email-verified Firebase Authentication account with the platform administrator email `gideondreams3325@gmail.com` receives the blue check automatically. The backend resolves the account's immutable Firebase UID using privileged Authentication lookup; editable display names, usernames and profile roles cannot claim it. The badge is never created by account verification or subscription status, and a revoke request for that official UID is forbidden. If the account is disabled, email-unverified, missing or Firebase Auth is unavailable, the backend does not invent a badge.

## Implemented code

- `scripts/patch-private-admin-ui.mjs`: clickable **Blue Check Hub** dashboard card (13th workspace), on the Security Team Portal.
- `scripts/patch-private-verification-badges.mjs`: replaces legacy blue check rendering with `🆔 Verified` for account-verified users; blue check rendering uses only the dedicated server badge registry. Includes a searchable admin interface with grant/revoke, confirmation and reason.
- `edge/traydaq-blue-badges/index.ts`: isolated Supabase Edge function, deployed to the connected project `vvpwntehstjbccarqqzp` as `traydaq-blue-badges`. It:
  - Serves a public, minimal list of awarded UIDs for badge display, with no private verification images or personal details.
  - Requires a cryptographically validated Firebase administrator ID token to grant or revoke.
  - Checks that the target Firebase Authentication account is active.
  - Writes the badge decision, audit event and owner notification via a **single RTDB multi-location update**.
  - Never trusts `verified` or `isPro` flags from a user-editable profile.
  - Uses the server-side Firebase credential from the Supabase secret or secure Vault; does not embed admin credentials in the Android app.
- `scripts/patch-private-verification-rules.mjs`: candidate Firebase Realtime Database rules hardening; prevents account owners from directly giving themselves verification approval fields and denies client writes to `blueBadgeGrants` and `blueBadgeAudit`.
- `.github/workflows/traydaq-verification-rules.yml`: **manual-only** live rules comparison and deployment. Requires owner confirmation. It is not part of the Android APK workflow.

## Security and rollout status

1. The public repository contains only build patches; it does not commit private app code or identity documents.
2. The Supabase blue-check endpoint is deployed. **Live connection to its private Firebase credential and an actual admin grant/revoke still require authenticated testing.**
3. The public APK builder applies the badge changes and checks that paid, admin and account verification states do not automatically render blue. **An APK is ready only after GitHub Actions succeeds.**
4. The candidate Firebase verification rules have **not** been deployed automatically, to protect against overwriting rules changed directly in Firebase Console. Run the *Traydaq Verification Rules (Manual Review)* workflow in `validate` mode first. If the current live rules match the private source baseline and review passes, the owner can run `deploy` with the exact confirmation phrase `APPROVE VERIFICATION RULES`. A credential with Firebase Rules deployment permission is required.
5. This does not remove or modify user accounts, account verification photos, seller data, orders or posts.

## How the Security Team uses the Blue Check Hub

In an APK containing this patch, open **Profile → Security Team Portal → Blue Check Hub**, find a genuine user, and choose **Grant blue check** or **Revoke blue check**. Confirm the action and provide a reason of 10–220 characters.

The official Traydaq account is marked **Permanent official badge** in the hub, with the change button disabled. The server independently rejects attempts to revoke it.

A successful action writes an auditable decision and notifies the recipient. If the server badge registry or Firebase credentials are unavailable, the hub disables the controls rather than allowing a locally faked blue check.

**Note:** This is an official platform badge, not a Ghana Card identity certificate. KYC/identity-verification and blue-check authority remain separate.
