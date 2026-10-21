#!/data/data/com.termux/files/usr/bin/bash
set -eu
cd "$(dirname "$0")/.."

if ! command -v zip >/dev/null 2>&1; then
  echo "Install zip with: pkg install zip -y"
  exit 1
fi
npm run check
npm test
mkdir -p dist
OUT="dist/Tokyo-Manga-Lab-Claude-Starter.zip"
rm -f "$OUT"
zip -r "$OUT" . \
  -x '.git/*' 'node_modules/*' 'dist/*' '.DS_Store' '*.log'
echo "Created $OUT"
