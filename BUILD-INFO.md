# Tokyo Manga Lab — build info

Version: 0.4.0 preview
Milestone: Manga title details and chapter-metadata API

## Changes in this preview
- Added modular adapter methods for normalized title details and chapter metadata.
- Added a chapter list in the title details dialog with page controls and translation-language filter. Chapter links open the original MangaDex site.
- Added `/api/v1/sources`, `/api/v1/search`, `/api/v1/manga/:id`, and `/api/v1/manga/:id/chapters` to the included Worker source.
- Preserved `/health` and `/manga` legacy routes for backward compatibility.
- Added Worker route tests and API documentation (17 automated tests).

## Not included
- No in-app chapter reader or image-page proxy.
- No offline chapter downloads.
- No novels, accounts, cloud sync, or author publishing.
- No Worker deployment, GitHub commit, or push was performed by generating this ZIP.
