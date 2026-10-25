// The signed-in person's AniList profile (banner, avatar, name, counts), shaped for the Profile screen.
// Pure helpers only; the network call lives in anilist-client.js and the caching in anilist-sync.js.
import { safeCoverUrl } from '../../shared/covers.js';

export const PROFILE_STALE_MS = 15 * 60 * 1000;
export const ABOUT_MAX_CHARS = 280;

const count = value => (Number.isFinite(Number(value)) && Number(value) >= 0 ? Math.round(Number(value)) : 0);
const score = value => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};

// AniList "about" is markdown/HTML with image and spoiler syntax. The Profile shows plain, short text only.
export function cleanAbout(text, max = ABOUT_MAX_CHARS) {
  let out = String(text || '')
    .replace(/<br\s*\/?>|<\/(?:p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/(?:img|webm|youtube)\d*\([^)]*\)/gi, ' ')
    .replace(/~!|!~/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#*_`>~]+/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;|&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
  if (out.length > max) out = `${out.slice(0, max).replace(/\s+\S*$/, '')}…`;
  return out;
}

// Turns AniList's Viewer answer (plus optional follower counts) into the small record we keep on the account.
export function normalizeProfile(viewer, social = null, now = Date.now()) {
  if (!viewer?.id) return null;
  const manga = viewer.statistics?.manga || {};
  const anime = viewer.statistics?.anime || {};
  const followers = Number.isFinite(Number(social?.followers)) ? count(social.followers) : null;
  const following = Number.isFinite(Number(social?.following)) ? count(social.following) : null;
  return {
    id: viewer.id,
    name: String(viewer.name || ''),
    siteUrl: /^https:\/\/anilist\.co\//.test(viewer.siteUrl || '') ? viewer.siteUrl : '',
    avatarUrl: safeCoverUrl(viewer.avatar?.large || viewer.avatar?.medium),
    bannerUrl: safeCoverUrl(viewer.bannerImage),
    about: cleanAbout(viewer.about),
    manga: { count: count(manga.count), chaptersRead: count(manga.chaptersRead), volumesRead: count(manga.volumesRead), meanScore: score(manga.meanScore) },
    anime: { count: count(anime.count), episodesWatched: count(anime.episodesWatched), meanScore: score(anime.meanScore) },
    followers,
    following,
    fetchedAt: now
  };
}

export const profileIsStale = (profile, now = Date.now()) => !profile || !profile.fetchedAt || now - profile.fetchedAt > PROFILE_STALE_MS;
