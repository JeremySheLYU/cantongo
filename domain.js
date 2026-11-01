export const PRACTICE = { id: 'practice', name: 'Practice', hint: 'No category needed', icon: 'clock' };
export const TYPES = [
  { id: 'listening', name: 'Listening', hint: 'A podcast, a song, a little TV', icon: 'headphones' },
  { id: 'speaking', name: 'Speaking', hint: 'Say it out loud', icon: 'mic' },
  { id: 'reading', name: 'Reading', hint: 'Words you meet on the page', icon: 'book' },
  { id: 'writing', name: 'Writing', hint: 'A message, a line, a thought', icon: 'pen' },
  { id: 'conversation', name: 'Conversation', hint: 'A chat in everyday life', icon: 'chat' },
  { id: 'lesson', name: 'Lesson', hint: 'Learning with a little structure', icon: 'notebook' },
];
export const OTHER = { id: 'other', name: 'Other', hint: 'Your own way of learning', icon: 'spark' };
export const ALL_TYPES = [PRACTICE, ...TYPES, OTHER];
export const typeInfo = id => ALL_TYPES.find(t => t.id === id) || PRACTICE;
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export const localTime = (date = new Date()) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
export function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1900 || year > 2200) return false;
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}
export function dateObject(value) {
  if (!isDate(value)) throw new Error('Please choose a valid date.');
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}
export function shiftDate(value, days) { const date = dateObject(value); date.setDate(date.getDate() + days); return localDate(date); }
export function weekStart(value = localDate()) { return shiftDate(value, -((dateObject(value).getDay() + 6) % 7)); }
export function monthCells(year, month) {
  const first = new Date(year, month, 1, 12), offset = (first.getDay() + 6) % 7;
  const length = Math.ceil((offset + new Date(year, month + 1, 0, 12).getDate()) / 7) * 7;
  return Array.from({ length }, (_, i) => { const date = new Date(year, month, i - offset + 1, 12); return { date: localDate(date), day: date.getDate(), inMonth: date.getMonth() === month }; });
}
export function emptyState() {
  return { schemaVersion: 1, revision: 0, entries: [], phrases: [], restDays: {}, settings: { theme: 'system', reference: { enabled: false, sessions: null, minutes: null } } };
}
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function text(value, label, max, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Error(`${label} is missing or too long.`);
  return value;
}
function number(value, label, min, max, optional = true) {
  if (value === null && optional) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${label} must be a whole number from ${min} to ${max}.`);
  return value;
}
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error('A record has an invalid timestamp.');
  return value;
}
export function validateEntry(value) {
  if (!object(value) || !isDate(value.date)) throw new Error('A practice record has an invalid date.');
  if (value.time !== null && (typeof value.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time))) throw new Error('Please enter a valid time.');
  if (!ALL_TYPES.some(type => type.id === value.type)) throw new Error('Please choose a practice type.');
  return { id: text(value.id, 'Record ID', 100, true), date: value.date, time: value.time, type: value.type,
    title: text(value.title, 'Session title', 100), durationMinutes: number(value.durationMinutes, 'Duration', 1, 1440),
    source: text(value.source, 'Source or setting', 300), notes: text(value.notes, 'Notes', 3000),
    createdAt: timestamp(value.createdAt), updatedAt: timestamp(value.updatedAt), timezoneOffset: number(value.timezoneOffset, 'Timezone offset', -900, 900, false) };
}
export function validatePhrase(value) {
  if (!object(value) || !isDate(value.date) || typeof value.favorite !== 'boolean') throw new Error('A phrase record is invalid.');
  return { id: text(value.id, 'Phrase ID', 100, true), date: value.date, cantonese: text(value.cantonese, 'Cantonese text', 500, true),
    jyutping: text(value.jyutping, 'Jyutping', 500), meaning: text(value.meaning, 'Meaning', 1000), context: text(value.context, 'Context', 1000),
    favorite: value.favorite, createdAt: timestamp(value.createdAt), updatedAt: timestamp(value.updatedAt) };
}
export function validateState(value) {
  if (!object(value) || value.schemaVersion !== 1 || !Array.isArray(value.entries) || !Array.isArray(value.phrases) || !object(value.restDays) || value.entries.length > 50000 || value.phrases.length > 50000 || Object.keys(value.restDays).length > 50000) throw new Error('This is not a supported CantonGo backup.');
  const entries = value.entries.map(validateEntry), phrases = value.phrases.map(validatePhrase);
  if (new Set(entries.map(item => item.id)).size !== entries.length || new Set(phrases.map(item => item.id)).size !== phrases.length) throw new Error('This backup contains duplicate IDs.');
  const restDays = {};
  for (const [date, pause] of Object.entries(value.restDays)) {
    if (!isDate(date) || !object(pause)) throw new Error('A pause note has an invalid date.');
    restDays[date] = { updatedAt: timestamp(pause.updatedAt) };
  }
  const settings = value.settings;
  if (!object(settings) || !['system', 'light', 'dark'].includes(settings.theme) || !object(settings.reference) || typeof settings.reference.enabled !== 'boolean') throw new Error('Backup preferences are invalid.');
  const reference = { enabled: settings.reference.enabled, sessions: number(settings.reference.sessions, 'Weekly sessions', 1, 100), minutes: number(settings.reference.minutes, 'Weekly minutes', 1, 10080) };
  if (reference.enabled && reference.sessions === null && reference.minutes === null) throw new Error('Add a time or session reference, or leave it switched off.');
  return { schemaVersion: 1, revision: Number.isSafeInteger(value.revision) && value.revision >= 0 ? value.revision : 0, entries, phrases, restDays, settings: { theme: settings.theme, reference } };
}
export function makeBackup(state, now = new Date()) { return JSON.stringify({ app: 'cantongo', schemaVersion: 1, exportedAt: now.toISOString(), data: validateState(state) }, null, 2); }
export function parseBackup(content) {
  if (typeof content !== 'string' || content.length > 10 * 1024 * 1024) throw new Error('Choose a CantonGo JSON backup smaller than 10 MB.');
  let value; try { value = JSON.parse(content); } catch { throw new Error('This file is not valid JSON.'); }
  if (!object(value) || value.app !== 'cantongo' || value.schemaVersion !== 1) throw new Error('Choose a CantonGo backup (version 1).');
  return validateState(value.data);
}
export function daySummary(state, date) {
  const entries = state.entries.filter(entry => entry.date === date).sort((a, b) => (b.time || '').localeCompare(a.time || '') || b.createdAt.localeCompare(a.createdAt));
  return { entries, rest: Boolean(state.restDays[date]), status: entries.length ? 'recorded' : state.restDays[date] ? 'pause' : 'unknown' };
}
export function summarize(state, start, end) {
  const entries = state.entries.filter(entry => entry.date >= start && entry.date <= end);
  const restDates = Object.keys(state.restDays).filter(date => date >= start && date <= end);
  return { sessions: entries.length, minutes: entries.reduce((sum, entry) => sum + (entry.durationMinutes ?? 0), 0), timedSessions: entries.filter(entry => entry.durationMinutes !== null).length,
    phrases: state.phrases.filter(phrase => phrase.date >= start && phrase.date <= end).length, pauseDays: restDates.length,
    types: ALL_TYPES.map(type => ({ ...type, count: entries.filter(entry => entry.type === type.id).length })).filter(type => type.count) };
}
export function weeklySeries(state, today = localDate(), count = 8) { const start = weekStart(today); return Array.from({ length: count }, (_, i) => { const from = shiftDate(start, (i - count + 1) * 7); return { start: from, end: shiftDate(from, 6), ...summarize(state, from, shiftDate(from, 6)) }; }); }
export function formatMinutes(minutes) { return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`; }
export function findPhrases(phrases, query = '', favoritesOnly = false) {
  const normalize = value => value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
  const terms = normalize(query).split(' ').filter(Boolean);
  return phrases.filter(phrase => (!favoritesOnly || phrase.favorite) && terms.every(term => normalize([phrase.cantonese, phrase.jyutping, phrase.meaning, phrase.context].join(' ')).includes(term)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}
export function replaceRecord(current, collection, id, expectedUpdatedAt, replacement) {
  if (!['entries', 'phrases'].includes(collection)) throw new Error('Unknown record collection.');
  const index = current[collection].findIndex(item => item.id === id);
  if (index < 0 || current[collection][index].updatedAt !== expectedUpdatedAt) throw new Error('This record changed in another window. Close and reopen it to use the latest version.');
  if (replacement === null) current[collection].splice(index, 1); else current[collection][index] = replacement;
  return current;
}
export function csvExport(state) {
  const safe = value => { let result = value === null || value === undefined ? '' : String(value); if (/^[\s]*[=+\-@\t\r]/.test(result)) result = `'${result}`; return `"${result.replaceAll('"', '""')}"`; };
  const rows = [['record_type', 'id', 'date', 'time', 'practice_type', 'title', 'duration_minutes', 'source', 'notes', 'cantonese', 'jyutping', 'meaning', 'context', 'favorite']];
  for (const entry of [...state.entries].sort((a, b) => a.date.localeCompare(b.date))) rows.push(['practice', entry.id, entry.date, entry.time, entry.type, entry.title, entry.durationMinutes, entry.source, entry.notes, '', '', '', '', '']);
  for (const date of Object.keys(state.restDays).sort()) rows.push(['pause', '', date, '', '', '', '', '', '', '', '', '', '', '']);
  for (const phrase of findPhrases(state.phrases)) rows.push(['phrase', phrase.id, phrase.date, '', '', '', '', '', '', phrase.cantonese, phrase.jyutping, phrase.meaning, phrase.context, phrase.favorite]);
  return '\uFEFF' + rows.map(row => row.map(safe).join(',')).join('\r\n');
}
