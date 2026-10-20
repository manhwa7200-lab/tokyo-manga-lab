# Tokyo Manga Lab — static prototype

A mobile-friendly, local-first manga-library UI prototype intended for GitHub Pages testing. It uses fictional, non-explicit sample catalogue data and browser `localStorage` only.

## Included

- Responsive dark/neon UI
- Search by title, author, genre, tags, and description
- Genre filters and a local-library view
- Save/remove sample titles and mark them as in progress
- Local JSON library export
- No login, backend, API keys, or remote manga page requests

## Deploy to GitHub Pages

1. Create a **new, empty public repository** under your GitHub account (for example, `tokyo-manga-lab`).
2. Extract this ZIP on your computer, then upload `index.html`, `README.md`, and `.nojekyll` to the repository root. Keep `index.html` at the top level, not inside another folder.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select branch `main` and folder `/ (root)`, then click **Save**.
6. Wait for the deployment and visit `https://YOUR-USERNAME.github.io/REPOSITORY-NAME/`.

## Local run

Open `index.html` in a modern browser. Library state is stored in that browser's local storage. Use **Export library** to save a JSON backup.

## Important boundaries

- GitHub Pages is static hosting. It does not run Node/Express backend code; browser-side API calls work only if the provider permits them via CORS.
- Never put private API keys or secrets in frontend JavaScript.
- This demo intentionally uses fictional, non-explicit records. GitHub's policies restrict pornographic/sexually obscene content, so do not use GitHub Pages to publish an explicit-content reader or explicit content. Choose a hosting provider whose terms permit the intended service.
- API connectors are not wired in this first prototype. Add only documented and permitted integrations, then test them separately on a host suitable for their intended content.
