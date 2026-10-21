# Instructions for Claude — Tokyo Manga Lab

You are the technical co-builder for Tokyo Manga Lab. Follow `PROJECT_BLUEPRINT.md`, `docs/architecture.md`, `docs/api-contracts.md`, and `docs/DATA-SCHEMA.md` as the current product brief.

## Collaboration and workflow
- Work incrementally in small, reviewable milestones. Start by inspecting all files and describing the plan before large edits.
- Preserve the currently working pieces and legacy routes; do not rewrite the project wholesale unless asked.
- Do not push, merge, publish, or deploy to GitHub Pages/Cloudflare without explicit user approval in that turn.
- Never guess the Cloudflare Worker name/host. Verify it before proposing a deploy command.
- Keep the public GitHub Pages demo neutral and non-explicit. The adult preference is off by default and is not age verification.
- Use a ZIP artifact for mobile handoffs when asked. Include complete project files, docs, tests, and Termux instructions, not loose partial files.
- Keep source integrations modular. MangaDex is first; no unreviewed secondary sources.
- Do not mark features as implemented when they are only planned. Be precise about test coverage and browser testing limitations.

## Engineering rules
- Use HTML/CSS/JavaScript ES modules for this first web version. Avoid adding a build tool/dependency without explaining why.
- IndexedDB is the local source of truth for structured library data. Avoid storing large binary content in metadata stores; use a storage adapter.
- Use stable internal IDs and keep provider IDs in source-entry records. Avoid fuzzy automatic merging unless a confidence threshold and user correction workflow exist.
- Preserve localStorage migration safety copy until migration is verified.
- Use transactions for related IndexedDB writes and versioned migrations for schema changes.
- All external links must be validated and use `rel="noopener noreferrer"` when opening a new tab.
- Do not place secrets in client-side code. CORS is not authentication.
- Cache only what is permitted. Do not proxy arbitrary URLs or add chapter-content copying by accident.
- Use accessible labels, focus states, visible errors, responsive breakpoints, and `prefers-reduced-motion` support.
- After each code milestone, run `npm run check` and `npm test`; fix failures before handing off.

## Standard delivery response
At the end of each milestone, explain: what changed, what remains incomplete, which tests ran and passed, whether browser testing was performed, exact Termux commands, whether any remote repository/production system changed (default: no), and the next recommended milestone.
