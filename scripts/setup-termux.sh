#!/data/data/com.termux/files/usr/bin/bash
set -eu

if [ -d .git ]; then
  echo "This folder is a Git repository. This script will not push or deploy anything."
fi

for cmd in node npm python3; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing command: $cmd"
    echo "Install tools with: pkg install -y nodejs-lts python unzip git"
    exit 1
  fi
done

printf '\n== Node ==\n'; node --version
printf '\n== Syntax checks ==\n'; npm run check
printf '\n== Tests ==\n'; npm test
printf '\nSetup checks passed. Start local preview with: npm run preview\n'
printf 'Preview URL: http://127.0.0.1:8000/\n'
