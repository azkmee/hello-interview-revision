# Hello Interview Revision

Revision app for Hello Interview study notes: Study (concept cards and a quick-note inbox), Revise (spaced-repetition flashcards) and Quiz (multiple choice).

```
Browser ──same origin──> Cloudflare Worker ──> static files (public/, content.json)
                                 └── /api/*  ──> D1 (cards, quiz_log, notes)
```

- **Content** (concepts, questions, generated quizzes) lives in `content/` as JSON and is versioned in git.
- **Review state** (stages, due dates, weak flags, quiz log, notes) lives in D1, behind a bearer token.

## Layout
| Path | What |
|------|------|
| `content/<chapter>/chapter.json` | `{ id, title, topics: [ordered topic names] }` |
| `content/<chapter>/<id>.json` | One concept. See format below. |
| `content/quizzes/<YYYY-MM-DD>.json` | Optional generated quiz for that day: `{ date, questions: [{ concept, question, options, correct, explanation }] }` |
| `scripts/build.mjs` | Validates `content/` and writes `public/content.json`. Runs on every `wrangler dev`/`deploy` and in CI. |
| `public/index.html` | The app. |
| `worker/index.js` | Worker: serves `public/`, handles `/api/*`. |
| `migrations/` | D1 schema. |

### Concept file
```jsonc
{
  "id": "strategy",                 // lowercase, digits, dashes; must match the file name; unique across chapters
  "topic": "Design Patterns",       // must be listed in chapter.json
  "title": "Strategy (behavioral)",
  "order": 6,                       // optional, sort within topic
  "added": "2026-11-24",            // first due date for a new card
  "points": ["..."],
  "trade": "...",                   // optional
  "code": "...",                    // optional
  "test": "Self-test question shown in Revise",
  "answer": "Answer revealed in Revise",
  "questions": [{ "question": "...", "options": ["a", "b", "c", "d"], "correct": 1, "explanation": "..." }]
}
```

## API
All routes need `Authorization: Bearer <token>`.

| Route | Owner (`APP_TOKEN`) | Routine (`ROUTINE_TOKEN`) |
|-------|:---:|:---:|
| `GET /api/state` → `{ cards, log }` | ✓ | ✓ |
| `PUT /api/cards/:conceptId` `{ stage, next, status, learned }` | ✓ | |
| `POST /api/quiz-log` `{ id, date, score, n, topics, weak }` | ✓ | |
| `GET /api/notes` (unprocessed; `?status=all` for all) | ✓ | ✓ |
| `POST /api/notes` `{ id, text }` | ✓ | |
| `POST /api/notes/:id/processed` `{ concept? }` | ✓ | ✓ |

## Local development
```sh
npm install
printf 'APP_TOKEN=dev-owner-token\nROUTINE_TOKEN=dev-routine-token\n' > .dev.vars
npm run db:migrate:local
npm run dev            # http://localhost:8787, then "Set token" -> dev-owner-token
```

## Deploy (once)
```sh
npx wrangler login
npx wrangler d1 create hello_interview        # paste the database_id into wrangler.jsonc
npm run db:migrate
npx wrangler secret put APP_TOKEN             # long random string, e.g. openssl rand -hex 32
npx wrangler secret put ROUTINE_TOKEN         # a different one
npm run deploy
```
After that, connect the GitHub repo in the Cloudflare dashboard (Workers > the worker > Settings > Builds) so every push to `main` deploys.
