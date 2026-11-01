import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { emptyState, validateEntry, validatePhrase, makeBackup, parseBackup } from './domain.js';

let clientNumber = 0;
const loadClient = () => import(new URL(`./db.js?client=${clientNumber++}`, import.meta.url).href);
async function freshClient(t) { globalThis.indexedDB = new IDBFactory(); const client = await loadClient(); t.after(async () => (await client.openDB()).close()); return client; }
const timestamp = '2026-10-31T18:00:00.000Z';
const entry = id => validateEntry({ id, date: '2026-10-31', time: null, type: 'practice', title: '', durationMinutes: 10, source: '', notes: '', createdAt: timestamp, updatedAt: timestamp, timezoneOffset: 240 });
const phrase = id => validatePhrase({ id, date: '2026-10-31', cantonese: '測試記錄', jyutping: '', meaning: 'Test only', context: '', favorite: true, createdAt: timestamp, updatedAt: timestamp });

test('sessions, phrases and pauses survive closing and reopening the database', async t => {
  const first = await freshClient(t);
  await first.mutateState(state => { state.entries.push(entry('session')); state.phrases.push(phrase('phrase')); state.restDays['2026-10-31'] = { updatedAt: timestamp }; return state; });
  const expected = await first.readState(); (await first.openDB()).close();
  const reopened = await loadClient(); t.after(async () => (await reopened.openDB()).close());
  assert.deepEqual(await reopened.readState(), expected); assert.equal(expected.phrases[0].favorite, true);
});
test('CantonGo uses a separate IndexedDB database from MoveLog on the same origin', async t => {
  const client = await freshClient(t); const connection = await client.openDB(); assert.equal(connection.name, 'cantongo-local-v1');
  await new Promise((resolve, reject) => { const request = indexedDB.open('movelog-local-v1', 1); request.onupgradeneeded = () => request.result.createObjectStore('journal'); request.onsuccess = () => { const db = request.result, transaction = db.transaction('journal','readwrite'); transaction.objectStore('journal').put({ privateRecord: 'separate' }, 'state'); transaction.oncomplete = () => { db.close(); resolve(); }; transaction.onerror = reject; }; request.onerror = reject; });
  assert.deepEqual(await client.readState(), emptyState());
});
test('an exception or unstoreable value aborts the complete journal mutation', async t => {
  const client = await freshClient(t); await client.mutateState(state => { state.phrases.push(phrase('keep')); return state; }); const before = await client.readState();
  await assert.rejects(client.mutateState(state => { state.phrases = []; throw new Error('Interrupted'); }), /Interrupted/); assert.deepEqual(await client.readState(), before);
  await assert.rejects(client.mutateState(state => { state.phrases = []; state.invalid = () => {}; return state; })); assert.deepEqual(await client.readState(), before);
});
test('two concurrent clients preserve every session and phrase addition', async t => {
  const first = await freshClient(t), second = await loadClient(); t.after(async () => (await second.openDB()).close());
  await Promise.all(Array.from({ length: 16 }, (_, i) => (i % 2 ? first : second).mutateState(state => { if (i % 2) state.phrases.push(phrase(`phrase-${i}`)); else state.entries.push(entry(`session-${i}`)); return state; })));
  const saved = await first.readState(); assert.equal(saved.entries.length, 8); assert.equal(saved.phrases.length, 8); assert.equal(saved.revision, 16); assert.deepEqual(await second.readState(), saved);
});
test('atomic restore replaces all collections and rejects corruption without erasing saved words', async t => {
  const client = await freshClient(t); await client.mutateState(state => { state.entries.push(entry('original')); state.phrases.push(phrase('original')); return state; });
  const replacement = emptyState(); replacement.phrases.push(phrase('restored')); replacement.settings.theme = 'dark';
  const backup = makeBackup(replacement); await client.mutateState(() => parseBackup(backup)); const restored = await client.readState();
  assert.equal(restored.entries.length, 0); assert.equal(restored.phrases[0].id, 'restored'); assert.equal(restored.settings.theme, 'dark'); assert.equal(restored.revision, 2);
  const corrupt = JSON.parse(backup); corrupt.data.phrases[0].cantonese = ''; await assert.rejects(client.mutateState(() => parseBackup(JSON.stringify(corrupt))), /Cantonese/); assert.deepEqual(await client.readState(), restored);
});
