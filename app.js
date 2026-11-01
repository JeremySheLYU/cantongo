import { PRACTICE, TYPES, OTHER, ALL_TYPES, typeInfo, localDate, localTime, dateObject, shiftDate, weekStart, monthCells, emptyState, validateEntry, validatePhrase, validateState, makeBackup, parseBackup, daySummary, summarize, weeklySeries, formatMinutes, findPhrases, replaceRecord, csvExport } from './domain.js';
import { readState, mutateState } from './db.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const paths = {
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18M8 15h1m6 0h1m-8 3h1"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
  headphones: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="12" width="4" height="8" rx="2"/><rect x="17" y="12" width="4" height="8" rx="2"/>',
  mic: '<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2m-7 9v3m-4 0h8"/>',
  book: '<path d="M12 5C8 2 4 3 2 4v15c3-1 7-1 10 1m0-15c4-3 8-2 10-1v15c-3-1-7-1-10 1V5Z"/>',
  pen: '<path d="m14 4 6 6M3 21l5-1L21 7a2.8 2.8 0 0 0-4-4L4 16l-1 5Z"/>',
  chat: '<path d="M21 11a9 9 0 0 1-9 9H4l-2 2V11a9 9 0 0 1 19 0Z"/><path d="M7 10h10M7 14h6"/>',
  notebook: '<rect x="5" y="3" width="15" height="19" rx="2"/><path d="M2 7h6M2 12h6M2 17h6m3-9h5m-5 5h5"/>',
  spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
  moon: '<path d="M20 14a8 8 0 0 1-10-10 8.5 8.5 0 1 0 10 10Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  left: '<path d="m15 6-6 6 6 6"/>', right: '<path d="m9 6 6 6-6 6"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>',
  edit: '<path d="m14 4 6 6M3 21l5-1L21 7a2.8 2.8 0 0 0-4-4L4 16l-1 5Z"/>',
  repeat: '<path d="m16 2 4 4-4 4M4 11V9a3 3 0 0 1 3-3h13M8 22l-4-4 4-4m12-1v2a3 3 0 0 1-3 3H4"/>',
  heart: '<path d="M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-4 5 1 10 8 15 7-5 12-10 8-15Z"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3"/>',
  cloudOff: '<path d="m3 3 18 18M5 8a5 5 0 0 0-1 10h11M9 5a7 7 0 0 1 11 7 3 3 0 0 1 1 5"/>',
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.spark}</svg>`;
const fmtDate = (date, options = { month: 'short', day: 'numeric' }) => new Intl.DateTimeFormat('en', options).format(dateObject(date));
const plural = (value, noun) => `${value} ${noun}${value === 1 ? '' : 's'}`;
const num = value => value === '' ? null : Number(value);
const stamp = () => new Date().toISOString();
let state = emptyState(), ready = false, view = 'today', selectedDate = localDate(), monthYear = dateObject(selectedDate).getFullYear(), monthIndex = dateObject(selectedDate).getMonth();
let chartMetric = 'sessions', phraseQuery = '', favoritesOnly = false, toastTimer, updateWorker, lastDay = localDate(), formSnapshot = '';
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('cantongo-journal') : null;
document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });

function applyTheme() { if (state.settings.theme === 'system') delete document.body.dataset.theme; else document.body.dataset.theme = state.settings.theme; }
function toast(message, action, handler, sticky = false) {
  clearTimeout(toastTimer);
  const el = $('#toast'); el.replaceChildren(); const copy = document.createElement('span'); copy.textContent = message; el.append(copy);
  if (action) { const button = document.createElement('button'); button.textContent = action; button.addEventListener('click', () => { el.hidden = true; handler?.(); }, { once: true }); el.append(button); }
  el.hidden = false; if (!sticky) toastTimer = setTimeout(() => { el.hidden = true; }, action ? 12000 : 6000);
}
async function commit(transform, message, undo = false) {
  if (!ready) { toast('Local storage is unavailable. Please reload before recording.'); return false; }
  try {
    const result = await mutateState(current => validateState(transform(current)));
    state = result.after; applyTheme(); render(); channel?.postMessage({ revision: state.revision });
    if (undo) toast(message, 'Undo', () => commit(current => { if (current.revision !== result.after.revision) throw new Error('Another change was saved. You can edit the record directly.'); return result.before; }, 'Change undone.'));
    else if (message) toast(message);
    return true;
  } catch (error) { toast(error.message || 'Could not save this change.'); return false; }
}
function entryCard(entry) {
  const type = typeInfo(entry.type);
  return `<article class="entry-card"><div class="entry-symbol">${icon(type.icon)}</div><div class="entry-content"><h3>${esc(entry.title || type.name)}</h3><div class="entry-meta">${[entry.time, type.name, entry.durationMinutes === null ? 'Time not entered' : formatMinutes(entry.durationMinutes)].filter(Boolean).map(esc).join(' · ')}</div>${entry.source ? `<p class="source">${esc(entry.source)}</p>` : ''}${entry.notes ? `<p class="notes">${esc(entry.notes)}</p>` : ''}</div><div class="entry-actions"><button class="icon-btn" data-a="repeat" data-id="${esc(entry.id)}" aria-label="Use ${esc(entry.title || type.name)} as a new session">${icon('repeat')}</button><button class="icon-btn" data-a="edit" data-id="${esc(entry.id)}" aria-label="Edit ${esc(entry.title || type.name)}">${icon('edit')}</button></div></article>`;
}
function phraseCard(phrase, compact = false) {
  return `<article class="phrase-card ${compact ? 'compact' : ''}"><div class="phrase-top"><span class="eyebrow">${fmtDate(phrase.date)}</span><div class="entry-actions"><button class="icon-btn ${phrase.favorite ? 'is-favorite' : ''}" data-a="favorite" data-id="${esc(phrase.id)}" aria-pressed="${phrase.favorite}" aria-label="${phrase.favorite ? 'Unfavorite' : 'Favorite'} ${esc(phrase.cantonese)}">${icon('heart')}</button><button class="icon-btn" data-a="edit-phrase" data-id="${esc(phrase.id)}" aria-label="Edit phrase ${esc(phrase.cantonese)}">${icon('edit')}</button></div></div><p class="cantonese" lang="yue-Hant">${esc(phrase.cantonese)}</p>${phrase.jyutping ? `<p class="jyutping">${esc(phrase.jyutping)}</p>` : ''}${phrase.meaning ? `<p class="meaning">${esc(phrase.meaning)}</p>` : ''}${phrase.context && !compact ? `<p class="phrase-context">${esc(phrase.context)}</p>` : ''}</article>`;
}
function dayCard(date) {
  const day = daySummary(state, date);
  return `<div class="entry-list">${day.entries.map(entryCard).join('')}</div>${!day.entries.length && !day.rest ? '<div class="empty-card"><span class="empty-symbol">'+icon('chat')+'</span><h3>A little space for your words.</h3><p>A few minutes, a conversation, a new expression.<br>Leave a record whenever it suits you.</p></div>' : ''}${day.rest ? `<div class="pause-card">${icon('moon')}<div><strong>A pause, noted.</strong><p>Practice and a pause can share a day.</p></div><button class="icon-btn" data-a="remove-pause" data-date="${date}" aria-label="Remove pause note">${icon('close')}</button></div>` : `<div class="pause-prompt"><span>Taking a quieter day?</span><button class="text-btn" data-a="pause" data-date="${date}">${icon('moon')}Note a pause</button></div>`}`;
}
function todayPage() {
  const today = localDate(), start = weekStart(today), summary = summarize(state, start, shiftDate(start, 6)), recent = [...state.entries].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 2);
  const phrases = findPhrases(state.phrases).slice(0, 2), reference = state.settings.reference;
  return `<section class="page-intro"><div><span class="eyebrow accent">SOME WORDS BECOME YOUR OWN.</span><h1>A little Cantonese,<br><em>at your pace.</em></h1><p>A place for what you practise.<br>And the words that stay with you.</p></div><span class="date-pill">${icon('calendar')}${fmtDate(today, { weekday: 'short', month: 'short', day: 'numeric' })}</span></section>
  <button class="quick-record" data-a="add"><span class="quick-symbol">${icon('clock')}</span><span><strong>Record practice</strong><span>Just add the time. No category needed.</span></span><span class="quick-arrow">${icon('arrow')}</span><span class="quick-art" aria-hidden="true">講</span></button>
  <section class="practice-section"><div class="section-heading"><h2>Leave a record</h2><span>Choose a starting point</span></div><div class="type-grid">${TYPES.map(type => `<button class="type-card" data-a="add" data-type="${type.id}"><span class="type-symbol">${icon(type.icon)}</span><strong>${type.name}</strong><span>${type.hint}</span></button>`).join('')}</div><button class="text-btn other-link" data-a="add" data-type="other">Another way of learning ${icon('arrow')}</button></section>
  <section class="week-overview" aria-label="This week's recorded practice"><div class="section-heading"><span class="eyebrow">THIS WEEK · ${fmtDate(start)} – ${fmtDate(shiftDate(start, 6))}</span><button class="text-btn" data-a="history">Look back ${icon('arrow')}</button></div><div class="week-stats"><div><strong>${summary.sessions}</strong><span>sessions recorded</span></div><div><strong>${summary.sessions && !summary.timedSessions ? '—' : summary.minutes}<small>min</small></strong><span>time recorded</span></div><div><strong>${summary.phrases}</strong><span>phrases collected</span></div></div><p class="quiet-copy">${summary.sessions ? `Only entered time is included.${summary.timedSessions < summary.sessions ? ` ${plural(summary.sessions - summary.timedSessions, 'session')} without a duration.` : ''}` : 'A view of your records, with no assumptions about empty days.'}</p>${reference.enabled ? `<p class="reference">Your optional weekly reference: ${[reference.sessions === null ? '' : plural(reference.sessions, 'session'), reference.minutes === null ? '' : `${reference.minutes} minutes`].filter(Boolean).join(' · ')}. <button class="text-btn" data-a="settings">Adjust or pause</button></p>` : ''}</section>
  <section class="journal-section"><div class="section-heading"><h2>Today's practice</h2><button class="text-btn" data-a="add">${icon('plus')}Add a session</button></div>${dayCard(today)}</section>
  <section class="journal-section"><div class="section-heading"><div><h2>Words to keep</h2><p>A phrase, an expression, a small discovery.</p></div><button class="text-btn" data-a="add-phrase">${icon('plus')}Add a phrase</button></div>${phrases.length ? `<div class="phrase-grid">${phrases.map(phrase => phraseCard(phrase, true)).join('')}</div><button class="text-btn section-link" data-a="phrases">Open your phrasebook ${icon('arrow')}</button>` : `<button class="phrase-invitation" data-a="add-phrase"><span class="phrase-invitation-symbol">${icon('book')}</span><span><strong>Something you'd like to say again?</strong><span>Keep the Cantonese, optional Jyutping, and what it means to you.</span></span><span>${icon('plus')}</span></button>`}</section>
  ${recent.length ? `<section class="journal-section"><div class="section-heading"><h2>Pick up where you left off</h2><span>Start a new session from an earlier one</span></div><div class="recent-grid">${recent.map(entry => `<button class="recent-card" data-a="repeat" data-id="${esc(entry.id)}">${icon(typeInfo(entry.type).icon)}<span><strong>${esc(entry.title || typeInfo(entry.type).name)}</strong><span>${fmtDate(entry.date)}${entry.durationMinutes === null ? '' : ` · ${formatMinutes(entry.durationMinutes)}`}</span></span>${icon('repeat')}</button>`).join('')}</div></section>` : ''}`;
}
function historyPage() {
  const today = localDate(), series = weeklySeries(state, today), max = Math.max(1, ...series.map(week => week[chartMetric]));
  const monthLabel = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(new Date(monthYear, monthIndex, 1, 12));
  const isCurrent = monthYear === dateObject(today).getFullYear() && monthIndex === dateObject(today).getMonth();
  return `<section class="page-intro compact"><div><span class="eyebrow accent">YOUR OWN RHYTHM</span><h1>A little look back.</h1><p>What you recorded. Nothing assumed.</p></div></section><section class="panel"><div class="section-heading"><div><h2>The last eight weeks</h2><p>Calendar weeks, starting Monday</p></div><div class="segmented" aria-label="Chart measure"><button data-a="metric" data-metric="sessions" aria-pressed="${chartMetric === 'sessions'}">Sessions</button><button data-a="metric" data-metric="minutes" aria-pressed="${chartMetric === 'minutes'}">Minutes</button></div></div><div class="week-chart">${series.map(week => `<div class="chart-column" aria-label="Week of ${fmtDate(week.start)}: ${week.sessions ? chartMetric === 'minutes' && !week.timedSessions ? 'duration not entered' : `${week[chartMetric]} ${chartMetric}${week.timedSessions < week.sessions ? ', some durations missing' : ''}` : 'no sessions recorded'}"><span class="chart-value">${week.sessions && (chartMetric === 'sessions' || week.timedSessions) ? week[chartMetric] : '—'}</span><div class="chart-track"><div class="chart-bar ${week.sessions ? '' : 'empty'}" style="height:${week[chartMetric] / max * 100}%"></div></div><span class="chart-label">${fmtDate(week.start)}</span></div>`).join('')}</div><p class="quiet-copy">A dash means no sessions or durations were entered. Minutes include entered durations only.</p></section>
  <section class="panel calendar-panel"><div class="section-heading"><h2>${monthLabel}</h2><div class="calendar-controls"><button class="text-btn" data-a="month-today">Today</button><button class="icon-btn" data-a="month-prev" aria-label="Previous month" ${monthYear === 1900 && monthIndex === 0 ? 'disabled' : ''}>${icon('left')}</button><button class="icon-btn" data-a="month-next" aria-label="Next month" ${isCurrent ? 'disabled' : ''}>${icon('right')}</button></div></div><div class="calendar-weekdays" aria-hidden="true">${['M','T','W','T','F','S','S'].map(day => `<span>${day}</span>`).join('')}</div><div class="calendar-grid">${monthCells(monthYear, monthIndex).map(cell => { const day = daySummary(state, cell.date); return `<button class="calendar-day ${cell.inMonth ? '' : 'outside'} ${cell.date === today ? 'is-today' : ''} ${cell.date === selectedDate ? 'selected' : ''}" data-a="day" data-date="${cell.date}" aria-pressed="${cell.date === selectedDate}" aria-label="${fmtDate(cell.date, { month: 'long', day: 'numeric' })}: ${day.entries.length ? plural(day.entries.length, 'session') : 'no practice record'}${day.rest ? ', pause noted' : ''}" ${cell.date > today ? 'disabled' : ''}>${cell.day}<span class="day-markers">${day.entries.length ? '<i class="practice-dot"></i>' : ''}${day.rest ? '<i class="pause-dot"></i>' : ''}</span></button>`; }).join('')}</div><div class="calendar-legend"><span><i class="practice-dot"></i>Practice recorded</span><span><i class="pause-dot"></i>Pause noted</span><span>Blank means no record</span></div></section>
  <section class="journal-section"><div class="section-heading"><h2>${fmtDate(selectedDate, { weekday: 'long', month: 'short', day: 'numeric' })}</h2><button class="text-btn" data-a="add" data-date="${selectedDate}">${icon('plus')}Add a session</button></div>${dayCard(selectedDate)}</section>`;
}
function phraseResults() {
  const phrases = findPhrases(state.phrases, phraseQuery, favoritesOnly);
  return `<p class="results-count" role="status">${plural(phrases.length, 'phrase')}${phraseQuery || favoritesOnly ? ' found' : ' in your collection'}</p>${phrases.length ? `<div class="phrase-grid">${phrases.map(phrase => phraseCard(phrase)).join('')}</div>` : `<div class="empty-card"><span class="empty-symbol">${icon('book')}</span><h3>${state.phrases.length ? 'A little room to search.' : 'Words worth coming back to.'}</h3><p>${state.phrases.length ? 'Try another word, meaning, or Jyutping spelling.' : 'Keep a phrase from a conversation, a lesson, or a show.<br>It does not need to be perfect.'}</p>${!state.phrases.length ? '<button class="btn" data-a="add-phrase">Add your first phrase</button>' : ''}</div>`}`;
}
function phrasesPage() {
  return `<section class="page-intro compact"><div><span class="eyebrow accent">YOUR POCKET PHRASEBOOK</span><h1>Words that stay.</h1><p>A little collection, in your own words.</p></div><button class="btn primary" data-a="add-phrase">${icon('plus')}Add a phrase</button></section><div class="phrase-toolbar"><label class="search-field">${icon('search')}<input id="phrase-search" type="search" placeholder="Search Cantonese, Jyutping, or meaning" aria-label="Search phrases" value="${esc(phraseQuery)}"></label><button class="filter-btn" data-a="filter-favorites" aria-pressed="${favoritesOnly}">${icon('heart')}Favorites</button></div><div id="phrase-results">${phraseResults()}</div><p class="phrasebook-note">Your notebook, rather than an answer key. Jyutping and meanings are the ones you enter.</p>`;
}
function settingsPage() {
  const settings = state.settings;
  return `<section class="page-intro compact"><div><span class="eyebrow accent">MAKE A LITTLE ROOM</span><h1>Just how you like it.</h1><p>Your journal. Your preferences.</p></div></section><section class="panel"><h2>A quiet approach</h2><p class="panel-copy">CantonGo records practice without streaks, ranks, or missed-day warnings. A blank day stays unknown. A pause is something you choose to note.</p><p class="panel-copy">This is a practice journal and personal phrasebook. It does not automatically assess your pronunciation or generate Jyutping.</p></section><section class="panel"><h2>Preferences</h2><form id="preferences-form"><div class="form-error" id="preferences-error" role="alert" hidden></div><label class="field"><span>Appearance</span><select name="theme">${['system','light','dark'].map(theme => `<option value="${theme}" ${settings.theme === theme ? 'selected' : ''}>${theme[0].toUpperCase() + theme.slice(1)}</option>`).join('')}</select></label><label class="check-row"><input type="checkbox" name="referenceEnabled" ${settings.reference.enabled ? 'checked' : ''}><span>Show an optional weekly reference<small>A personal reference, with no scores or automatic increases.</small></span></label><fieldset class="reference-fields" ${settings.reference.enabled ? '' : 'disabled'}><div class="field-row"><label class="field"><span>Sessions per week</span><input type="number" min="1" max="100" step="1" name="referenceSessions" value="${settings.reference.sessions ?? ''}" placeholder="Optional"></label><label class="field"><span>Minutes per week</span><input type="number" min="1" max="10080" step="1" name="referenceMinutes" value="${settings.reference.minutes ?? ''}" placeholder="Optional"></label></div></fieldset><button type="submit" class="btn primary">Save preferences</button></form></section><section class="panel"><h2>Your records stay with you</h2><p class="panel-copy">Sessions, phrases, and preferences are stored in this browser. There is no cloud sync, remote AI service, or app analytics. Local records and exported files are not encrypted by CantonGo.</p><p class="panel-copy">Changing devices, browsers, or websites does not transfer your journal. Save a JSON backup before clearing browser data.</p><div class="data-summary"><span>${plural(state.entries.length, 'session')}</span><span>${plural(state.phrases.length, 'phrase')}</span><span>${plural(Object.keys(state.restDays).length, 'pause note')}</span></div><div class="button-row"><button class="btn primary" data-a="backup">Export JSON backup</button><button class="btn" data-a="restore">Restore backup</button><button class="btn" data-a="csv">Export CSV</button></div><p class="quiet-copy">JSON restores the whole journal. CSV is for reading or analysis.</p></section><section class="panel"><h2>A place on your Home Screen</h2><p class="panel-copy" id="offline-status">Checking offline access…</p><div class="button-row"><button class="btn" data-a="install">iPhone installation</button>${updateWorker ? '<button class="btn primary" data-a="update">Apply available update</button>' : ''}</div><p id="persistence-status" class="quiet-copy">Browser storage can be cleared. Separate backups help keep your journal safe.</p><button class="text-btn" data-a="persist">Ask this browser to retain local storage</button></section><section class="panel danger-zone"><h2>Clear this journal</h2><p class="panel-copy">Remove local sessions, phrases, and pause notes. Your preferences stay saved.</p><button class="btn danger" data-a="clear">Clear local records</button></section>`;
}
function render() {
  document.querySelectorAll('[data-view]').forEach(button => { const active = button.dataset.view === view; button.classList.toggle('active', active); if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); });
  $('#view-label').textContent = { today: 'YOUR CANTONESE JOURNAL', history: 'A RECORD OF YOUR PRACTICE', phrases: 'A LITTLE COLLECTION OF WORDS', settings: 'YOUR SPACE, YOUR PACE' }[view];
  $('#main').innerHTML = { today: todayPage, history: historyPage, phrases: phrasesPage, settings: settingsPage }[view]();
  updateConnection(); if (view === 'settings') updateStorageInfo();
}
function navigate(next) {
  view = ['today','history','phrases','settings'].includes(next) ? next : 'today';
  history.replaceState(null, '', `#${view}`); render(); window.scrollTo({ top: 0, behavior: 'instant' }); $('#main').focus({ preventScroll: true });
}
function field(label, name, value = '', extra = '', type = 'text') { return `<label class="field"><span>${label}</span><input type="${type}" name="${name}" value="${esc(value ?? '')}" ${extra}></label>`; }
function formDataSnapshot() { const form = $('#entry-dialog form'); return form ? JSON.stringify([...new FormData(form).entries()]) : ''; }
function closeEntry() {
  if (formDataSnapshot() !== formSnapshot) confirmAction({ title: 'Leave these edits?', body: '<p>Your changes in this form have not been saved.</p>', label: 'Discard edits', cancel: 'Keep editing', task: () => { $('#entry-dialog').close(); return true; } });
  else $('#entry-dialog').close();
}
function openEntry(type = PRACTICE.id, date = localDate(), original = null, repeat = false) {
  const editing = Boolean(original && !repeat), quick = type === PRACTICE.id;
  const entry = original ? { ...original, date: repeat ? localDate() : original.date, time: repeat ? localTime() : original.time } : { type, date, time: localTime(), durationMinutes: null, title: '', source: '', notes: '' };
  const dialog = $('#entry-dialog');
  const details = `<div class="field-row">${field('Date', 'date', entry.date, `required min="1900-01-01" max="${localDate()}"`, 'date')}${field('Time · optional', 'time', entry.time, '', 'time')}</div><label class="field"><span>Practice type</span><select name="type">${ALL_TYPES.map(item => `<option value="${item.id}" ${entry.type === item.id ? 'selected' : ''}>${item.name}${item.id === 'practice' ? ' · no category' : ''}</option>`).join('')}</select></label>${field('What did you practise? · optional', 'title', entry.title, 'maxlength="100" placeholder="Give this little session a name"')}${field('Source or setting · optional', 'source', entry.source, 'maxlength="300" placeholder="A show, a lesson, a chat over lunch…"')}<label class="field"><span>Anything to remember? · optional</span><textarea name="notes" rows="3" maxlength="3000" placeholder="A small discovery, or how it felt">${esc(entry.notes)}</textarea></label>`;
  dialog.innerHTML = `<div class="sheet-head"><div><span class="eyebrow accent">A LITTLE PRACTICE, NOTED.</span><h2 id="entry-heading">${editing ? 'Edit practice' : repeat ? 'Use this as a starting point' : quick ? 'Record practice' : `Record ${typeInfo(type).name.toLowerCase()}`}</h2><p>${repeat ? 'Review these copied details before saving a new session.' : quick ? 'Just the time. Add details if you like.' : 'Keep as much or as little detail as you like.'}</p></div><button class="icon-btn" data-a="close-entry" aria-label="Close record form">${icon('close')}</button></div><form id="practice-form"><div class="form-error" id="entry-error" role="alert" hidden></div><label class="field duration-field"><span>How long did you practise?${quick ? '' : ' · optional'}</span><span class="duration-input"><input type="number" name="duration" inputmode="numeric" min="1" max="1440" step="1" value="${entry.durationMinutes ?? ''}" ${quick ? 'required' : ''} placeholder="15" autofocus><span>min</span></span></label><div class="quick-choices" aria-label="Quick duration choices">${[5,10,15,30].map(minutes => `<button type="button" data-a="quick-duration" data-minutes="${minutes}" aria-pressed="${entry.durationMinutes === minutes}">${minutes} min</button>`).join('')}</div>${quick ? `<details class="optional-details"><summary>Add details <span>optional</span></summary><div>${details}</div></details>` : details}<div class="form-actions">${editing ? `<button type="button" class="text-btn danger-text" data-a="delete-entry" data-id="${esc(original.id)}" data-stamp="${esc(original.updatedAt)}">Remove session</button>` : '<span></span>'}<div><button type="button" class="btn" data-a="close-entry">Cancel</button><button type="submit" class="btn primary">Save record</button></div></div></form>`;
  dialog.showModal(); formSnapshot = formDataSnapshot();
  $('#practice-form').addEventListener('submit', async event => {
    event.preventDefault(); const form = event.target, fields = form.elements, error = $('#entry-error'); error.hidden = true;
    try {
      if (fields.date.value > localDate()) throw new Error('Please choose today or an earlier date.');
      const now = stamp(), saved = validateEntry({ id: editing ? original.id : crypto.randomUUID(), date: fields.date.value, time: fields.time.value || null, type: fields.type.value, title: fields.title.value.trim(), source: fields.source.value.trim(), notes: fields.notes.value.trim(), durationMinutes: num(fields.duration.value), createdAt: editing ? original.createdAt : now, updatedAt: now, timezoneOffset: editing ? original.timezoneOffset : new Date().getTimezoneOffset() });
      const submit = form.querySelector('[type=submit]'); submit.disabled = true;
      const ok = await commit(current => { if (editing) return replaceRecord(current, 'entries', original.id, original.updatedAt, saved); current.entries.push(saved); return current; }, editing ? 'Practice updated.' : 'Practice recorded.', true);
      if (ok) dialog.close(); else submit.disabled = false;
    } catch (problem) { error.textContent = problem.message; error.hidden = false; }
  });
}
function openPhrase(original = null) {
  const dialog = $('#entry-dialog'), phrase = original || { cantonese: '', jyutping: '', meaning: '', context: '', date: localDate(), favorite: false };
  dialog.innerHTML = `<div class="sheet-head"><div><span class="eyebrow accent">SOMETHING TO COME BACK TO.</span><h2 id="entry-heading">${original ? 'Edit your phrase' : 'Keep a little Cantonese'}</h2><p>Your own words. Your own reasons to remember.</p></div><button class="icon-btn" data-a="close-entry" aria-label="Close phrase form">${icon('close')}</button></div><form id="phrase-form"><div class="form-error" id="entry-error" role="alert" hidden></div><label class="field"><span>Cantonese word or phrase</span><textarea name="cantonese" lang="yue-Hant" rows="2" maxlength="500" required autofocus placeholder="A word or sentence you want to keep">${esc(phrase.cantonese)}</textarea></label>${field('Jyutping · optional', 'jyutping', phrase.jyutping, 'maxlength="500" autocapitalize="off" spellcheck="false" placeholder="Add the spelling you learned"')}<label class="field"><span>Meaning · optional</span><textarea name="meaning" rows="2" maxlength="1000" placeholder="In any language that helps you">${esc(phrase.meaning)}</textarea></label><label class="field"><span>Where did you meet it? · optional</span><textarea name="context" rows="2" maxlength="1000" placeholder="A conversation, a show, or a situation to try it in">${esc(phrase.context)}</textarea></label>${field('Date collected', 'date', phrase.date, `required min="1900-01-01" max="${localDate()}"`, 'date')}<label class="check-row"><input name="favorite" type="checkbox" ${phrase.favorite ? 'checked' : ''}><span>Keep this in favorites</span></label><div class="form-actions">${original ? `<button type="button" class="text-btn danger-text" data-a="delete-phrase" data-id="${esc(original.id)}" data-stamp="${esc(original.updatedAt)}">Remove phrase</button>` : '<span></span>'}<div><button type="button" class="btn" data-a="close-entry">Cancel</button><button type="submit" class="btn primary">Save phrase</button></div></div></form>`;
  dialog.showModal(); formSnapshot = formDataSnapshot();
  $('#phrase-form').addEventListener('submit', async event => {
    event.preventDefault(); const form = event.target, fields = form.elements, error = $('#entry-error'); error.hidden = true;
    try {
      if (fields.date.value > localDate()) throw new Error('Please choose today or an earlier date.');
      const now = stamp(), saved = validatePhrase({ id: original?.id || crypto.randomUUID(), date: fields.date.value, cantonese: fields.cantonese.value.trim(), jyutping: fields.jyutping.value.trim(), meaning: fields.meaning.value.trim(), context: fields.context.value.trim(), favorite: fields.favorite.checked, createdAt: original?.createdAt || now, updatedAt: now });
      const submit = form.querySelector('[type=submit]'); submit.disabled = true;
      const ok = await commit(current => { if (original) return replaceRecord(current, 'phrases', original.id, original.updatedAt, saved); current.phrases.push(saved); return current; }, original ? 'Phrase updated.' : 'Phrase kept.', true);
      if (ok) dialog.close(); else submit.disabled = false;
    } catch (problem) { error.textContent = problem.message; error.hidden = false; }
  });
}
function confirmAction({ title, body, label, task, typed, cancel = 'Cancel', danger = false }) {
  const dialog = $('#confirm-dialog'); if (dialog.open) dialog.close();
  dialog.innerHTML = `<div class="confirm-head"><h2 id="confirm-heading">${esc(title)}</h2><button class="icon-btn" data-a="close-confirm" aria-label="Close confirmation">${icon('close')}</button></div><div class="confirm-copy">${body}${typed ? `<label class="field"><span>Type ${esc(typed)} to continue</span><input id="confirm-typed" autocomplete="off" autocapitalize="characters"></label>` : ''}</div><div class="confirm-actions"><button class="btn" data-a="close-confirm">${esc(cancel)}</button><button class="btn ${danger ? 'danger' : 'primary'}" id="confirm-submit" ${typed ? 'disabled' : ''}>${esc(label)}</button></div>`;
  const submit = $('#confirm-submit'); if (typed) $('#confirm-typed').addEventListener('input', event => { submit.disabled = event.target.value !== typed; });
  submit.addEventListener('click', async () => { submit.disabled = true; try { if (await task() !== false) dialog.close(); else submit.disabled = false; } catch (error) { toast(error.message); submit.disabled = false; } });
  dialog.showModal();
}
function download(content, mime, filename) { const url = URL.createObjectURL(new Blob([content], { type: mime })), link = document.createElement('a'); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
function updateConnection() { $('#connection').innerHTML = navigator.onLine ? `${icon('lock')}Local journal` : `${icon('cloudOff')}Offline · saved here`; }
async function updateStorageInfo() {
  const el = $('#offline-status'); if (!el) return;
  try { const registration = await navigator.serviceWorker?.getRegistration(new URL('./sw.js', location.href)); if (el.isConnected) el.textContent = registration?.active ? 'The app shell is saved for offline use in this browser.' : 'Keep this page online briefly, then reload to prepare offline access.'; }
  catch { if (el.isConnected) el.textContent = 'Offline access could not be checked here. Your records still save locally.'; }
  try { if (await navigator.storage?.persisted?.()) { const notice = $('#persistence-status'); if (notice) notice.textContent = 'This browser has granted persistent storage. Keep a separate backup for device changes or deliberate data clearing.'; } } catch { /* Storage retention is optional. */ }
}
document.addEventListener('click', async event => {
  const nav = event.target.closest('[data-view]'); if (nav && ready) { navigate(nav.dataset.view); return; }
  const button = event.target.closest('[data-a]'); if (!button || button.disabled || !ready) return;
  const action = button.dataset.a, date = button.dataset.date || localDate();
  if (action === 'add') openEntry(button.dataset.type || PRACTICE.id, date);
  else if (action === 'edit' || action === 'repeat') { const entry = state.entries.find(entry => entry.id === button.dataset.id); if (entry) openEntry(entry.type, entry.date, entry, action === 'repeat'); }
  else if (action === 'add-phrase' || action === 'edit-phrase') { const phrase = action === 'edit-phrase' ? state.phrases.find(phrase => phrase.id === button.dataset.id) : null; if (action === 'add-phrase' || phrase) openPhrase(phrase); }
  else if (action === 'close-entry') closeEntry();
  else if (action === 'close-confirm') $('#confirm-dialog').close();
  else if (action === 'close-info') $('#info-dialog').close();
  else if (['history','phrases','settings'].includes(action)) navigate(action);
  else if (action === 'quick-duration') { const input = $('#practice-form').elements.duration; input.value = button.dataset.minutes; input.dispatchEvent(new Event('input', { bubbles: true })); input.focus({ preventScroll: true }); }
  else if (action === 'pause') { if (date <= localDate()) commit(current => { current.restDays[date] = { updatedAt: stamp() }; return current; }, 'Pause noted.', true); }
  else if (action === 'remove-pause') commit(current => { delete current.restDays[date]; return current; }, 'Pause note removed.', true);
  else if (action === 'favorite') commit(current => { const phrase = current.phrases.find(phrase => phrase.id === button.dataset.id); if (!phrase) throw new Error('This phrase was removed in another window.'); phrase.favorite = !phrase.favorite; phrase.updatedAt = stamp(); return current; }, 'Favorites updated.');
  else if (action === 'filter-favorites') { favoritesOnly = !favoritesOnly; button.setAttribute('aria-pressed', String(favoritesOnly)); $('#phrase-results').innerHTML = phraseResults(); }
  else if (action === 'delete-entry' || action === 'delete-phrase') { const collection = action === 'delete-entry' ? 'entries' : 'phrases', noun = collection === 'entries' ? 'session' : 'phrase'; confirmAction({ title: `Remove this ${noun}?`, body: '<p>You can undo this briefly after removing it.</p>', label: `Remove ${noun}`, danger: true, task: async () => { const ok = await commit(current => replaceRecord(current, collection, button.dataset.id, button.dataset.stamp, null), `${noun[0].toUpperCase() + noun.slice(1)} removed.`, true); if (ok) $('#entry-dialog').close(); return ok; } }); }
  else if (action === 'day') { selectedDate = date; render(); }
  else if (action === 'month-prev' || action === 'month-next') { const next = new Date(monthYear, monthIndex + (action === 'month-prev' ? -1 : 1), 1, 12); if (next.getFullYear() < 1900 || localDate(next) > localDate()) return; monthYear = next.getFullYear(); monthIndex = next.getMonth(); selectedDate = localDate(next); render(); }
  else if (action === 'month-today') { selectedDate = localDate(); monthYear = dateObject(selectedDate).getFullYear(); monthIndex = dateObject(selectedDate).getMonth(); render(); }
  else if (action === 'metric') { chartMetric = button.dataset.metric; render(); }
  else if (action === 'backup' || action === 'csv') { try { const fresh = validateState(await readState()); if (action === 'backup') download(makeBackup(fresh), 'application/json', `cantongo-backup-${localDate()}.json`); else download(csvExport(fresh), 'text/csv;charset=utf-8', `cantongo-records-${localDate()}.csv`); toast('File prepared. Keep it somewhere you can find.'); } catch (error) { toast(error.message); } }
  else if (action === 'restore') { $('#restore-file').value = ''; $('#restore-file').click(); }
  else if (action === 'clear') { const revision = state.revision; confirmAction({ title: 'Clear this local journal?', body: `<p>This removes ${plural(state.entries.length, 'session')}, ${plural(state.phrases.length, 'phrase')}, and ${plural(Object.keys(state.restDays).length, 'pause note')} from this browser. Preferences stay saved.</p><p>Export a JSON backup first to keep a copy. This action has no undo.</p>`, label: 'Clear records', typed: 'CLEAR', danger: true, task: () => commit(current => { if (current.revision !== revision) throw new Error('Your journal changed after this preview. Close this confirmation and review the current records.'); current.entries = []; current.phrases = []; current.restDays = {}; return current; }, 'Local journal cleared.') }); }
  else if (action === 'persist') { try { toast(await navigator.storage?.persist?.() ? 'Persistent storage granted by this browser.' : 'Storage retention was not granted. Your journal still saves locally; keep backups.'); updateStorageInfo(); } catch { toast('Storage retention is not available here. You can still keep JSON backups.'); } }
  else if (action === 'install') { $('#info-dialog').innerHTML = `<div class="confirm-head"><h2 id="info-heading">A place on your Home Screen.</h2><button class="icon-btn" data-a="close-info" aria-label="Close installation help">${icon('close')}</button></div><div class="confirm-copy"><ol><li>Open CantonGo in Safari on your iPhone.</li><li>Choose Share, then <strong>Add to Home Screen</strong>.</li><li>If shown, enable <strong>Open as Web App</strong>, then tap <strong>Add</strong>.</li></ol><p>Export a JSON backup before moving between browsers or app windows. Local records may use separate storage.</p></div><div class="confirm-actions"><button class="btn primary" data-a="close-info">Got it</button></div>`; $('#info-dialog').showModal(); }
  else if (action === 'update') applyUpdate();
});
document.addEventListener('input', event => {
  if (event.target.id === 'phrase-search') { phraseQuery = event.target.value; $('#phrase-results').innerHTML = phraseResults(); }
  if (event.target.name === 'duration') document.querySelectorAll('[data-a="quick-duration"]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.minutes === event.target.value)));
});
document.addEventListener('change', event => { if (event.target.name === 'referenceEnabled') $('#preferences-form .reference-fields').disabled = !event.target.checked; });
document.addEventListener('submit', async event => {
  if (event.target.id !== 'preferences-form') return;
  event.preventDefault(); const form = event.target, fields = form.elements, error = $('#preferences-error'); error.hidden = true;
  try { const settings = { theme: fields.theme.value, reference: { enabled: fields.referenceEnabled.checked, sessions: num(fields.referenceSessions.value), minutes: num(fields.referenceMinutes.value) } }; validateState({ ...state, settings }); const button = form.querySelector('[type=submit]'); button.disabled = true; if (!await commit(current => { current.settings = settings; return current; }, 'Preferences saved.')) button.disabled = false; }
  catch (problem) { error.textContent = problem.message; error.hidden = false; }
});
$('#entry-dialog').addEventListener('cancel', event => { event.preventDefault(); closeEntry(); });
$('#restore-file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error('Choose a JSON backup smaller than 10 MB.');
    const backup = parseBackup(await file.text()), revision = state.revision, dates = [...backup.entries.map(entry => entry.date), ...backup.phrases.map(phrase => phrase.date), ...Object.keys(backup.restDays)].sort();
    confirmAction({ title: 'Restore this CantonGo journal?', body: `<p>Preview of <strong>${esc(file.name)}</strong></p><div class="data-summary"><span>${plural(backup.entries.length, 'session')}</span><span>${plural(backup.phrases.length, 'phrase')}</span><span>${plural(Object.keys(backup.restDays).length, 'pause note')}</span></div>${dates.length ? `<p>Dates: ${fmtDate(dates[0], { year: 'numeric', month: 'short', day: 'numeric' })} to ${fmtDate(dates.at(-1), { year: 'numeric', month: 'short', day: 'numeric' })}.</p>` : '<p>This backup contains an empty journal.</p>'}<p>This replaces all ${state.entries.length} sessions, ${state.phrases.length} phrases, ${Object.keys(state.restDays).length} pause notes, and preferences currently in this browser. Export a backup first to keep them.</p>`, label: 'Replace & restore', task: () => commit(current => { if (current.revision !== revision) throw new Error('Your records changed after this preview. Choose the backup again to review the current counts.'); return backup; }, 'Journal restored from backup.') });
  } catch (error) { toast(error.message || 'This backup could not be read.'); }
});
async function refresh() {
  if (!ready) return;
  try { const next = validateState(await readState()); if (next.revision !== state.revision || lastDay !== localDate()) { state = next; lastDay = localDate(); applyTheme(); render(); } }
  catch { toast('Could not refresh local records. Please reload before making changes.'); }
}
channel?.addEventListener('message', refresh);
window.addEventListener('online', updateConnection); window.addEventListener('offline', updateConnection);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
window.addEventListener('hashchange', () => { if (ready) navigate(location.hash.slice(1)); });
$('.brand').addEventListener('click', event => { event.preventDefault(); if (ready) navigate('today'); });
setInterval(() => { if (lastDay !== localDate()) refresh(); }, 30000);
function applyUpdate() { if (document.querySelector('dialog[open]')) { toast('Close the open form before updating. Your saved records will stay here.'); return; } updateWorker?.postMessage({ type: 'SKIP_WAITING' }); }
async function registerOffline() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.register('./sw.js');
    const notice = worker => { updateWorker = worker; if (!document.querySelector('dialog[open]')) toast('A new version is ready.', 'Update', applyUpdate, true); if (view === 'settings') render(); };
    if (registration.waiting) notice(registration.waiting);
    registration.addEventListener('updatefound', () => { const worker = registration.installing; worker?.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) notice(worker); if (view === 'settings') updateStorageInfo(); }); });
    let reloading = false; navigator.serviceWorker.addEventListener('controllerchange', () => { if (updateWorker && !reloading) { reloading = true; location.reload(); } });
  } catch { /* Journal records work online even if shell caching is unavailable. */ }
}
try { state = validateState(await readState()); ready = true; applyTheme(); view = ['today','history','phrases','settings'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'today'; render(); registerOffline(); }
catch (error) { $('#storage-error').hidden = false; $('#storage-error').textContent = `Local storage could not be opened. ${error.message || ''} No new records will be saved until storage is available.`; $('#main').innerHTML = '<div class="empty-card"><h1>Your words need a place to stay.</h1><p>Reload, or use a browser with IndexedDB enabled.</p><button class="btn" id="retry-storage">Reload CantonGo</button></div>'; $('#retry-storage').addEventListener('click', () => location.reload()); }
