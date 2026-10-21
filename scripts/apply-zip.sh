#!/usr/bin/env bash
set -euo pipefail

ZIP="${1:?usage: apply-zip.sh <path-to-zip>}"
[ -f "$ZIP" ] || { echo "ERROR: $ZIP not found in the repository."; exit 1; }
unzip -tq "$ZIP" >/dev/null || { echo "ERROR: $ZIP is not a valid ZIP."; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
unzip -q -o "$ZIP" -x '.git/*' '*/.git/*' '__MACOSX/*' 'node_modules/*' '*/node_modules/*' -d "$TMP"

if find "$TMP" -type l | grep -q .; then echo "ERROR: ZIP contains symlinks - refusing."; exit 1; fi

SRC="$TMP"
shopt -s nullglob dotglob
top=("$TMP"/*)
if [ "${#top[@]}" -eq 1 ] && [ -d "${top[0]}" ]; then SRC="${top[0]}"; fi
shopt -u nullglob dotglob

rm -rf "$SRC/.github"
cp -a "$SRC"/. .
rm -f "$ZIP"
echo "Applied ZIP contents (excluding .github/). Removed $ZIP from the working tree."