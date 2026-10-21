# Termux quick start (Android)

The project is delivered as a single ZIP. GitHub Actions YAML validates/packages the project in GitHub; it does not unzip files on your Android phone. The shell commands below handle local extraction and running.

## First installation
1. Download `Tokyo-Manga-Lab-Claude-Starter.zip` to Android's Downloads folder.
2. In Termux, grant storage access and install tools:

```bash
termux-setup-storage
pkg update -y
pkg install -y nodejs-lts python unzip git
```

3. Extract to a clean folder separate from any existing Git repository:

```bash
mkdir -p "$HOME/tokyo-manga-lab-claude"
unzip -o "$HOME/storage/downloads/Tokyo-Manga-Lab-Claude-Starter.zip" -d "$HOME/tokyo-manga-lab-claude"
cd "$HOME/tokyo-manga-lab-claude"
bash scripts/setup-termux.sh
```

4. Start the preview:

```bash
npm run preview
```

Open `http://127.0.0.1:8000/` in the Android browser. Keep Termux open while testing. Stop the server with `Ctrl+C`.

## A one-command installer after extracting this package once

`scripts/install-from-zip.sh` can be run from an already extracted copy to install an update ZIP into a separate/new destination. It takes a ZIP path and optional destination:

```bash
bash scripts/install-from-zip.sh "$HOME/storage/downloads/Tokyo-Manga-Lab-Claude-Starter.zip" "$HOME/tokyo-manga-lab-claude-copy"
```

The script backs up an existing destination instead of overwriting it silently. Review the script before using it. It does not push to GitHub or deploy Cloudflare.

## Check code

```bash
npm run check
npm test
git diff --check
```

No `npm install` is necessary for the current dependency-free baseline. If later work adds dependencies, review `package.json` and the lockfile before installing.

## Live API note
The current API hostname is configured in `src/services/api-client.js`. Browser requests require the Worker CORS allowlist to include the preview origin. The Worker source is in `worker/src/index.js`; editing it locally does not deploy it. Verify the Cloudflare Worker name and actual hostname before running `wrangler deploy`.
