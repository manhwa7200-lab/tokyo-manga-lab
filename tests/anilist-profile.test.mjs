import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanAbout, normalizeProfile, profileIsStale, PROFILE_STALE_MS } from '../src/features/anilist/anilist-profile.js';

const VIEWER = {
  id: 7, name: 'Kai', siteUrl: 'https://anilist.co/user/Kai', about: 'Hello <b>there</b>!',
  bannerImage: 'https://s4.anilist.co/file/anilistcdn/user/banner/b7.jpg',
  avatar: { large: 'https://s4.anilist.co/file/anilistcdn/user/avatar/large/a7.png', medium: 'https://s4.anilist.co/file/anilistcdn/user/avatar/medium/a7.png' },
  statistics: { anime: { count: 313, episodesWatched: 8305, meanScore: 96.52 }, manga: { count: 149, chaptersRead: 11148, volumesRead: 473, meanScore: 94.96 } }
};

test('profile is shaped for the screen', () => {
  const profile = normalizeProfile(VIEWER, { followers: 3, following: 7 }, 1000);
  assert.equal(profile.name, 'Kai');
  assert.equal(profile.bannerUrl, VIEWER.bannerImage);
  assert.equal(profile.avatarUrl, VIEWER.avatar.large);
  assert.deepEqual(profile.manga, { count: 149, chaptersRead: 11148, volumesRead: 473, meanScore: 94.96 });
  assert.equal(profile.anime.count, 313);
  assert.equal(profile.followers, 3);
  assert.equal(profile.following, 7);
  assert.equal(profile.about, 'Hello there!');
});

test('images from other hosts are dropped and missing counts become null or zero', () => {
  const profile = normalizeProfile({ ...VIEWER, bannerImage: 'https://evil.example/b.jpg', avatar: { large: 'http://s4.anilist.co/a.png' }, statistics: null, siteUrl: 'https://evil.example/' });
  assert.equal(profile.bannerUrl, null);
  assert.equal(profile.avatarUrl, null);
  assert.equal(profile.siteUrl, '');
  assert.equal(profile.followers, null);
  assert.equal(profile.manga.count, 0);
  assert.equal(normalizeProfile({}), null);
});

test('bio is turned into short plain text', () => {
  assert.equal(cleanAbout('img200(https://x.test/a.png) ~!spoiler!~ [link](https://x.test) text'), 'spoiler link text');
  assert.ok(cleanAbout('word '.repeat(200)).length <= 281);
  assert.equal(cleanAbout(null), '');
});

test('a profile goes stale after 15 minutes', () => {
  assert.equal(profileIsStale(null), true);
  assert.equal(profileIsStale({ fetchedAt: 1000 }, 1000 + PROFILE_STALE_MS - 1), false);
  assert.equal(profileIsStale({ fetchedAt: 1000 }, 1000 + PROFILE_STALE_MS + 1), true);
});
