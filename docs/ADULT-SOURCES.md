# Adult content and extra sources

## What exists now
- **MangaDex adult ratings** (erotica, pornographic), Android app only. Settings > Language and content > Adult-content preference. Off by default, needs a confirmation, and is a preference on the device, not age verification.
- The Worker only returns adult ratings when the request has no `Origin` header and carries `adult=1`. Browsers, including the GitHub Pages demo, always get the neutral catalogue, and the web build refuses to switch the preference on.
- Titles tagged `loli` or `shota` are blocked everywhere, regardless of any setting.
- Turning the preference off stops the flag and hides cached adult titles from offline results. Titles you added to your own library stay in your library.

## What is deliberately not built
Third-party adult sites. The project rules allow no unreviewed secondary sources, and the sites people usually mean have no official public API, so supporting them would mean scraping pages. A source is only added when all of these are true:

1. The site has an official, documented API or an explicit permission to use it from an app, and its terms allow third-party clients. Scraping is out.
2. The content is legal where the app is used and the source states how it handles takedowns, consent and age.
3. Sexualised minors are excluded (same tag and response checks as above), and the source gives us a way to filter by rating.
4. It lives behind the same off-by-default, Android-only, no-Origin gate, never on the public demo.
5. It is one adapter file behind `source-registry.js`, with its own tests, rate limits, attribution and a Worker route with a fixed upstream. No arbitrary URL proxying.
6. The project owner reviews and approves it in writing before any code is merged.

If you want a specific site considered, send its name and its API or terms page and it can go through this checklist.
