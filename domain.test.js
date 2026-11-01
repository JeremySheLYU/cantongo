import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { emptyState, validateEntry, validatePhrase, validateState, makeBackup, parseBackup, daySummary, summarize, weeklySeries, findPhrases, replaceRecord, csvExport, isDate, shiftDate, weekStart, monthCells } from './domain.js';

const timestamp = '2026-10-31T18:00:00.000Z';
const entry = (overrides = {}) => validateEntry({ id: 'session-a', date: '2026-10-31', time: '14:00', type: 'practice', title: '', durationMinutes: 15, source: '', notes: '', createdAt: timestamp, updatedAt: timestamp, timezoneOffset: 240, ...overrides });
const phrase = (overrides = {}) => validatePhrase({ id: 'phrase-a', date: '2026-10-31', cantonese: '測試詞句', jyutping: 'test1', meaning: 'A test phrase', context: 'Notebook verification', favorite: false, createdAt: timestamp, updatedAt: timestamp, ...overrides });

test('CantonGo backup round trip retains uncategorized practice, Chinese text, favorites and pauses', () => {
  const state = emptyState(); state.entries.push(entry()); state.phrases.push(phrase({ favorite: true, context: '多語言\n"notes"' })); state.restDays['2026-10-31'] = { updatedAt: timestamp };
  assert.deepEqual(parseBackup(makeBackup(state)), state);
  assert.equal(state.entries[0].type, 'practice');
});
test('backups from other apps and unsupported schemas are rejected', () => {
  const backup = JSON.parse(makeBackup(emptyState()));
  for (const app of ['movelog','sipless',null]) assert.throws(() => parseBackup(JSON.stringify({ ...backup, app })), /CantonGo/);
  assert.throws(() => parseBackup(JSON.stringify({ ...backup, schemaVersion: 2 })), /version 1/);
  assert.throws(() => parseBackup('not JSON'), /valid JSON/);
});
test('corrupted records and duplicate phrase IDs cannot silently replace a journal', () => {
  const state = emptyState(); state.entries.push(entry()); state.phrases.push(phrase());
  assert.throws(() => validateState({ ...state, entries: [{ ...state.entries[0], durationMinutes: -1 }] }), /Duration/);
  assert.throws(() => validateState({ ...state, phrases: [phrase(), phrase()] }), /duplicate/);
  assert.throws(() => validateState({ ...state, phrases: [phrase(), { ...phrase({ id: 'two' }), favorite: 'yes' }] }), /invalid/);
  assert.throws(() => validateEntry({ ...entry(), date: '2026-02-30' }), /date/);
  assert.throws(() => validateEntry({ ...entry(), type: 'strength' }), /practice type/);
});
test('blank dates, explicit pauses and sessions remain distinct and can coexist', () => {
  const state = emptyState(); assert.equal(daySummary(state, '2026-10-31').status, 'unknown');
  state.restDays['2026-10-31'] = { updatedAt: timestamp }; assert.equal(daySummary(state, '2026-10-31').status, 'pause');
  state.entries.push(entry()); const summary = daySummary(state, '2026-10-31'); assert.equal(summary.status, 'recorded'); assert.equal(summary.rest, true);
  state.entries = []; assert.equal(daySummary(state, '2026-10-30').status, 'unknown');
});
test('missing durations stay missing; phrases do not invent practice sessions', () => {
  const state = emptyState(); state.entries.push(entry({ durationMinutes: null }), entry({ id: 'timed', durationMinutes: 10 })); state.phrases.push(phrase());
  const summary = summarize(state, '2026-10-26', '2026-11-01');
  assert.equal(summary.sessions, 2); assert.equal(summary.minutes, 10); assert.equal(summary.timedSessions, 1); assert.equal(summary.phrases, 1);
  state.entries = []; assert.equal(summarize(state, '2026-10-26', '2026-11-01').sessions, 0);
});
test('phrase searches cover Cantonese, Jyutping, meaning and context with favorites applied', () => {
  const phrases = [phrase({ favorite: true }), phrase({ id: 'second', cantonese: '另一句', jyutping: 'other2', meaning: 'Something else', context: 'A different source' })];
  assert.equal(findPhrases(phrases, '測試')[0].id, 'phrase-a');
  assert.equal(findPhrases(phrases, 'TEST1 NOTEBOOK')[0].id, 'phrase-a');
  assert.equal(findPhrases(phrases, 'something source')[0].id, 'second');
  assert.equal(findPhrases(phrases, '', true).length, 1);
  assert.equal(findPhrases(phrases, 'something', true).length, 0);
  assert.equal(findPhrases(phrases, 'ＳＯＭＥＴＨＩＮＧ').length, 1);
});
test('concurrent edits and deletions are detected rather than recreating or overwriting records', () => {
  const state = emptyState(); state.phrases.push(phrase());
  const changed = phrase({ meaning: 'Updated', updatedAt: '2026-10-31T18:00:01.000Z' });
  replaceRecord(state, 'phrases', 'phrase-a', timestamp, changed);
  assert.throws(() => replaceRecord(state, 'phrases', 'phrase-a', timestamp, phrase()), /another window/);
  assert.equal(state.phrases[0].meaning, 'Updated');
  replaceRecord(state, 'phrases', 'phrase-a', changed.updatedAt, null);
  assert.throws(() => replaceRecord(state, 'phrases', 'phrase-a', changed.updatedAt, changed), /another window/);
  assert.equal(state.phrases.length, 0);
});
test('optional weekly references start off and validate without imposing a target', () => {
  const state = emptyState(); assert.equal(state.settings.reference.enabled, false);
  assert.deepEqual(validateState(state), state);
  state.settings.reference.enabled = true; assert.throws(() => validateState(state), /reference/);
  state.settings.reference.minutes = 30; assert.equal(validateState(state).settings.reference.minutes, 30);
});
test('CSV quotes multilingual fields, escapes spreadsheet formulas and includes phrase and pause rows', () => {
  const state = emptyState(); state.entries.push(entry({ title: '=2+2', notes: 'line one\n"line two"' })); state.phrases.push(phrase({ cantonese: ' @SUM(A1)', meaning: '中文, English' })); state.restDays['2026-10-30'] = { updatedAt: timestamp };
  const csv = csvExport(state); assert.ok(csv.startsWith('\uFEFF')); assert.ok(csv.includes('"\'=2+2"')); assert.ok(csv.includes('"\' @SUM(A1)"')); assert.ok(csv.includes('"中文, English"')); assert.ok(csv.includes('"pause","","2026-10-30"')); assert.ok(csv.includes('"phrase","phrase-a"')); assert.ok(csv.includes('"line one\n""line two"""'));
});
test('calendar calculations cover leap years and Monday-based month grids', () => {
  assert.equal(isDate('2024-02-29'), true); assert.equal(isDate('2026-02-29'), false); assert.equal(isDate('2026-13-01'), false);
  assert.equal(shiftDate('2024-02-28', 1), '2024-02-29'); assert.equal(shiftDate('2026-12-31', 1), '2027-01-01');
  assert.equal(weekStart('2026-11-01'), '2026-10-26');
  const cells = monthCells(2026, 10); assert.equal(cells[0].date, '2026-10-26'); assert.equal(cells.filter(cell => cell.inMonth).length, 30);
});
test('calendar dates survive daylight saving changes in three timezones', () => {
  const code = `import {shiftDate,weekStart} from './domain.js'; console.log(JSON.stringify([shiftDate('2026-03-07',1),shiftDate('2026-11-01',1),weekStart('2026-11-01')]));`;
  for (const timezone of ['America/New_York','Asia/Hong_Kong','Pacific/Honolulu']) {
    const result = execFileSync(process.execPath, ['--input-type=module','-e',code], { cwd: new URL('.', import.meta.url), env: { ...process.env, TZ: timezone }, encoding: 'utf8' });
    assert.deepEqual(JSON.parse(result), ['2026-03-08','2026-11-02','2026-10-26']);
  }
});
test('weekly series uses calendar boundaries and includes missing-duration counts', () => {
  const state = emptyState(); state.entries.push(entry({ date: '2026-10-25' }), entry({ id: 'current', durationMinutes: null }));
  const weeks = weeklySeries(state, '2026-10-31', 2); assert.equal(weeks[0].start, '2026-10-19'); assert.equal(weeks[0].minutes, 15); assert.equal(weeks[1].start, '2026-10-26'); assert.equal(weeks[1].sessions, 1); assert.equal(weeks[1].timedSessions, 0);
});
