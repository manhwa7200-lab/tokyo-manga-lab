#!/usr/bin/env bash
# Runs AFTER `npx cap add android`. Applies version numbers and the app icon
# to the generated (never committed) android/ project.
set -euo pipefail

VERSION_NAME="${1:?usage: android-customize.sh <versionName> <versionCode>}"
VERSION_CODE="${2:?usage: android-customize.sh <versionName> <versionCode>}"
GRADLE=android/app/build.gradle
RES=android/app/src/main/res

[ -f "$GRADLE" ] || { echo "ERROR: $GRADLE not found - did 'cap add android' run?"; exit 1; }

sed -i -E "s/versionCode [0-9]+/versionCode ${VERSION_CODE}/; s/versionName \"[^\"]*\"/versionName \"${VERSION_NAME}\"/" "$GRADLE"
grep -E "versionCode|versionName" "$GRADLE"

# --- Icons (ImageMagick `convert` is preinstalled on GitHub's ubuntu runners) ---
ICON=resources/icon.png
if [ -f "$ICON" ] && command -v convert >/dev/null 2>&1; then
  declare -A LEGACY=( [mdpi]=48 [hdpi]=72 [xhdpi]=96 [xxhdpi]=144 [xxxhdpi]=192 )
  declare -A FOREGROUND=( [mdpi]=108 [hdpi]=162 [xhdpi]=216 [xxhdpi]=324 [xxxhdpi]=432 )
  for d in "${!LEGACY[@]}"; do
    dir="$RES/mipmap-$d"; mkdir -p "$dir"
    s=${LEGACY[$d]}; f=${FOREGROUND[$d]}; inner=$(( f * 66 / 100 ))
    convert "$ICON" -resize "${s}x${s}" "$dir/ic_launcher.png"
    convert "$ICON" -resize "${s}x${s}" \( +clone -alpha extract -fill black -colorize 100 -fill white -draw "circle $((s/2)),$((s/2)) $((s/2)),0" \) -alpha off -compose CopyOpacity -composite "$dir/ic_launcher_round.png"
    convert "$ICON" -resize "${inner}x${inner}" -background none -gravity center -extent "${f}x${f}" "$dir/ic_launcher_foreground.png"
  done
  mkdir -p "$RES/values"
  cat > "$RES/values/ic_launcher_background.xml" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#09080F</color>
</resources>
XML
  echo "Icons generated from $ICON"
else
  echo "WARN: icon or ImageMagick missing - keeping default Capacitor icon"
fi
