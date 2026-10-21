# Tokyo Manga Lab — MangaDex Worker API v1.1

This Worker patch adds normalized versioned metadata endpoints while preserving the existing `/health` and `/manga` routes for backward compatibility.

## Endpoints

- `GET /health` — legacy health check.
- `GET /manga?q=one%20piece&page=1` — legacy search response; up to 24 items.
- `GET /api/v1/sources` — enabled source registry/capabilities.
- `GET /api/v1/search?query=one%20piece&type=manga&page=1` — normalized search response.
- `GET /api/v1/manga/{mangaDexUuid}` — normalized title metadata.
- `GET /api/v1/manga/{mangaDexUuid}/chapters?page=1&language=en` — paginated chapter metadata only. Use `language=all` to list all available translation languages.

The API exposes MangaDex catalogue metadata and canonical source links only. It does **not** proxy page images, chapter content, arbitrary upstream URLs, downloads, or explicit-rated catalogue items. Chapter links open the original MangaDex page.

## Deploy with Termux

From your existing repository clone, first review the diff and run tests. Then deploy only after you're ready:

```bash
cd ~/tokyo-manga-lab
npm run check
npm test
cd worker
wrangler login # only if not already authenticated
wrangler deploy
```

After deployment, test `/health`, `/api/v1/sources`, `/api/v1/search?query=one%20piece&page=1`, and details/chapters for a MangaDex title UUID returned by search. The website UI continues to use the legacy search route while the new details and chapter list use the versioned routes.

## CORS

CORS allows `https://tokyo720022-create.github.io` plus local preview origins `http://127.0.0.1:8000` and `http://localhost:8000`. This is only browser access control, not authentication; all routes are public GET metadata endpoints. Adjust the origin list if your official host changes.

## Content and source boundaries

Only `safe` and `suggestive` MangaDex ratings are available through this connector. The frontend adult-content preference is off by default, but this setting is not age verification. Follow MangaDex's current API policy and attribution rules. Do not host explicit content on GitHub Pages. This Worker provides chapter *metadata* only, not a reader or downloader.
