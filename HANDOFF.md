# Handoff: Hello Interview Revision

Status as of 2026-11-24. The code is written and parses; it has not been pushed, deployed or tested against a real MongoDB. This document says what the repo must contain, how the pieces connect, and what is still open.

## Goal
A revision app for Azmi's Hello Interview study (currently the Low Level Design chapter). It has three tabs: Study (concept cards), Revise (flashcards with Got it / Struggled) and Quiz (5 multiple-choice questions). Review stages, weak flags and the quiz log must persist across reloads and devices. The Mongo connection string must never reach the browser.

## Architecture
```
Browser (GitHub Pages, static)
   |  Authorization: Bearer APP_TOKEN
   v
/api/state  (Vercel serverless function, holds MONGODB_URI)
   v
MongoDB  (db: hello_interview, collection: state, one doc with _id "main")
```
GitHub Pages is static, so the Mongo URL cannot live in the page. It exists only as an environment variable on the API host.

## Repo name and visibility
`azkmee/hello-interview-revision`, public (free GitHub Pages needs a public repo; contents are study notes only). Default branch `main`.

## Files that must be in the repo
| Path | Purpose |
|------|---------|
| `public/index.html` | The whole app: CSS, concept data (`CONCEPTS`), quiz data (`QUESTIONS`), rendering, and sync code (`load`, `save`, `logQuiz`). Uses today's real date. Sync status and a "Set token" button sit in the header. |
| `public/config.js` | Sets `window.APP_CONFIG = { apiBase: "" }`. The Pages workflow overwrites it at build time from the `API_BASE` repo variable. |
| `api/state.js` | Vercel function. `GET` returns `{cards, log}`. `PUT` upserts `{cards, log}` into doc `_id: "main"`. Rejects requests without the bearer token (timing-safe compare), validates body shape, caps body at 200,000 chars. CORS origin from `ALLOWED_ORIGIN`. |
| `package.json` | Single dependency: `mongodb` ^6.8.0. |
| `.github/workflows/pages.yml` | On push to `main`: writes `public/config.js` from `vars.API_BASE`, then deploys `public/` to GitHub Pages. |
| `.gitignore` | `node_modules`, `.env`, `.vercel`. |
| `README.md` | Short setup summary. |
| `HANDOFF.md` | This file. |

The full set is in `hello-interview-revision.zip` (sent to the user in the Claude session). Unzip it and push the contents of the inner `hi-revision/` folder as the repo root.

## Data model
One Mongo document:
```json
{ "_id": "main",
  "cards": { "<conceptId>": { "stage": 0, "next": "YYYY-MM-DD", "status": "new|ok|weak", "learned": "YYYY-MM-DD" } },
  "log":   [ { "date": "YYYY-MM-DD", "score": 4, "n": 5, "topics": ["..."], "weak": ["..."] } ],
  "updatedAt": "<Date>" }
```
Concept ids (`enc`, `abstraction`, `srp`, `factory`, ...) are defined in `CONCEPTS` in `index.html`. The browser merges saved cards onto the defaults, so adding a concept later does not break saved state. Writes are last-write-wins on the whole document (single user).

Review intervals: +1, +3, +7, +14, +30 days. "Got it" moves to the next stage. "Struggled" resets to stage 0, next review +1 day, status weak.

## Environment variables
On the API host (Vercel):
- `MONGODB_URI` (required): Atlas connection string. Never commit it.
- `APP_TOKEN` (required): long random string. Without it the API rejects every request.
- `MONGODB_DB` (optional): defaults to `hello_interview`.
- `ALLOWED_ORIGIN` (optional): the Pages origin, e.g. `https://azkmee.github.io`. Defaults to `*`.

On GitHub (repo Settings > Secrets and variables > Actions > Variables):
- `API_BASE`: the deployed API origin, no trailing slash.

## Steps to finish
1. Create the public repo and push the files above to `main`.
2. Repo Settings > Pages > Source: GitHub Actions.
3. Import the repo into Vercel. Set `MONGODB_URI`, `APP_TOKEN` and `ALLOWED_ORIGIN`. Deploy. In Atlas, allow Vercel's IPs (or 0.0.0.0/0 with a strong password).
4. Add the repo variable `API_BASE`, then re-run the Pages workflow (Actions tab > Deploy to GitHub Pages > Run workflow).
5. Open the Pages site, click "Set token", paste `APP_TOKEN`. The header should read "Synced".
6. Test: rate a concept in Revise, reload the page, confirm the stage persisted. Finish a quiz and confirm a row appears in the quiz log after reload.

## Why this is not finished
- The GitHub login in the Claude session was invalid, and the GitHub connector could not create repositories (403 "Resource not accessible by integration"). Either create the empty repo by hand and give the connector Contents write access to it, or widen the connector's permission.
- The connector has no tools for enabling Pages or setting repo variables, so steps 2 and 4 are manual.
- Nothing can be deployed to Vercel from the Claude session, so steps 3 and 5 are manual.

## Known gaps and next ideas
- Concept and quiz content is hard-coded in `index.html`. The source of truth is still the Claude Project "Hello Interview" (`claude/chapters/*.md`). New concepts need a rebuild of `CONCEPTS`.
- Only the Low Level Design chapter exists. Multi-chapter support means adding a `chapter` field to each concept and a chapter filter in the UI.
- The scheduled quiz task (every other day, 7:17pm Singapore time) currently reads and writes the Project files and republishes the old Claude artifact. To make Mongo the shared state, it would need to call `GET`/`PUT /api/state` with the token, or the chapter files would need to be generated from Mongo.
- The old Claude artifact "Hello Interview Revision" keeps no state; it can be retired once the Pages site works.
- Last-write-wins sync means two devices open at once can overwrite each other. Fine for one user; add per-card timestamps if that becomes a problem.
- No automated tests. `api/state.js` passes `node --check`; the page script parses.
