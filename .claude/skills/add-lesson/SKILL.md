---
name: add-lesson
description: Turn Hello Interview study notes into concept cards and quiz questions in content/. Use when the user pastes notes or a lesson to add, asks to add/update a concept or chapter, or asks to process the Quick note inbox.
---

# Add a lesson

The revision app's content lives in `content/<chapter>/<id>.json`, one file per concept. The format and field rules are in `README.md` under "Concept file". Read it, `content/<chapter>/chapter.json`, and two or three existing concept files before writing, and match their style.

## Input
Either:
- notes the user pasted, or
- the Quick note inbox. Load `WORKER_URL` and `APP_TOKEN` from `.env` without printing them (`set -a; . ./.env; set +a`), then `curl -s -H "Authorization: Bearer $APP_TOKEN" "$WORKER_URL/api/notes"`.

If the chapter is unclear, ask. Today's date is the user's local date (Singapore).

## Steps
1. **Check for overlap first.** List existing ids and titles across all chapters. If a note covers an existing concept, extend that file (add points, a question, sharpen the trade-off) instead of creating a near-duplicate. Tell the user which you chose.
2. **Write each concept** (one idea per file; split notes that cover several):
   - `id`: short, lowercase, dashes, unique across chapters, and equal to the file name.
   - `topic`: must be in `chapter.json` `topics`. If it needs a new topic, add it to the list in a sensible position.
   - `order`: next number within its topic. `added`: today.
   - `points`: 3–5 full sentences, each one self-contained fact or rule.
   - `trade`: when to use it and when not, how it differs from the concepts it is easily confused with, and which principles it relates to.
   - `code`: a short Java example (Spring where natural), only when code clarifies the idea.
   - `test`: a scenario-style self-test question that needs reasoning, not recall of a definition. `answer`: 1–3 sentences.
   - `questions`: 2–3 multiple-choice questions. Scenarios, "X vs Y", and trade-offs. 4 options, all plausible, similar length. Vary the `correct` index. `explanation` says why the answer is right and why the tempting wrong one is wrong.
3. **Stay faithful to the notes.** Don't invent claims the notes don't support. If something in the notes looks wrong, say so to the user instead of silently fixing or copying it.
4. **Validate:** `npm run build` must pass.
5. **Show the user** a short summary: new or changed files, titles, and the questions. Wait for their OK.
6. **On OK:** commit (`Add <titles>` style message) and push to `main`. If Workers Builds is not connected yet (see `HANDOFF.md`), also run `npm run deploy`.
7. **Inbox notes only, after the push succeeds:** mark each used note processed:
   `curl -s -X POST -H "Authorization: Bearer $APP_TOKEN" -H "Content-Type: application/json" -d '{"concept":"<id>"}' "$WORKER_URL/api/notes/<noteId>/processed"`.
   Notes that weren't turned into anything stay unprocessed; tell the user which and why.
