export const ANILIST_API_URL = 'https://graphql.anilist.co';
export const ANILIST_AUTH_URL = 'https://anilist.co/api/v2/oauth/authorize';

// Register this exact redirect URL in your AniList developer settings.
export const ANILIST_REDIRECT_URI = 'tokyomangalab://anilist-auth';
export const ANILIST_REDIRECT_PROTOCOL = 'tokyomangalab:';
export const ANILIST_REDIRECT_HOST = 'anilist-auth';

// The app's own AniList client ID. It is public (not a secret). Its redirect URL on anilist.co must be exactly tokyomangalab://anilist-auth.
export const DEFAULT_ANILIST_CLIENT_ID = '44302';

export const AUTH_ATTEMPT_MAX_AGE_MS = 15 * 60 * 1000;
export const ANILIST_TOKEN_DEFAULT_TTL_SECONDS = 365 * 24 * 60 * 60; // AniList tokens last one year
export const LIST_CHUNK_SIZE = 500;
export const MAX_LIST_CHUNKS = 20;
export const MAX_PUSHES_PER_RUN = 60;
export const PUSH_SPACING_MS = 1200; // stays under AniList's 30-90 requests per minute limit
