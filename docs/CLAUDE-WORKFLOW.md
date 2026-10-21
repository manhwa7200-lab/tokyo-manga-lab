# Working with Claude on this project

## Best way to start
1. Upload `Tokyo-Manga-Lab-Claude-Starter.zip` to Claude.
2. Open `CLAUDE_MASTER_PROMPT.md` from the archive and paste it as the first project instruction.
3. Ask Claude to audit the files and produce a milestone plan before editing.
4. Work on one milestone at a time. Do not ask it to build the reader, novel system, login and publishing backend all in one pass.
5. After every change, ask for tests, a list of changed files, known limitations and a full ZIP if the work is intended for Termux.

## Suggested prompts in order

### Prompt 1 — audit only
"Read CLAUDE.md, PROJECT_BLUEPRINT.md, docs/architecture.md, docs/api-contracts.md, docs/DATA-SCHEMA.md, and docs/ROADMAP.md. Run the existing checks and tests. Do not edit files yet. Tell me what's implemented, what is incomplete, and propose the smallest next milestone."

### Prompt 2 — V1 smoke checks
"Implement only missing regression tests and small correctness fixes for MangaDex search, pagination, title details, chapter metadata, IndexedDB library, backup/restore and legacy migration. Do not implement novel reading or author publishing yet. Run npm run check and npm test."

### Prompt 3 — real phone review
"Help me test the current build on Android using Termux. Give exact commands. Do not push, merge, or deploy anything. Record what passes/fails and fix only issues we can reproduce."

### Prompt 4 — package for review
"Package the complete project (excluding .git and node_modules) into one ZIP with updated docs/tests and Termux commands. Do not change GitHub or Cloudflare."

## Don't do these
- Don't make a giant rewrite before auditing.
- Don't replace the working Worker host from guesses.
- Don't deploy from the local ZIP automatically.
- Don't claim a live browser test passed if only syntax/tests were run.
- Don't erase local library state for a schema migration.
- Don't treat CORS as security or expose tokens in frontend source.
