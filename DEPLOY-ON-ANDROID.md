# Android / Termux update checklist — Preview 0.4

This ZIP contains frontend updates **and** a proposed Worker source update. Extracting it does not push code to GitHub and does not deploy the Worker.

## 1. Back up the existing project

```bash
cd ~/tokyo-manga-lab || exit 1
git status --short
BACKUP="$HOME/tokyo-manga-lab-backup-$(date +%Y%m%d-%H%M%S)"
cp -a "$HOME/tokyo-manga-lab" "$BACKUP" || exit 1
echo "Backup: $BACKUP"
```

If `git status --short` shows personal changes, review and preserve them before continuing.

## 2. Extract Preview 0.4

If Android saved the ZIP under Downloads:

```bash
unzip -o "$HOME/storage/downloads/Tokyo-Manga-Lab-V1.1-Chapters-Preview-0.4.zip" -d "$HOME/tokyo-manga-lab"
cd "$HOME/tokyo-manga-lab"
```

If your Downloads path differs, adjust the ZIP path. The package updates `src/app.js`, CSS, API adapter code, docs/tests, and `worker/src/index.js`. It intentionally does not include or overwrite `worker/wrangler.toml`.

## 3. Run verification

```bash
npm run check
npm test
git diff --check
git status --short
```

Expected automated result: 17 tests pass.

## 4. Preview the website

```bash
python -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000/` in your Android browser. Search still uses the currently deployed legacy `/manga` route. If the Worker still has its old code, or local-preview CORS blocks the new route, the details screen will show an API-update/local-CORS note. This is expected until the included Worker source is deployed to the verified live Worker URL.

## 5. Deploy the Worker patch only after review

The new detail and chapter-list UI needs the new routes from `worker/src/index.js`. Before running Wrangler, inspect your existing `worker/wrangler.toml` and Cloudflare dashboard. Confirm its Worker `name` points to the exact script that serves `https://tokyo-manga-lab-api2.haribp720.workers.dev`. **Do not guess or change the Worker name blindly.** If the configured name would deploy to a different URL, preserve your current Worker configuration or update the frontend `API_BASE_URL` only after confirming the deployment URL.

After you've confirmed the exact target and want to deploy:

```bash
cd ~/tokyo-manga-lab/worker
wrangler deploy
```

Then test these endpoints on the actual deployed hostname:

- `/health`
- `/api/v1/sources`
- `/api/v1/search?query=one%20piece&page=1`
- `/api/v1/manga/MANGADEX_UUID`
- `/api/v1/manga/MANGADEX_UUID/chapters?page=1&language=en`

Replace `MANGADEX_UUID` with an ID returned from the search response. The detail and chapters endpoints return metadata only. Chapters link to the original MangaDex pages; the Worker does not proxy chapter pages or images.

## 6. GitHub deployment

Do not commit or push until the local UI and Worker have been checked. The Worker deploy and GitHub Pages deploy are separate operations. Test each separately and keep the project backup until both are verified.
