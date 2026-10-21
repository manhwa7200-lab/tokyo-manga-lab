import test from 'node:test';
import assert from 'node:assert/strict';
import { SETTINGS_CATEGORIES, allSettingKeys } from '../src/features/settings/settings-schema.js';
import { DEFAULT_SETTINGS, normalizeSettingValue } from '../src/features/settings/settings-service.js';
import { ICONS } from '../src/shared/icons.js';
import { FEATURES, featuresFor } from '../src/features/feature-registry.js';
import { PROFILE_GROUPS, plannedProfileRows } from '../src/features/profile/profile-sections.js';
import { parseRoute } from '../src/core/router.js';

const ITEM_TYPES = new Set(['toggle', 'select', 'action', 'link', 'info', 'planned']);

test('settings categories have unique ids, titles and valid icons', () => {
  const ids = SETTINGS_CATEGORIES.map(category => category.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const category of SETTINGS_CATEGORIES) {
    assert.ok(category.title && category.summary, `${category.id} needs a title and summary`);
    assert.ok(ICONS[category.icon], `${category.id} uses unknown icon ${category.icon}`);
    assert.ok(category.groups.length > 0, `${category.id} needs at least one sub-category`);
    const groupIds = category.groups.map(group => group.id);
    assert.equal(new Set(groupIds).size, groupIds.length, `${category.id} has duplicate sub-category ids`);
    for (const group of category.groups) {
      assert.ok(group.title && group.items.length > 0, `${category.id}/${group.id} needs a title and items`);
      for (const item of group.items) assert.ok(ITEM_TYPES.has(item.type), `${category.id}/${group.id}: unknown item type ${item.type}`);
    }
  }
});

test('every setting key in the schema has a default and every default is shown once', () => {
  const keys = allSettingKeys();
  assert.equal(new Set(keys).size, keys.length, 'a setting key appears twice in the schema');
  for (const key of keys) assert.ok(Object.hasOwn(DEFAULT_SETTINGS, key), `${key} is missing from DEFAULT_SETTINGS`);
  for (const key of Object.keys(DEFAULT_SETTINGS)) assert.ok(keys.includes(key), `${key} has no UI in the schema`);
});

test('select defaults are valid options and bad values are rejected', () => {
  for (const category of SETTINGS_CATEGORIES) for (const group of category.groups) for (const item of group.items) {
    if (item.type !== 'select') continue;
    assert.ok(item.options.some(([value]) => value === DEFAULT_SETTINGS[item.key]), `${item.key} default is not in its options`);
  }
  assert.throws(() => normalizeSettingValue('theme', 'neon'));
  assert.throws(() => normalizeSettingValue('notAKey', true));
  assert.equal(normalizeSettingValue('reducedMotion', 1), true);
  assert.equal(normalizeSettingValue('preferredLanguage', 'fr'), 'fr');
});

test('action items name an action and link items use https', () => {
  for (const category of SETTINGS_CATEGORIES) for (const group of category.groups) for (const item of group.items) {
    if (item.type === 'action') assert.ok(item.action && item.button);
    if (item.type === 'link') assert.match(item.href, /^https:\/\//);
    if (item.type === 'planned') assert.ok(item.id && item.title, 'planned items need id and title');
  }
});

test('feature registry and profile sections are consistent', () => {
  const ids = FEATURES.map(feature => feature.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const feature of FEATURES) assert.ok(ICONS[feature.icon], `${feature.id} icon`);
  assert.ok(featuresFor('profile').length > 0);
  assert.equal(plannedProfileRows().length, featuresFor('profile').length);
  for (const group of PROFILE_GROUPS) for (const row of group.rows) {
    assert.ok(ICONS[row.icon]);
    assert.match(row.href, /^#(library|downloads|settings)/);
  }
});

test('profile rows that point into settings use real categories', () => {
  const categoryIds = new Set(SETTINGS_CATEGORIES.map(category => category.id));
  for (const group of PROFILE_GROUPS) for (const row of group.rows) {
    const [, route, param] = row.href.match(/^#(\w+)\/?([\w-]*)/);
    if (route === 'settings' && param) assert.ok(categoryIds.has(param), `${row.id} points to missing category ${param}`);
  }
});

test('router parses sub-pages and rejects junk', () => {
  assert.deepEqual(parseRoute('#settings/appearance'), { route: 'settings', param: 'appearance' });
  assert.deepEqual(parseRoute('#library'), { route: 'library', param: '' });
  assert.deepEqual(parseRoute('#nope'), { route: 'home', param: '' });
  assert.deepEqual(parseRoute('#settings/<script>'), { route: 'settings', param: '' });
  assert.deepEqual(parseRoute(''), { route: 'home', param: '' });
});
