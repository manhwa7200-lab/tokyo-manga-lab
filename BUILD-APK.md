# Build the Tokyo Manga Lab APK (no PC needed)

The APK is a **Capacitor** wrapper around the existing web app. GitHub builds it for you in the cloud - nothing to install on your phone except the finished APK.

## One-time setup
1. Put these files in your repo (see "Add the files" below).
2. In GitHub: **Settings > Actions > General > Workflow permissions** > choose **Read and write permissions** and tick **Allow GitHub Actions to create and approve pull requests**. Save.

## Build the APK
1. Open the repo on GitHub > **Actions** tab > **Build Android APK** > **Run workflow**.
2. Wait about 5-8 minutes. Open the finished run and download **Tokyo-Manga-Lab-APK** from *Artifacts* (it is a ZIP containing the `.apk`).
3. On Android: unzip it, tap the `.apk`, allow **Install unknown apps** when asked, and install.

Tag builds (`git tag v0.5.0 && git push origin v0.5.0`) also attach the APK to a GitHub Release.

## Add the files to the repo
**Option A - Termux (no workflow needed)**
```bash
pkg install -y git unzip
git clone https://github.com/tokyo720022-create/tokyo-manga-lab.git
cd tokyo-manga-lab
git checkout -b feature/android-apk
unzip -o ~/storage/downloads/Tokyo-Manga-Lab-APK-Kit.zip
git status          # review what changed
git add -A && git commit -m "Add Android APK build"
git push -u origin feature/android-apk   # then open a Pull Request and merge it
```

**Option B - the "Unzip and apply ZIP" workflow**
The workflow file itself must be added by hand first (GitHub does not let Actions create workflow files):
1. On GitHub: **Add file > Create new file**, name it `.github/workflows/unzip-and-apply.yml`, paste the contents from this kit, commit.
2. Also upload `scripts/apply-zip.sh` the same way (Add file > Upload files).
3. Upload your ZIP as `upload/project.zip`.
4. **Actions > Unzip and apply ZIP > Run workflow.** It unzips onto a new branch `import/zip-N` and opens a pull request. It never touches `main`, and it skips `.github/` from the ZIP.
5. Review the PR, merge it, then run **Build Android APK**.

## Notes and honest limits
- This is a **debug-signed** APK: fine for installing on your own phone, **not** for Google Play. A release keystore is a later step.
- Not built or run on a device by Claude yet. The first GitHub run may need small fixes; send me the log if it fails.
- The Worker only accepts requests from GitHub Pages/localhost. The APK turns on Capacitor's native HTTP (`CapacitorHttp` in `capacitor.config.json`) so requests carry no browser Origin and pass. No Worker redeploy is needed.
- App id: `com.tokyobrotherhood.mangalab` (cannot change after you publish).
- Chapter links open in the system browser; there is no in-app reader yet.
