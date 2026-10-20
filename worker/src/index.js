const API_BASE = "https://api.mangadex.org";
const ALLOWED_ORIGIN = "https://tokyo720022-create.github.io";
const MAX_QUERY_LENGTH = 100;
const PAGE_SIZE = 24;
const MAX_PAGE = 20;

function corsHeaders(origin) {
  const headers = {
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
  if (origin === ALLOWED_ORIGIN) headers["Access-Control-Allow-Origin"] = ALLOWED_ORIGIN;
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

function pickText(value) {
  if (!value || typeof value !== "object") return "";
  return value.en || value["ja-ro"] || value.ja || Object.values(value)[0] || "";
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      if (origin && origin !== ALLOWED_ORIGIN) {
        return new Response("Origin not allowed", { status: 403 });
      }
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (origin && origin !== ALLOWED_ORIGIN) {
      return json({ error: "Origin not allowed." }, 403, origin);
    }

    if (request.method !== "GET") {
      return json({ error: "Only GET requests are supported." }, 405, origin, { Allow: "GET, OPTIONS" });
    }

    if (url.pathname === "/health") {
      return json({
        ok: true,
        service: "Tokyo Manga Lab MangaDex catalogue proxy",
        contentRatings: ["safe", "suggestive"]
      }, 200, origin);
    }

    if (url.pathname !== "/manga") {
      return json({ error: "Not found. Use /health or /manga?q=title&page=1." }, 404, origin);
    }

    const title = (url.searchParams.get("q") || "").trim().slice(0, MAX_QUERY_LENGTH);
    const page = Math.max(1, Math.min(MAX_PAGE, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1));
    const apiUrl = new URL(API_BASE + "/manga");
    apiUrl.searchParams.set("limit", String(PAGE_SIZE));
    apiUrl.searchParams.set("offset", String((page - 1) * PAGE_SIZE));
    for (const include of ["cover_art", "author", "artist"]) {
      apiUrl.searchParams.append("includes[]", include);
    }
    for (const rating of ["safe", "suggestive"]) {
      apiUrl.searchParams.append("contentRating[]", rating);
    }

    if (title) {
      apiUrl.searchParams.set("title", title);
      apiUrl.searchParams.set("order[relevance]", "desc");
    } else {
      apiUrl.searchParams.set("order[latestUploadedAt]", "desc");
    }

    try {
      const upstream = await fetch(apiUrl.toString(), {
        headers: {
          Accept: "application/json",
          "User-Agent": "TokyoMangaLab/0.1.0 (catalogue prototype)"
        },
        cf: { cacheTtl: 120, cacheEverything: true }
      });

      if (!upstream.ok) {
        return json({
          error: "MangaDex returned an error.",
          upstreamStatus: upstream.status
        }, upstream.status === 429 ? 429 : 502, origin);
      }

      const payload = await upstream.json();
      const data = (payload.data || []).map((item) => {
        const attrs = item.attributes || {};
        const rels = item.relationships || [];
        const coverRel = rels.find((rel) => rel.type === "cover_art");
        const coverFile = coverRel && coverRel.attributes && coverRel.attributes.fileName;
        const authors = rels
          .filter((rel) => rel.type === "author" || rel.type === "artist")
          .map((rel) => rel.attributes && rel.attributes.name)
          .filter(Boolean);
        const tags = (attrs.tags || [])
          .map((tag) => pickText(tag.attributes && tag.attributes.name))
          .filter(Boolean);

        return {
          id: item.id,
          title: pickText(attrs.title) || "Untitled manga",
          description: pickText(attrs.description),
          year: attrs.year || null,
          status: attrs.status || "unknown",
          contentRating: attrs.contentRating || "safe",
          authors: [...new Set(authors)],
          tags,
          coverUrl: coverFile
            ? `https://uploads.mangadex.org/covers/${encodeURIComponent(item.id)}/${encodeURIComponent(coverFile)}.256.jpg`
            : null,
          mangaDexUrl: `https://mangadex.org/title/${encodeURIComponent(item.id)}`
        };
      });

      return json({
        source: "MangaDex",
        attribution: "Catalogue metadata provided by MangaDex. Cover art and source links remain the property of their respective owners.",
        page,
        limit: PAGE_SIZE,
        total: payload.total || 0,
        data
      }, 200, origin);
    } catch (error) {
      return json({ error: "Could not reach MangaDex. Try again shortly." }, 502, origin);
    }
  }
};
