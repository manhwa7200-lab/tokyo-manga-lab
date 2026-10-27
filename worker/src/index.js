const API_BASE = "https://api.mangadex.org";
const ALLOWED_ORIGIN = "https://tokyo720022-create.github.io";
const ALLOWED_DEV_ORIGINS = new Set([
  ALLOWED_ORIGIN,
  "http://127.0.0.1:8000",
  "http://localhost:8000"
]);
const MAX_QUERY_LENGTH = 100;
const PAGE_SIZE = 24;
const MAX_CHAPTER_PAGE_SIZE = 100; // a client may ask for bigger chapter pages (up to this) so a whole title loads in a few requests
const MAX_SEARCH_PAGE = 20;
const MAX_CHAPTER_PAGE = 1000;
const SAFE_RATINGS = ["safe", "suggestive"];
const ADULT_RATINGS = ["erotica", "pornographic"];
// Sexualised-minor tags are never served in any mode. Checked by id (request filter) and by name (response filter, fail closed).
const BLOCKED_TAG_IDS = ["2d1f5d56-a1e5-4d0d-a961-2193588b08ec", "ddefd648-5140-4e5f-ba18-4eca4071d19b"];
const BLOCKED_TAG_NAMES = new Set(["loli", "shota"]);
// Discover filters. Status values and sort keys are fixed lists, never passed through from the request as they are.
const STATUS_VALUES = ["ongoing", "completed", "hiatus", "cancelled"];
const SORT_KEYS = { popular: "followedCount", new: "createdAt", updated: "latestUploadedChapter" };
const MAX_GENRE_FILTERS = 6;
const LATEST_WINDOW = 100; // chapters looked at per Latest page; the titles they belong to are shown once each
const TAG_LIST_TTL_MS = 6 * 60 * 60 * 1000;

// ---- Tag policy ---------------------------------------------------------------------------------------------------
// A title tagged loli or shota is shown only when ALL of these hold:
//   - MangaDex rates it "safe" (suggestive, erotica and pornographic are never shown, with or without the 18+ toggle);
//   - it carries no tag about sexual content (see SEXUAL_TAG_WORDS), because a "safe" rating next to such a tag means the
//     rating cannot be trusted;
//   - its id is not in ALWAYS_BLOCKED_IDS, where you can list any title that slips through. See docs/TAG-POLICY.md.
// Titles without these tags follow the normal rating rules.
const ALWAYS_BLOCKED_IDS = new Set([
  // "00000000-0000-4000-8000-000000000000", // Name, only a note for you
]);
const SEXUAL_TAG_WORDS = ["sexual", "incest", "erotic", "hentai", "smut", "ecchi", "nsfw", "lewd"];

// Adult ratings are only ever returned to non-browser clients (the Android app sends no Origin header) that
// ask for them with adult=1. This keeps the public GitHub Pages demo neutral. It is a product policy,
// not authentication or age verification: CORS and the Origin header are not security boundaries.
function adultRequested(url, origin) {
  return !origin && url.searchParams.get("adult") === "1";
}

function allowedRatings(allowAdult) {
  return allowAdult ? [...SAFE_RATINGS, ...ADULT_RATINGS] : SAFE_RATINGS;
}

function hasBlockedTag(item) {
  return (item?.attributes?.tags || []).some(tag =>
    BLOCKED_TAG_IDS.includes(tag?.id) || Object.values(tag?.attributes?.name || {}).some(name => BLOCKED_TAG_NAMES.has(String(name).trim().toLowerCase())));
}

// Best-effort per-client limit (per Worker instance, keyed by Cloudflare's client IP header). It slows casual abuse of this
// public endpoint; it is not authentication. For a hard limit add a Cloudflare rate-limiting rule (see docs/api-contracts.md).
const RATE_WINDOW_MS = 60000;
const RATE_MAX_REQUESTS = 120;
const rateBuckets = new Map();

function retryAfterSeconds(request, now = Date.now()) {
  const ip = request.headers.get("CF-Connecting-IP");
  if (!ip) return 0;
  if (rateBuckets.size > 5000) {
    for (const [key, bucket] of rateBuckets) if (now - bucket.start >= RATE_WINDOW_MS) rateBuckets.delete(key);
    if (rateBuckets.size > 5000) rateBuckets.clear();
  }
  let bucket = rateBuckets.get(ip);
  if (!bucket || now - bucket.start >= RATE_WINDOW_MS) { bucket = { start: now, count: 0 }; rateBuckets.set(ip, bucket); }
  bucket.count += 1;
  return bucket.count > RATE_MAX_REQUESTS ? Math.max(1, Math.ceil((bucket.start + RATE_WINDOW_MS - now) / 1000)) : 0;
}

function isAllowedOrigin(origin) {
  return !origin || ALLOWED_DEV_ORIGINS.has(origin);
}

function corsHeaders(origin) {
  const headers = {
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
  if (origin && ALLOWED_DEV_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(data, status, origin, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=120",
      ...corsHeaders(origin),
      ...extraHeaders
    }
  });
}

function requestId() {
  try { return crypto.randomUUID(); } catch { return `req-${Date.now().toString(36)}`; }
}

function apiV1(data, origin, status = 200, extra = {}) {
  return json({ data, meta: { apiVersion: "1", requestId: requestId() } }, status, origin, extra);
}

function apiError(code, message, origin, status = 400, extra = {}) {
  return json({ error: { code, message }, meta: { apiVersion: "1", requestId: requestId() } }, status, origin, extra);
}

function pickText(value) {
  if (!value || typeof value !== "object") return "";
  return value.en || value["ja-ro"] || value.ja || Object.values(value)[0] || "";
}

function allTitleTexts(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap(entry => entry && typeof entry === "object" ? Object.values(entry) : [])
    .filter(text => typeof text === "string" && text.trim()).map(text => text.trim()))];
}

function getRelations(item) {
  return Array.isArray(item?.relationships) ? item.relationships : [];
}

function getNamedRelationships(item, wantedTypes) {
  return [...new Set(getRelations(item)
    .filter(rel => wantedTypes.includes(rel.type))
    .map(rel => rel.attributes?.name)
    .filter(name => typeof name === "string" && name.trim())
    .map(name => name.trim()))];
}

function getCoverUrl(item) {
  const rel = getRelations(item).find(entry => entry.type === "cover_art");
  const fileName = rel?.attributes?.fileName;
  return fileName && item?.id
    ? `https://uploads.mangadex.org/covers/${encodeURIComponent(item.id)}/${encodeURIComponent(fileName)}.256.jpg`
    : null;
}

// MangaDex stores other sites' ids in `links` (al = AniList, mal = MyAnimeList). Only plain numeric ids are passed on.
function numericLink(value) {
  const text = String(value ?? "").trim();
  return /^\d{1,9}$/.test(text) ? text : null;
}

function normalizeManga(item) {
  const attrs = item?.attributes || {};
  const tags = (attrs.tags || [])
    .map(tag => pickText(tag.attributes?.name))
    .filter(Boolean);
  return {
    sourceId: "mangadex",
    externalId: String(item?.id || ""),
    contentType: "manga",
    title: pickText(attrs.title) || "Untitled manga",
    alternateTitles: allTitleTexts(attrs.altTitles),
    description: pickText(attrs.description),
    coverUrl: getCoverUrl(item),
    authors: getNamedRelationships(item, ["author"]),
    artists: getNamedRelationships(item, ["artist"]),
    genres: [...new Set(tags.map(tag => tag.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")))],
    tags,
    publicationStatus: normalizePublicationStatus(attrs.status),
    releaseYear: attrs.year || null,
    language: attrs.originalLanguage || null,
    sourceUrl: item?.id ? `https://mangadex.org/title/${encodeURIComponent(item.id)}` : null,
    contentRating: attrs.contentRating || "unknown",
    lastChapter: attrs.lastChapter ? String(attrs.lastChapter).slice(0, 12) : null,
    anilistId: numericLink(attrs.links?.al),
    malId: numericLink(attrs.links?.mal)
  };
}

function normalizePublicationStatus(value) {
  const status = String(value || '').toLowerCase();
  if (status === 'ongoing' || status === 'releasing') return 'releasing';
  if (status === 'completed') return 'completed';
  if (status === 'hiatus') return 'hiatus';
  return 'unknown';
}

function hasSexualTag(item) {
  return (item?.attributes?.tags || []).some(tag =>
    Object.values(tag?.attributes?.name || {}).some(name => SEXUAL_TAG_WORDS.some(word => String(name).toLowerCase().includes(word))));
}

// True for a title that carries a blocked tag but passes the policy above.
function isTaggedAndAllowed(item) {
  return hasBlockedTag(item) && item?.attributes?.contentRating === "safe" && !hasSexualTag(item) && !ALWAYS_BLOCKED_IDS.has(String(item?.id || "").toLowerCase());
}

function isAllowedContent(item, allowAdult = false) {
  if (!allowedRatings(allowAdult).includes(item?.attributes?.contentRating)) return false;
  if (ALWAYS_BLOCKED_IDS.has(String(item?.id || "").toLowerCase())) return false;
  return !hasBlockedTag(item) || isTaggedAndAllowed(item);
}

// The normal search request excludes the blocked tags, so safe-rated tagged titles are asked for separately: safe only,
// first page of a text search, merged into the results. Best effort: a failure here never breaks a search.
async function taggedSafeMatches(query, allowAdult = false) {
  const text = String(query || "").trim();
  if (!text) return [];
  const params = [["limit", PAGE_SIZE], ["title", text], ["order[relevance]", "desc"], ["contentRating[]", "safe"], ["includedTagsMode", "OR"],
    ["includes[]", "cover_art"], ["includes[]", "author"], ["includes[]", "artist"]];
  for (const id of BLOCKED_TAG_IDS) params.push(["includedTags[]", id]);
  try {
    const payload = await fetchMangaDex("/manga", params);
    return (payload.data || []).filter(item => isAllowedContent(item, allowAdult) && isTaggedAndAllowed(item));
  } catch { return []; }
}

// Titles whose name contains every search word go first (the person is most likely looking for them), the rest after.
function withTagged(extra, items, query) {
  const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  const matches = item => {
    const attrs = item.attributes || {};
    const text = [pickText(attrs.title), ...allTitleTexts(attrs.altTitles)].join(" ").toLowerCase();
    return words.every(word => text.includes(word));
  };
  const seen = new Set(items.map(item => item.id));
  const fresh = extra.filter(item => !seen.has(item.id));
  return [...fresh.filter(matches), ...items, ...fresh.filter(item => !matches(item))];
}

function parsePage(value, max = MAX_SEARCH_PAGE) {
  const parsed = Number.parseInt(value || "1", 10);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(max, parsed)) : 1;
}

function validMangaId(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

async function fetchMangaDexOnce(url, cache) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "TokyoMangaLab/0.9 (catalogue metadata connector)"
      },
      signal: controller.signal,
      cf: cache ? { cacheTtl: 120, cacheEverything: true } : { cacheTtl: 0, cacheEverything: false }
    });
    if (!response.ok) {
      const err = new Error(`MangaDex returned HTTP ${response.status}.`);
      err.status = response.status;
      throw err;
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

// One quiet retry for a dropped connection or a gateway error (502/503/504). Anything else, including rate limits and
// "not found", is passed straight back so the app can show the right message.
async function fetchMangaDex(path, params = {}, { cache = true } = {}) {
  const url = new URL(API_BASE + path);
  for (const [key, value] of params) url.searchParams.append(key, String(value));
  try {
    return await fetchMangaDexOnce(url, cache);
  } catch (error) {
    const transient = error.status === undefined || error.status === 502 || error.status === 503 || error.status === 504;
    if (!transient) throw error;
    await new Promise(resolve => setTimeout(resolve, 350));
    return fetchMangaDexOnce(url, cache);
  }
}

function ratingParams(allowAdult) {
  const params = allowedRatings(allowAdult).map(rating => ["contentRating[]", rating]);
  for (const id of BLOCKED_TAG_IDS) params.push(["excludedTags[]", id]);
  params.push(["excludedTagsMode", "OR"]);
  return params;
}

// Genre ids, status and sort from the request. Anything that is not a plain tag id, a listed status or a listed sort is
// dropped, and the sexualised-minor tag ids can never be asked for, in any mode.
function searchFilters(url) {
  const genres = [...new Set(String(url.searchParams.get("genre") || "").split(",").map(id => id.trim().toLowerCase()).filter(validMangaId))]
    .filter(id => !BLOCKED_TAG_IDS.includes(id)).slice(0, MAX_GENRE_FILTERS);
  const status = String(url.searchParams.get("status") || "").toLowerCase();
  const sort = String(url.searchParams.get("sort") || "").toLowerCase();
  return { genres, status: STATUS_VALUES.includes(status) ? status : "", sort: Object.hasOwn(SORT_KEYS, sort) ? sort : "" };
}

function isFiltered(filters) {
  return Boolean(filters && (filters.genres?.length || filters.status));
}

function mangaSearchParams(query, page, allowAdult = false, filters = {}) {
  const params = [
    ["limit", PAGE_SIZE],
    ["offset", (page - 1) * PAGE_SIZE],
    ["includes[]", "cover_art"],
    ["includes[]", "author"],
    ["includes[]", "artist"],
    ...ratingParams(allowAdult)
  ];
  for (const id of filters.genres || []) params.push(["includedTags[]", id]);
  if (filters.genres?.length) params.push(["includedTagsMode", "AND"]);
  if (filters.status) params.push(["status[]", filters.status]);
  if (query) params.push(["title", query]);
  if (filters.sort) params.push([`order[${SORT_KEYS[filters.sort]}]`, "desc"]);
  else if (query) params.push(["order[relevance]", "desc"]);
  else params.push(["order[latestUploadedChapter]", "desc"]);
  return params;
}

async function doMangaSearch(query, page, allowAdult = false, filters = {}) {
  const payload = await fetchMangaDex("/manga", mangaSearchParams(query, page, allowAdult, filters));
  const extra = page === 1 && !isFiltered(filters) ? await taggedSafeMatches(query, allowAdult) : [];
  const items = withTagged(extra, (payload.data || []).filter(item => isAllowedContent(item, allowAdult)), query).map(normalizeManga);
  const total = Math.max(0, Number(payload.total) || items.length);
  return {
    items,
    pagination: {
      page,
      limit: PAGE_SIZE,
      total,
      hasNext: (page * PAGE_SIZE) < total
    }
  };
}

// ---- Genre list and Latest -------------------------------------------------------------------------------------------
// The genre list comes from MangaDex's own tag list. Blocked tags are never listed, and the tags about sexual content are
// listed only in the adult-gated case. Kept in memory for a few hours so it costs one upstream request per period.
let tagListCache = { at: 0, tags: null };

async function loadTagList() {
  if (tagListCache.tags && Date.now() - tagListCache.at < TAG_LIST_TTL_MS) return tagListCache.tags;
  const payload = await fetchMangaDex("/manga/tag", []);
  const tags = (payload.data || []).filter(tag => tag?.id && validMangaId(tag.id)).map(tag => ({
    id: String(tag.id).toLowerCase(),
    name: pickText(tag.attributes?.name),
    group: String(tag.attributes?.group || "other"),
    allNames: Object.values(tag.attributes?.name || {}).map(name => String(name).toLowerCase())
  })).filter(tag => tag.name);
  tagListCache = { at: Date.now(), tags };
  return tags;
}

function listableTags(tags, allowAdult) {
  return tags
    .filter(tag => !BLOCKED_TAG_IDS.includes(tag.id) && !tag.allNames.some(name => BLOCKED_TAG_NAMES.has(name.trim())))
    .filter(tag => allowAdult || !tag.allNames.some(name => SEXUAL_TAG_WORDS.some(word => name.includes(word))))
    .map(({ id, name, group }) => ({ id, name, group }))
    .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
}

async function handleV1Tags(url, origin) {
  try {
    const tags = listableTags(await loadTagList(), adultRequested(url, origin));
    return json({ data: tags, meta: { apiVersion: "1", requestId: requestId(), source: "mangadex" } }, 200, origin, { "Cache-Control": "public, max-age=3600" });
  } catch (error) {
    const status = error?.status === 429 ? 429 : 502;
    return apiError(status === 429 ? "RATE_LIMITED" : "UPSTREAM_UNAVAILABLE", status === 429 ? "MangaDex is rate-limiting requests. Please retry shortly." : "Could not load the genre list right now.", origin, status);
  }
}

// The newest English chapters, one entry per title. MangaDex lists chapters, not titles, so the newest window of chapters is
// read first and then the titles they belong to are loaded (with covers) and put through the same content policy as search.
async function doLatest(page, allowAdult = false) {
  const chapterParams = [["limit", LATEST_WINDOW], ["offset", (page - 1) * LATEST_WINDOW], ["order[publishAt]", "desc"],
    ["translatedLanguage[]", "en"], ["includeExternalUrl", "0"], ["includeEmptyPages", "0"],
    ...allowedRatings(allowAdult).map(rating => ["contentRating[]", rating])];
  const payload = await fetchMangaDex("/chapter", chapterParams);
  const newest = new Map();
  for (const chapter of payload.data || []) {
    const mangaId = getRelations(chapter).find(rel => rel.type === "manga")?.id;
    if (!mangaId || !validMangaId(mangaId) || newest.has(mangaId)) continue;
    const attrs = chapter.attributes || {};
    newest.set(mangaId, { number: attrs.chapter ? String(attrs.chapter).slice(0, 12) : null, publishedAt: attrs.publishAt || attrs.readableAt || null });
  }
  const ids = [...newest.keys()];
  const total = Math.max(0, Number(payload.total) || ids.length);
  const pagination = { page, limit: LATEST_WINDOW, total, hasNext: page * LATEST_WINDOW < total && page < MAX_SEARCH_PAGE };
  if (!ids.length) return { items: [], pagination };
  const titles = await fetchMangaDex("/manga", [["limit", ids.length], ...ids.map(id => ["ids[]", id]),
    ["includes[]", "cover_art"], ["includes[]", "author"], ["includes[]", "artist"], ...ratingParams(allowAdult)]);
  const byId = new Map((titles.data || []).filter(item => isAllowedContent(item, allowAdult)).map(item => [item.id, item]));
  const items = ids.filter(id => byId.has(id)).map(id => ({ ...normalizeManga(byId.get(id)), latestChapter: newest.get(id) }));
  return { items, pagination };
}

async function handleV1Latest(url, origin) {
  const page = parsePage(url.searchParams.get("page"), MAX_SEARCH_PAGE);
  try {
    const result = await doLatest(page, adultRequested(url, origin));
    return json({ data: result.items, pagination: result.pagination, meta: { apiVersion: "1", requestId: requestId(), source: "mangadex", cachedSeconds: 120 } }, 200, origin);
  } catch (error) {
    const status = error?.status === 429 ? 429 : 502;
    return apiError(status === 429 ? "RATE_LIMITED" : "UPSTREAM_UNAVAILABLE", status === 429 ? "MangaDex is rate-limiting requests. Please retry shortly." : "Could not reach MangaDex. Try again shortly.", origin, status);
  }
}

async function doMangaDetails(id, allowAdult = false) {
  const payload = await fetchMangaDex(`/manga/${encodeURIComponent(id)}`, [
    ["includes[]", "cover_art"], ["includes[]", "author"], ["includes[]", "artist"]
  ]);
  const item = payload.data;
  if (!item || item.id !== id) return { kind: "missing" };
  if (!isAllowedContent(item, allowAdult)) return { kind: "filtered" };
  return { kind: "ok", item: normalizeManga(item) };
}

function normalizeChapter(chapter, mangaId) {
  const attrs = chapter?.attributes || {};
  const relations = getRelations(chapter);
  const groups = relations.filter(rel => rel.type === "scanlation_group")
    .map(rel => rel.attributes?.name).filter(Boolean);
  const externalId = String(chapter?.id || "");
  return {
    sourceId: "mangadex",
    externalId,
    mangaExternalId: mangaId,
    chapterNumber: attrs.chapter === undefined || attrs.chapter === null ? null : String(attrs.chapter),
    volumeNumber: attrs.volume === undefined || attrs.volume === null ? null : String(attrs.volume),
    title: attrs.title || null,
    language: attrs.translatedLanguage || null,
    pages: Math.max(0, Number(attrs.pages) || 0),
    publishedAt: attrs.publishAt || attrs.readableAt || null,
    scanlationGroups: [...new Set(groups)],
    sourceUrl: externalId ? `https://mangadex.org/chapter/${encodeURIComponent(externalId)}` : null
  };
}

async function doChapterList(id, page, language, allowAdult = false, pageSize = PAGE_SIZE) {
  const title = await doMangaDetails(id, allowAdult);
  if (title.kind !== "ok") return title;
  const params = [
    ["limit", pageSize],
    ["offset", (page - 1) * pageSize],
    ["order[chapter]", "desc"],
    ...allowedRatings(allowAdult).map(rating => ["contentRating[]", rating]),
    ["includes[]", "scanlation_group"],
    // Chapters hosted on other sites (for example MangaPlus) and chapters with no pages cannot be read here.
    ["includeExternalUrl", "0"],
    ["includeEmptyPages", "0"]
  ];
  if (language !== "all") params.push(["translatedLanguage[]", language]);
  const payload = await fetchMangaDex(`/manga/${encodeURIComponent(id)}/feed`, params);
  const items = (payload.data || []).map(chapter => normalizeChapter(chapter, id));
  const total = Math.max(0, Number(payload.total) || items.length);
  return {
    kind: "ok",
    data: items,
    pagination: { page, limit: pageSize, total, hasNext: page * pageSize < total },
    manga: title.item
  };
}

async function handleLegacyManga(url, origin) {
  const allowAdult = adultRequested(url, origin);
  const title = (url.searchParams.get("q") || "").trim().slice(0, MAX_QUERY_LENGTH);
  const page = parsePage(url.searchParams.get("page"), MAX_SEARCH_PAGE);
  try {
    const filters = searchFilters(url);
    const payload = await fetchMangaDex("/manga", mangaSearchParams(title, page, allowAdult, filters));
    const extra = page === 1 && !isFiltered(filters) ? await taggedSafeMatches(title, allowAdult) : [];
    const data = withTagged(extra, (payload.data || []).filter(item => isAllowedContent(item, allowAdult)), title).map(item => {
      const normalized = normalizeManga(item);
      return {
        id: normalized.externalId,
        title: normalized.title,
        description: normalized.description,
        year: normalized.releaseYear,
        status: item.attributes?.status || "unknown",
        contentRating: normalized.contentRating,
        lastChapter: normalized.lastChapter,
        authors: [...normalized.authors, ...normalized.artists].filter(Boolean),
        tags: normalized.tags,
        coverUrl: normalized.coverUrl,
        mangaDexUrl: normalized.sourceUrl,
        anilistId: normalized.anilistId,
        malId: normalized.malId
      };
    });
    return json({
      source: "MangaDex",
      attribution: "Catalogue metadata provided by MangaDex. Cover art and source links remain the property of their respective owners.",
      page,
      limit: PAGE_SIZE,
      total: Math.max(0, Number(payload.total) || 0),
      data
    }, 200, origin);
  } catch (error) {
    const status = error?.status === 429 ? 429 : 502;
    return json({ error: status === 429 ? "MangaDex is rate-limiting requests. Please retry shortly." : "Could not reach MangaDex. Try again shortly." }, status, origin);
  }
}

async function handleV1Search(url, origin) {
  const type = (url.searchParams.get("type") || "manga").toLowerCase();
  if (type !== "manga") return apiError("UNSUPPORTED_CONTENT_TYPE", "Only manga search is available in this version.", origin, 400);
  const query = (url.searchParams.get("query") || "").trim().slice(0, MAX_QUERY_LENGTH);
  const page = parsePage(url.searchParams.get("page"), MAX_SEARCH_PAGE);
  try {
    const result = await doMangaSearch(query, page, adultRequested(url, origin), searchFilters(url));
    return json({
      data: result.items,
      pagination: result.pagination,
      meta: { apiVersion: "1", requestId: requestId(), source: "mangadex", cachedSeconds: 120 }
    }, 200, origin);
  } catch (error) {
    const status = error?.status === 429 ? 429 : 502;
    return apiError(status === 429 ? "RATE_LIMITED" : "UPSTREAM_UNAVAILABLE", status === 429 ? "MangaDex is rate-limiting requests. Please retry shortly." : "Could not reach MangaDex. Try again shortly.", origin, status);
  }
}

async function handleV1Details(id, origin, allowAdult = false) {
  if (!validMangaId(id)) return apiError("INVALID_MANGA_ID", "The manga ID is not a valid MangaDex UUID.", origin, 400);
  try {
    const result = await doMangaDetails(id, allowAdult);
    if (result.kind === "missing" || result.kind === "filtered") return apiError("TITLE_UNAVAILABLE", "This title is unavailable in the current catalogue mode.", origin, 404);
    return json({ data: result.item, meta: { apiVersion: "1", requestId: requestId(), source: "mangadex" } }, 200, origin);
  } catch (error) {
    const status = error?.status === 429 ? 429 : error?.status === 404 ? 404 : 502;
    const code = status === 429 ? "RATE_LIMITED" : status === 404 ? "TITLE_UNAVAILABLE" : "UPSTREAM_UNAVAILABLE";
    const message = status === 429 ? "MangaDex is rate-limiting requests. Please retry shortly." : status === 404 ? "This title was not found in the current catalogue." : "Could not load this title right now.";
    return apiError(code, message, origin, status);
  }
}

async function handleV1Chapters(id, url, origin) {
  if (!validMangaId(id)) return apiError("INVALID_MANGA_ID", "The manga ID is not a valid MangaDex UUID.", origin, 400);
  const page = parsePage(url.searchParams.get("page"), MAX_CHAPTER_PAGE);
  const language = (url.searchParams.get("language") || "en").toLowerCase();
  if (language !== "all" && !/^[a-z]{2,3}$/.test(language)) return apiError("INVALID_LANGUAGE", "Use a two- or three-letter language code, or 'all'.", origin, 400);
  const requestedSize = Number.parseInt(url.searchParams.get("limit") || "", 10);
  const pageSize = Number.isFinite(requestedSize) ? Math.max(1, Math.min(MAX_CHAPTER_PAGE_SIZE, requestedSize)) : PAGE_SIZE;
  try {
    const result = await doChapterList(id, page, language, adultRequested(url, origin), pageSize);
    if (result.kind === "missing" || result.kind === "filtered") return apiError("TITLE_UNAVAILABLE", "This title is unavailable in the current catalogue mode.", origin, 404);
    return json({ data: result.data, pagination: result.pagination, meta: { apiVersion: "1", requestId: requestId(), source: "mangadex", language } }, 200, origin);
  } catch (error) {
    const status = error?.status === 429 ? 429 : error?.status === 404 ? 404 : 502;
    const code = status === 429 ? "RATE_LIMITED" : status === 404 ? "TITLE_UNAVAILABLE" : "UPSTREAM_UNAVAILABLE";
    const message = status === 429 ? "MangaDex is rate-limiting requests. Please retry shortly." : status === 404 ? "This title was not found in the current catalogue." : "Could not load chapter metadata right now.";
    return apiError(code, message, origin, status);
  }
}

// ---- Chapter pages (MangaDex at-home) -------------------------------------------------
// Returns only what the reader needs to build image URLs. The Worker never fetches or relays image bytes,
// and the only upstream paths it can call are the two fixed ones below, so this is not a general proxy.
const PAGE_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,150}$/;
const CHAPTER_HASH = /^[A-Za-z0-9]{8,64}$/;

function usableBaseUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && !url.username && !url.password ? url.origin + url.pathname.replace(/\/$/, "") : null;
  } catch { return null; }
}

async function doChapterPages(id, allowAdult = false) {
  const meta = await fetchMangaDex(`/chapter/${encodeURIComponent(id)}`, [["includes[]", "manga"]], { cache: true });
  const chapter = meta.data;
  if (!chapter || chapter.id !== id) return { kind: "missing" };
  const parent = getRelations(chapter).find(rel => rel.type === "manga");
  // Fail closed: if the parent title's rating cannot be read, do not serve pages.
  if (!parent || !isAllowedContent(parent, allowAdult)) return { kind: "filtered" };
  if (chapter.attributes?.externalUrl) return { kind: "external" };
  const home = await fetchMangaDex(`/at-home/server/${encodeURIComponent(id)}`, [], { cache: false });
  const baseUrl = usableBaseUrl(home.baseUrl);
  const hash = home.chapter?.hash;
  const clean = list => (Array.isArray(list) ? list : []).filter(name => typeof name === "string" && PAGE_FILENAME.test(name));
  const data = clean(home.chapter?.data);
  const dataSaver = clean(home.chapter?.dataSaver);
  if (!baseUrl || typeof hash !== "string" || !CHAPTER_HASH.test(hash) || (!data.length && !dataSaver.length)) return { kind: "invalid" };
  return {
    kind: "ok",
    pages: {
      chapterId: id,
      mangaExternalId: parent.id,
      baseUrl,
      hash,
      data,
      dataSaver,
      issuedAt: new Date().toISOString(),
      validForSeconds: 900
    }
  };
}

async function handleV1Pages(id, origin, allowAdult = false) {
  if (!validMangaId(id)) return apiError("INVALID_CHAPTER_ID", "The chapter ID is not a valid MangaDex UUID.", origin, 400, { "Cache-Control": "no-store" });
  const noStore = { "Cache-Control": "no-store" };
  try {
    const result = await doChapterPages(id, allowAdult);
    if (result.kind === "missing") return apiError("CHAPTER_UNAVAILABLE", "This chapter was not found.", origin, 404, noStore);
    if (result.kind === "filtered") return apiError("CHAPTER_UNAVAILABLE", "This chapter is unavailable in the current catalogue mode.", origin, 404, noStore);
    if (result.kind === "external") return apiError("CHAPTER_EXTERNAL", "This chapter is hosted on another site. Open it from the source link.", origin, 422, noStore);
    if (result.kind === "invalid") return apiError("UPSTREAM_UNAVAILABLE", "MangaDex returned an unusable page list.", origin, 502, noStore);
    return json({ data: result.pages, meta: { apiVersion: "1", requestId: requestId(), source: "mangadex" } }, 200, origin, noStore);
  } catch (error) {
    const status = error?.status === 429 ? 429 : error?.status === 404 ? 404 : 502;
    const code = status === 429 ? "RATE_LIMITED" : status === 404 ? "CHAPTER_UNAVAILABLE" : "UPSTREAM_UNAVAILABLE";
    const message = status === 429 ? "MangaDex is rate-limiting requests. Please retry shortly." : status === 404 ? "This chapter was not found." : "Could not load chapter pages right now.";
    return apiError(code, message, origin, status, noStore);
  }
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      if (!isAllowedOrigin(origin)) return new Response("Origin not allowed", { status: 403 });
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (!isAllowedOrigin(origin)) return json({ error: "Origin not allowed." }, 403, origin);
    if (request.method !== "GET") return json({ error: "Only GET requests are supported." }, 405, origin, { Allow: "GET, OPTIONS" });

    if (url.pathname !== "/health") {
      const wait = retryAfterSeconds(request);
      if (wait) return apiError("RATE_LIMITED", "Too many requests. Please wait a moment and retry.", origin, 429, { "Retry-After": String(wait), "Cache-Control": "no-store" });
    }
    if (url.pathname === "/health") {
      return json({ ok: true, service: "Tokyo Manga Lab MangaDex catalogue proxy", contentRatings: SAFE_RATINGS, apiVersion: "1" }, 200, origin);
    }
    if (url.pathname === "/manga") return handleLegacyManga(url, origin);

    if (url.pathname === "/api/v1/sources") {
      return json({ data: [{
        id: "mangadex", label: "MangaDex", contentTypes: ["manga"],
        capabilities: { search: true, titleDetails: true, chapters: true, chapterContent: true, offlineDownloads: false }
      }], meta: { apiVersion: "1", requestId: requestId() } }, 200, origin);
    }
    if (url.pathname === "/api/v1/search") return handleV1Search(url, origin);
    if (url.pathname === "/api/v1/tags") return handleV1Tags(url, origin);
    if (url.pathname === "/api/v1/latest") return handleV1Latest(url, origin);

    const pagesMatch = url.pathname.match(/^\/api\/v1\/chapters\/([^/]+)\/pages$/);
    if (pagesMatch) {
      let id;
      try { id = decodeURIComponent(pagesMatch[1]); } catch { return apiError("INVALID_CHAPTER_ID", "The chapter ID is invalid.", origin, 400); }
      return handleV1Pages(id, origin, adultRequested(url, origin));
    }
    const chaptersMatch = url.pathname.match(/^\/api\/v1\/manga\/([^/]+)\/chapters$/);
    if (chaptersMatch) {
      let id;
      try { id = decodeURIComponent(chaptersMatch[1]); } catch { return apiError("INVALID_MANGA_ID", "The manga ID is invalid.", origin, 400); }
      return handleV1Chapters(id, url, origin);
    }
    const detailsMatch = url.pathname.match(/^\/api\/v1\/manga\/([^/]+)$/);
    if (detailsMatch) {
      let id;
      try { id = decodeURIComponent(detailsMatch[1]); } catch { return apiError("INVALID_MANGA_ID", "The manga ID is invalid.", origin, 400); }
      return handleV1Details(id, origin, adultRequested(url, origin));
    }
    if (url.pathname.startsWith("/api/v1/")) return apiError("NOT_FOUND", "API route not found.", origin, 404);
    return json({ error: "Not found. Use /health, /manga or the documented /api/v1 routes." }, 404, origin);
  }
};
