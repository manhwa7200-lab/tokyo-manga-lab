// Download records. One `downloadJobs` row per chapter (the chapter id is the row id). The pages themselves are in
// the page store; this row says what was asked for, how far it got, and what the reader needs to open it offline.
import { deleteRecord, getAllRecords, putRecord } from '../../data/database.js';

export function createJobRepository() {
  return {
    all: () => getAllRecords('downloadJobs'),
    put: job => putRecord('downloadJobs', job),
    remove: id => deleteRecord('downloadJobs', id)
  };
}

// Same interface in memory, for unit tests.
export function createMemoryJobRepository(seed = []) {
  const map = new Map(seed.map(job => [job.id, { ...job }]));
  return {
    async all() { return [...map.values()].map(job => ({ ...job })); },
    async put(job) { map.set(job.id, { ...job }); },
    async remove(id) { map.delete(id); }
  };
}
