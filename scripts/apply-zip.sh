#!/usr/bin/env bash
# Unzip a project ZIP over the current repo checkout.
#  - removes a single wrapping top-level folder if the ZIP has one
#  - never touches .github/ (GitHub blocks workflow edits from Actions; add those by hand)
#  - skips .git/, node_modules/ and absolute / parent-directory paths
#  - deletes files listed in DELETE-FILES.txt (one repo-relative path per line, # for comments), so an update
#    can remove files it no longer needs. Only plain files outside .git/, .github/ and node_modules/ are removed.
set -euo pipefail

ZIP="${1:?usage: apply-zip.sh <path-to-zip>}"
[ -f "$ZIP" ] || { echo "ERROR: $ZIP not found in the repository."; exit 1; }
unzip -tq "$ZIP" >/dev/null || { echo "ERROR: $ZIP is not a valid ZIP."; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
unzip -q -o "$ZIP" -x '.git/*' '*/.git/*' '__MACOSX/*' 'node_modules/*' '*/node_modules/*' -d "$TMP"

# Guard against path escapes (unzip already refuses them; this double-checks).
if find "$TMP" -type l | grep -q .; then echo "ERROR: ZIP contains symlinks - refusing."; exit 1; fi

SRC="$TMP"
shopt -s nullglob dotglob
top=("$TMP"/*)
if [ "${#top[@]}" -eq 1 ] && [ -d "${top[0]}" ]; then SRC="${top[0]}"; fi
shopt -u nullglob dotglob

rm -rf "$SRC/.github"
# Copy contents (including dotfiles) over the repo, but do not re-copy the ZIP itself.
cp -a "$SRC"/. .
rm -f "$ZIP"

# Deletions. The list can arrive in the ZIP (now in the working tree) or be left over from an earlier import.
if [ -f DELETE-FILES.txt ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    path="${line%%#*}"; path="$(printf '%s' "$path" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')"
    [ -n "$path" ] || continue
    case "$path" in
      /*|*..*|.git|.git/*|.github|.github/*|node_modules|node_modules/*|DELETE-FILES.txt) echo "Skipping unsafe delete entry: $path"; continue ;;
    esac
    if [ -f "$path" ] && [ ! -L "$path" ]; then rm -f -- "$path"; echo "Deleted $path"; else echo "Already gone: $path"; fi
  done < DELETE-FILES.txt
  rm -f DELETE-FILES.txt
fi
echo "Applied ZIP contents (excluding .github/). Removed $ZIP from the working tree."
