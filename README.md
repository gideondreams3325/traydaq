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