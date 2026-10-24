# Source reviews

Sources are reviewed against the checklist in `docs/ADULT-SOURCES.md` (official API or explicit permission, legal content, takedown handling, rating filters, the same gate, one adapter file, owner approval). MangaDex is the only manga source in the app.

## Comick (reviewed 24 Oct 2026) - not added
Why:
- **No official, documented third-party API.** The only public trace is a community feature request on Comick's own feedback tracker, answered with "planned"; the HTTP API used by other tools is undocumented and has changed shape and domain before (`.fun`, then `.app`).
- **Content is mostly unlicensed scanlation.** Press coverage describes it as a manga piracy site. Reading it through this app would mean the app delivers unlicensed chapters.
- **Its status is unclear.** The operator announced the site was closing in September 2025. Its status page now shows "operational" and names `comick.dev` as the only official domain, but we found no relaunch notice, terms or takedown policy.
- No rating filter or age safeguard we could rely on, so criterion 3 and the gate could not be honoured.

What would change this: a written statement from the Comick team that third-party apps may use their API, a published terms and takedown page, a rating filter, and the project owner's written approval.

Sources checked: Anime Corner report of the Sept 2025 closure, the Comick status page, the Comick feedback tracker issue "API Support for Third-Party Apps and Websites", HakuNeko issue #5514 (API change).

## Compliant ways to get a second source
- Official publisher APIs or feeds that allow third-party clients.
- Importing your own files (CBZ) into the library.
- AniList for tracking (already supported).
