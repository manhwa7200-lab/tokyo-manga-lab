# Keeping APK updates installable

Android only installs an APK over an older one when both were signed with the **same key**. The build creates a
throwaway debug key on every run, so each new APK looked like a different app and could not be installed over the
old one. Uninstalling first deletes the app's data (library, progress, AniList sign-in).

The fix is to give every build the same key, stored as a GitHub secret.

## One-time setup (phone friendly)
1. Open `debug-signing-key.txt` (sent with the update). It is one long line of text. Copy all of it.
2. On GitHub: your repo > **Settings** > **Secrets and variables** > **Actions** > **New repository secret**.
3. Name: `ANDROID_DEBUG_KEYSTORE_BASE64`. Value: paste the text. Save.
4. Replace `.github/workflows/build-apk.yml` with the file in `docs/workflows/build-apk.yml` (GitHub's website editor:
   open the file, pencil icon, select all, paste, commit). The "Unzip and apply ZIP" workflow cannot change `.github`.
5. Run **Build Android APK**. The log ends with a *signing fingerprint*. It should read
   `5D:95:DD:98:36:04:94:58:...` and stay the same on every later build.

## What to expect
- The **first** APK signed with this key will not install over the old random-key build. Export a backup first
  (Settings > Library > Export backup; the app now opens the Android share sheet), uninstall once, install, then
  import the backup. After that, updates install in place and keep your data.
- This is a *debug* key for sideloading, not a Play Store key. Anyone who has the secret text can sign an APK that
  Android treats as an update to this app, so keep it private and do not commit it to the repository. If it leaks,
  create a new key (the same one-time setup) and accept one more reinstall.
- Without the secret the build still works, prints a warning, and signs with a random key as before.
