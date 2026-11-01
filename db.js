import { emptyState } from './domain.js';
const DB_NAME = 'cantongo-local-v1';
let db;
export async function openDB() {
  if (db) return db;
  db = await new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('journal');
    req.onsuccess = () => {
      req.result.onversionchange = () => { req.result.close(); db = null; };
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Close other CantonGo windows, then reload to open storage.'));
  });
  return db;
}
export async function readState() {
  const connection = await openDB();
  return new Promise((resolve, reject) => {
    const tx = connection.transaction('journal', 'readonly');
    const req = tx.objectStore('journal').get('state');
    let value;
    req.onsuccess = () => { value = req.result || emptyState(); };
    tx.oncomplete = () => resolve(value);
    tx.onabort = tx.onerror = () => reject(tx.error || new Error('Could not read local records.'));
  });
}
// Read, transform and write in one transaction. Concurrent tabs cannot overwrite
// one another with a stale copy of the entire journal.
export async function mutateState(transform) {
  const connection = await openDB();
  return new Promise((resolve, reject) => {
    const tx = connection.transaction('journal', 'readwrite');
    const store = tx.objectStore('journal');
    const req = store.get('state');
    let before, after, problem;
    req.onsuccess = () => {
      try {
        before = req.result || emptyState();
        after = transform(structuredClone(before));
        if (!after || typeof after !== 'object') throw new Error('The record could not be saved.');
        after.revision = before.revision + 1;
        store.put(after, 'state');
      } catch (error) { problem = error; tx.abort(); }
    };
    tx.oncomplete = () => resolve({ before, after });
    tx.onabort = tx.onerror = () => reject(problem || tx.error || new Error('Local storage could not save this change. Try exporting a backup or freeing some device space.'));
  });
}
