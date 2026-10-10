# Traydaq Android APK builder

This **public** repository is an APK build controller. It deliberately does **not** include the private Traydaq/SellerFlow app source, Firebase admin credentials, real account data, or signing keys. The original source remains in the private `gideondreams3325/sellerflow` repository.

## One-time setup (works from an Android phone)

1. In GitHub, open **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Select your account as **Resource owner**. Under repository access choose **Only select repositories** and select **sellerflow**, not every repository. Give it only **Contents: Read-only**; no write or administration access. Set an expiration and create the token.
3. Open the public [Traydaq Actions secrets settings](https://github.com/gideondreams3325/traydaq/settings/secrets/actions). Choose **New repository secret**. Name it exactly `SELLERFLOW_SOURCE_TOKEN`; enter the token as the secret's value. **Never paste the token into source code, issues, workflow inputs, logs, or a chat.**
4. Open [Traydaq GitHub Actions](https://github.com/gideondreams3325/traydaq/actions) and choose **Traydaq Android APK (Public Builder) → Run workflow**.
5. When the run succeeds, open its **Summary → Artifacts → Traydaq-debug-APK**. Download the ZIP file, extract `Traydaq-debug.apk`, and install it on the Android device.

## Stable debug signing (recommended before updating an already installed app)

The optional repository secret `TRAYDAQ_DEBUG_KEYSTORE_B64` must contain the Base64 encoding of the **same** Android debug keystore used for previous installed versions. If it is missing, GitHub creates a temporary debug signing certificate for each build. This can prevent an APK from installing as an update and can break Android-native Google Sign-In until its SHA fingerprints are registered in Firebase. Do not share a keystore in public code or chat.

This workflow builds a **debug APK only**; it does not sign a Play Store release, publish the app, or deploy the backend. It runs manually, not from external pull requests, to protect the private repository token. Anyone who can view public Actions logs may see build status and a package fingerprint, but not the private source itself.

If the build fails, open the failed step in the Actions log. Do not copy authentication token or keystore material into issue comments or screenshots.