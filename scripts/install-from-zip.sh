#!/data/data/com.termux/files/usr/bin/bash
set -eu

ZIP_PATH="${1:-}"
DEST="${2:-$HOME/tokyo-manga-lab-claude}"

if [ -z "$ZIP_PATH" ]; then
  echo "Usage: bash scripts/install-from-zip.sh /path/to/project.zip [destination]"
  exit 2
fi
if [ ! -f "$ZIP_PATH" ]; then
  echo "ZIP not found: $ZIP_PATH"
  exit 1
fi
if ! command -v unzip >/dev/null 2>&1; then
  echo "unzip is missing. Run: pkg install unzip -y"
  exit 1
fi

if [ -e "$DEST" ]; then
  BACKUP="${DEST}.backup-$(date +%Y%m%d-%H%M%S)"
  echo "Destination exists. Backing up to: $BACKUP"
  cp -a "$DEST" "$BACKUP"
fi
mkdir -p "$DEST"
unzip -o "$ZIP_PATH" -d "$DEST"
cd "$DEST"
if [ -f package.json ]; then
  bash scripts/setup-termux.sh
else
  echo "Extraction completed, but package.json was not found at destination root. Check ZIP folder layout."
  exit 1
fi
