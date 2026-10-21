# Master prompt — Build Tokyo Manga Lab from scratch in Claude

Copy/paste this whole prompt into Claude after uploading the complete ZIP. Also ask Claude to read `CLAUDE.md`, `PROJECT_BLUEPRINT.md`, `docs/architecture.md`, `docs/api-contracts.md` and `docs/DATA-SCHEMA.md` first.

---

You are my senior software architect and implementation partner for **Tokyo Manga Lab**, a mobile-first reading ecosystem. We are rebuilding from a clean starter baseline and will work milestone by milestone. The company/community is **Tokyo Brotherhood** and the creator is **Hariharasuthan Karunakaran**. The approved UI concept image is included at `docs/ui-concept-reference.png`.

## First task
Before editing anything:
1. Inspect the entire repository and read the product blueprint, architecture, API contracts, data schema, README and tests.
2. Summarize the current files and distinguish implemented behavior from planned behavior.
3. Run `npm run check` and `npm test` (or tell me precisely which command/environment is unavailable).
4. Propose a short ordered implementation plan based on the roadmap below.
5. Do not push to GitHub, merge a PR, deploy GitHub Pages or deploy a Cloudflare Worker without my explicit approval.

## Product vision
Build a polished reading library—not a clone of another app. The initial product is manga-first. The same architecture can later support novels and original author publishing.

### Product and UI
- Name: Tokyo Manga Lab.
- Visual direction: AMOLED-friendly near-black, cream-white text, Sakura pink/purple accents, rounded cards, clean mobile layout, restrained neon, accessible contrast and reduced-motion support.
- Main navigation: Home, Discover, Library, Downloads, Profile. Settings is reachable from Profile; title details and readers are contextual screens.
- Plan screens for: splash/entry, Home, Discover, manga details, manga reader, Library, novel reader, novel details, Download manager, Profile, Settings, Creator Studio. Not all screens should be fully implemented in V1.
- Prioritize responsive Android/mobile use, low-data behavior and touch-friendly controls.

### Version roadmap
**V1 Manga foundation:** MangaDex as the only source initially; search and pagination; normalized results; title details; chapter metadata list that opens the original MangaDex chapter page; local library; statuses (planned/reading/completed/paused/dropped); favourites; custom collections; filters/sorting; local IndexedDB storage; export/restore; settings; basic statistics and honest empty states where data is not measured. Preserve existing `GET /health` and `GET /manga?q=...&page=...` compatibility routes.

**Stabilization/reader:** validate all API flows on Android and on a deployed Worker; then implement an authorized content reader only after checking source policies and technical requirements. Do not proxy arbitrary URLs or assume chapter media can be reused freely.

**Novel Reading Beta after website launch:** local EPUB and TXT first, PDF later; reflowable EPUB/text reader separate from fixed-layout PDF; font/size/spacing/theme controls; bookmarks and stable progress; web-novel sources only where their terms permit access/caching.

**Later publishing/community:** public author application, review/moderation, approved author role, profiles, private drafts, chapter publishing/version history, schedules, follows/notifications, report/takedown/rights declarations/audit log. Requires a real authenticated backend and server-side authorization; GitHub Pages alone is not a backend.

**Later distribution:** official website for downloads/release notes/privacy/terms/support; GitHub for source/issues/CI/releases. Keep a possible Android app path open but don't select Capacitor/native until file access and distribution needs have been tested.

### Monetization — settled
The product is free to use with optional voluntary creator donations/support. No mandatory subscription, paid chapters, or paywalls in the initial plan. Donations must not unlock reading access, determine moderation outcomes, or buy approval to publish. Explain who receives money. Do not implement payments until specifically planned and legally/provider requirements are reviewed.

### Content/privacy boundaries
- Adult-content setting defaults OFF; it is a user preference and not age verification.
- The public GitHub Pages demo remains neutral and non-explicit. Do not publish explicit content to GitHub Pages.
- Use only permitted API access and respect MangaDex/source terms, attribution, rate limits and content ratings.
- No secrets in frontend source. CORS is not authentication.
- Personal library/progress stays local until a clearly explained cloud-sync feature is intentionally enabled.

## Architecture and data
Use modular HTML/CSS and JavaScript ES modules for the first web version. Keep API services/source adapters, features, data repositories, local storage, reader engines and future publishing concerns separate. Use IndexedDB for structured local records, Cache Storage for same-origin app resources, and a storage adapter for imported binaries where supported. Avoid adding dependencies unless they solve a real need.

Use the approved detailed schema in `docs/DATA-SCHEMA.md`. Core concepts include `contentItems`, `sourceEntries`, `chapterRecords`, `chapterAssets`, `libraryEntries`, `collections`, `collectionItems`, `savedViews`, `readingProgress`, `chapterProgress`, `bookmarks`, `localFiles`, `downloadJobs`, `downloadedAssets`, `appSettings`, `sourceSettings`, `apiCache`, `readingSessions`, optional `statisticsCache`, and future `syncOutbox`. Backend-only future concepts include users/roles, author applications/profiles, manuscripts, published chapters, moderation reports/actions and notifications.

## API decisions
MangaDex first, modular adapter architecture. Preserve legacy `/health` and `/manga` route contracts. Plan normalized versioned endpoints for source capabilities, search, title details, and chapter metadata. A source-specific ID is not the same as a stable internal library ID. Do not merge uncertain matches automatically. Chapter metadata may link to original-source pages; chapter content/pages are not currently served by this API.

The current known Worker host is `https://tokyo-manga-lab-api2.haribp720.workers.dev`; verify it before any deployment. Do not assume the source file's Wrangler `name` points to that host. Do not deploy or edit remote systems without my explicit approval.

## Technical quality gates
- Run `npm run check` and `npm test` after each meaningful milestone.
- Add or update tests for every important API/model behavior and regression.
- Validate query length, pagination, IDs, source URLs and data shapes.
- Handle timeouts, rate limits, source failures, loading/empty states and retry paths.
- Version IndexedDB migrations; do not delete the old localStorage key until its migration has been verified. Never silently wipe library data.
- Export/restore personal metadata; clearly warn when a backup excludes original files/binary downloads.
- Measure active reading time honestly; don't fabricate chart data.
- Keep app fast on low-end Android: lazy load covers, avoid large libraries, use pagination, and respect reduced motion.

## Milestone order
1. Audit baseline, run checks, identify any critical breakages.
2. Stabilize app shell/navigation/theme and API health/search.
3. Validate search/pagination and title details/chapter metadata against the correct Worker version.
4. Validate IndexedDB library operations, migration and backup/restore.
5. Add accessibility/performance checks and realistic mobile verification.
6. Build a real in-app manga reader after source/content delivery constraints are resolved.
7. Launch main website; only then implement Novel Reading Beta.
8. Design backend, accounts/sync and author publishing in a separate later milestone.

For each milestone: first summarize what you plan to edit and why, then implement only that slice. Preserve working functionality. Never call it done until tests and the available UI checks pass. When handing off for Termux, provide a complete ZIP and commands that don't accidentally push/deploy. My device workflow uses Android/Termux, so keep steps copy-pasteable and explain them simply.

---
