#!/usr/bin/env bash
# OPTIONAL. Adds the Kotlin new-chapter checker (native/android/updates) to the generated android/ project, so the app can
# check for new chapters and show a notification while it is closed. android-customize.sh runs this only when the file
# native/android/UPDATES_ENABLED exists. It has not been compiled by the author (there is no Android SDK in the authoring
# environment): if the APK build fails after you enable it, delete native/android/UPDATES_ENABLED and build again. The app
# works the same without it, except that new chapters are only looked for while the app is open.
#
# Runs after android-native-downloads.sh (when that is enabled too). Every edit checks first whether it is already there.
# The riskiest edits (Gradle) come first and the Kotlin files are copied last, so a failure early on leaves the project
# exactly as it was.
set -euo pipefail

APP_ID="$(node -p "require('./capacitor.config.json').appId")"
[ -n "$APP_ID" ] || { echo "native updates: appId not found"; exit 1; }
ROOT_GRADLE=android/build.gradle
APP_GRADLE=android/app/build.gradle
MANIFEST=android/app/src/main/AndroidManifest.xml
JAVA_DIR="android/app/src/main/java/$(echo "$APP_ID" | tr . /)"
MAIN="$JAVA_DIR/MainActivity.java"
for f in "$ROOT_GRADLE" "$APP_GRADLE" "$MANIFEST" "$MAIN"; do [ -f "$f" ] || { echo "native updates: $f not found"; exit 1; }; done

python3 - "$ROOT_GRADLE" "$APP_GRADLE" "$MANIFEST" "$MAIN" <<'PY'
import re, sys
root_gradle, app_gradle, manifest, main = sys.argv[1:5]

def read(path): return open(path, encoding="utf-8").read()
def write(path, text): open(path, "w", encoding="utf-8").write(text)

# 1. Kotlin Gradle plugin (skipped when the downloads add-on already added it)
text = read(root_gradle)
if "kotlin-gradle-plugin" not in text:
    match = re.search(r"^(\s*)classpath\s+['\"]com\.android\.tools\.build:gradle:[^'\"]+['\"]\s*$", text, re.M)
    if not match:
        sys.exit("native updates: could not find the Android Gradle plugin line in android/build.gradle")
    line = match.group(0)
    text = text.replace(line, line + "\n" + match.group(1) + "classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.25'", 1)
    write(root_gradle, text)

text = read(app_gradle)
if "kotlin-android" not in text:
    match = re.search(r"^apply plugin:\s*['\"]com\.android\.application['\"]\s*$", text, re.M)
    if not match:
        sys.exit("native updates: could not find 'apply plugin: com.android.application' in android/app/build.gradle")
    text = text.replace(match.group(0), match.group(0) + "\napply plugin: 'kotlin-android'", 1)
    java = re.search(r"targetCompatibility\s+JavaVersion\.VERSION_(\d+(?:_\d+)?)", text)
    if java:  # Kotlin must aim at the same Java level as the app, or Gradle refuses to build
        target = java.group(1).replace("1_", "1.") if java.group(1).startswith("1_") else java.group(1)
        text = re.sub(r"(android\s*\{)", r"\1\n    kotlinOptions { jvmTarget = '" + target + "' }", text, count=1)
# WorkManager runs the periodic check
if "androidx.work:work-runtime-ktx" not in text:
    deps = re.search(r"^dependencies\s*\{", text, re.M)
    if not deps:
        sys.exit("native updates: could not find the dependencies block in android/app/build.gradle")
    text = text.replace(deps.group(0), deps.group(0) + "\n    implementation 'androidx.work:work-runtime-ktx:2.9.1'", 1)
write(app_gradle, text)

# 2. Manifest: the notification permission (Android 13 and newer asks the person once)
text = read(manifest)
if "android.permission.POST_NOTIFICATIONS" not in text:
    text = text.replace("</manifest>", '    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />\n</manifest>', 1)
write(manifest, text)

# 3. Register the plugin in MainActivity, next to the downloads plugin if that is there
text = read(main)
if "TmlUpdatesPlugin" not in text:
    if "registerPlugin(TmlDownloadsPlugin.class);" in text:
        text = text.replace("registerPlugin(TmlDownloadsPlugin.class);", "registerPlugin(TmlDownloadsPlugin.class);\n        registerPlugin(TmlUpdatesPlugin.class);", 1)
    elif "super.onCreate(savedInstanceState);" in text:
        text = text.replace("super.onCreate(savedInstanceState);", "registerPlugin(TmlUpdatesPlugin.class);\n        super.onCreate(savedInstanceState);", 1)
    else:
        opening = re.search(r"public\s+class\s+MainActivity\s+extends\s+BridgeActivity\s*\{", text)
        if not opening:
            sys.exit("native updates: MainActivity has an unexpected shape")
        hook = opening.group(0) + "\n    @Override\n    public void onCreate(android.os.Bundle savedInstanceState) {\n        registerPlugin(TmlUpdatesPlugin.class);\n        super.onCreate(savedInstanceState);\n    }\n"
        text = text.replace(opening.group(0), hook, 1)
    write(main, text)
print("native updates: Gradle, manifest and MainActivity updated")
PY

# 4. Kotlin sources, with this app's package name filled in
for src in native/android/updates/*.kt; do
  sed "s/__APP_ID__/${APP_ID}/g" "$src" > "$JAVA_DIR/$(basename "$src")"
done
echo "native updates: Kotlin update checker installed for $APP_ID"
