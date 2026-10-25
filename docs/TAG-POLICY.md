# Tag policy: loli and shota

MangaDex tags some titles **loli** or **shota**. Tokyo Manga Lab applies this rule in the Worker (`worker/src/index.js`), for search, title details, chapter lists and chapter pages:

A tagged title is shown **only if all of these are true**:
1. MangaDex rates it **safe**. Suggestive, erotica and pornographic are never shown, with or without the 18+ toggle.
2. It carries **no sexual-content tag** (any tag whose name contains sexual, incest, erotic, hentai, smut, ecchi, nsfw or lewd). A "safe" rating next to such a tag means the rating cannot be trusted, so the title stays hidden.
3. Its id is **not in `ALWAYS_BLOCKED_IDS`**.

Titles without these tags follow the normal rating rules (safe and suggestive always; erotica and pornographic only in the Android app with the 18+ preference on).

## Why "safe" only, not "everything except adult"
"Suggestive" on MangaDex means sexualised content. Allowing it next to these tags would show sexualised child characters, so it stays blocked.

## Hiding a title that slips through
If you ever see a title that should not be there (for example it is mis-rated on MangaDex), add its id to `ALWAYS_BLOCKED_IDS` at the top of the Worker, run `npm test`, and redeploy the Worker. The id is the UUID in the title's mangadex.org address.

## What you will see
- Safe-rated tagged titles appear when you **search** for them (first page of results; name matches first). They do not appear in the "latest" shelf on their own.
- They open normally, with chapters and the reader.
- The app needs no update for this: the rule runs in the Worker, so **redeploy the Worker** to apply it.

## Tests
`tests/worker-api.test.mjs` and `tests/worker-tag-policy.test.mjs` check every rating with the tag (safe allowed; suggestive, erotica and pornographic blocked in the browser and in the app with 18+ on), the sexual-tag rule, the block list, chapter pages, and that search keeps working if the extra lookup fails.
