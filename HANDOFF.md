# Handoff: Hello Interview Revision

Status as of 2026-11-24. Steps 1–4 of the plan are done and tested locally (`wrangler dev` with local D1, driven in a browser). Nothing is deployed yet. Step 5, the daily Claude routine, is not started.

## Goal
A revision app for Azmi's Hello Interview study. Study shows concept cards and has a quick-note inbox. Revise is spaced-repetition flashcards. Quiz is multiple choice. Progress persists across devices. New learning goes in as rough notes, and a scheduled Claude Code run on the Claude subscription turns the notes into concepts and quizzes.

## Architecture
```
Browser ──same origin──> Cloudflare Worker ──> static assets (public/, content.json)
                                 └── /api/* ──> D1: cards, quiz_log, notes

Daily Claude Code routine (subscription) ──ROUTINE_TOKEN──> /api/state, /api/notes
        └── writes content/*.json ──> git push ──> Workers Builds redeploys
```
- **Content is in git** (`content/`): concepts with their questions, plus optional dated quizzes. `scripts/build.mjs` validates the files and bundles them into `public/content.json`. Bad content fails the build, so it never reaches the site.
- **State is in D1**, one row per card or log entry. A write never replaces the whole state.
- The page keeps a localStorage cache and an **outbox**. Every write is queued and sent in order. If the API is unreachable, writes stay queued and retry when the browser is back online, when the tab regains focus, every 60s, and on the next page load.
- Two tokens. `APP_TOKEN` (the browser) has full access. `ROUTINE_TOKEN` can only read state and notes and mark notes processed.

See `README.md` for the file layout, concept format, API table and deploy commands.

## Changes from the first version
- Replaced Vercel + MongoDB + GitHub Pages with one Cloudflare Worker + D1. Removed `api/state.js`, `public/config.js` and `.github/workflows/pages.yml`.
- Concepts and questions moved out of `index.html` into `content/lld/*.json`. Each question belongs to a concept.
- Review fixes:
  - A normal Revise round holds only due cards, weak ones first. "Practice anyway" shows every card and doesn't change the schedule.
  - The rating buttons are disabled until the first load attempt finishes.
  - "Today" is the device's local date, not UTC.
  - A wrong quiz answer marks that concept weak (stage 0, due tomorrow).
  - The quiz prefers weak concepts, then due ones, with at most one question per concept.
- The quiz log is append-only and idempotent: the browser generates each row's id, so retries don't duplicate rows.
- Added a Quick note box (Study tab) → `notes` table.
- CI (`.github/workflows/validate.yml`) runs the content check and `node --check` on every push and PR.

## Steps to finish
1. Push to `azkmee/hello-interview-revision` (remote already set).
2. Deploy: follow "Deploy (once)" in `README.md`. That covers the D1 database, the migration, the two secrets and `npm run deploy`. Put the real `database_id` into `wrangler.jsonc` and commit it.
3. In the Cloudflare dashboard, connect the GitHub repo so pushes to `main` deploy.
4. Open the Worker URL, click "Set token", and paste `APP_TOKEN`. Rate a card, reload, and confirm it persisted. Repeat on your phone.
5. Daily routine (not started): see below.

## Step 5: the daily routine
This has to run as Claude Code, either as a scheduled cloud routine via `/schedule` or as a local `claude -p` cron. A Worker can't use the subscription. The routine needs GitHub access to the repo, which was failing in this session (GitHub connector error: "Authorization header is badly formatted"). Fix that first. The routine also needs the Worker URL and `ROUTINE_TOKEN` as environment variables.

Each run:
1. `GET /api/notes`. Turn each note into a new concept file (`content/<chapter>/<id>.json`, `added` = today, 1–3 questions) or merge it into an existing one. Then call `POST /api/notes/:id/processed` with `{concept}`.
2. `GET /api/state`. Write `content/quizzes/<today>.json` with about 5 new questions aimed at weak and due concepts and recent misses (`log[].weak` holds concept ids).
3. Run `node scripts/build.mjs`. It must pass before committing.
4. Push the quiz files to `main`. Open a PR for new or changed concepts so you can review them.

Retire the old every-other-day 7:17pm quiz task and the old "Hello Interview Revision" Claude artifact once this runs.

## Known gaps
- Two devices that rate the same card while offline: the last write wins for that card. That's acceptable for one user.
- `added` for the existing 24 concepts is set to 2026-11-24. The original learn dates weren't recorded.
- Old generated quiz files pile up in `content/quizzes/`. Prune them occasionally, or have the routine delete files older than 14 days.
- There are no automated tests beyond the content validator. The API and page were tested by hand against local D1.
