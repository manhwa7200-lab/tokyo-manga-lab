import test from 'node:test';
import assert from 'node:assert/strict';
import { coverVariants, retryUrl, safeCoverUrl } from '../src/shared/covers.js';

const MD = 'https://uploads.mangadex.org/covers/abc/def.jpg.256.jpg';

test('only https covers from MangaDex and AniList are allowed', () => {
  assert.equal(safeCoverUrl(MD), MD);
  assert.equal(safeCoverUrl('https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/x.jpg'), 'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/x.jpg');
  for (const bad of ['http://uploads.mangadex.org/x.jpg', 'https://evil.example/x.jpg', 'https://uploads.mangadex.org.evil.example/x.jpg', 'https://user:pw@uploads.mangadex.org/x.jpg', 'javascript:alert(1)', 'data:image/png;base64,AAAA', '', null, undefined, 'not a url']) {
    assert.equal(safeCoverUrl(bad), null, String(bad));
  }
});

test('MangaDex thumbnails get a 512 variant for sharp high-density screens', () => {
  const v = coverVariants(MD);
  assert.equal(v.src, MD);
  assert.equal(v.large, 'https://uploads.mangadex.org/covers/abc/def.jpg.512.jpg');
  assert.match(v.srcset, /256w, .*512w/);
});

test('other allowed covers have one size and no srcset', () => {
  const v = coverVariants('https://s4.anilist.co/x.jpg');
  assert.equal(v.large, v.src);
  assert.equal(v.srcset, '');
  assert.equal(coverVariants('https://evil.example/a.jpg'), null);
});

test('retry address differs from the original', () => {
  assert.notEqual(retryUrl(MD), MD);
  assert.match(retryUrl(MD), /tmlretry=1$/);
});
