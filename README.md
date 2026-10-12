# Traydaq Android APK builder

This **public** repository is an APK build controller. It deliberately does **not** include the private Traydaq/SellerFlow app source, Firebase admin credentials, real account data, or signing keys. The original source remains in the private `gideondreams3325/sellerflow` repository.

## One-time setup (works from an Android phone)

1. In GitHub, open **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Select your account as **Resource owner**. Under repository access choose **Only select repositories** and select **sellerflow**, not every repository. Give it only **Contents: Read-only**; no write or administration access. Set an expiration and create the token.
3. Open the public [Traydaq Actions secrets settings](https://github.com/gideondreams3325/traydaq/settings/secrets/actions). Choose **New repository secret**. Name it exactly `SELLERFLOW_SOURCE_TOKEN`; enter the token as the secret's value. **Never paste the token into source code, issues, workflow inputs, logs, or a chat.**
4. Open [Traydaq GitHub Actions](https://github.com/gideondreams3325/traydaq/actions) and choose **Traydaq Android APK (Public Builder) → Run workflow**.
5. When the run succeeds, open its **Summary → Artifacts → Traydaq-debug-APK**. Download the ZIP file, extract `Traydaq-debug.apk`, and install it on the Android device.

## Required stable Android debug signing

The public builder requires **three repository Actions secrets** in `gideondreams3325/traydaq`:

- `SELLERFLOW_SOURCE_TOKEN`: read-only permission to the private SellerFlow source.
- `TRAYDAQ_DEBUG_KEYSTORE_B64`: Base64 encoding of the **same private debug keystore** for every Android APK build.
- `GOOGLE_SERVICES_JSON`: the **latest Firebase Android SDK config** from the `sellerflow-efaab` project, downloaded after registering the permanent signing certificate. This is NOT a Firebase Admin service-account JSON.

To configure `TRAYDAQ_DEBUG_KEYSTORE_B64` on Android:

1. Download the private `Traydaq-GitHub-Secret.txt` from your ChatGPT conversation, then open it in a text editor and copy **all** its contents (one long Base64 line).
2. Visit [Traydaq repository secrets](https://github.com/gideondreams3325/traydaq/settings/secrets/actions), then select **New repository secret** (enable your browser's desktop-site mode if necessary).
3. Set the secret name exactly to `TRAYDAQ_DEBUG_KEYSTORE_B64`, paste the Base64 text into the secret value field, and save.
4. Keep `Traydaq-stable-debug.keystore` backed up securely outside GitHub. The workflow will not publish the signing key and will refuse to build if its secret is missing or invalid.
5. In [GitHub Actions](https://github.com/gideondreams3325/traydaq/actions/workflows/traydaq-android-apk.yml), run **Traydaq Android APK (Public Builder)** manually.

## Fixing Google Sign-In error 10 (DEVELOPER_ERROR)

1. Open [Firebase project settings](https://console.firebase.google.com/project/sellerflow-efaab/settings/general). Under **Your apps**, select the existing Android app `com.sellerflow.app`.
2. Register SHA-1 `46:7D:25:17:59:33:5B:94:B1:0A:72:9A:67:33:FA:DC:8D:F5:0D:31`.
3. Register SHA-256 `F8:1F:CC:A1:BC:83:DC:EF:85:FA:EF:FB:2B:8A:FC:51:E3:14:A8:B4:06:2E:0C:D4:01:72:05:A7:CC:9B:2B:5A`.
4. In [Firebase Authentication](https://console.firebase.google.com/project/sellerflow-efaab/authentication/providers), confirm **Google** sign-in provider is enabled. Return to project settings and download a fresh `google-services.json` for the Android app.
5. Under the **public Traydaq repository's GitHub Actions secrets**, add `GOOGLE_SERVICES_JSON` and paste the entire JSON content. Never use Firebase Admin private key JSON or post it in a chat.
6. Run the APK builder manually. It refuses to build if the real Firebase Android OAuth client for this package and signing key is missing.

This is a Google/Firebase configuration requirement, not an issue that can be solved by changing the APK's visible error message.

**Important:** This is a new private signing key. It cannot be used to upgrade an APK installed with a different signing certificate. Safeguard existing account access and any unsynced app data before replacing an older installation. Register the signing key's SHA-1 and SHA-256 fingerprints in Firebase for native Google Sign-In. An added Firebase SHA fingerprint is not a replacement for the GitHub signing secret.

Never commit the keystore, its Base64 representation, or the private source token to the public repository or include it in a screenshot or chat message.

This workflow builds a **debug APK only**; it does not sign a Play Store release, publish the app, or deploy the backend. It runs manually, not from external pull requests, to protect the private repository token. Anyone who can view public Actions logs may see build status and a package fingerprint, but not the private source itself.

If the build fails, open the failed step in the Actions log. Do not copy authentication token or keystore material into issue comments or screenshots.

## Shared post links (Android)

New post shares point to the public, non-media landing endpoint:

\`https://vvpwntehstjbccarqqzp.supabase.co/functions/v1/traydaq-open-post?postId=<post-id>\`

The endpoint never serves the original Supabase image/video bytes and does not require sign-in. It attempts to open \`traydaq://post/<post-id>\` on Android. Browsers may block automatic custom-app launches, so the page also has an explicit **Open in TRAYDAQ** button. People without the app see **Download TRAYDAQ APK**.

The public APK builder adds the native \`VIEW\`/ \`BROWSABLE\` intent filter and a validated JavaScript bridge on both cold/warm launches. The app's existing \`navigate('feed', postId)\` opens the referenced post, and the share sheet exports the **post URL**, not a media-storage URL. Previously copied raw storage links cannot be converted retroactively.

After the builder passes its signature and account-data safety checks, a separate GitHub Actions job publishes the **preview APK** at:

https://github.com/gideondreams3325/traydaq/releases/download/traydaq-android-preview/Traydaq-debug.apk

This is a **debug-signed preview build**, not a Play Store release. The release will only be available after a successful APK build and release job. Existing users must install the updated APK for deep links to work. Do not use a new signing key for updates.

**Production Android App Links:** For verified, one-tap HTTPS opening without browser prompts, serve the share URL from an app-owned custom HTTPS domain with \`/.well-known/assetlinks.json\`, and register that domain in the native Android manifest. The Supabase \`*.supabase.co\` host does not currently provide such a verification file for this app; therefore this implementation uses Android custom-scheme intents with an explicit browser fallback.

## Android app performance patch (October 2026)

The public APK workflow runs `tests/traydaq-speed-engine.test.mjs` and injects
`assets/traydaq-speed-engine.js` into the temporary private app checkout **before**
building. It also verifies the speed engine exists in the generated web bundle and the signed APK.

The speed engine prioritizes visible For You media, limits nearby video metadata
preloading (one next reel on low-RAM/Data Saver devices; two otherwise), pauses
feed video when hidden or when leaving Home, lazy-loads offscreen discovery images,
and records anonymous local `window.__tdSpeedEngine2026.stats` startup/long-task
measurements. It preserves media aspect ratios, music, share links, user sessions,
permissions, and the existing animated wheel splash.

This client-side optimization does **not** transcode uploaded videos, add adaptive
streaming renditions, rewrite private Firebase queries, or claim guaranteed startup
timings. Those features require separate server-side integration and measurements.
Do not paste private user records, access tokens or media URLs into performance logs.

## Android media and feed performance integration (October 12, 2026)

The **public APK builder** now applies additional tested patches exclusively to its temporary private source checkout:

- `scripts/patch-private-feed-first-page.mjs`: changes only the initial For You Firestore page from 100 to 36 posts. Keeps existing filtering and pagination state; aborts the build if its source contract changes.
- `scripts/patch-private-creator-photo-compression.mjs` and `assets/traydaq-public-photo-compression.js`: optimize Creator Studio JPEG/PNG/WebP uploads bigger than 1.2 MB, capped to 1600px, only when the result is at least 15% smaller. Preserve the original on timeout, unsupported format, failure or poor compression. Uploaded video/audio are untouched.
- `scripts/patch-private-public-media-cache.mjs` and `assets/traydaq-public-media-sw.js`: install a native Android-only service worker that caches at most 24 approved **public** post/product/profile covers from the TRAYDAQ public media bucket. It never handles private documents, Firebase tokens, signed URLs, API requests, video range requests or personal databases. If service workers are unsupported on a particular Android WebView, registration quietly falls back to regular networking.

All three have standalone tests, plus workflow bundle/APK inclusion checks. Changes to the public workflow trigger the Android builder. **A commit does not prove the APK passed**: check GitHub Actions before installing.

### Video processing limitations

The signed upload endpoint sends original videos directly to Supabase Storage. Supabase Edge Functions have a strict CPU budget and cannot be used as a general-purpose FFmpeg transcoder for these uploads. Real multiple-bitrate HLS/DASH generation requires a video encoder (e.g. separately provisioned FFmpeg worker or configured streaming provider), ingestion authorization, output storage/CDN, and play-ready manifest references in posts. **None of that is silently enabled**, and no paid vendor account is created. The installed Android Speed Engine adapts **preload budgets**, not encoded bitrates. Existing video editing/export and signed upload flow remain unchanged.

Firebase is the authoritative post feed database; the Supabase tables primarily support other features. No Firestore/RTDB security rules were replaced and no destructive database migrations were made to chase speculative gains.
