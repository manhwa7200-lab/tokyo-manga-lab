# Tokyo Manga Lab — Project Blueprint

**Planning status:** approved direction; this kit is a clean, reviewable starting point. Implement in phases. Do not deploy or push without the owner's explicit approval.

## 1. Vision

Tokyo Manga Lab is a mobile-first, local-first reading ecosystem created by **Hariharasuthan Karunakaran**, under **Tokyo Brotherhood**. The first release focuses on a reliable manga catalogue and personal library. The architecture should support novels, offline reading, source adapters, statistics, and eventually an open author-publishing platform without turning V1 into an oversized, fragile project.

Working tagline from the visual concept: **“Your manga. Your world.”** It can be changed later.

## 2. Product principles

1. **Manga first.** Prioritize search, metadata, collections, bookmarks, progress, and a pleasant mobile experience.
2. **Local-first.** Personal library/progress should work without login and be stored on the device. Cloud sync is optional and later.
3. **Modular integrations.** MangaDex is the first source adapter. The UI talks to normalized interfaces, not directly to provider-specific schemas.
4. **Privacy and data ownership.** Explain any data that leaves the device. Provide metadata backup/restore. Never upload reading history by surprise.
5. **Preserve user data.** Updates and source changes must not silently erase bookmarks, progress, imports or collections.
6. **Free product.** Core features remain free; optional voluntary support/donations may support participating creators. No mandatory subscriptions, paid chapters, or paywalls in the initial plan.
7. **Mobile-first performance.** Small bundles, lazy loading, stable touch targets, keyboard accessibility, low-end Android support, and graceful offline states.
8. **Safe source boundaries.** Use permitted APIs and respect provider terms, content ratings, attribution, and rate limits. Don't proxy arbitrary URLs or copy source content without permission.

## 3. Brand and visual system

- Product: Tokyo Manga Lab
- Company/community: Tokyo Brotherhood
- Creator: Hariharasuthan Karunakaran
- Visual reference: `docs/ui-concept-reference.png`
- Style: AMOLED-friendly near-black surfaces, cream-white text, Sakura pink and restrained purple glow, rounded cards, clean spacing, visible focus states, smooth but reduced-motion-friendly transitions.
- Mobile navigation: Home, Discover, Library, Downloads, Profile. Settings are reachable from Profile; readers and details are contextual screens.
- Design is a reference, not a demand to copy any unrelated app or copyrighted product assets. Use original generic artwork/placeholders until permitted art is available.

## 4. Current technical direction

### Frontend
- Static HTML/CSS and modular JavaScript ES modules for the first web version.
- GitHub Pages is acceptable for a neutral, non-explicit frontend demo.
- IndexedDB for structured local data; Cache Storage for same-origin app shell; use a suitable storage adapter for larger imported files where supported.
- Service worker caches only the app shell unless explicit content-storage rules and user controls are implemented.

### API
- Cloudflare Worker is the API boundary.
- Keep existing compatibility routes: `GET /health` and `GET /manga?q=...&page=...`.
- Add versioned normalized metadata routes incrementally: `/api/v1/sources`, `/api/v1/search`, `/api/v1/manga/{id}`, `/api/v1/manga/{id}/chapters`.
- One source first: MangaDex. Add other sources only after the adapter contract, reliability, and permitted usage have been reviewed.
- The current known Worker host in the existing project is `https://tokyo-manga-lab-api2.haribp720.workers.dev`; verify this before deployment. Do not change Worker identity or deploy blindly.

### Future backend
GitHub Pages does not provide a secure accounts/database backend. A future authenticated backend is needed for cloud sync, private author drafts, author applications, publishing permissions, moderation, notifications and audit logs. Select a provider only after requirements, cost and deployment needs are understood.

## 5. Main feature set

### V1 — Manga website
- Responsive Home and Discover views.
- MangaDex search with query, pagination, clear loading/error/empty states.
- Normalized title cards, covers where available, source attribution and original-source links.
- Title details and chapter metadata list; chapter links open the source site. This is not the in-app reader yet.
- Local library with statuses: Planned, Reading, Completed, Paused, Dropped.
- Favourites, manual collections, genres/tags, sorting, saved filters/smart lists where implemented.
- Bookmarks/progress data model designed for future readers.
- Profile/Settings: theme, source connection status, privacy controls, content safety preference.
- JSON backup and restore for metadata/library/progress. Warn users that metadata export is not a binary file backup.
- Basic catalogue/library statistics; activity charts are only meaningful when real reading-session events exist.
- Adult-content preference defaults OFF. A preference toggle is not age verification.

### V1.1 — Stabilization and manga reader follow-up
- Validate real search/details/chapter listing on device and deployed Worker.
- In-app manga reader only after source access and content delivery are properly scoped; preserve source policies, don't build an arbitrary page proxy.
- Reader modes, if supported by authorized content: page-by-page, RTL/LTR, vertical scrolling, tap zones, progress/bookmarks, brightness/UI preferences.
- Reliable download queue and storage cleanup only when rights/terms permit.

### Novel Reading Beta — after main website launch
- Local EPUB and TXT imports first; PDF fixed-layout reader later.
- Reader settings: font, size, line height, margins, theme, chapter navigation, bookmarks and stable resume location.
- Separate reader engines share the same library model; don't force EPUB/PDF into a manga-page model.
- Online novel sources only where access and caching are allowed by their terms.
- Imported files remain local unless the user intentionally exports/backups them.

### Later — community and publishing
- Public author application workflow; applications require review before author privileges are granted.
- Roles: Reader, Applicant, Approved Author, Moderator, Administrator.
- Server-side authorization for drafts and publishing; do not rely on hidden buttons for security.
- Creator profiles, authorized works, drafts, chapter management, publish schedule, version history, follows/notifications.
- Report/takedown process, rights declaration, moderation notes, audit trail and appeals path.
- Optional donation/support links. Reading access and publishing acceptance must not depend on donating.

### Later — Android and official website
- Keep the web frontend portable; decide between a PWA wrapper, Capacitor or native Android only after browser/file-access requirements and distribution strategy are tested.
- Official product website can later include downloads/releases, screenshots, changelog, privacy policy, terms, support and age/content notices.
- GitHub is for source, documentation, issues, versioning, CI and releases. Hosting terms must be checked for every type of content.

## 6. Out of scope for V1

- Full user accounts or multi-device cloud sync.
- Secure author drafts or public chapter publishing.
- Payment processing/donation payouts built into the app.
- Novel platforms whose terms do not permit integration.
- Automatic cross-source merging based only on similar titles/chapter numbers.
- Claiming reading time if active time was not measured reliably.
- Explicit content in the GitHub Pages demo.

## 7. Quality and security gates

- All dynamic text rendered as text or escaped safely; validate external URL origins before linking.
- Do not expose private API keys, tokens, or server secrets in frontend files.
- Validate Worker routes, limit query length/page size, use timeouts, return stable error shapes, set CORS only for intentional origins, and avoid user-controlled arbitrary upstream URLs.
- Respect provider rate limits, attribution, content filtering, and data licenses/terms.
- Back up local data before schema migrations and keep migrations versioned.
- Include unit tests for model normalization, source adapter contracts, ID/language validation, database/repository behavior where feasible, legacy route compatibility, and error paths.
- Test on a mobile browser and on a low-end device before public deployment.

## 8. Definition of done

A feature is not done solely because its screen exists. It must have working behavior, loading/empty/error states, mobile layout, appropriate keyboard/screen-reader support, tests for important logic, updated documentation, and a rollback/backup plan if it changes stored data.
