import { getRecord, putRecord } from '../../data/database.js';

export const DEFAULT_SETTINGS = Object.freeze({
  theme: 'sakura',
  adultContentEnabled: false,
  reducedMotion: false,
  defaultLibrarySort: 'recently-updated',
  preferredLanguage: 'en',
  enableOnlineSearch: true
});

export async function loadSettings() {
  const settings = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    const record = await getRecord('appSettings', key);
    if (record && Object.hasOwn(record, 'value')) settings[key] = record.value;
  }
  if (!['sakura', 'midnight'].includes(settings.theme)) settings.theme = DEFAULT_SETTINGS.theme;
  settings.adultContentEnabled = Boolean(settings.adultContentEnabled);
  return settings;
}

export async function saveSetting(key, value) {
  if (!Object.hasOwn(DEFAULT_SETTINGS, key)) throw new Error('Unknown setting.');
  if (key === 'theme' && !['sakura', 'midnight'].includes(value)) throw new Error('Unknown theme.');
  if (key === 'adultContentEnabled' || key === 'reducedMotion' || key === 'enableOnlineSearch') value = Boolean(value);
  const record = { key, value, updatedAt: new Date().toISOString() };
  await putRecord('appSettings', record);
  return record;
}
