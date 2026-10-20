# Tokyo Manga Lab — MangaDex catalogue connector

This is a small Cloudflare Worker for MangaDex catalogue metadata only.

Endpoints:
- `GET /health` — deployment check
- `GET /manga?q=one%20piece&page=1` — title search
- `GET /manga?page=1` — latest-updated catalogue entries

It returns up to 24 entries per page and includes MangaDex `safe` and `suggestive` ratings only. It does not proxy chapter pages or arbitrary upstream URLs.

## Deploy from Termux

Install tools:

```bash
pkg update
pkg install nodejs-lts git -y
npm install --global wrangler
```

If you already cloned the site repository:

```bash
cd ~/tokyo-manga-lab
```

Otherwise:

```bash
cd ~
git clone https://github.com/tokyo720022-create/tokyo-manga-lab.git
cd ~/tokyo-manga-lab
```

Copy the `worker` directory from this package into `~/tokyo-manga-lab/worker`, then:

```bash
cd ~/tokyo-manga-lab/worker
wrangler login
wrangler deploy
```

Follow the Cloudflare prompts. Your endpoint will look like:

`https://tokyo-manga-lab-api.YOUR-SUBDOMAIN.workers.dev`

Test these URLs in your browser, replacing the hostname with your actual deployment:
- `/health`
- `/manga?q=one%20piece&page=1`

The website UI still needs its API base URL wired to the deployed Worker before live results show up. Do not put Cloudflare account tokens in frontend code.

## Notes

- CORS allows the GitHub Pages origin `https://tokyo720022-create.github.io`; update `ALLOWED_ORIGIN` if the website origin changes.
- This connector handles catalogue metadata only. Follow MangaDex's current API usage rules, attribution requirements, and rate limits.
- Keep the GitHub Pages deployment to the neutral, non-explicit prototype; do not use it to publish explicit content.
