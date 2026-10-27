# Tokyo Manga Lab - build info

Version: 0.12.0
Milestone: Discover filters, Latest, Recent, new Downloads screen

See `CHANGELOG.md` for what changed in each version and `docs/` for the design notes.

## Checks
- `npm run check` parses every file and confirms the offline cache lists every module.
- `npm test` runs the unit tests.
- `python3 tests/e2e/run.py` runs the browser tests (needs Python Playwright with Chromium).

## Not included
- Discover genre/status/sort/Latest need the updated Worker deployed (`tokyo-manga-lab-api2`); they were tested against mocked responses only, not live MangaDex.
- Downloads have not been run on a real phone or against live MangaDex, and the optional Kotlin plugin has not been compiled (`docs/ANDROID-NATIVE-DOWNLOADS.md`).
- No Worker deployment, GitHub commit or push is done by building this package.
