# CantonGo

A little Cantonese, at your pace. **Record, don't judge.**

A mobile-first practice journal and personal phrasebook. English interface, with Cantonese text and optional Jyutping entered by you. No streaks, ranks, or missed-day warnings.

## Use

- **Record practice**: enter minutes, or choose 5/10/15/30. No category is required. Optional date, time, category, title, source, and notes live under Add details.
- **Leave a record**: start from Listening, Speaking, Reading, Writing, Conversation, Lesson, or Other. Detailed entries may omit a duration; summaries disclose missing durations.
- **History**: eight calendar weeks, sessions or entered minutes, a monthly calendar, date-specific entries, and independent pause notes. A blank day means no record. Pause notes can coexist with practice.
- **Phrases**: save Cantonese text with optional Jyutping, meaning, and context. Search across those fields, favorite phrases, and edit or remove them. Phrases are a personal notebook, not automatically verified teaching material.
- **Settings**: system/light/dark appearance; optional adjustable weekly reference (off by default); JSON backup and validated restore; CSV export; optional storage retention request; installation help.

## Your data

All journal records are stored in IndexedDB in the current browser and origin, in CantonGo's own database. MoveLog and SipLess are separate applications. There is no cloud sync, app analytics, AI endpoint, or automatic pronunciation assessment. The app does not upload your journal or generate Jyutping. Local records and exported backups are not encrypted by the app.

Export a JSON backup before clearing browser data, changing websites, or moving devices. JSON includes sessions, phrases, favorites, pause notes, and preferences. Restore previews counts and dates and requires explicit replacement confirmation. CSV is for viewing and analysis; spreadsheet formula prefixes are escaped.

Writes use a single read/transform/write transaction. Concurrent tabs refresh through BroadcastChannel. Editing checks for changes to the same record, restore checks for changes after its preview, and undo refuses to overwrite later changes. Clear requires typing CLEAR and preserves preferences. Unsaved record or phrase edits require confirmation before discarding.

## Run and verify

The app is buildless HTML/CSS/JavaScript with no production dependencies. Node.js runs the automated checks; `fake-indexeddb` is a test-only development dependency.

```sh
npm install
npm test
npm run dev
```

Open http://127.0.0.1:4174. The app-shell service worker uses a CantonGo cache scoped to this project's URL path. It only stores application assets, and updates wait for user acceptance. Bump its cache version whenever releasing changed app-shell assets.

For GitHub Pages, serve `main` from `/` (root). The relative manifest paths support `/cantongo/`; the application identity defaults to the resolved start URL. `.nojekyll` bypasses Jekyll. Only the 11 browser assets are cached; development files are not included in the offline shell.

On iPhone, open the published app in Safari and choose Share > Add to Home Screen. Installation, offline relaunch, file sharing, and separate browser/Home Screen storage should be checked on the actual device. Keep backups when moving between contexts.

## Verification limits

Automated tests cover backup validation, phrase search, date calculations, missing-duration summaries, CSV escaping, edit conflict checks, and actual storage API transactions against an in-memory IndexedDB implementation. They do not establish real-device disk durability or replace iPhone testing.
