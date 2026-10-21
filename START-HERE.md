# START HERE — Tokyo Manga Lab

## For Claude

1. Upload `Tokyo-Manga-Lab-Claude-Starter.zip` into a Claude chat/project.
2. Open `CLAUDE_MASTER_PROMPT.md` and paste it as the initial task.
3. Ask Claude to **audit the project first without editing** and to list implemented vs. planned features.
4. Work in short milestones. Don't let the first request turn into a rewrite of every future feature.

## For Android / Termux

Download the ZIP into Android's Downloads folder. Then paste these commands in Termux:

```bash
termux-setup-storage
pkg update -y
pkg install -y nodejs-lts python unzip git
mkdir -p "$HOME/tokyo-manga-lab-claude"
unzip -o "$HOME/storage/downloads/Tokyo-Manga-Lab-Claude-Starter.zip" -d "$HOME/tokyo-manga-lab-claude"
cd "$HOME/tokyo-manga-lab-claude"
bash scripts/setup-termux.sh
```

To start the local preview:

```bash
npm run preview
```

Open `http://127.0.0.1:8000/` in the phone browser. Keep Termux open while the server runs; press `Ctrl+C` to stop it.

## For GitHub Actions YAML

`.github/workflows/ci.yml` runs checks/tests and builds a downloadable ZIP artifact when you push to GitHub or open a pull request. It does not auto-push to production or deploy Cloudflare. It cannot unzip a file on your Android phone; local extraction is handled by the Termux `unzip` command above.

## Before public deployment

- Review `git status` and the diff.
- Back up personal changes/local library data.
- Run `npm run check` and `npm test`.
- Verify the exact Worker name and hostname in Cloudflare before using Wrangler.
- Keep GitHub Pages as a neutral, non-explicit demo.
- Do not push, merge or deploy just because a code generator has finished; test on the actual device first.
