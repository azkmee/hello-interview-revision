// Cloudflare Worker: serves public/ as static assets and the JSON API under /api/*.
// State lives in D1 (binding DB). Tokens are Worker secrets:
//   APP_TOKEN     - the owner (browser). Full access.
//   ROUTINE_TOKEN - the daily Claude routine. Read state and notes, mark notes processed.

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CONCEPT_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const CLIENT_ID = /^[A-Za-z0-9-]{8,64}$/;
const MAX_BODY = 20000;
const MAX_NOTE = 5000;
const STAGES = 5;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
const fail = (status, error) => json({ error }, status);

async function sha256(s) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
}

// Compare digests so neither the token's content nor its length leaks through timing.
async function tokenMatches(given, want) {
  if (!want) return false;
  const [a, b] = await Promise.all([sha256(given), sha256(want)]);
  return crypto.subtle.timingSafeEqual(a, b);
}

async function roleOf(request, env) {
  const given = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!given) return null;
  if (await tokenMatches(given, env.APP_TOKEN)) return "owner";
  if (await tokenMatches(given, env.ROUTINE_TOKEN)) return "routine";
  return null;
}

async function readBody(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) throw new HttpError(413, "body too large");
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new HttpError(400, "body must be a JSON object");
  }
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const strList = (v, max) =>
  Array.isArray(v) && v.length <= max && v.every((s) => typeof s === "string" && s.length > 0 && s.length <= 200);

// ---------- handlers ----------

async function getState(env) {
  const [cards, log] = await env.DB.batch([
    env.DB.prepare("SELECT concept_id, stage, next, status, learned FROM cards"),
    env.DB.prepare("SELECT id, date, score, n, topics, weak FROM quiz_log ORDER BY rowid DESC LIMIT 200"),
  ]);
  const out = {};
  for (const r of cards.results) out[r.concept_id] = { stage: r.stage, next: r.next, status: r.status, learned: r.learned };
  return json({
    cards: out,
    log: log.results.reverse().map((r) => ({ ...r, topics: JSON.parse(r.topics), weak: JSON.parse(r.weak) })),
  });
}

async function putCard(env, id, body) {
  if (!CONCEPT_ID.test(id)) throw new HttpError(400, "bad concept id");
  const { stage, next, status, learned } = body;
  if (!Number.isInteger(stage) || stage < 0 || stage > STAGES) throw new HttpError(400, "stage must be 0-5");
  if (!DATE.test(next || "")) throw new HttpError(400, "next must be YYYY-MM-DD");
  if (!["new", "ok", "weak"].includes(status)) throw new HttpError(400, "bad status");
  if (learned != null && !DATE.test(learned)) throw new HttpError(400, "learned must be YYYY-MM-DD");
  await env.DB.prepare(
    `INSERT INTO cards (concept_id, stage, next, status, learned, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
     ON CONFLICT (concept_id) DO UPDATE SET
       stage = excluded.stage, next = excluded.next, status = excluded.status,
       learned = excluded.learned, updated_at = excluded.updated_at`
  )
    .bind(id, stage, next, status, learned ?? null)
    .run();
  return json({ ok: true });
}

async function postQuizLog(env, body) {
  const { id, date, score, n, topics, weak } = body;
  if (!CLIENT_ID.test(id || "")) throw new HttpError(400, "id required");
  if (!DATE.test(date || "")) throw new HttpError(400, "date must be YYYY-MM-DD");
  if (!Number.isInteger(n) || n < 1 || n > 50) throw new HttpError(400, "bad n");
  if (!Number.isInteger(score) || score < 0 || score > n) throw new HttpError(400, "bad score");
  if (!strList(topics, 50) || !strList(weak, 50)) throw new HttpError(400, "topics and weak must be string lists");
  await env.DB.prepare("INSERT OR IGNORE INTO quiz_log (id, date, score, n, topics, weak) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
    .bind(id, date, score, n, JSON.stringify(topics), JSON.stringify(weak))
    .run();
  return json({ ok: true });
}

async function getNotes(env, url) {
  const all = url.searchParams.get("status") === "all";
  const { results } = await env.DB.prepare(
    `SELECT id, text, created_at, processed_at, concept FROM notes
     ${all ? "" : "WHERE processed_at IS NULL"} ORDER BY created_at LIMIT 200`
  ).all();
  return json({ notes: results });
}

async function postNote(env, body) {
  const { id, text } = body;
  if (!CLIENT_ID.test(id || "")) throw new HttpError(400, "id required");
  if (typeof text !== "string" || !text.trim() || text.length > MAX_NOTE) throw new HttpError(400, `text must be 1-${MAX_NOTE} chars`);
  await env.DB.prepare("INSERT OR IGNORE INTO notes (id, text) VALUES (?1, ?2)").bind(id, text.trim()).run();
  return json({ ok: true });
}

async function markNoteProcessed(env, id, body) {
  if (!CLIENT_ID.test(id)) throw new HttpError(400, "bad note id");
  const concept = body.concept ?? null;
  if (concept !== null && !CONCEPT_ID.test(concept)) throw new HttpError(400, "bad concept id");
  const r = await env.DB.prepare("UPDATE notes SET processed_at = datetime('now'), concept = ?2 WHERE id = ?1")
    .bind(id, concept)
    .run();
  if (!r.meta.changes) throw new HttpError(404, "note not found");
  return json({ ok: true });
}

// ---------- routing ----------

async function api(request, env, url) {
  const role = await roleOf(request, env);
  if (!role) return fail(401, "unauthorized");
  const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const [res, id, sub] = parts;
  const m = request.method;
  const ownerOnly = () => {
    if (role !== "owner") throw new HttpError(403, "forbidden for this token");
  };

  if (res === "state" && !id && m === "GET") return getState(env);
  if (res === "cards" && id && !sub && m === "PUT") return ownerOnly(), putCard(env, id, await readBody(request));
  if (res === "quiz-log" && !id && m === "POST") return ownerOnly(), postQuizLog(env, await readBody(request));
  if (res === "notes" && !id && m === "GET") return getNotes(env, url);
  if (res === "notes" && !id && m === "POST") return ownerOnly(), postNote(env, await readBody(request));
  if (res === "notes" && id && sub === "processed" && m === "POST") return markNoteProcessed(env, id, await readBody(request));
  return fail(404, "not found");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/") && url.pathname !== "/api") return env.ASSETS.fetch(request);
    try {
      return await api(request, env, url);
    } catch (e) {
      if (e instanceof HttpError) return fail(e.status, e.message);
      console.error(e);
      return fail(500, "server error");
    }
  },
};
