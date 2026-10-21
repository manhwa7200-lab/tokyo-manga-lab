import { mangaDexAdapter } from './manga/mangadex-adapter.js';

const adapters = new Map([[mangaDexAdapter.id, mangaDexAdapter]]);

export const sourceRegistry = Object.freeze({
  get(sourceId) { return adapters.get(sourceId) || null; },
  list() { return [...adapters.values()].map(({ id, label, contentTypes, capabilities }) => ({ id, label, contentTypes: [...contentTypes], capabilities: { ...capabilities } })); },
  register(adapter) {
    if (!adapter || typeof adapter.id !== 'string' || !adapter.id || typeof adapter.search !== 'function') throw new TypeError('A source adapter needs an id and a search function.');
    if (adapters.has(adapter.id)) throw new Error(`Source adapter already registered: ${adapter.id}`);
    adapters.set(adapter.id, adapter);
  },
  async search(sourceId, query, page = 1, options = {}) {
    const adapter = adapters.get(sourceId);
    if (!adapter) throw new Error(`Unknown catalogue source: ${sourceId}`);
    return adapter.search(query, page, options);
  }
});
